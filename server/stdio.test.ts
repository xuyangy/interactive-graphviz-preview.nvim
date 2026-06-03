import { describe, expect, test } from "bun:test";
import { encodeLine, LineBuffer } from "./stdio";

describe("stdio framing", () => {
  test("encodeLine appends exactly one newline", () => {
    expect(encodeLine({ type: "ping" })).toBe('{"type":"ping"}\n');
  });

  test("LineBuffer splits multiple complete lines", () => {
    const buf = new LineBuffer();
    const lines = buf.push('{"a":1}\n{"b":2}\n');
    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
    expect(buf.pending).toBe("");
  });

  test("LineBuffer holds a partial line across chunk boundaries", () => {
    const buf = new LineBuffer();
    expect(buf.push('{"type":"sess')).toEqual([]);
    expect(buf.push('ion_open","sessionId":3}\n')).toEqual([
      '{"type":"session_open","sessionId":3}',
    ]);
  });

  test("LineBuffer drops blank lines", () => {
    const buf = new LineBuffer();
    expect(buf.push("\n\n{\"x\":1}\n\n")).toEqual(['{"x":1}']);
  });
});
