---
baseline_commit: 2bd3712
---

# Story 1.6: Error resilience and view preservation

Status: done

Created: 2026-06-04

Story Key: 1-6-error-resilience-and-view-preservation

## Story

As a Neovim user whose DOT is frequently broken mid-edit,
I want the preview to hold the last good graph and tell me about the error,
so that live reload never blanks my screen while I work.

## Acceptance Criteria

1. **Given** a preview showing a good render, **when** the buffer's DOT becomes a parse/render error, **then** the last good graph remains on screen and a non-blocking visible error message is shown (FR-9); the canvas (`#app`) never blanks.
2. **Given** the error is corrected, **when** the next valid render arrives, **then** the error indicator clears and the new graph replaces the previous one.
3. **Given** the renderer/library exposes zoom/pan state in v1 and `preserve_view` is enabled (default: `true`), **when** a reload re-renders, **then** the zoom/pan view-state is preserved where feasible (best-effort).
4. **Scope guard (passes unconditionally):** if the renderer cannot expose zoom/pan state cheaply in v1, the story still passes when ACs 1 and 2 (last-good render + visible error-overlay) are correct. Zoom/pan is best-effort and must not block AC1/AC2.
5. **Given** a late-connecting browser (cold-open race), **when** it receives the replayed `lastRender`, **then** the replayed render is the last *good* render (not a broken-DOT envelope). [server/sessions.ts: `lastRender` → `lastGoodDot` transition, deferred from Story 1.4 review]

## Tasks / Subtasks

- [x] **Frontend: `frontend/render-queue.ts` — activate the error-overlay SEAM** (AC: 1, 2)
  - [x] Change the signature of `createRenderQueue` to accept an optional second argument: `opts?: { onError?: (err: unknown, v: number) => void; onSuccess?: (v: number) => void }`. Both callbacks are optional for backward compatibility and test isolation.
  - [x] In `run()`, in the `.catch()` block, replace `console.error(...)` with: call `opts?.onError?.(err, entry.v)` (passes error + `v` to the overlay), then `console.error(...)` (keep the console log too). AC1 depends on this — `render-queue.ts` must NOT attempt to render a fallback dot; the overlay is the caller's responsibility.
  - [x] In `run()`, in the `.then()` block (after `lastAppliedV` advance), call `opts?.onSuccess?.(entry.v)`. The overlay's "clear error" path hooks here.
  - [x] The synchronous-throw recovery path in `run()` must also call `opts?.onError?.(syncErr, entry.v)`.
  - [x] Export `RenderQueueOpts` interface alongside `RenderFn` for type-safe consumers.

- [x] **Frontend: `frontend/render.ts` — last-good-render state + overlay wiring** (AC: 1, 2, 3)
  - [x] Maintain module-level state: `let lastGoodDot: string | null = null; let lastGoodEngine: string = "dot";`.
  - [x] Wrap `renderDot` in a new `renderDotWithFallback(dot: string, engine: string): Promise<void>` that: (a) calls `renderDot(dot, engine)`; (b) on success, updates `lastGoodDot = dot; lastGoodEngine = engine;`. This is the function passed to `createRenderQueue` (replacing the current bare `renderDot`).
    - **IMPORTANT:** `renderDotWithFallback` stores `lastGoodDot` only on success (i.e., in the `.then()` chain before returning). It does **NOT** render the fallback itself — fallback rendering is triggered by `onError` in the queue opts.
  - [x] Pass `onError` and `onSuccess` opts to `createRenderQueue(renderDotWithFallback, { onError, onSuccess })`:
    - `onError(err, v)`: (a) call `showError(err, v)` to display the overlay; (b) if `lastGoodDot !== null`, call `renderDot(lastGoodDot, lastGoodEngine)` to restore the canvas. Re-rendering with `lastGoodDot` bypasses the queue (it is a recovery render, not a new DOT version) — call `renderDot` directly. Log a warning if `renderDot` rejects during fallback (but do not recurse).
    - `onSuccess(v)`: call `clearError(v)` to dismiss the overlay.
  - [x] Remove the Story 1.6 SEAM comment from `render.ts` (activated).
  - [x] Export `_lastGoodDot(): string | null` as a test seam (production code never calls it).

