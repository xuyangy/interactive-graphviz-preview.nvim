/**
 * Cold-open relay tests for Story 1.4 (AC2 delivery correctness).
 *
 * Tests that a render envelope sent to the server BEFORE any browser connects
 * is replayed to the browser when it subscribes. This exercises the actual
 * :GraphvizPreview order:
 *   1. Lua sends `render` (buffered at `ready`, flushed to server)
 *   2. Browser opens, loads, connects, sends `hello`
 *   3. Server replays the render on subscribe → browser receives it
 *
 * A test that connects first and then pushes the render is a false-green (it
 * never exercises the delivery race). These tests enforce the correct order.
 *
 * WASM / FR-6 tests live in server/render.test.ts (run via `bun test server`).
 */

import { describe, expect, test } from "bun:test";
import { isReady, type Ready } from "../../server/protocol";

const SERVER = `${import.meta.dir}/../../server/server.ts`;

// Kill the just-spawned server if the ready frame never arrives, so a failed
// startup can't orphan a process holding its listening port.
async function spawnServer(): Promise<{ proc: Bun.Subprocess; ready: Ready }> {
  const proc = Bun.spawn(["bun", "run", SERVER], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "ignore",
    env: { ...process.env, IG_HEARTBEAT_TIMEOUT_MS: "10000" },
  });
  try {
    const ready = await readReadyFrame(proc.stdout!, 8000);
    return { proc, ready };
  } catch (err) {
    proc.kill();
    throw err;
  }
}

// Read stdout until the server's `ready` frame arrives, skipping any
// environment/runtime noise (non-JSON or non-`ready` lines) before it — the same
// tolerance the browser smoke harness applies to this shared protocol channel.
async function readReadyFrame(
  stream: ReadableStream<Uint8Array>,
  timeoutMs: number,
): Promise<Ready> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (!line.trimStart().startsWith("{")) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue;
        }
        if (isReady(parsed)) return parsed;
      }
    }
  } finally {
    reader.releaseLock();
  }
  throw new Error("no ready frame received before timeout");
}

async function openSocket(
  port: number,
): Promise<{ ws: WebSocket; received: Record<string, unknown>[] }> {
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

describe("Story 1.4: cold-open relay (AC2)", () => {
  test("render sent before browser connects is replayed on subscribe", async () => {
    const { proc, ready } = await spawnServer();
    try {
      // Send render BEFORE any browser exists (mirrors :GraphvizPreview order).
      writeLine(proc, { type: "session_open", sessionId: 42 });
      writeLine(proc, {
        type: "render",
        v: 1,
        sessionId: 42,
        engine: "dot",
        dot: "digraph G { Hello -> World }",
      });
      await sleep(150); // server processes render; subscriber set is empty → no-op fan-out

      // Browser connects and authenticates.
      const { ws, received } = await openSocket(ready.port);
      ws.send(JSON.stringify({ type: "hello", sessionId: 42, token: ready.token }));
      await sleep(300);

      // Replay must have delivered the render.
      expect(received.length).toBeGreaterThanOrEqual(1);
      const replayed = received[0]!;
      expect(replayed.type).toBe("render");
      expect(replayed.dot).toBe("digraph G { Hello -> World }");
      expect(replayed.v).toBe(1);

      ws.close();
    } finally {
      proc.kill();
    }
  }, 20000);

  test("subsequent live renders also arrive after the replay", async () => {
    const { proc, ready } = await spawnServer();
    try {
      writeLine(proc, { type: "session_open", sessionId: 43 });
      writeLine(proc, { type: "render", v: 1, sessionId: 43, engine: "dot", dot: "digraph{cold}" });
      await sleep(150);

      const { ws, received } = await openSocket(ready.port);
      ws.send(JSON.stringify({ type: "hello", sessionId: 43, token: ready.token }));
      await sleep(200);

      expect(received.length).toBe(1);
      expect((received[0] as { dot: string }).dot).toBe("digraph{cold}");

      writeLine(proc, { type: "render", v: 2, sessionId: 43, engine: "dot", dot: "digraph{live}" });
      await sleep(200);
      expect(received.length).toBe(2);
      expect((received[1] as { dot: string }).dot).toBe("digraph{live}");

      ws.close();
    } finally {
      proc.kill();
    }
  }, 20000);
});
