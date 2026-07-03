---
title: 'Preview toolbar: clickable home / zoom-in / zoom-out buttons'
type: 'feature'
created: '2026-07-03'
status: 'done'
baseline_commit: '0e2135265c9fdef759af6f034c4126a23fa4d7a5'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** All view controls (reset-to-fit via `0`/`r`, zoom via scroll wheel / double-click / shift+double-click) are keyboard/mouse-gesture only — undiscoverable for users who prefer clicking buttons, and the double-click zoom isn't even documented. The PlantUML Previewer's top-right icon toolbar (home, zoom-in, zoom-out) is the reference UX.

**Approach:** Add a small fixed toolbar at the top-right of the preview page with three buttons — home (reset view to fit), zoom in, zoom out — each wrapping the code paths the existing gestures already use (`resetZoomToFit` and the live d3-zoom behavior's public `scaleBy`). No new behavior, only visible affordances. Document the toolbar and the previously undocumented double-click / shift+double-click zoom in README and vimdoc.

## Boundaries & Constraints

**Always:**
- Touch ONLY: `frontend/render.ts` (toolbar + `zoomBy`), `frontend/main.ts` (one install call), `frontend/render.dom.test.ts` (tests), `README.md` and `doc/interactive-graphviz.txt` (docs).
- Buttons must call the SAME code paths as the gestures: home → `resetZoomToFit()`; zoom in/out → the d3-graphviz instance's public `zoomBehavior().scaleBy(zoomSelection(), factor)` (the mechanism d3-zoom's own scroll/dblclick gestures use). No parallel zoom implementation.
- Follow the established overlay idiom in render.ts: `document.createElement`, inline `cssText`, id-guarded idempotent `install*()` function called once from main.ts, dark rgba background + monospace styling consistent with the error overlay / empty notice.
- Every button gets a `title` tooltip naming its keyboard/gesture equivalent (e.g. `Reset view (0 or r)`).
- Zero new dependencies (SM-C1); icons are inline text/SVG, no external assets.
- All button handlers are guarded no-ops before the first render (no zoom behavior yet) and never throw — mirror `resetZoomToFit`'s try/catch shape.

**Ask First:**
- Any change to the error overlay / empty notice / search box beyond a positional offset needed to avoid overlapping the toolbar.
- Any new Lua config key or wire-protocol surface (e.g. a toolbar on/off setting) — out of scope unless the human asks.

**Never:**
- Do not alter the existing keyboard/gesture behaviors or their handlers.
- Do not touch `server/`, `lua/`, or the protocol.
- Do not add a toolbar-hide config, animation, or pan buttons — not requested.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Home click after render | Graph rendered, user zoomed/panned | View resets to fit-to-viewport (same as pressing `0`/`r`) | N/A |
| Zoom-in / zoom-out click | Graph rendered | View scales about the current center by the fixed factor (in ×1.4, out ÷1.4) | N/A |
| Click before first render | Fresh page, no zoom behavior yet | Silent no-op, no console error thrown | try/catch + null-guard |
| Double install | `installViewToolbar()` called twice | Single toolbar (id-guarded), no duplicate buttons | N/A |
| Error overlay coexistence | DOT parse error shown while toolbar visible | Both visible without the overlay covering the buttons' click targets | N/A |
| Live re-render | Buffer edit triggers re-render | Toolbar persists (attached to body, outside `#app`) | N/A |

</frozen-after-approval>

## Code Map

- `frontend/render.ts:161` — `resetZoomToFit()`: the exact reset code path the home button calls; its guard/try-catch shape is the template for `zoomBy`
- `frontend/render.ts:139` — `zoomAccessor()`: shows how to reach the live `zoomBehavior()` / `zoomSelection()` off `graphviz("#app")`
- `frontend/render.ts:228-239` — error overlay: the overlay idiom (createElement + cssText + id guard) and the top-right occupant (`top:8px;right:8px`) the toolbar must coexist with; overlay is `pointer-events:none` so clicks already pass through — shift its `right` offset so it doesn't visually cover the buttons
- `frontend/render.ts:337-342` — `installResetKeybinding()`: the idempotent `install*` pattern to mirror
- `frontend/main.ts:32` — startup install-call site; add `installViewToolbar()` alongside the existing installs
- `frontend/render.dom.test.ts` — happy-dom DOM test file; `describe` blocks per story are the pattern to extend
- `README.md:85-95` — the "Navigating the graph" gesture table to extend (toolbar rows + double-click rows)
- `doc/interactive-graphviz.txt` — vimdoc; add the browser view-controls to the appropriate section

## Tasks & Acceptance