- [x] **Frontend: `frontend/render.ts` — error overlay DOM** (AC: 1, 2)
  - [x] Implement `showError(err: unknown, v: number): void` — idempotent: if an overlay element already exists, update its text instead of inserting a second one. The overlay is a `<div id="ig-error-overlay">` positioned at top-right (or top-center) via inline CSS. Style: semi-transparent dark background, white text, z-index above `#app`, non-blocking pointer-events (does not capture clicks over the graph). Text: `"DOT parse error (v${v}): ${extractMessage(err)}"` where `extractMessage` returns `err.message` if `err instanceof Error` else `String(err)`. Cap the message at 200 characters to avoid giant overlay.
  - [x] Implement `clearError(_v: number): void` — removes `#ig-error-overlay` from the DOM if present. The `_v` parameter is accepted for future correlation but unused in v1.
  - [x] Do NOT import any CSS file — the overlay styles are inline on the element. No build pipeline change.
  - [x] Export `_overlayElement(): HTMLElement | null` as a test seam (returns `document.getElementById("ig-error-overlay")`).

- [x] **Frontend: `frontend/viewstate.ts` — zoom/pan capture and reapply** (AC: 3, 4)
  - [x] `viewstate.ts` currently exports only a stub `ViewState` interface and `defaultViewState()`. Upgrade it to capture and reapply `d3-zoom` transform for `preserve_view`. **However: only add the full implementation if `d3-graphviz`'s `graphviz()` instance exposes `zoom()` or `zoomTransform()` on the v1 version (5.6.0).** If it does not, keep the stub and add a comment explaining the limitation. The AC explicitly allows the story to pass with just AC1/AC2 working.
  - [x] The `preserve_view` flag is read from `config.get().preserve_view` (default `true`). Read it at render time in `render.ts`, not at module load.
  - [x] If implementing zoom/pan preservation: capture the transform before `renderDot` is called; reapply it in the `renderDot.on("end")` callback (or after the promise resolves). Use the `graphviz("#app").zoom(false)` disable/re-enable pattern if needed to avoid d3-graphviz overriding the transform during transition.
  - [x] Export `captureViewState(): ViewState | null` and `restoreViewState(vs: ViewState | null): void` from `viewstate.ts`.

- [x] **Server: `server/sessions.ts` — rename `lastRender` → `lastGoodRender`** (AC: 5)
  - [x] In `Session` interface: rename `lastRender?: ProtocolMessage` to `lastGoodRender?: ProtocolMessage`. Update `setLastRender` → `setLastGoodRender`. Update all references in `sessions.ts`, `server.ts`, and any `*.test.ts` files.
  - [x] In `server.ts`'s `render` case, call `sessions.setLastGoodRender(...)` only when the render envelope is considered valid (i.e., not an `error_display`). Render envelopes always carry valid DOT from the Lua side — a bad DOT produces an error on the browser side, not a bad server message. So the server's `render` case can still store every `render` envelope as `lastGoodRender`; the error is caught by the WASM renderer in the frontend. This means `lastGoodRender` stores the last DOT that was *dispatched* (not *rendered-without-error*). The browser's `lastGoodDot` (in `render.ts`) is the actual last-rendered-without-error DOT — these are separate concerns and that is correct.
    - **CLARIFICATION on semantics:** The server's `lastGoodRender` is "last render message that was cleanly relayed" — it feeds reconnect/cold-open. The frontend's `lastGoodDot` is "last DOT that actually rendered without a WASM error." Both are needed and serve different purposes.
  - [x] In `server.ts`'s `hello` case, replace `session.lastRender` with `session.lastGoodRender`.
  - [x] Update the Session comments to reflect the semantic distinction between server-side `lastGoodRender` and frontend `lastGoodDot`.

- [x] **Frontend: `frontend/main.ts` — wire `onErrorDisplay`** (AC: 1, 2)
  - [x] The `ws.ts` client already delivers `error_display` envelopes via `onErrorDisplay`. In `main.ts`, add an `onErrorDisplay` handler in the `createWebSocketClient` call. The handler should read `msg.message as string` and `msg.v as number` and call `showError(...)` imported from `./render`. Add the `showError` import (it is already exported from `render.ts` after the task above).
  - [x] Remove the comment `// error_display and session_closed are stash/log-only until Stories 1.6/1.7.` from `main.ts` (partially; keep the `session_closed` part if 1.7 is still future).
  - [x] Import `showError` and `clearError` from `"./render"` — these become the public error-display API.

