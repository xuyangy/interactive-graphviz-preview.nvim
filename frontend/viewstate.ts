// viewstate.ts — zoom/pan capture and reapply for preserve_view (AC 3/4).
//
// d3-graphviz 5.6.0 manages d3-zoom internally via _zoomBehavior and
// _zoomSelection (private fields). On each renderDot() call it rebuilds the
// zoom behavior from scratch, discarding any transform previously applied via
// `zoomBehavior.transform(...)`. There is no public API to disable this
// reset-on-re-render without disabling zoom entirely (`graphviz("#app").zoom(false)`),
// which would remove the user's zoom interactivity.
//
// AC 4 explicitly allows the story to pass with just AC1/AC2 when zoom/pan
// preservation cannot be added cheaply in v1. This file exports the required
// interface but the capture/restore functions are stubs — zoom/pan preservation
// is deferred until a clean integration path is available (e.g., d3-graphviz
// exposes a public `restoreTransform` option).

export interface ViewState {
  preserve: boolean;
}

export function defaultViewState(): ViewState {
  return { preserve: true };
}

/**
 * Capture the current zoom/pan view state.
 * Returns null in v1 (zoom/pan restore deferred — see module comment).
 */
export function captureViewState(): ViewState | null {
  return null;
}

/**
 * Reapply a previously captured view state.
 * No-op in v1 (zoom/pan restore deferred — see module comment).
 */
export function restoreViewState(_vs: ViewState | null): void {
  // Deferred — see module comment above.
}
