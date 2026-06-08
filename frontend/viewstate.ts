// viewstate.ts — zoom/pan capture and reapply for preserve_view (Story 5.1, AC2/AC3).
//
// Background / the hazard this module works around
// -------------------------------------------------
// d3-graphviz 5.6.0 manages d3-zoom internally via the private fields
// `_zoomBehavior` and `_zoomSelection`. On each renderDot() it re-runs the graph
// transition; depending on key/SVG churn it can re-translate or rebuild the zoom
// state (createZoomBehavior / translateZoomBehaviorTransform in
// d3-graphviz/src/zoom.js), which can move the view away from the user's prior
// zoom/pan. There is no public option to pin the transform across re-renders
// without disabling zoom entirely (`graphviz("#app").zoom(false)`), which would
// remove the user's zoom/pan.
//
// The clean integration path (now implemented, deferral from Story 1.6 lifted)
// is defensive and idempotent regardless of whether 5.6.0 happens to preserve
// the transform on a given render:
//   1. BEFORE the new renderDot() runs, read the current d3-zoom transform off
//      the live zoom selection -> capture.
//   2. AFTER the render "end" event resolves (the zoom behavior is in place),
//      reapply the captured transform via the zoom behavior's `.transform()`.
//
// d3-graphviz exposes the live zoom state through two PUBLIC accessors
// (d3-graphviz/src/zoom.js): `zoomBehavior()` -> the d3-zoom behavior or null,
// and `zoomSelection()` -> the SVG selection or null. We read the current
// transform with `d3.zoomTransform(node)` from d3-zoom (a pure transform-math
// helper — NOT the renderer; importing it here does not break the "only render.ts
// imports the renderer" boundary, which concerns d3-graphviz / @hpcc-js/wasm).
//
// To keep this module pure-unit testable (the browser WASM render path has no
// automated harness), all DOM/d3 access goes through an injected `ZoomAccessor`.
// render.ts supplies the real accessor backed by the d3-graphviz instance;
// tests supply a stub. The exported function names (`captureViewState`,
// `restoreViewState`) are the seam the architecture references — kept stable.

import { zoomTransform } from "d3-zoom";

/**
 * Minimal view over the live d3-graphviz zoom state. render.ts builds one of
 * these from the graphviz instance; tests stub it. Mirrors the public
 * `zoomSelection()` / `zoomBehavior()` accessors of d3-graphviz 5.6.0.
 */
export interface ZoomAccessor {
  /** The SVG selection d3-zoom is bound to, or null before the first render. */
  zoomSelection(): { node(): Element | null } | null;
  /**
   * The d3-zoom behavior, or null before the first render. Its `.transform`
   * function reapplies a transform to a selection.
   */
  zoomBehavior(): {
    transform(selection: unknown, transform: unknown): void;
  } | null;
}

export interface ViewState {
  preserve: boolean;
  /**
   * The captured d3-zoom transform (`d3.zoomTransform` result: {x, y, k} with a
   * `.toString()`), or null when no transform was active at capture time.
   */
  transform: unknown | null;
}

export function defaultViewState(): ViewState {
  return { preserve: true, transform: null };
}

// ── preserve_view resolution (Decision D1, Option 1: frontend-default-on) ─────
// `preserve_view` is a Lua config key (default true). AC4 forbids new wire
// surface / Lua protocol changes, so the frontend resolves it locally: default
// true (matches the Lua default and zero-config). `setPreserveView(false)`
// lets the view reset on reload (AC3) and is the seam tests flip.
let _preserveView = true;

/** Set whether zoom/pan is preserved across live-reload (default true). */
export function setPreserveView(preserve: boolean): void {
  _preserveView = preserve;
}

/** Current resolved preserve_view value. */
export function getPreserveView(): boolean {
  return _preserveView;
}

/**
 * Capture the current zoom/pan transform from the live zoom selection.
 *
 * Returns a ViewState carrying the active d3-zoom transform, or null when:
 *  - preserve_view is false (nothing to preserve — caller should fit-reset), or
 *  - there is no live zoom selection yet (fresh canvas, before first render), or
 *  - no transform has been applied (identity — treated as "nothing to restore").
 *
 * Must run BEFORE the next renderDot() rebuilds the zoom behavior.
 */
export function captureViewState(accessor: ZoomAccessor): ViewState | null {
  if (!_preserveView) return null;

  const selection = accessor.zoomSelection();
  const node = selection?.node();
  if (!node) return null;

  const t = zoomTransform(node);
  // d3.zoomTransform returns zoomIdentity ({k:1,x:0,y:0}) when no transform is
  // set. Treat identity as "nothing to restore" so a fresh canvas fit-resets.
  if (t.k === 1 && t.x === 0 && t.y === 0) return null;

  return { preserve: true, transform: t };
}

/**
 * Reapply a previously captured view state onto the (newly rebuilt) zoom
 * behavior + selection.
 *
 * No-op when:
 *  - vs is null (nothing captured / preserve_view was false at capture), or
 *  - preserve_view is currently false (AC3 — let the new render fit-to-viewport), or
 *  - the new zoom behavior/selection do not yet exist.
 *
 * Must run AFTER the render "end" event, when the new _zoomBehavior exists.
 */
export function restoreViewState(accessor: ZoomAccessor, vs: ViewState | null): void {
  if (!_preserveView) return;
  if (!vs || vs.transform == null) return;

  const behavior = accessor.zoomBehavior();
  const selection = accessor.zoomSelection();
  if (!behavior || !selection) return;

  // Reapply via the zoom behavior's transform() — the same mechanism
  // d3-graphviz uses internally (zoomBehavior.transform(selection, transform)).
  behavior.transform(selection, vs.transform);
}