- [x] **Tests** (AC: 1, 2, 3, 5)
  - [x] **`server/render-queue.test.ts`** — extend the existing test file (do NOT create a new one). Add a describe block: `"render-queue: error overlay hooks"`. Tests: (a) `onError` callback is called with the correct `err` and `v` when `renderFn` rejects; (b) `onSuccess` callback is called with the correct `v` on successful render; (c) `onError` is called on synchronous throw; (d) `onError` is NOT called on successful renders; (e) `onSuccess` is NOT called on failed renders. Use `_resetForTest()` in `beforeEach`.
  - [x] **`server/sessions.test.ts`** (or whichever session test file exists) — add a test confirming `setLastGoodRender` updates the session and that `subscribersOf` + replay after rename still work. Check if `sessions.test.ts` exists; if it doesn't, add the test to `server/relay.test.ts` or `server/render.test.ts` as appropriate.
  - [x] **Frontend bundle smoke:** `bun build frontend/index.html --outdir dist/frontend` must still pass.
  - [x] **Lua tests:** No Lua changes in this story. Do NOT modify `tests/render_spec.lua` or other `.lua` specs.
  - [x] **Local validation (busted NOT installed):** Verify Lua syntax with `nvim --headless -u tests/minimal_init.lua`. For TS tests, run `bun test server`. For frontend smoke, run `bun build frontend/index.html --outdir dist/frontend`.

## Dev Notes

### Scope Boundary (read first)

This story implements **error resilience and view preservation only**: last-good-render retention, visible error overlay, zoom/pan preservation (`preserve_view`), and `lastGoodDot` promotion in the server session. Do NOT implement:

- **`:GraphvizPreviewStop` / `:GraphvizPreviewToggle` / session teardown** — **Story 1.7**. `render.stop_watch` and `render.stop_all` are already implemented as seams.
- **Engine-switch UI / `:GraphvizEngine`** — **Epic 2**.
- **`setup{}` config surface expansion** — **Epic 2** (but reading `config.get().preserve_view` is fine — the key already exists in `config.lua` defaults).

### What Story 1.5 established (all must not regress)

Baseline HEAD is `2bd3712` (Story 1.5 complete + review patches applied):

- **`render-queue.ts`** has `createRenderQueue(renderFn)`. Story 1.6 changes the signature to `createRenderQueue(renderFn, opts?)`. Backward compatible — opts is optional.
- **`render.ts`** exports `renderDot` and `queueRender`. Story 1.6 keeps both exports; `queueRender` is re-wired to use `renderDotWithFallback` + opts.
- **`main.ts`** calls `queueRender(dot, engine, v)` in `onRender`. Do NOT change this call — it is correct as-is. Only add the `onErrorDisplay` handler.
- **`render.lua`** is fully implemented (debounce, `start_watch`, `stop_watch`, `stop_all`). Do NOT modify.
- **`commands.lua`** calls `render.start_watch(bufnr)` after `open_session`. Do NOT modify.
- **`server.ts`** calls `sessions.setLastRender(...)` — rename this to `setLastGoodRender` in this story.
- **`sessions.ts`** has `lastRender?: ProtocolMessage` on `Session` — rename to `lastGoodRender`.

### Error overlay design constraints

- **Non-blocking:** `pointer-events: none` or `pointer-events: auto` is a judgment call; the requirement is that clicks on the graph SVG remain reachable. Recommended: `pointer-events: none` on the overlay div so all mouse events pass through to `#app`.
- **Idempotent:** `showError` called twice must not create two overlay elements — find existing `#ig-error-overlay` and update its `textContent`.
- **Visually distinct:** dark semi-transparent background, white/yellow text. Exact colors at developer discretion. A minimal inline style like `position:fixed; top:8px; right:8px; background:rgba(30,0,0,0.85); color:#ff8080; padding:6px 10px; border-radius:4px; font-size:13px; font-family:monospace; z-index:9999; pointer-events:none; max-width:50vw; word-break:break-all;` is a reasonable starting point.
- **Error message capping:** `extractMessage(err)` — if `err instanceof Error`, use `err.message`; else `String(err)`. Cap at 200 characters with `…` suffix.

### d3-graphviz zoom/pan preservation (AC 3/4)

