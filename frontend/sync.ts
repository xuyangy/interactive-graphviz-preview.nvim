// sync.ts — the browser-side gate + sender seam for Story 6.2 (graph → buffer).
//
// Clicking a node in the preview should put the Neovim cursor on that node's
// source line. This module owns the frontend half of that decision: a
// `jump_on_click` gate (resolved exactly like animate.ts / viewstate.ts — a
// module-level value fed by the URL-param config path, default ON) and an
// injectable sender seam. render.ts calls `emitNodeClick(title)` from its click
// handler; main.ts registers the real WebSocket sender at startup. Keeping the
// sender injected (instead of importing ws.ts here) keeps this module pure —
// no DOM, no socket — so the gate logic is unit-testable, and render.ts's
// import graph gains no network dependency.
//
// Emission is a side effect of the existing click-to-highlight behavior, never
// a replacement: this module knows nothing about selection or emphasis.

/** Sends one node_click for `nodeId`; returns whether a frame actually went out. */
export type NodeClickSender = (nodeId: string) => boolean;

// Default true — mirrors the Lua default `sync.jump_on_click = true`; the URL
// param (sync_jump_on_click) only ever confirms or flips this at startup.
let _jumpOnClick = true;
let _sender: NodeClickSender | null = null;

/**
 * Set the jump-on-click gate (default true). Non-boolean input is ignored, so a
 * tampered/garbage config value clamps to the default rather than breaking the
 * click path (mirrors setAnimate / setPreserveView).
 */
export function setJumpOnClick(on: unknown): void {
  if (typeof on === "boolean") _jumpOnClick = on;
}

/** Current resolved jump-on-click gate value (default true). */
export function getJumpOnClick(): boolean {
  return _jumpOnClick;
}

/**
 * Register the outbound sender (main.ts passes the WebSocket client's
 * `sendNodeClick`). Anything other than a function clears the registration —
 * with no sender, emitNodeClick is a safe no-op (e.g. before startup wiring).
 */
export function setNodeClickSender(sender: NodeClickSender | null): void {
  _sender = typeof sender === "function" ? sender : null;
}

/**
 * Emit a node_click for `nodeId` through the registered sender. Returns false —
 * and sends NOTHING — when the gate is off (AC3), when `nodeId` is empty, or
 * when no sender is registered; otherwise returns whether the sender reported a
 * frame actually sent.
 */
export function emitNodeClick(nodeId: string): boolean {
  if (!_jumpOnClick) return false;
  if (typeof nodeId !== "string" || nodeId.length === 0) return false;
  if (_sender === null) return false;
  return _sender(nodeId) === true;
}

// ── Test seam ─────────────────────────────────────────────────────────────────
/** Restore the default gate and clear the sender. Production never calls this. */
export function _resetSync(): void {
  _jumpOnClick = true;
  _sender = null;
}
