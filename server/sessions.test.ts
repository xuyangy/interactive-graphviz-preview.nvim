import { describe, expect, test } from "bun:test";
import { SessionRegistry, type Subscriber } from "./sessions";

// Minimal stand-in for a ServerWebSocket — the registry only uses Set identity.
function fakeSocket(): Subscriber {
  return {} as unknown as Subscriber;
}

describe("SessionRegistry", () => {
  test("register is idempotent and keyed by sessionId", () => {
    const reg = new SessionRegistry();
    const a = reg.register(3);
    const b = reg.register(3);
    expect(a).toBe(b);
    expect(reg.size).toBe(1);
    expect(reg.has(3)).toBe(true);
  });

  test("size is the refcount across distinct sessions", () => {
    const reg = new SessionRegistry();
    reg.register(1);
    reg.register(2);
    expect(reg.size).toBe(2);
  });

  test("unregister removes a session", () => {
    const reg = new SessionRegistry();
    reg.register(1);
    expect(reg.unregister(1)).toBe(true);
    expect(reg.has(1)).toBe(false);
    expect(reg.size).toBe(0);
    expect(reg.unregister(1)).toBe(false);
  });

  test("register initializes an empty subscribers set", () => {
    const reg = new SessionRegistry();
    const s = reg.register(3);
    expect(s.subscribers).toBeInstanceOf(Set);
    expect(s.subscribers.size).toBe(0);
    expect([...reg.subscribersOf(3)]).toEqual([]);
  });

  test("subscribe adds the socket; size stays the session count, not the subscriber count", () => {
    const reg = new SessionRegistry();
    const ws1 = fakeSocket();
    const ws2 = fakeSocket();
    reg.subscribe(7, ws1);
    reg.subscribe(7, ws2);
    expect(reg.size).toBe(1); // one session, two subscribers
    expect([...reg.subscribersOf(7)]).toHaveLength(2);
  });

  test("subscribe registers an unknown session implicitly", () => {
    const reg = new SessionRegistry();
    expect(reg.has(9)).toBe(false);
    reg.subscribe(9, fakeSocket());
    expect(reg.has(9)).toBe(true);
    expect([...reg.subscribersOf(9)]).toHaveLength(1);
  });

  test("unsubscribe is idempotent and does not affect session size", () => {
    const reg = new SessionRegistry();
    const ws = fakeSocket();
    reg.subscribe(2, ws);
    reg.unsubscribe(2, ws);
    expect([...reg.subscribersOf(2)]).toHaveLength(0);
    // Idempotent: unsubscribing again (and on an unknown session) is a no-op.
    reg.unsubscribe(2, ws);
    reg.unsubscribe(404, ws);
    expect(reg.size).toBe(1); // session still registered; subscriber count != refcount
  });

  test("subscribersOf an unknown session is an empty iterable", () => {
    const reg = new SessionRegistry();
    expect([...reg.subscribersOf(123)]).toEqual([]);
  });

  test("setLastGoodRender stores the render envelope on the session", () => {
    const reg = new SessionRegistry();
    const session = reg.register(10);
    const envelope = { type: "render", sessionId: 10, dot: "digraph{a}", engine: "dot", v: 1 };
    reg.setLastGoodRender(10, envelope);
    expect(session.lastGoodRender).toBe(envelope);
  });

  test("setLastGoodRender is a no-op for an unknown session", () => {
    const reg = new SessionRegistry();
    // Should not throw.
    reg.setLastGoodRender(999, { type: "render", sessionId: 999, dot: "digraph{a}", engine: "dot", v: 1 });
    expect(reg.has(999)).toBe(false);
  });

  test("setLastGoodRender + subscribersOf still work after rename (cold-open replay)", () => {
    const reg = new SessionRegistry();
    const ws = fakeSocket();
    const session = reg.subscribe(5, ws);
    const envelope = { type: "render", sessionId: 5, dot: "digraph{b}", engine: "dot", v: 2 };
    reg.setLastGoodRender(5, envelope);
    // Replay: the stored envelope can be read back.
    expect(session.lastGoodRender).toBe(envelope);
    // Subscribers still intact.
    expect([...reg.subscribersOf(5)]).toHaveLength(1);
  });
});
