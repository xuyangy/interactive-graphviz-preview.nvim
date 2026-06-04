/**
 * FR-6 / NFR-6 gate: DOT → SVG via @hpcc-js/wasm-graphviz without any system
 * Graphviz installed. This exercises the same WASM engine that d3-graphviz
 * uses internally (the bundled renderer). No DOM is required.
 *
 * FR-6 path used: @hpcc-js/wasm-graphviz direct drive (Graphviz.load() →
 * gv.dot()/gv.layout()). A headless browser was unavailable in this
 * environment; these tests prove the WASM renderer produces valid SVG.
 * The d3-graphviz browser render path is exercised manually.
 *
 * These tests run as part of `bun test server` (the CI "Bun tests" step).
 */

import { describe, expect, test } from "bun:test";
import { Graphviz } from "@hpcc-js/wasm-graphviz";

describe("WASM renderer (FR-6 / NFR-6)", () => {
  test("produces valid SVG from DOT — no system Graphviz required", async () => {
    const gv = await Graphviz.load();
    const svg = gv.dot("digraph G { Hello -> World }");

    expect(typeof svg).toBe("string");
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    // NFR-6 semantic parity: node labels appear in the output.
    expect(svg).toContain("Hello");
    expect(svg).toContain("World");
  }, 15000);

  test("neato engine also produces valid SVG", async () => {
    const gv = await Graphviz.load();
    const svg = gv.layout("digraph { a -> b }", "svg", "neato");
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  }, 15000);

  test("invalid DOT throws — not a silent failure", async () => {
    const gv = await Graphviz.load();
    expect(() => gv.dot("this is not valid dot")).toThrow();
  }, 15000);
});
