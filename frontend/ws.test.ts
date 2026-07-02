import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";

// Story 6.2 — sendNodeClick, the ONLY browser→Lua outbound path besides hello.
// ws.ts reads `window.location` at call time and constructs the global
// `WebSocket`; both are stubbed here (no happy-dom: a hand-rolled fake gives
// full control of open/close timing and captures every sent frame). Globals are
// saved/restored so this file cannot bleed into other suites in the same run.

type Listener = (event: unknown) => void;

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  url: string;
  sent: string[] = [];
  private listeners: Record<string, Listener[]> = {};

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, fn: Listener): void {
    (this.listeners[type] ??= []).push(fn);
  }

  send(data: string): void {
    this.sent.push(String(data));
  }

  close(): void {
    this.dispatch("close", {});
  }

  dispatch(type: string, event: unknown): void {
    for (const fn of this.listeners[type] ?? []) fn(event);
  }
}

const g = globalThis as Record<string, unknown>;
const savedWindow = g.window;
const savedWebSocket = g.WebSocket;

function setUrl(search: string): void {
  g.window = {
    location: { protocol: "http:", host: "127.0.0.1:9876", search },
  };
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  g.WebSocket = FakeWebSocket;
  setUrl("?sessionId=3&token=tok-abc");
});

afterEach(() => {
  g.window = savedWindow;
  g.WebSocket = savedWebSocket;
});

afterAll(() => {
  g.window = savedWindow;
  g.WebSocket = savedWebSocket;
});

async function makeClient() {
  const { createWebSocketClient } = await import("./ws");
  const client = createWebSocketClient();
  const socket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
  return { client, socket };
}

describe("sendNodeClick (Story 6.2)", () => {
  test("before the socket is open: returns false, nothing sent", async () => {
    const { client, socket } = await makeClient();
    expect(client.sendNodeClick("a")).toBe(false);
    expect(socket.sent).toEqual([]);
  });

  test("after open: sends EXACTLY {type,sessionId,nodeId} — no v, token, or extra keys", async () => {
    const { client, socket } = await makeClient();
    socket.dispatch("open", {});

    expect(client.sendNodeClick("node one")).toBe(true);

    // sent[0] is the hello handshake; the node_click is the second frame.
    expect(socket.sent).toHaveLength(2);
    const frame = JSON.parse(socket.sent[1]!) as Record<string, unknown>;
    expect(Object.keys(frame).sort()).toEqual(["nodeId", "sessionId", "type"]);
    expect(frame).toEqual({ type: "node_click", sessionId: 3, nodeId: "node one" });
    expect(typeof frame.sessionId).toBe("number");
  });

  test("after close: returns false again (connected tracks the socket)", async () => {
    const { client, socket } = await makeClient();
    socket.dispatch("open", {});
    socket.dispatch("close", {});

    expect(client.sendNodeClick("a")).toBe(false);
    expect(socket.sent).toHaveLength(1); // hello only
  });

  test("non-numeric URL sessionId: returns false, nothing beyond hello", async () => {
    setUrl("?sessionId=banana&token=tok-abc");
    const { client, socket } = await makeClient();
    socket.dispatch("open", {});

    expect(client.sendNodeClick("a")).toBe(false);
    // hello is also skipped-or-sent per existing behavior; assert no node_click
    // frame regardless of hello handling.
    expect(socket.sent.filter((f: string) => f.includes("node_click"))).toEqual([]);
  });

  test("missing sessionId: returns false", async () => {
    setUrl("?token=tok-abc");
    const { client, socket } = await makeClient();
    socket.dispatch("open", {});

    expect(client.sendNodeClick("a")).toBe(false);
    expect(socket.sent).toEqual([]); // no sessionId → no hello either
  });
});