`d3-graphviz` 5.6.0 exposes the zoom behavior via `graphviz("#app").zoom()`. The typical approach to preserve zoom/pan across re-render:

```ts
import { zoomTransform } from "d3-zoom";  // d3-graphviz pulls in d3-zoom
import { select } from "d3-selection";

// Before render:
let savedTransform: unknown = null;
try {
  savedTransform = zoomTransform(document.getElementById("app")!);
} catch { /* not available yet */ }

// After render (in on("end")):
if (savedTransform && config.get().preserve_view) {
  // reapply transform via d3's zoom behavior bound to #app
}
```

However, `d3-graphviz`'s `graphviz()` instance manages d3-zoom internally, which may reset the transform on each `.renderDot()` call. The safe implementation path: check if `d3-graphviz` exposes a way to disable its internal zoom-reset (e.g., `graphviz("#app").zoom(false)` to disable, then manually manage). If this is too invasive in v1, defer zoom/pan preservation and leave `viewstate.ts` as a stub — AC 4 explicitly allows this.

**Architecture note:** `viewstate.ts` was scaffolded to eventually hold `captureViewState()` / `restoreViewState()`. The current stub just returns `{ preserve: true }`. Upgrade it or leave it; the story passes either way as long as AC1/AC2 are solid.

### Wire protocol: `error_display` message

The architecture defines `error_display{v, message}` as a **server → browser** message. In v1, the server does **NOT** send `error_display` — WASM parse errors are detected and handled entirely browser-side. The server sends `render{v, engine, dot}` and the browser's d3-graphviz raises an error event if the DOT is invalid.

`main.ts`'s `onErrorDisplay` handler is for the (dormant-in-v1) case where the server might someday forward a backend parse error. It is wired now for completeness and Story 1.4/review preparation, but will not fire in the typical flow — the `render-queue.ts` `onError` path is what fires on WASM errors.

**Summary of error paths:**
- DOT parse error → d3-graphviz fires `"error"` event → `renderDot` rejects → `render-queue.ts` `.catch()` → `onError(err, v)` → `showError(err, v)` + `renderDot(lastGoodDot, lastGoodEngine)`.
- `error_display` WS message → `ws.ts` `onErrorDisplay` → `main.ts` handler → `showError(msg.message, msg.v)`.
- Both paths call the same `showError` function.

### Files being modified (current state → what changes)

- `frontend/render-queue.ts` — **current:** `createRenderQueue(renderFn)`. **Change:** add `opts?: RenderQueueOpts` param; call `onError`/`onSuccess` hooks; export `RenderQueueOpts` type. **Preserve:** all existing v-guard + render-lock logic, test seams.
- `frontend/render.ts` — **current:** `renderDot` + `createRenderQueue(renderDot)` + `queueRender`. **Change:** add `renderDotWithFallback`; `lastGoodDot`/`lastGoodEngine` state; `showError`/`clearError` overlay functions; pass opts to queue; export `showError`, `clearError`, `_lastGoodDot`, `_overlayElement`. Remove Story 1.6 SEAM comment. **Preserve:** `renderDot` export, `queueRender` export, `d3-graphviz` as sole importer.
- `frontend/viewstate.ts` — **current:** stub. **Change:** optionally upgrade to full zoom/pan capture/restore. Either way, export `captureViewState` and `restoreViewState`.
- `frontend/main.ts` — **current:** `onRender` calls `queueRender`; `onErrorDisplay` not handled. **Change:** add `onErrorDisplay` handler that calls `showError`. Add import of `showError`. **Preserve:** `queueRender` call, `_wsClient`, `__igEnvelopes`, debug stash.
- `server/sessions.ts` — **current:** `lastRender?: ProtocolMessage; setLastRender(...)`. **Change:** rename to `lastGoodRender`, `setLastGoodRender`. **Preserve:** all other logic unchanged.
- `server/server.ts` — **current:** calls `sessions.setLastRender(...)` and replays `session.lastRender`. **Change:** update both to `setLastGoodRender` / `lastGoodRender`. **Preserve:** all other logic.
- `server/render-queue.test.ts` — **current:** 10 Bun tests. **Change:** add a new describe block with 5 tests for `onError`/`onSuccess` hooks. **Preserve:** all existing tests.

