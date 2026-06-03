import { describe, expect, test } from "bun:test";
import { SessionRegistry } from "./sessions";

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
});
