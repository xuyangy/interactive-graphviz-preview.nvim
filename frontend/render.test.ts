import { describe, expect, test } from "bun:test";
import {
  fitTransformForBBox,
  shouldFitSelection,
  shouldReset,
  unionBBoxes,
  type RectLike,
} from "./render";

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

// Plan item #6 — the fit-to-selection `f` gesture predicate and the pure fit
// math (same DOM-free approach as shouldReset / cursorPanNeeded above; the
// d3-zoom transform application is covered by the browser smoke test).

describe("shouldFitSelection (fit-to-selection `f` gesture)", () => {
  test("triggers for unmodified `f` when nothing is focused", () => {
    expect(shouldFitSelection({ key: "f" }, undefined)).toBe(true);
  });

  test("does not trigger for other keys (case-sensitive)", () => {
    expect(shouldFitSelection({ key: "F" }, undefined)).toBe(false);
    expect(shouldFitSelection({ key: "g" }, undefined)).toBe(false);
  });

  test("does not trigger while typing (an `f` in the search input is a literal)", () => {
    expect(shouldFitSelection({ key: "f" }, "INPUT")).toBe(false);
    expect(shouldFitSelection({ key: "f" }, "TEXTAREA")).toBe(false);
  });

  test("does not trigger when a modifier is held (so e.g. Cmd+F finds)", () => {
    expect(shouldFitSelection({ key: "f", metaKey: true }, undefined)).toBe(false);
    expect(shouldFitSelection({ key: "f", ctrlKey: true }, undefined)).toBe(false);
    expect(shouldFitSelection({ key: "f", altKey: true }, undefined)).toBe(false);
  });

  test("still triggers over a non-text focused element (e.g. a BUTTON)", () => {
    expect(shouldFitSelection({ key: "f" }, "BUTTON")).toBe(true);
  });
});

describe("unionBBoxes (fit-to-selection bbox math)", () => {
  test("empty list is null; a single box is itself", () => {
    expect(unionBBoxes([])).toBeNull();
    const b = { x: 3, y: 4, width: 10, height: 20 };
    expect(unionBBoxes([b])).toEqual(b);
  });

  test("union spans disjoint and overlapping boxes", () => {
    expect(
      unionBBoxes([
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 30, y: 5, width: 10, height: 25 },
        { x: 5, y: 5, width: 2, height: 2 }, // fully inside the first
      ]),
    ).toEqual({ x: 0, y: 0, width: 40, height: 30 });
  });
});

describe("fitTransformForBBox (fit-to-selection transform math)", () => {
  // A 1:1 world: svg rect == viewBox == visible area, 1000×500 — so px and
  // viewBox units coincide and the expected numbers stay hand-checkable.
  const VIEW: RectLike = { left: 0, top: 0, right: 1000, bottom: 500 };
  const SVG: RectLike = VIEW;
  const VB = { x: 0, y: 0, width: 1000, height: 500 };
  const EXTENT: [number, number] = [0.1, 8];

  test("centers the bbox at the largest margin-scaled fit (height-limited here)", () => {
    const t = fitTransformForBBox({ x: 100, y: 100, width: 100, height: 100 }, VIEW, SVG, VB, EXTENT)!;
    // fit = min(1000/100, 500/100) * 0.9 = 4.5; bbox center (150,150) → view center (500,250).
    expect(t.k).toBeCloseTo(4.5);
    expect(t.tx).toBeCloseTo(500 - 4.5 * 150);
    expect(t.ty).toBeCloseTo(250 - 4.5 * 150);
  });

  test("a bbox larger than the view zooms OUT (k < 1) and still centers", () => {
    const t = fitTransformForBBox({ x: 0, y: 0, width: 4000, height: 500 }, VIEW, SVG, VB, EXTENT)!;
    expect(t.k).toBeCloseTo((1000 / 4000) * 0.9);
    expect(t.tx).toBeCloseTo(500 - t.k * 2000);
  });

  test("scale is clamped to the zoom behavior's extent (a tiny bbox can't out-zoom the wheel)", () => {
    const t = fitTransformForBBox({ x: 500, y: 250, width: 1, height: 1 }, VIEW, SVG, VB, EXTENT)!;
    expect(t.k).toBe(8); // raw fit would be 450×
  });

  test("degenerate geometry is null (zero-size bbox, view, svg, or viewBox)", () => {
    const box = { x: 0, y: 0, width: 10, height: 10 };
    const empty: RectLike = { left: 0, top: 0, right: 0, bottom: 0 };
    expect(fitTransformForBBox({ ...box, width: 0 }, VIEW, SVG, VB, EXTENT)).toBeNull();
    expect(fitTransformForBBox(box, empty, SVG, VB, EXTENT)).toBeNull();
    expect(fitTransformForBBox(box, VIEW, empty, VB, EXTENT)).toBeNull();
    expect(fitTransformForBBox(box, VIEW, SVG, { x: 0, y: 0, width: 0, height: 0 }, EXTENT)).toBeNull();
  });

  test("px→viewBox conversion: a scaled svg rect changes the fit accordingly", () => {
    // The svg renders at half its viewBox size: 500×250 px for a 1000×500 vb.
    const svgHalf: RectLike = { left: 0, top: 0, right: 500, bottom: 250 };
    const viewHalf = svgHalf; // fully visible
    const t = fitTransformForBBox({ x: 0, y: 0, width: 100, height: 100 }, viewHalf, svgHalf, VB, EXTENT)!;
    // Visible area in vb units is the full 1000×500 again → same fit as 1:1.
    expect(t.k).toBeCloseTo(4.5);
  });
});