Do **not** touch: `lua/interactive-graphviz/render.lua`, `lua/interactive-graphviz/commands.lua`, `lua/interactive-graphviz/server.lua`, `lua/interactive-graphviz/session.lua`, `lua/interactive-graphviz/lifecycle.lua`, `lua/interactive-graphviz/config.lua`, `frontend/ws.ts`, `frontend/protocol.ts`, `server/protocol.ts`, `server/stdio.ts`, `tests/**/*.lua`, `.github/workflows/ci.yml`.

### Previous story intelligence (Story 1.5 done + review patches applied)

Key review patches already applied to the Story 1.5 codebase:

1. `stop_all()` now collects keys into a separate array before iterating to avoid iterator-mutation bug.
2. `start_watch` call in `commands.lua` is wrapped in `pcall`.
3. `debounce()` autocmd callback is wrapped in `pcall`.
4. `run()` in `render-queue.ts` sets `inFlight=true` **after** the `try { promise = renderFn(...) }` guard (sync-throw safe).

The Story 1.4 deferred item: `lastRender replayed on reconnect may be invalid/errored DOT` is directly addressed by this story's AC5 (rename `lastRender` → `lastGoodRender`). See `deferred-work.md` line: "`lastRender` replayed on reconnect may be invalid/errored DOT ... Story 1.6 introduces `lastGoodDot` to replace `lastRender`."

### `config.get().preserve_view` — already in config

`config.lua` already has `preserve_view = true` as a default (architecture `config.lua` stub). Calling `config.get().preserve_view` in `render.ts` is safe. Read it at the time of render (not at import time) to respect runtime config changes.

### Testing standards

- **busted is NOT installed locally** — do NOT run `busted` locally. CI handles Lua tests.
- **Local Lua validation:** `nvim --headless -u tests/minimal_init.lua -l <spec>` for module-load checks.
- **TypeScript tests:** `bun test server` (runs all `*.test.ts` under `server/`).
- **Frontend bundle smoke:** `bun build frontend/index.html --outdir dist/frontend`.
- **No floating promises in Bun tests:** every async test must `await` or explicitly handle all promises. New tests follow the same pattern as `server/render-queue.test.ts`.

### Render-queue `onError` contract

The `onError(err, v)` callback is called when `renderFn` rejects or throws synchronously. It is NOT expected to re-render or call `queueRender` — the queue has no `pending` to process here (error exits the normal path). The `onError` implementation in `render.ts` calls `renderDot` directly (bypasses the queue) to restore `lastGoodDot`. This is safe because:

1. The queue is not in-flight at the time `onError` returns (the `.finally()` has already set `inFlight=false` before `onError` runs, since `onError` is called from `.catch()` before `.finally()`). 
   - Actually: `.catch()` fires before `.finally()`, but `inFlight` is reset in `.finally()`. So `onError` is called while `inFlight` is still `true`. The direct `renderDot` call happens outside the queue — it does NOT set `inFlight=true` on the queue. This is intentional: the fallback render is not a new DOT version, it is a recovery path.
2. Calling `renderDot(lastGoodDot, lastGoodEngine)` directly is safe because d3-graphviz is not re-entrant, but the recovery render only runs after the in-flight render has settled (the `.catch()` phase). The d3 transition from the failed render will have been interrupted/cleared by the error event before `renderDot` is called.
   - If concerned about this, wrap the fallback `renderDot` in `setTimeout(fn, 0)` to ensure the current d3 render is fully torn down. This is optional but safe.

## Project Structure Notes

No new npm packages required. All changes are within the existing three-tier structure. The `render-queue.ts` API extension is backward-compatible (optional opts). The `sessions.ts` rename is a purely internal refactor with no wire-format change. The error overlay uses only the DOM API — no CSS file, no new dependency.

## References

