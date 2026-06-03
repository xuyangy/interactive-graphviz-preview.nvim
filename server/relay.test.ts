import { describe, expect, test } from "bun:test";

const SERVER = `${import.meta.dir}/server.ts`;

interface Ready {
  type: string;
  port: number;
  token: string;
}

// Spawn the real server and read its `ready{port,token}` announcement. Mirrors
// the supervisor.test.ts live-server idiom; always kill in `finally`.
async function spawnServer(): Promise<{ proc: Bun.Subprocess; ready: Ready }> {
  const proc = Bun.spawn(["bun", "run", SERVER], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "ignore",
    env: { ...process.env, IG_HEARTBEAT_TIMEOUT_MS: "10000" },
  });
  const ready = JSON.parse(await readFirstLine(proc.stdout!, 8000)) as Ready;
  return { proc, ready };
}

async function readFirstLine(stream: ReadableStream<Uint8Array>, timeoutMs: number): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const nl = buf.indexOf("\n");
      if (nl >= 0) return buf.slice(0, nl);
    }
  } finally {
    reader.releaseLock();
  }
  throw new Error("no line received before timeout");
}

// Open a WS, collecting every inbound frame (parsed) into `received`.
async function openSocket(port: number): Promise<{ ws: WebSocket; received: Record<string, unknown>[] }> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/`);
  const received: Record<string, unknown>[] = [];
  ws.addEventListener("message", (e) => {
    received.push(JSON.parse(String((e as MessageEvent).data)) as Record<string, unknown>);
  });
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve());
    ws.addEventListener("error", () => reject(new Error("ws error")));
  });
  return { ws, received };
}

function writeLine(proc: Bun.Subprocess, obj: unknown): void {
  (proc.stdin as { write: (s: string) => void }).write(`${JSON.stringify(obj)}\n`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("message protocol + WebSocket relay", () => {
  test("contract round-trip: Lua stdin -> server -> WS envelope is structurally identical", async () => {
    const { proc, ready } = await spawnServer();
    try {
      expect(ready.type).toBe("ready");

      // Serve the static frontend over HTTP (no bare 503).
      const httpRes = await fetch(`http://127.0.0.1:${ready.port}/`);
      expect(httpRes.status).toBe(200);
      const html = await httpRes.text();
      expect(html).toContain('id="app"');

      const { ws, received } = await openSocket(ready.port);
      ws.send(JSON.stringify({ type: "hello", sessionId: 3, token: ready.token }));
      await sleep(100);

      // The exact envelope Lua/stdin emits (camelCase keys, single `v`, snake_case type).
      const sent = { type: "render", v: 42, sessionId: 3, engine: "dot", dot: "digraph{a->b}" };
      writeLine(proc, sent);
      await sleep(250);

      expect(received.length).toBe(1);
      const got = received[0]!;
      // Structurally identical on both hops — byte-shape preserved.
      expect(JSON.stringify(got)).toBe(JSON.stringify(sent));
      expect(got.type).toBe("render");
      expect(Object.keys(got).sort()).toEqual(["dot", "engine", "sessionId", "type", "v"]);
      expect(got).not.toHaveProperty("data"); // no {data:…} wrapping
      for (const k of Object.keys(got)) {
        expect(got[k]).not.toBeNull(); // no null for absent fields
      }
      ws.close();
    } finally {
      proc.kill();
    }
  }, 20000);

  test("token rejection: a hello with a wrong/missing token is closed and never receives a render", async () => {
    const { proc, ready } = await spawnServer();
    try {
      // Wrong token.
      const bad = await openSocket(ready.port);
      let closed = false;
      bad.ws.addEventListener("close", () => {
        closed = true;
      });
      bad.ws.send(JSON.stringify({ type: "hello", sessionId: 3, token: "not-the-token" }));
      await sleep(200);
      expect(closed).toBe(true);

      // Missing token.
      const missing = await openSocket(ready.port);
      let missingClosed = false;
      missing.ws.addEventListener("close", () => {
        missingClosed = true;
      });
      missing.ws.send(JSON.stringify({ type: "hello", sessionId: 3 }));
      await sleep(200);
      expect(missingClosed).toBe(true);

      // A render for that session must not reach the rejected sockets.
      writeLine(proc, { type: "render", v: 1, sessionId: 3, engine: "dot", dot: "g" });
      await sleep(200);
      expect(bad.received.length).toBe(0);
      expect(missing.received.length).toBe(0);
    } finally {
      proc.kill();
    }
  }, 20000);

  test("per-session isolation: a render for session A reaches only A's socket", async () => {
    const { proc, ready } = await spawnServer();
    try {
      const a = await openSocket(ready.port);
      const b = await openSocket(ready.port);
      a.ws.send(JSON.stringify({ type: "hello", sessionId: 1, token: ready.token }));
      b.ws.send(JSON.stringify({ type: "hello", sessionId: 2, token: ready.token }));
      await sleep(150);

      writeLine(proc, { type: "render", v: 7, sessionId: 1, engine: "dot", dot: "A" });
      await sleep(250);

      expect(a.received.length).toBe(1);
      expect((a.received[0] as { dot: string }).dot).toBe("A");
      expect(b.received.length).toBe(0); // never crosses sessions

      a.ws.close();
      b.ws.close();
    } finally {
      proc.kill();
    }
  }, 20000);

  test("render to a session with zero subscribers is a silent no-op", async () => {
    const { proc, ready } = await spawnServer();
    try {
      // Subscribe to session 1 only; broadcast to unknown session 99.
      const a = await openSocket(ready.port);
      a.ws.send(JSON.stringify({ type: "hello", sessionId: 1, token: ready.token }));
      await sleep(150);

      writeLine(proc, { type: "render", v: 1, sessionId: 99, engine: "dot", dot: "X" });
      await sleep(200);
      expect(a.received.length).toBe(0);

      // Server still alive and still relays to a real subscriber afterward.
      writeLine(proc, { type: "render", v: 2, sessionId: 1, engine: "dot", dot: "Y" });
      await sleep(200);
      expect(a.received.length).toBe(1);
      a.ws.close();
    } finally {
      proc.kill();
    }
  }, 20000);

  test("unknown/garbage inbound frame is logged+ignored and does not break the connection", async () => {
    const { proc, ready } = await spawnServer();
    try {
      const a = await openSocket(ready.port);
      a.ws.send(JSON.stringify({ type: "hello", sessionId: 1, token: ready.token }));
      await sleep(120);

      // Unknown type + malformed JSON — neither should tear the socket down.
      a.ws.send(JSON.stringify({ type: "totally_unknown", foo: 1 }));
      a.ws.send("{not valid json");
      a.ws.send(JSON.stringify({ type: "ack", v: 7 })); // dormant warm-channel ack
      await sleep(150);

      // The subscription survives: a subsequent render still arrives.
      writeLine(proc, { type: "render", v: 9, sessionId: 1, engine: "dot", dot: "Z" });
      await sleep(200);
      expect(a.received.length).toBe(1);
      expect((a.received[0] as { dot: string }).dot).toBe("Z");
      a.ws.close();
    } finally {
      proc.kill();
    }
  }, 20000);

  test("close handler removes the socket so a later render is not sent to it", async () => {
    const { proc, ready } = await spawnServer();
    try {
      const a = await openSocket(ready.port);
      a.ws.send(JSON.stringify({ type: "hello", sessionId: 5, token: ready.token }));
      await sleep(150);
      a.ws.close();
      await sleep(150);

      writeLine(proc, { type: "render", v: 1, sessionId: 5, engine: "dot", dot: "gone" });
      await sleep(200);
      expect(a.received.length).toBe(0);
    } finally {
      proc.kill();
    }
  }, 20000);
});