**Execution:**
- [x] `frontend/render.ts` — add `zoomBy(factor: number)` (public `scaleBy` on the live zoom behavior, guarded + try/catch like `resetZoomToFit`) and `installViewToolbar()` (idempotent; fixed vertical stack top-right, ids like `ig-view-toolbar`; three buttons: home → `resetZoomToFit()`, zoom-in → `zoomBy(1.4)`, zoom-out → `zoomBy(1/1.4)`; `title` tooltips naming gesture equivalents; dark rgba + monospace styling). Shift the error overlay's `right` offset so it clears the toolbar column.
- [x] `frontend/main.ts` — call `installViewToolbar()` once at startup next to the other installs, with a brief story-style comment
- [x] `frontend/render.dom.test.ts` — new `describe("view toolbar")`: toolbar exists with exactly 3 buttons after install; double-install stays 3; each button has a non-empty `title`; clicking each button before any render does not throw
- [x] `README.md` — extend the gesture table: toolbar buttons row(s), plus rows for `Double-click` (zoom in) and `Shift + double-click` (zoom out)
- [x] `doc/interactive-graphviz.txt` — document the browser view controls (toolbar + double-click zoom) in the interactivity section; regenerate helptags if the repo's flow requires it

**Acceptance Criteria:**
- Given a rendered graph that the user has zoomed/panned, when the home button is clicked, then the view resets exactly as pressing `0`/`r` does (same function, no divergent path)
- Given a rendered graph, when zoom-in then zoom-out are clicked once each, then the scale returns to (approximately) its starting value (inverse factors)
- Given the full frontend suite, when `bun test` runs in `frontend/`, then all pre-existing tests still pass and the new toolbar tests are green
- Given the README gesture table, when read after this change, then double-click and shift+double-click zoom appear as documented gestures alongside the toolbar

## Spec Change Log

## Verification

**Commands:**
- `bun test --cwd /Users/xuyangy/trash/git/interactive-graphviz.nvim/frontend` — expected: 0 failures, new toolbar describe block green
- `bunx tsc --noEmit -p /Users/xuyangy/trash/git/interactive-graphviz.nvim/frontend` (if a tsconfig exists; otherwise skip) — expected: no type errors

**Manual checks (if no CLI):**
- Open a preview (`:GraphvizPreview` on a DOT buffer): toolbar visible top-right with 3 buttons; hover shows tooltips; home/zoom buttons behave like their gesture twins; trigger a DOT parse error and confirm the error overlay does not cover the buttons

## Suggested Review Order

**The buttons wrap existing code paths (the core spec constraint)**

- Home button calls the same `resetZoomToFit` the `0`/`r` keys use; zoom uses d3-zoom's public `scaleBy`
  [`render.ts:449`](../../frontend/render.ts#L449)

- `zoomBy`: the only new behavior primitive — guarded, no-throw, mirrors `resetZoomToFit`'s shape
  [`render.ts:396`](../../frontend/render.ts#L396)

- One install call at startup, alongside the existing handler installs
  [`main.ts:57`](../../frontend/main.ts#L57)

**Toolbar construction + review-patch hardening**

- `installViewToolbar`: DOM-id-guarded (survives body rebuilds), role/aria-labels, outside `#app`
  [`render.ts:415`](../../frontend/render.ts#L415)

- `mousedown` preventDefault: clicks never steal focus from the search input or arm Space/Enter re-fire
  [`render.ts:444`](../../frontend/render.ts#L444)

- Inline SVG icons from plantuml-previewer.vim: classes flattened (they'd collide as globals), `currentColor` fill
  [`render.ts:371`](../../frontend/render.ts#L371)

**Overlay/search coexistence (the two collision fixes)**

- Shared clearance constant ties overlay offset to toolbar geometry — no magic-number drift
  [`render.ts:363`](../../frontend/render.ts#L363)

- Error overlay shifted right by the clearance so it never covers the buttons
  [`render.ts:235`](../../frontend/render.ts#L235)

- Search box max-width caps its right edge clear of the toolbar column on narrow windows
  [`render.ts:908`](../../frontend/render.ts#L908)

**Peripherals**

- 7 new happy-dom tests: 3 buttons + icons + tooltips, idempotence, pre-render no-throw, overlay offset, aria
  [`render.dom.test.ts:493`](../../frontend/render.dom.test.ts#L493)

- README gesture table: double-click zoom rows (previously undocumented) + toolbar row
  [`README.md:88`](../../README.md#L88)

- Vimdoc: new `*interactive-graphviz-view-controls*` subsection
  [`interactive-graphviz.txt:52`](../../doc/interactive-graphviz.txt#L52)