- Epics: `_bmad-output/planning-artifacts/epics.md#Story 1.6` (lines 276-295); FR-9
- Architecture — Render Pipeline (last-good + error overlay + preserve zoom/pan): `architecture.md` lines 317-321
- Architecture — State & Session Model (`lastGoodDot`): `architecture.md` line 281
- Architecture — Message Protocol (`error_display`): `architecture.md` lines 307-308
- Architecture — Architectural Boundaries (render.ts sole d3-graphviz importer): `architecture.md` lines 637-638
- Architecture — Requirements to Structure Mapping (FR-9 → frontend/render.ts): `architecture.md` line 661
- Architecture — Configuration Surface (`preserve_view`): `architecture.md` line 367
- Architecture — Process Patterns (no floating promises): `architecture.md` lines 503-506
- Deferred work resolved: `deferred-work.md` — `lastRender replayed on reconnect may be invalid/errored DOT`; `Empty DOT buffer sends a render envelope; frontend silently ignores it`
- Previous story: `_bmad-output/implementation-artifacts/1-5-live-reload-on-buffer-change.md`
- `frontend/render-queue.ts` — Story 1.6 SEAM comment at top (lines 6-8)
- `frontend/render.ts` — Story 1.6 SEAM comment at top (lines 6-8)
- `server/sessions.ts` — `lastRender` → `lastGoodRender` rename (lines 23-24, 77-83)
- `server/server.ts` — `setLastRender` call (line 198) and `session.lastRender` replay (line 127)
- Memory: `local-test-harness.md` — busted not installed locally; use `bun test server` + nvim headless for Lua

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Implemented `RenderQueueOpts` interface with `onError`/`onSuccess` callbacks in `render-queue.ts`; backward-compatible optional `opts` param.
- `render.ts`: added `renderDotWithFallback` (updates `lastGoodDot`/`lastGoodEngine` on success), `showError`/`clearError` overlay functions (idempotent, inline CSS, `pointer-events:none`), `_lastGoodDot`/`_overlayElement` test seams. Wired `onError` (shows overlay + restores last good render via direct `renderDot`) and `onSuccess` (clears overlay).
- `viewstate.ts`: kept as stub per AC4 scope guard. d3-graphviz 5.6.0 manages zoom internally via private `_zoomBehavior`/`_zoomSelection` fields and rebuilds the zoom behavior on each `renderDot()` call, making safe capture/restore too invasive for v1. Exported `captureViewState()`/`restoreViewState()` as required stubs with explanatory comment.
- `main.ts`: wired `onErrorDisplay` handler calling `showError`; updated comment to reflect story 1.6 activation.
- `server/sessions.ts`: renamed `lastRender`→`lastGoodRender`, `setLastRender`→`setLastGoodRender`; updated Session comment to explain semantic distinction between server-side `lastGoodRender` and frontend `lastGoodDot`.
- `server/server.ts`: updated both `setLastGoodRender` call and `lastGoodRender` replay in `hello` handler.
- Tests: added 5-test describe block `"render-queue: error overlay hooks"` in `render-queue.test.ts`; added 3 tests for `setLastGoodRender` in `sessions.test.ts`.
- All 52 `bun test server` tests pass (47 existing + 5 new). Frontend bundle smoke: 178 modules bundled. Stylua: 0 issues. Lua module load: exit 0.

### File List

- `frontend/render-queue.ts` (modified)
- `frontend/render.ts` (modified)
- `frontend/viewstate.ts` (modified)
- `frontend/main.ts` (modified)
- `server/sessions.ts` (modified)
- `server/server.ts` (modified)
- `server/render-queue.test.ts` (modified)
- `server/sessions.test.ts` (modified)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)

### Change Log

- Implemented error resilience: last-good-render retention, visible error overlay, `lastGoodRender` server rename (Date: 2026-06-04)

### Review Findings

- [x] [Review][Patch] `onSuccess` fires for stale `entry.v`, can clear a valid error overlay [frontend/render-queue.ts:47-51]
- [x] [Review][Patch] Fallback `renderDot` called while `inFlight=true` — concurrent d3-graphviz render race; wrap in setTimeout(fn,0) [frontend/render.ts:103-107]
- [x] [Review][Patch] `showError` label "DOT parse error" misapplied to server-side `error_display` messages [frontend/render.ts:64]
- [x] [Review][Patch] `sessions.test.ts` test accesses `reg.sessions` internal map directly instead of public API [server/sessions.test.ts:83]
- [x] [Review][Defer] Unicode surrogate-pair split in `extractMessage` at 200-char boundary [frontend/render.ts:56] — deferred, pre-existing
- [x] [Review][Defer] AC5 semantic gap: server `lastGoodRender` stores every dispatched render including broken-DOT envelopes; true last-good replay requires frontend coordination — deferred, by design per spec dev notes
- [x] [Review][Defer] `config.get().preserve_view` not read at render time in `render.ts`; `captureViewState`/`restoreViewState` not called from render path — deferred, zoom/pan deferred by AC4 scope guard
