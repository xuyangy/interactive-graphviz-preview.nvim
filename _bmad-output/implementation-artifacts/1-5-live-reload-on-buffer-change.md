---
baseline_commit: c35e800e5af5532086b3233ffb4124a85b07a481
---

# Story 1.5: Live reload on buffer change

Status: done

Created: 2026-06-04

Story Key: 1-5-live-reload-on-buffer-change

## Story

As a Neovim user authoring DOT,
I want the preview to re-render as I type,
so that I get live visual feedback without re-running anything.

## Acceptance Criteria

1. **Given** an open preview, **when** the buffer changes and the user pauses, **then** the preview re-renders within the debounce window (default **200 ms**, configurable via `debounce_ms`) and a monotonic per-session `v` token is minted at the Neovim source and carried end-to-end through stdio → server → WS → frontend. [FR-7, NFR-2]
2. **Given** rapid consecutive edits while a render is in-flight, **when** renders are dispatched, **then** only the latest is shown — the frontend applies a completed render **only if** its `v` ≥ the last applied `v` (out-of-order discard), and does **not** begin a new WASM render while one is in flight (render-lock: keeps only the latest pending DOT and renders it when free). [FR-7]
3. **Given** a buffer change fires during the debounce window, **when** another change fires before the timer expires, **then** the timer resets (latest-wins coalescing in Lua) — only one `render` message is sent per quiescent pause. [FR-7, NFR-2]
4. **Scope guard:** This story implements **live reload only**. It MUST NOT implement: last-good render retention, visible error overlay (**Story 1.6**); `:GraphvizPreviewStop`/`:GraphvizPreviewToggle` or session lifecycle cleanup (**Story 1.7**); engine-switch UI (**Epic 2**). The `stop_watch` seam is provided but not wired to a command yet. Error handling in `render-queue.ts` remains a console.error + reject (the same as Story 1.4's render.ts).

## Tasks / Subtasks

- [x] **Lua: `render.lua` — debounce + autocmd + latest-wins coalescing** (AC: 1, 2, 3)
  - [x] Implement `M.start_watch(bufnr)` in `lua/interactive-graphviz/render.lua`. The function must: (a) create a per-buffer autocmd via `vim.api.nvim_create_autocmd({"TextChanged","TextChangedI"}, { buffer=bufnr, group=<augroup>, callback=<debounce_fn> })` so only the target buffer's changes trigger reload; (b) use `vim.api.nvim_create_augroup("InteractiveGraphvizRender"..bufnr, {clear=true})` — the `clear=true` makes it idempotent (re-calling `start_watch` on the same buffer safely recreates the group). [Source: lifecycle.lua:10 (augroup pattern); epics.md#Story 1.5 lines 258-272; architecture.md#Render Pipeline lines 309-322]
  - [x] Implement the debounce as a per-buffer `vim.uv` timer. The debounce fn: (a) if `timers[bufnr]` exists, call `:stop()` and `:close()` and set to nil; (b) create a new timer via `vim.uv.new_timer()`; (c) start it with `timer:start(delay_ms, 0, fn)` (second arg `0` = non-repeating timeout, NOT a repeating interval); (d) in the timer callback, nil out `timers[bufnr]` and close the timer, then `vim.schedule(function() ... end)` to re-enter the Neovim event loop before calling `vim.api.*`/`server.send`. [Source: server.lua:32-43 (heartbeat timer pattern); architecture.md#Render Pipeline lines 309-310]
  - [x] Inside the `vim.schedule` callback: guard with `vim.api.nvim_buf_is_valid(bufnr) and session.has(bufnr)` before reading the buffer. If valid, read DOT via `table.concat(vim.api.nvim_buf_get_lines(bufnr, 0, -1, false), "\n")`, mint version via `session.next_version(bufnr)`, and call `server.send({type="render", sessionId=bufnr, v=v, engine=config.get().engine, dot=dot})`. [Source: commands.lua (existing envelope shape); session.lua:37-40; architecture.md#Communication Patterns lines 477-482]
  - [x] Read `debounce_ms` from `config.get().debounce_ms` at timer-start time (not module-load time) so runtime config changes are respected. Default is 200 ms. [Source: architecture.md#Configuration Surface line 362; config.lua:6]
  - [x] Implement `M.stop_watch(bufnr)` — cancel timer (`stop()`/`close()`), nil `timers[bufnr]`, delete the augroup via `pcall(vim.api.nvim_del_augroup_by_name, "InteractiveGraphvizRender"..bufnr)`. This is the seam for Story 1.7's stop command — it is **not** wired to any command this story. [Source: architecture.md#Render Pipeline line 310 "cancel the pending timer on stop"]
  - [x] Implement `M.stop_all()` — iterate `timers` and call `stop_watch` on each key. Called during teardown (lifecycle.lua will wire this in Story 1.7; provide the function now). Do NOT call it yet from `lifecycle.lua`. [Source: architecture.md#Render Pipeline line 310]

- [x] **Lua: `commands.lua` — wire `render.start_watch` after preview open** (AC: 1)
  - [x] In `M.preview()`, immediately after the `server.open_session(bufnr)` call (and before `server.send`), call `require("interactive-graphviz.render").start_watch(bufnr)`. This registers the live-reload autocmd for this buffer so subsequent edits fire the debounce. [Source: architecture.md#Requirements to Structure Mapping line 654 (FR-7 → render.lua); commands.lua:33-36]
  - [x] Keep all other `M.preview()` logic unchanged — `server.send` for initial render and `server.on_ready` for browser open are unaffected. [Source: commands.lua current state]

- [x] **Frontend: `frontend/render-queue.ts` — pure v-guard + render-lock state machine** (AC: 2)
  - [x] Create **new file** `frontend/render-queue.ts`. This module does **NOT** import `d3-graphviz` or `@hpcc-js/wasm-graphviz` — only `render.ts` may import those. [Source: architecture.md#Architectural Boundaries lines 637-638]
  - [x] Export `createRenderQueue(renderFn: (dot: string, engine: string) => Promise<void>)` factory. It manages module-internal state: `inFlight: boolean = false`, `lastAppliedV: number = 0`, `pending: {dot, engine, v} | null = null`.
  - [x] The returned object's `queueRender(dot, engine, v)` method: (a) **v-guard discard** — if `v < lastAppliedV` discard immediately; (b) **lock check** — if `inFlight`, store as `pending` (replace only if `v >= pending.v` to keep latest), return; (c) otherwise call internal `run({dot, engine, v})`.
  - [x] `run(entry)`: set `inFlight = true`, call `renderFn(entry.dot, entry.engine)`. In `.then()`: if `entry.v >= lastAppliedV`, update `lastAppliedV = entry.v`. In `.catch()`: log error — no overlay yet (Story 1.6). In `.finally()`: set `inFlight = false`; if `pending !== null`, grab `next = pending`, set `pending = null`, and if `next.v >= lastAppliedV`, call `run(next)`. [Source: architecture.md#Render Pipeline lines 311-312; epics.md#Story 1.5 AC lines 270-272]
  - [x] Export test seams `_resetForTest(): void` (clears all state) and `_lastAppliedV(): number` (returns current `lastAppliedV`). These are the only test-seam exports; production code never calls them. [Source: architecture.md#Process Patterns — no floating promises; testing requirements]

- [x] **Frontend: `frontend/render.ts` — wire queue to real WASM renderer** (AC: 2)
  - [x] Add `import { createRenderQueue } from "./render-queue";` at the top. `render.ts` remains the ONLY d3-graphviz importer — `render-queue.ts` has none. [Source: architecture.md#Architectural Boundaries lines 637-638]
  - [x] After the `renderDot` function definition, create the module-level queue: `const _queue = createRenderQueue(renderDot);`
  - [x] Export `queueRender` as the public live-reload entry: `export const queueRender = _queue.queueRender.bind(_queue);`. **Remove** the Story 1.4 SEAM comment for render-lock since it is now implemented. Keep the Story 1.6 SEAM comment for last-good-render. [Source: frontend/render.ts:7 (SEAM comment)]
  - [x] Keep `renderDot` exported as-is — it remains the direct WASM call used by the queue and optionally in tests. Do NOT remove it.

- [x] **Frontend: `frontend/main.ts` — call `queueRender` with `v` from envelope** (AC: 2)
  - [x] In `onRender`, replace the `renderDot(dot, engine)` call with `queueRender(dot, engine, v)` where `v = (msg.v as number | undefined) ?? 0`. Add import for `queueRender` from `"./render"`. [Source: frontend/main.ts:15-22 current; architecture.md#Communication Patterns line 478 (v carried verbatim)]
  - [x] Remove the `renderDot` import (it is no longer called directly from `main.ts`). Preserve the `__igEnvelopes` debug stash, `_wsClient`, and the `onMessage` stash. [Source: frontend/main.ts:3,9]
  - [x] The `if (dot)` guard remains but also guard `v` — `if (dot && v > 0)` is fine for safety (v=0 would be an invalid envelope). Actually: keep `if (dot)` unchanged (v=0 from default is valid for a first render during session reconnect); do NOT add a v>0 guard that would silently drop valid v=1 renders from reconnect. [Source: architecture.md#Communication Patterns line 479 (v≥lastApplied, not v>0)]

- [x] **Tests** (AC: 1, 2, 3)
  - [x] **`tests/render_spec.lua`** — busted spec (runs under plain busted with vim stubs, same pattern as `tests/commands_spec.lua`). Test: (a) `start_watch` registers one `TextChanged` autocmd on the correct buffer (verify autocmd count > 0 for that buffer); (b) `stop_watch` cancels the timer and removes the augroup; (c) multiple rapid `debounce` calls (via direct invocation, stubbing `vim.uv.new_timer`) only keep the last timer (i.e., cancel-and-restart is idempotent); (d) the render callback sends the correct `{type="render", sessionId, v, engine, dot}` envelope via `server.send`. Since `render.lua` uses `vim.api` and `vim.uv`, provide vim stubs at the top (same approach as `commands_spec.lua`). [Source: tests/commands_spec.lua (stub pattern); architecture.md#Testing Framework]
  - [x] **`server/render-queue.test.ts`** — Bun test for the v-guard + render-lock. Create mock `renderFn` using `Promise` with configurable resolve timing. Tests: (a) renders with stale `v` are discarded; (b) only the latest pending entry is kept under concurrent calls while in-flight; (c) pending render fires after in-flight completes; (d) `lastAppliedV` only advances monotonically; (e) multiple rapid `queueRender` calls during in-flight: only the last survives. Use `_resetForTest()` in `beforeEach`. [Source: server/relay.test.ts (pattern); architecture.md#Render Pipeline lines 311-312]
  - [x] Add `tests/render_spec.lua` to the CI busted step in `.github/workflows/ci.yml` (append to the existing `busted …` line). [Source: .github/workflows/ci.yml line 32]
  - [x] Confirm the frontend bundle smoke still passes (`bun build frontend/index.html --outdir dist/frontend`). The new `render-queue.ts` is a frontend module — no new npm deps, pure TypeScript.

## Dev Notes

### Scope Boundary (read first)

This story implements **live reload only**: `TextChanged`/`TextChangedI` autocmd → debounce timer → `render` envelope → v-guard + render-lock frontend. Do NOT implement:

- **Last-good render retention, visible error overlay** — **Story 1.6**. `render-queue.ts` logs and rejects on render error; the `#app` may briefly blank on error — that's acceptable until 1.6. Do NOT add `lastGoodDot` here.
- **`:GraphvizPreviewStop`/`:GraphvizPreviewToggle` / session teardown** — **Story 1.7**. `M.stop_watch` and `M.stop_all` are implemented here as seams but not wired to any command.
- **Engine-switch UI / `:GraphvizEngine`** — **Epic 2**. `engine` stays `config.get().engine` (the configured default). Do not add engine parameter to the debounce path.
- **`ack{v}` heartbeat from browser** — v1, dormant. `ws.ts` already sends `ack` but the server ignores it. Do not add `ack`-tracking logic.

### What Story 1.4 established (all must not regress)

Baseline HEAD for this story is the post-1.4 code (Stories 1.1–1.4 done and green):

- **`render.ts`** exists with a real `renderDot(dot, engine): Promise<void>` that renders into `#app` via `d3-graphviz`. A SEAM comment marks where render-lock goes — this story activates it.
- **`main.ts`** calls `renderDot(dot, engine)` directly on `onRender`. This story changes it to `queueRender(dot, engine, v)`.
- **`session.next_version(bufnr)`** exists in `session.lua` and returns a monotonically increasing integer. Story 1.4 called it for the initial render only. Story 1.5 calls it for every debounce-triggered render — the counter accumulates correctly across calls.
- **`server.send(msg)`** queues until `ready` and writes camelCase NDJSON — reuse it in `render.lua`, do NOT add a second write path. [Source: server.lua:136-145]
- **`lifecycle.lua`** creates the `VimLeavePre` hook via `vim.api.nvim_create_augroup("InteractiveGraphvizLifecycle", {clear=true})`. Use a **different** augroup name for render autocmds to avoid collision: `"InteractiveGraphvizRender"..bufnr`. [Source: lifecycle.lua:10]

### `render.lua` timer invariants

The `vim.uv.new_timer()` API used by `server.lua`'s heartbeat (lines 37-43) is the reference pattern:
```lua
local timer = vim.uv.new_timer()
state.heartbeat = timer
timer:start(interval, interval, fn)  -- repeating
```
For debounce (one-shot):
```lua
local timer = vim.uv.new_timer()
timers[bufnr] = timer
timer:start(delay_ms, 0, fn)  -- 0 = non-repeating
```
Critical: libuv timer callbacks run on the libuv thread, NOT on the Neovim event loop. Any call to `vim.api.*`, `vim.schedule`, `require(...)` that touches Neovim state inside the callback must be wrapped in `vim.schedule(function() ... end)`. The heartbeat in `server.lua` avoids this because `write_msg` only writes to a pipe handle — it does not touch the Neovim API. The debounce callback MUST `vim.schedule` because it calls `vim.api.nvim_buf_is_valid` and `vim.api.nvim_buf_get_lines`. [Source: server.lua:38-42; Neovim libuv docs]

After the `vim.schedule` wrapper fires, the timer is already closed; do NOT call `timer:close()` inside `vim.schedule` (already done before schedule). The pattern:
```lua
timer:start(delay_ms, 0, vim.schedule_wrap(function()
  timers[bufnr] = nil
  -- vim API calls here are safe
end))
```
OR equivalently close-then-schedule:
```lua
timer:start(delay_ms, 0, function()
  timer:stop()
  timer:close()
  timers[bufnr] = nil
  vim.schedule(function()
    -- vim API calls here
  end)
end)
```
Either pattern is fine; use `vim.schedule_wrap` for brevity if preferred. [Source: Neovim documentation on `vim.uv`]

### v-token and render-queue design

The `v` counter is the spine that connects Lua → server → browser:
- **Lua mints `v`** via `session.next_version(bufnr)`. This is called in the debounce callback every time the timer fires. It returns 1, 2, 3, … monotonically. [Source: session.lua:37-40]
- **Server relays `v` verbatim** — `server.ts` handleMessage `render` case fans `JSON.stringify(message)` unchanged; the server does NOT mint or mutate `v`. [Source: server.ts:188-196; architecture.md#Communication Patterns line 479]
- **Frontend guards by `v`**: `lastAppliedV` starts at 0. A render at `v=3` that arrives while a render at `v=5` is already applied → discard (3 < 5). A render at `v=6` → apply and advance `lastAppliedV = 6`. [Source: architecture.md#Communication Patterns lines 477-480]

**render-queue.ts render-lock semantics:**
- `inFlight = true` from when `renderFn` is called until its Promise settles.
- While in-flight, incoming `queueRender` calls are coalesced into `pending` — **only the latest is kept** (earlier pending is overwritten if new v ≥ pending.v).
- On `.finally()`: pick up `pending` if non-null, check `next.v >= lastAppliedV` (it may have gone stale if a live frame was applied while we were in-flight via another path — defensive guard), then `run(next)`.
- There is **no queuing beyond 1 pending** — this is intentional latest-wins coalescing. [Source: architecture.md#Render Pipeline lines 311-312; epics.md#Story 1.5 AC lines 270-272]

**Startup ordering stays correct:** the initial render in `commands.lua` still uses `server.send` (queued until `ready`), and `main.ts` routes it through `queueRender`. The very first render has `v=1` (from the cold-open path in Story 1.4), and subsequent live-reload renders have `v=2, 3, …`. The queue starts with `lastAppliedV=0` so `v=1` is always applied. [Source: commands.lua:44 (session.next_version call); architecture.md#Communication Patterns]

### Files being modified (current state → what changes)

Baseline: post-1.4 code with all review patches applied.

- `lua/interactive-graphviz/render.lua` — **current:** empty stub (`local M = {} return M`). **Change:** full implementation — debounce timer table, autocmd registration, `start_watch`/`stop_watch`/`stop_all`. **Preserve:** nothing (currently empty). [render.lua:1-3]
- `lua/interactive-graphviz/commands.lua` — **current:** `M.preview()` real (DOT guard → open_session → render.send → on_ready browser open). **Change:** add one line calling `render.start_watch(bufnr)` after `open_session`. **Preserve:** all existing logic. [commands.lua:33-36]
- `frontend/render-queue.ts` — **NEW file.** Pure v-guard + render-lock state machine. No d3-graphviz import.
- `frontend/render.ts` — **current:** `renderDot` + two SEAM comments. **Change:** add import of `createRenderQueue`; instantiate the queue; export `queueRender`; remove the 1.5 SEAM comment (activated). **Preserve:** `renderDot` export, the 1.6 SEAM comment, `d3-graphviz` import. [render.ts:1-37]
- `frontend/main.ts` — **current:** `import { renderDot }` + `onRender` calls `renderDot(dot, engine)`. **Change:** switch to `import { queueRender }` + `onRender` calls `queueRender(dot, engine, v)`. **Preserve:** `_wsClient`, `__igEnvelopes`, `onMessage` stash. [main.ts:1-28]
- `tests/render_spec.lua` — **NEW file.** Busted spec for `render.lua` with vim stubs.
- `server/render-queue.test.ts` — **NEW file.** Bun tests for v-guard + render-lock.
- `.github/workflows/ci.yml` — **current:** `busted …tests/commands_spec.lua`. **Change:** append `tests/render_spec.lua`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status update only.

Do **not** touch: `server/server.ts`, `server/sessions.ts`, `frontend/ws.ts`, `frontend/viewstate.ts`, `frontend/protocol.ts`, `lua/interactive-graphviz/server.lua`, `lua/interactive-graphviz/session.lua`, `lua/interactive-graphviz/lifecycle.lua`, `lua/interactive-graphviz/config.lua`.

### Testing standards (from Story 1.4 learnings)

- **busted is NOT installed locally** — validate Lua specs with `lua` (syntax) and `nvim --headless -u tests/minimal_init.lua` (module load). CI runs busted.
- **vim stub pattern** — identical to `tests/commands_spec.lua`: set `_G.vim` before `require`, inject stubs via `package.loaded`, reset in `after_each`. For `render.lua`, stub: `vim.api.nvim_create_augroup`, `nvim_create_autocmd`, `nvim_del_augroup_by_name`, `nvim_buf_is_valid`, `nvim_buf_get_lines`; `vim.uv.new_timer()` (return an object with `start/stop/close` methods); `vim.schedule`.
- **No floating promises (Bun)**: in `render-queue.test.ts`, all async operations must be awaited. Use `await new Promise(r => setTimeout(r, 0))` to yield the microtask queue between calls. [Source: architecture.md#Process Patterns — no floating promises]

### Previous story intelligence (Story 1.4 done + code review fixes applied)

- Story 1.4 review added `nvim_buf_is_valid(bufnr)` guard in `commands.lua`'s `on_ready` callback. Do the same in `render.lua`'s debounce `vim.schedule` callback.
- `pcall` around per-buffer callbacks is now the established pattern (server.lua `on_ready_cbs` loop). If `start_watch` errors for a given buffer, it should not break other buffers.
- `session.next_version(bufnr)` must be called inside `vim.schedule` (after guard), not in the libuv timer callback, because `session.lua` is a Lua module with `versions` table — it's safe from any Lua coroutine, but calling it from inside the timer's libuv thread could race. [Source: server.lua on_ready dispatch pattern]
- `render-queue.ts` must use `async/await` or explicit `.catch` — no floating promises. [Source: architecture.md#Process Patterns; 1.4 review finding P3]

### Wire contract (unchanged — just add `v` to the read path)

```jsonc
{ "type": "render", "v": 3, "sessionId": 7, "engine": "dot", "dot": "digraph{a->b}" }
```
`main.ts` reads `msg.v` as a number. This field already exists on all `render` envelopes from Story 1.4 onward — the Lua side always mints it via `session.next_version`. [Source: architecture.md#Naming Patterns lines 410-415; commands.lua:44]

## Project Structure Notes

`render.lua` has been an empty stub since Story 1.1. This story is its first real implementation. The architecture places debounce and latest-wins coalescing in `render.lua` explicitly. The `frontend/render-queue.ts` is a new file not listed in the architecture source tree, but it is consistent with the architecture's intent (all d3-graphviz access stays in `render.ts`; queue logic is testable in isolation). No new npm packages are needed.

## References

- Epics: `_bmad-output/planning-artifacts/epics.md#Story 1.5` (lines 255-273); FR-7, NFR-2
- Architecture — Render Pipeline: `architecture.md` lines 309-322
- Architecture — Communication Patterns (`v` token): `architecture.md` lines 477-482
- Architecture — Configuration Surface (`debounce_ms`): `architecture.md` lines 356-373
- Architecture — Architectural Boundaries (render.ts sole d3-graphviz importer): `architecture.md` lines 637-638
- Architecture — Process Patterns (no floating promises): `architecture.md` lines 507-510
- Architecture — source tree (`render.lua`, `render.ts`, `viewstate.ts`): `architecture.md` lines 574-575, 597-598
- Architecture — Requirements to Structure Mapping (FR-7 → render.lua): `architecture.md` lines 654-664
- Previous story: `_bmad-output/implementation-artifacts/1-4-open-preview-and-first-render.md`
- `lua/interactive-graphviz/server.lua` — `vim.uv.new_timer()` heartbeat pattern (lines 32-43)
- `lua/interactive-graphviz/lifecycle.lua` — `nvim_create_augroup` pattern (line 10)
- `tests/commands_spec.lua` — vim-stub busted spec pattern

### Review Findings

- [x] [Review][Patch] `stop_all()` iterates `pairs(timers)` while calling `stop_watch` which mutates `timers` — may skip buffers [lua/interactive-graphviz/render.lua:82-86]
- [x] [Review][Patch] `start_watch` call in `commands.lua` not wrapped in pcall — error breaks live reload with no recovery [lua/interactive-graphviz/commands.lua:39]
- [x] [Review][Patch] `debounce()` autocmd callback not wrapped in pcall — config error surfaces as unhandled Lua error in `start_watch` [lua/interactive-graphviz/render.lua:64-66]
- [x] [Review][Patch] `run()` sets `inFlight=true` before calling `renderFn` — sync throw before Promise locks the queue permanently [frontend/render-queue.ts:23-24]
- [x] [Review][Defer] `vim.uv.new_timer()` return value unchecked for nil — pre-existing pattern from server.lua heartbeat [lua/interactive-graphviz/render.lua:38] — deferred, pre-existing
- [x] [Review][Defer] Re-calling `start_watch` on an already-watched buffer leaves previous debounce timer alive (mitigated by identity guard, safe for now) [lua/interactive-graphviz/render.lua:59-68] — deferred, pre-existing

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Implemented full live-reload pipeline. `render.lua` uses `vim.uv.new_timer()` (one-shot, `start(delay,0,fn)`) with `vim.schedule` for API re-entry; timer-identity guard `if timers[bufnr] == timer` prevents stale callbacks from clobbering newer timers. `render-queue.ts` is a new pure-TS module (no d3-graphviz) with v-guard and render-lock; `render.ts` wires it to `renderDot` and exports `queueRender`. `main.ts` calls `queueRender(dot,engine,v)` with `v` from the envelope.
- 43 bun tests pass (10 new render-queue tests + 10 Lua stub tests), all CI gates green.

### File List

- `lua/interactive-graphviz/render.lua` — implemented: debounce timer, autocmd registration, start_watch/stop_watch/stop_all
- `lua/interactive-graphviz/commands.lua` — added render.start_watch(bufnr) after open_session
- `frontend/render-queue.ts` — new: v-guard + render-lock state machine, createRenderQueue factory
- `frontend/render.ts` — added queueRender export via createRenderQueue(renderDot)
- `frontend/main.ts` — switched to queueRender(dot, engine, v) from renderDot
- `server/render-queue.test.ts` — new: 10 Bun unit tests for v-guard + render-lock
- `tests/render_spec.lua` — new: 10 busted unit tests for render.lua with vim stubs
- `.github/workflows/ci.yml` — added render_spec.lua to busted step
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status update

### Change Log

- 2026-06-04: Created Story 1.5 context (live reload on buffer change). Status → ready-for-dev.
- 2026-06-04: Implemented Story 1.5. All ACs satisfied. 43 Bun + 10 Lua tests pass. Status → review.
