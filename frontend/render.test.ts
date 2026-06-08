import { describe, expect, test } from "bun:test";
import { shouldReset } from "./render";

// Story 5.1 AC1 — the reset-to-fit keybinding predicate. Pure + DOM-free, so
// the `0`/`r` gesture decision logic is unit-tested without a browser (the real
// d3-graphviz render + d3-zoom path has no automated harness — see MEMORY
// browser-render-untested). The render-triggering side (resetZoomToFit ->
// graphviz("#app").resetZoom()) is verified manually in a browser.

describe("shouldReset (reset-to-fit `0`/`r` gesture)", () => {
  test("triggers for unmodified `0` when nothing is focused", () => {
    expect(shouldReset({ key: "0" }, undefined)).toBe(true);
  });

  test("triggers for unmodified `r` when nothing is focused", () => {
    expect(shouldReset({ key: "r" }, undefined)).toBe(true);
  });

  test("does not trigger for other keys", () => {
    expect(shouldReset({ key: "a" }, undefined)).toBe(false);
    expect(shouldReset({ key: "Enter" }, undefined)).toBe(false);
    expect(shouldReset({ key: "R" }, undefined)).toBe(false); // case-sensitive: capital R is not bound
  });

  test("does not trigger while typing in an INPUT (search seam for Story 5.3)", () => {
    expect(shouldReset({ key: "0" }, "INPUT")).toBe(false);
    expect(shouldReset({ key: "r" }, "INPUT")).toBe(false);
  });

  test("does not trigger while typing in a TEXTAREA", () => {
    expect(shouldReset({ key: "r" }, "TEXTAREA")).toBe(false);
  });

  test("does not trigger when a modifier is held (so e.g. Cmd+R reloads)", () => {
    expect(shouldReset({ key: "r", metaKey: true }, undefined)).toBe(false);
    expect(shouldReset({ key: "r", ctrlKey: true }, undefined)).toBe(false);
    expect(shouldReset({ key: "0", altKey: true }, undefined)).toBe(false);
  });

  test("still triggers over a non-text focused element (e.g. a BUTTON)", () => {
    expect(shouldReset({ key: "0" }, "BUTTON")).toBe(true);
  });
});
