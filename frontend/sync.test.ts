import { afterEach, describe, expect, test } from "bun:test";
import {
  _resetSync,
  emitNodeClick,
  getJumpOnClick,
  setJumpOnClick,
  setNodeClickSender,
} from "./sync";

// Story 6.2 — the pure browser-side gate + sender seam. The DOM click path is
// covered in render.dom.test.ts; the real WebSocket sender in ws.test.ts. Here:
// the gate default, clamping, and every no-emit condition of emitNodeClick.

afterEach(() => {
  _resetSync();
});

describe("jump_on_click gate", () => {
  test("defaults to true (mirrors the Lua default sync.jump_on_click = true)", () => {
    expect(getJumpOnClick()).toBe(true);
  });

  test("setJumpOnClick accepts booleans and ignores anything else (clamp)", () => {
    setJumpOnClick(false);
    expect(getJumpOnClick()).toBe(false);
    setJumpOnClick(true);
    expect(getJumpOnClick()).toBe(true);
    for (const garbage of ["1", 0, null, undefined, {}, []]) {
      setJumpOnClick(garbage);
      expect(getJumpOnClick()).toBe(true);
    }
  });
});

describe("emitNodeClick", () => {
  test("forwards the nodeId through the registered sender and reports its result", () => {
    const seen: string[] = [];
    setNodeClickSender((nodeId) => {
      seen.push(nodeId);
      return true;
    });

    expect(emitNodeClick("node one")).toBe(true);
    expect(seen).toEqual(["node one"]);
  });

  test("a sender that reports no frame sent yields false", () => {
    setNodeClickSender(() => false);
    expect(emitNodeClick("a")).toBe(false);
  });

  test("disabled gate: returns false and never calls the sender (AC3)", () => {
    let calls = 0;
    setNodeClickSender(() => {
      calls += 1;
      return true;
    });
    setJumpOnClick(false);

    expect(emitNodeClick("a")).toBe(false);
    expect(calls).toBe(0);
  });

  test("empty nodeId: returns false and never calls the sender", () => {
    let calls = 0;
    setNodeClickSender(() => {
      calls += 1;
      return true;
    });

    expect(emitNodeClick("")).toBe(false);
    expect(calls).toBe(0);
  });

  test("no sender registered (pre-startup): safe no-op returning false", () => {
    expect(emitNodeClick("a")).toBe(false);
  });

  test("setNodeClickSender(null) clears a previous registration", () => {
    let calls = 0;
    setNodeClickSender(() => {
      calls += 1;
      return true;
    });
    setNodeClickSender(null);

    expect(emitNodeClick("a")).toBe(false);
    expect(calls).toBe(0);
  });
});
