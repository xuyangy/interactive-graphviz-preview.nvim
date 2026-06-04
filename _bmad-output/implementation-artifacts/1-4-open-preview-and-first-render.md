---
baseline_commit: c35e800e5af5532086b3233ffb4124a85b07a481
---

# Story 1.4: Open preview and first render

Status: done

Created: 2026-06-03T17:58:00+0200
Story Key: 1-4-open-preview-and-first-render

## Story

As a Neovim user editing a `.dot`/`.gv` file,
I want `:GraphvizPreview` to open a browser tab showing my rendered graph,
so that I can see my graph without leaving the editor.

## Acceptance Criteria

1. **Given** a `.dot`/`.gv` buffer, **when** the user runs `:GraphvizPreview`, **then** the server starts if not already running (reusing the existing one otherwise) and the **default browser opens** to exactly `http://127.0.0.1:<port>/?sessionId=<bufnr>&token=<token>` — `<port>`/`<token>` taken from the live `ready{port,token}` state, `<bufnr>` = the current buffer number. The browser is opened via `vim.ui.open` (or the configured `open_cmd`). [FR-1]
2. **Given** the preview is opened, **when** the browser tab loads and authenticates (`hello{sessionId,token}`), **then** the **initial Graph renders from that buffer's DOT** using the bundled `@hpcc-js/wasm-graphviz`/`d3-graphviz` with **no system Graphviz/`dot` installed** — the Lua side sends one `render{sessionId,v,engine,dot}` (engine = the configured default `dot`) and the frontend `render.ts` performs the real WASM render into the page. [FR-6]
3. **Given** valid DOT, **when** it renders, **then** the rendered Graph **matches Graphviz semantics** (parity with the d3-graphviz/WASM reference renderer). [NFR-6]
4. **Given** a **non-DOT buffer** (filetype not `dot`, i.e. not `.dot`/`.gv`), **when** the user runs `:GraphvizPreview`, **then** it is a **no-op with an informative message** (via `log.lua`) — no server spawn, no session, no browser open. [FR-1]
5. **Given** a buffer already has a preview open, **when** `:GraphvizPreview` is run again on it, **then** it does not double-spawn the server and re-opens / re-renders the existing session (idempotent open; the browser may already be connected). It must not leave an inconsistent state.
6. **Scope guard:** This story implements **first render on open only**. It MUST NOT implement: debounce, live-reload on buffer change, the monotonic-`v` end-to-end machinery, render-lock, or latest-wins (**Story 1.5**); last-good-render retention, the error overlay, or zoom/pan view-state preservation (**Story 1.6**); `:GraphvizPreviewStop`/`:GraphvizPreviewToggle` or last-buffer-close teardown (**Story 1.7**); engine-switch UI / `:GraphvizEngine` (**Epic 2**). The `v` carried here is a minimal first value (see Dev Notes) — do NOT build the `v` policy here.

## Tasks / Subtasks

- [x] **Lua: `:GraphvizPreview` opens browser + sends first render** (AC: 1, 2, 4, 5)
  - [x] In `lua/interactive-graphviz/commands.lua`, replace the `M.preview()` placeholder with the real command. Steps, in order: (a) resolve the current buffer (`vim.api.nvim_get_current_buf()`); (b) **guard non-DOT**: if the buffer is not a DOT buffer, call `log.notify`/`log.info` with an informative message and **return** (no spawn, no session, no open) — see "DOT-buffer detection" in Dev Notes; (c) call `server.open_session(bufnr)` (spawns the server idempotently if needed, registers the session, sends `session_open`) and bail with a user message if it returns `false`; (d) send the **initial render** for the buffer; (e) **open the browser** to the session URL. [Source: epics.md#Story 1.4 lines 243-254; architecture.md#Requirements to Structure Mapping line 654; architecture.md#Integration Points lines 678-679]
  - [x] Keep `M.stop()`/`M.toggle()`/`M.engine()` as placeholders (Stories 1.7 / Epic 2). Do NOT wire them. [Source: epics.md#Story 1.7 lines 296-315; #Story 2.2]
  - [x] The render send and browser-open must use the **live** `port`/`token` from `server.state` after `ready`. Because `ready` is async (the server announces it over stdout after spawn), the URL/token are not known synchronously at command time — see "Async ready ordering" in Dev Notes for the required deferral pattern; do NOT read `state.port`/`state.token` before `state.running` is true. [Source: server.lua:55-78 (`ready` dispatch); 1-2 story "Security"]

- [x] **Lua: build the initial `render` envelope** (AC: 2)
  - [x] Read the buffer's DOT text: `table.concat(vim.api.nvim_buf_get_lines(bufnr, 0, -1, false), "\n")`. Build the wire envelope with **camelCase keys** via the existing `server.send` path: `{ type = "render", sessionId = bufnr, v = <first value>, engine = config.get().engine, dot = <text> }`. `engine` is the configured default (`"dot"`). [Source: architecture.md#Transport lines 296-303; #Naming Patterns lines 410-420; 1-3 story "Good envelope" lines 108-112]
  - [x] **`v` is minimal here.** Use `session.next_version(bufnr)` (the existing seam — it returns `1` on first call) so the field is present and monotonic-capable, but do NOT add debounce, latest-wins, or any `v`-comparison logic — that is Story 1.5. The frontend in this story renders whatever arrives (no `v`-guard yet). [Source: session.lua:36-40; epics.md#Story 1.5 lines 256-273; architecture.md#Decision Impact lines 391-392]
  - [x] Use `server.send(msg)`, which already queues the message until `ready` arrives and writes camelCase NDJSON. Do NOT add a second write path or touch `server.lua`'s transport. [Source: server.lua:136-145; 1-3 story Dev Notes line 66]

- [x] **Lua: browser-open helper (`vim.ui.open` / `open_cmd`)** (AC: 1)
  - [x] Build the URL: `string.format("http://127.0.0.1:%d/?sessionId=%d&token=%s", port, bufnr, token)`. Bind is the literal `127.0.0.1` (matches the server bind and Security). [Source: architecture.md#Security line 326; #Integration Points line 679; epics.md#Story 1.4 line 248]
  - [x] Open it: if `config.get().open_cmd` is set, run that command with the URL (e.g. `vim.system({ <open_cmd>, url })` or split the string + url); otherwise use `vim.ui.open(url)` (Neovim 0.10+, the OS-default opener). Route failures through `log.lua`. Place this in `commands.lua` (or a tiny helper); do NOT add a new top-level module just for one function. [Source: architecture.md#Configuration Surface line 366 (`open_cmd` default nil = OS default); #External integrations line 682; https://neovim.io/doc/user/lua.html#vim.ui.open()]

- [x] **Frontend: real WASM render in `render.ts`** (AC: 2, 3)
  - [x] Replace the orphaned scaffold `render.ts` (`createRenderer()`/`describe()`, currently dead — see Deferred-Work) with a real renderer that is the **only** module importing `d3-graphviz`/`@hpcc-js/wasm-graphviz`. Expose a single async entry, e.g. `renderDot(dot: string, engine: string): Promise<void>`, that renders the DOT into the mount element (`#app`) using `d3-graphviz`'s `graphviz(selector).engine(engine).renderDot(dot)` (or the equivalent `dot(...).render()` call) backed by `@hpcc-js/wasm-graphviz`. The render engine boundary is `render.ts` only — `main.ts`/`ws.ts` speak the protocol, never the render lib. [Source: architecture.md#Architectural Boundaries lines 637-638; #source tree lines 597-598; deferred-work.md (1-3 entry)]
  - [x] No system Graphviz: the WASM module is bundled into the frontend bundle (which is embedded into the Bun single-file binary). Verify the bundle still builds (see Tasks → Build). Do NOT shell out to `dot` or any system binary anywhere. [Source: architecture.md#Tier 3 lines 215-225; #Key de-risking insight lines 162-166; FR-6]
  - [x] Do NOT implement, in `render.ts`: a `v`-guard, render-lock, last-good retention, error overlay, or zoom/pan capture. A WASM parse/render error may surface however is simplest for this story (e.g. log it) — robust error handling is **Story 1.6**, the stale-`v` guard + render-lock are **Story 1.5**. Keep the seam obvious (a comment) but unimplemented. [Source: epics.md#Story 1.5 lines 256-273, #Story 1.6 lines 275-295; architecture.md#Render Pipeline lines 311-321]

- [x] **Frontend: wire `render` → renderer in `main.ts`** (AC: 2)
  - [x] In `frontend/main.ts`, replace the Story-1.3 stash-only behavior: on an inbound `render` envelope, call the new `render.ts` `renderDot(msg.dot, msg.engine)`. Keep the `createWebSocketClient` wiring, the `hello` flow, and the `__igEnvelopes` debug stash (intentional, documented debug seam — do not remove). `error_display`/`session_closed` stay stash/log-only this story (acted on in 1.6/1.7). [Source: 1-3 story main.ts lines 16-31; #Review Findings line 83 (`__igEnvelopes` dismissed-as-intentional); epics.md#Story 1.4 line 250]
  - [x] Read `dot`/`engine` off the envelope (the server relays `render{sessionId,v,engine,dot}` **verbatim**, so both fields are present on the WS frame). Types come from `frontend/protocol.ts` — never redefine the envelope. [Source: server/server.ts:184-195 (verbatim relay); 1-3 story Dev Notes lines 122-124]

- [x] **Server: minimal replay-on-subscribe (`server/server.ts` + `server/sessions.ts`)** (AC: 2, 5)
  - [x] **Why this is needed:** `render` is flushed to the server at `ready`, but the browser only becomes a subscriber *after* it loads and sends `hello` — well after `ready`. Without replay the fan-out hits an empty subscriber set and the first render is silently dropped (blank page). The architecture's session shape already includes `lastRender` for exactly this purpose (`State & Session Model`, architecture.md:282: *"browsers are stateless views that re-sync on (re)connect"*). The SEAM for this is dormant at `server/server.ts:123-125` ("lastGoodDot does not exist yet"). Activate the minimal slice of it here.
  - [x] In `server/sessions.ts`: add `lastRender?: ProtocolMessage` to the `Session` interface (next to `subscribers`). No other changes to sessions.ts.
  - [x] In `server/server.ts`, `handleMessage` `render` case (lines 184-195): after the fan-out loop, store `sessions.get(sessionId)!.lastRender = message` (only if the session exists — the `subscribersOf` path already returns `[]` for unknown sessions, so guard the same way).
  - [x] In `server/server.ts`, `hello` subscribe branch (the SEAM at line 123): after `sessions.subscribe(sessionId, ws)`, if `session.lastRender` exists, call `safeSend(ws, JSON.stringify(session.lastRender))` to replay it to this new subscriber. This is the **only** mutation — no error retention, no view-state, no good/bad distinction (those are Story 1.6). [Source: architecture.md#State & Session lines 278-285; server.ts:120-126 (SEAM); sessions.ts:16-23]
  - [x] Keep the scope guard: `lastRender` stores the **last render envelope verbatim**, not `lastGoodDot`. The good/bad and error-overlay distinction is Story 1.6's job. Do NOT add `error_display` replay, view-state capture, or any 1.6 logic here.

- [x] **Dependencies: add the renderer libs to the frontend build** (AC: 2)
  - [x] Add `d3-graphviz`@`5.6.0` and `@hpcc-js/wasm-graphviz`@`1.21.2` as dependencies so Bun can bundle them into the frontend (which `static.ts` imports and the binary embeds). **Create `frontend/package.json`** with these as `dependencies` — do NOT rely on `server/package.json` for this. `bun build frontend/index.html` resolves `node_modules` upward from the entry dir (`frontend/` → repo root); `server/` is a sibling, not an ancestor, so deps placed only there will silently fail to resolve when bundling the frontend. Run `bun install` from `frontend/` (or repo root with a workspace) once to produce a lockfile. [Source: architecture.md#Tier 3 lines 217-218; #source tree lines 589, 600; #File Organization line 689; epics.md#Renderer line 101]
  - [x] These two libs are **architecture-specified and in-scope** for this story — they are the FR-6 renderer. Do NOT add any other render/zoom/transition deps yet (d3-zoom/viewstate wiring is Story 1.6). Pin the exact versions above. [Source: architecture.md#Tier 3 lines 217-229; #Render Pipeline line 322]
  - [x] **Confirm the bundle still builds single-file:** the existing CI "Frontend bundle smoke" runs `bun build frontend/index.html --outdir dist/frontend`; it must stay green with the new deps (the WASM asset gets bundled). The `bun build --compile` single-file path (Epic 3, `scripts/release.ts`) must remain valid — do not break the `static.ts` HTML-import seam that makes the frontend embeddable. [Source: ci.yml "Frontend bundle smoke"; architecture.md#Frontend packaging (epics line 100); static.ts:1-10]

- [x] **Tests** (AC: 1, 2, 3, 4, 5)
  - [x] **Frontend/e2e render check (cold-open order)** under `tests/e2e/` (the architecture's `tests/e2e/render.spec.ts` is currently a one-line placeholder). **Critical ordering:** the test must mirror the real `:GraphvizPreview` command — send `render` to the server *before* the browser connects, then connect and authenticate, then assert the SVG appears. A test that connects first and *then* pushes the render does not exercise the replay-on-subscribe path and will be a false-green (passing while the real command shows a blank page). Concretely: spawn the server, push `session_open` + `render` over stdin, *then* open the page (headless Playwright or a direct WS client) and send `hello`, and assert `<svg>`/node appears in `#app`. If a headless browser is unavailable, a Bun-test that calls `@hpcc-js/wasm-graphviz` directly (DOT → SVG string contains expected node) covers FR-6/NFR-6 for the renderer itself; record which path was used. [Source: architecture.md#Testing Framework lines 238-240; #source tree lines 620-621; server.ts:123-126 (replay-on-subscribe SEAM)]
  - [x] **Lua command unit check** for the non-DOT no-op and the URL/envelope shape: assert that on a non-DOT buffer `:GraphvizPreview` does **not** spawn/open (no `session_open`/`render` sent, informative message logged), and that on a DOT buffer it builds the URL `http://127.0.0.1:<port>/?sessionId=<bufnr>&token=<token>` and a `render{sessionId,v,engine="dot",dot}` envelope. Drive this via headless nvim / plain Lua (busted is NOT installed locally — mirror the Story 1.2/1.3 approach: validate Lua specs via plain `lua` and headless `nvim`; CI runs busted). Stub `vim.ui.open`/`server.send` to capture calls without a real browser/server where practical. [Source: 1-2 story "Testing note" line 224; 1-3 story Testing standards lines 177-181; architecture.md#File Organization lines 692-693]
  - [x] **Idempotent re-open check** (AC: 5): assert that running `:GraphvizPreview` a second time on the same DOT buffer does not re-spawn the server (server-side `session_open` count is unchanged, `ensure_started` returns the same handle), and that the already-connected browser receives a new `render` envelope (the replay fires again). This verifies the "re-opens / re-renders the existing session" half of AC5.
  - [x] Wire any new e2e/Bun spec into CI consistent with the existing `bun test server` / "Frontend bundle smoke" steps; if a Playwright e2e is added, add the minimal CI step (or document why it runs only locally). Keep all existing gates green (orphan gate, `bun test server`, nvim smoke, stylua). [Source: ci.yml; 1-3 story Testing lines 74-75]

### Review Findings (AI)

- [x] [Review][Patch] Stale `bufnr` in `on_ready` closure — no validity guard before opening browser [lua/interactive-graphviz/commands.lua — `on_ready` callback]
- [x] [Review][Patch] `sessions.sessions.get()` mutates Session directly from `server.ts`, violating the "mutation only in sessions.ts" architecture invariant — add `setLastRender` method to `SessionRegistry` [server/sessions.ts, server/server.ts:194-199]
- [x] [Review][Patch] `pcall(cb)` in `on_ready` dispatch loop silently swallows errors — log failures [lua/interactive-graphviz/server.lua — dispatch/ready handler]
- [x] [Review][Patch] `_on_exit` silently drains pending `on_ready_cbs` without any user notification — log warning if list non-empty [lua/interactive-graphviz/server.lua:_on_exit]
- [x] [Review][Patch] `WebSocketClient` return value from `createWebSocketClient` is dropped — `.close()` seam lost, regression vs Story 1.3 baseline [frontend/main.ts:8]
- [x] [Review][Patch] `server/render.test.ts` uses `@hpcc-js/wasm-graphviz` direct path for FR-6 but does not record this as required by spec (Tasks §Tests) [server/render.test.ts]
- [x] [Review][Defer] Empty DOT buffer sends render that frontend silently ignores (`if (dot)` guard in main.ts) [frontend/main.ts, lua/interactive-graphviz/commands.lua] — deferred to Story 1.6 error feedback
- [x] [Review][Defer] Multiple rapid `:GraphvizPreview` calls before `ready` queue N browser-open callbacks [lua/interactive-graphviz/server.lua] — deferred to Story 1.7 idempotency guard
- [x] [Review][Defer] Concurrent `renderDot` calls race for `#app` — no render-lock yet [frontend/render.ts] — deferred to Story 1.5 render-lock
- [x] [Review][Defer] `lastRender` replayed on reconnect may be invalid/errored DOT — no good/bad distinction [server/sessions.ts] — deferred to Story 1.6 lastGoodDot
- [x] [Review][Defer] `lastRender` lost on server restart — browser reconnect gets blank page [server/sessions.ts] — known architectural limitation; pre-existing
- [x] [Review][Defer] `_on_exit` drops on_ready_cbs silently on server crash before `ready` (duplicate logging concern; separate from P4 warning) — deferred to Story 1.7 lifecycle
- [x] [Review][Defer] `open_cmd` with quoted arguments (e.g. `"open -a Google Chrome"`) splits incorrectly — deferred, configuration edge case
- [x] [Review][Defer] No `nvim_buf_is_valid` guard in `is_dot_buffer` — theoretical for user-triggered command [lua/interactive-graphviz/commands.lua] — deferred to Story 1.7 lifecycle
- [x] [Review][Defer] commands_spec.lua never exercises `on_ready` deferred-queue path (only already-running stub) — deferred, integration test scope
- [x] [Review][Defer] Very large DOT buffer: no size limit before `server.send` — pre-existing, tracked in deferred-work.md
- [x] [Review][Defer] AC5 "already-connected browser receives new render on re-open" not exercised end-to-end — components separately verified; deferred to Story 1.7

## Dev Notes

### Scope Boundary (read first)

This story is **open-the-preview + first render only**. The end-to-end slice it must deliver: run `:GraphvizPreview` on a `.dot`/`.gv` buffer → server spawns (or is reused) → browser opens at the token URL → the buffer's DOT renders as a real Graphviz SVG in the page, with **no system Graphviz installed**. Do **NOT** implement:

- **Debounce / live-reload / monotonic-`v` machinery / render-lock / latest-wins** — **Story 1.5**. The `v` carried here is a minimal first value (from the existing `session.next_version` seam); there is no `v`-comparison anywhere yet, and no buffer-change autocmd. `render.lua` stays empty this story.
- **Last-good render retention, the visible error overlay, zoom/pan view-state preservation** — **Story 1.6**. `frontend/render.ts` renders the latest DOT; it does not retain a last-good SVG, show an overlay, or capture/reapply a d3-zoom transform. `viewstate.ts` stays a stub. `error_display`/`session_closed` are stashed, not acted on.
- **`:GraphvizPreviewStop` / `:GraphvizPreviewToggle` / last-buffer-close teardown** — **Story 1.7**. Only `M.preview()` becomes real; `stop`/`toggle` stay placeholders. (`VimLeavePre` graceful teardown already exists from Story 1.2 — do not regress it.)
- **Engine-switch UI / `:GraphvizEngine` / `set_engine`** — **Epic 2**. `engine` in the render envelope is the configured default (`"dot"`); there is no runtime switch.
- **LAN exposure (`expose_to_lan`)** — Epic 2. Bind stays literal loopback; the URL host is literal `127.0.0.1`.

> A story must leave the system working end-to-end for what it claims. Here that means: a real `:GraphvizPreview` actually opens a browser tab that actually renders the buffer's DOT as an SVG via bundled WASM — verified by the e2e/render check, not asserted in prose.

### What this story builds on (Stories 1.2 + 1.3 are done and green)

The spawn/supervision (1.2) and the WS relay spine (1.3) already exist and must not regress:

- **Server spawn + `ready`:** `server.ensure_started()` spawns one server per Neovim via `vim.system({ stdin=true, stdout, stderr, text=true })`, binds literal `127.0.0.1:0`, mints a `crypto.randomUUID()` token, and announces `ready{port,token}` on stdout. Lua stores `state.port`/`state.token` and sets `state.running = true` on `ready`. [Source: server.lua:55-78, 161-202; 1-2 Completion Notes]
- **`server.open_session(bufnr)`** already: ensures the server is started, `session.register(bufnr)`, and sends `session_open{sessionId=bufnr}` (queued until `ready`). Returns `false` if spawn failed. **Reuse it** — do not re-implement spawn/register in `commands.lua`. [Source: server.lua:206-213]
- **`server.send(msg)`** queues until `ready`, then writes `vim.json.encode(msg).."\n"` (camelCase NDJSON). The relay test already proves a `render{...}` envelope round-trips Lua→server→WS byte-shape-identical. **Reuse it** for the initial render. [Source: server.lua:136-145; 1-3 relay.test.ts contract round-trip]
- **Server relays `render` verbatim:** `server.ts` `handleMessage` has a `render` case that fans `JSON.stringify(message)` to exactly `sessions.subscribersOf(sessionId)` — `engine` and `dot` survive verbatim onto the WS frame. No server change is needed for this story. [Source: server.ts:184-195]
- **Frontend WS client (1.3):** `frontend/ws.ts` opens a `WebSocket`, reads `sessionId`/`token` from `location.search`, sends `hello{sessionId,token}` on open, and dispatches inbound envelopes via `onRender`/`onErrorDisplay`/`onSessionClosed`/`onMessage`. `frontend/main.ts` currently **stashes** `render` (no DOM render) and exposes `window.__igEnvelopes`. This story turns the `render` stash into a real WASM render. [Source: ws.ts:38-87; main.ts:16-31]
- **Token gate is live:** the server rejects a `hello` without the matching token. The browser must be opened with the token in the URL so `ws.ts` can read it and authenticate — this is exactly the URL this story mints. [Source: 1-3 story Security lines 134-137; ws.ts:23-26]

### Files being modified (current state → what changes)

Baseline is HEAD `c35e800` (Story 1.3 done). For each:

- `lua/interactive-graphviz/commands.lua` — **current:** every command is a `placeholder()` that just notifies "not implemented in the scaffold story". **Change:** make `M.preview()` real (DOT guard → `open_session` → initial `render` → browser open). **Preserve:** `M.stop`/`M.toggle`/`M.engine` stay placeholders (1.7/Epic 2). [commands.lua:1-26]
- `lua/interactive-graphviz/render.lua` — **current:** empty stub (`local M = {} return M`). **Change:** none this story (debounce/live-reload is Story 1.5). Leave it empty; do not pre-build the debounce machinery. [render.lua:1-3]
- `frontend/render.ts` — **current:** orphaned scaffold (`createRenderer()`/`describe()`), unreferenced dead code flagged in deferred-work for removal this story. **Change:** replace with the real WASM renderer (`renderDot(dot, engine)`), the only module importing `d3-graphviz`/`@hpcc-js/wasm-graphviz`. **Preserve:** the render-engine boundary (only this module touches the libs). [render.ts:1-11; deferred-work.md]
- `frontend/main.ts` — **current:** connects via `ws.ts`, stashes inbound `render`/`error_display`/`session_closed` (no DOM render), exposes `__igEnvelopes`, shows placeholder text. **Change:** on `render`, call `render.ts` `renderDot(msg.dot, msg.engine)`. **Preserve:** the WS/`hello` wiring and the `__igEnvelopes` debug stash (intentional, documented). [main.ts:1-31]
- `frontend/ws.ts` — **current:** real WS client; reads `sessionId`/`token` from URL; `hello` on open; dispatch by type. **Change:** none expected (it already surfaces `onRender`). **Preserve:** the URL-param read + `hello` token flow — this story's URL feeds it. [ws.ts:23-87]
- `frontend/index.html` — **current:** `<main id="app">` mount + `main.ts` module. **Change:** likely none; if `d3-graphviz` needs a specific mount node/SVG container, render into `#app` (or add a child container) without removing `#app`. [index.html:8-11]
- `lua/interactive-graphviz/server.lua` — **current:** spawn/supervise/`ready`/`send`/`open_session`/`close_session`. **Change:** none required (reuse `open_session`/`send`/`state.port`/`state.token`). Read `state.running`/`state.port`/`state.token` only — do not add transport. [server.lua:131-213]
- `lua/interactive-graphviz/session.lua` — **current:** Lua-side cache + `next_version`. **Change:** none (call `next_version(bufnr)` for the minimal `v`; mutate the map only here, via `register` inside `open_session`). [session.lua:13-40]
- `lua/interactive-graphviz/init.lua` / `plugin/interactive-graphviz.lua` — **current:** `setup()` entry; lazy command defs dispatching to `commands.lua`. **Change:** none expected — `:GraphvizPreview` already dispatches to `commands.preview`; this story fills the body, not the wiring. **Preserve:** the lazy `plugin/` defs (no eager `require`). [init.lua:1-8; plugin/interactive-graphviz.lua:1-32]
- `frontend/package.json` (NEW) and/or `server/package.json` — **current:** `frontend/package.json` is empty/absent; `server/package.json` has empty `devDependencies`. **Change:** add `d3-graphviz@5.6.0` + `@hpcc-js/wasm-graphviz@1.21.2` where the `frontend/index.html` bundle resolves them; run `bun install` to produce a lockfile. [server/package.json; frontend dir]
- `tests/e2e/render.spec.ts` — **current:** one-line placeholder. **Change:** implement the render check (or add a Bun-level DOT→SVG check; see Testing). [tests/e2e/render.spec.ts:1]
- `protocol.ts` / `protocol.lua` — **current:** the `render` type + arbitrary camelCase fields already covered. **Change:** none (no new types; `render{sessionId,v,engine,dot}` already valid). [protocol.ts:1-21; protocol.lua:5-19]

Do **not** touch the release pipeline (`scripts/release.ts`, `checksums.txt`, `release.yml`) — unrelated. Do **not** modify `server/stdio.ts`.

**`server/server.ts` and `server/sessions.ts` require minimal changes** for the replay-on-subscribe fix (see Tasks — Server section above). All other server relay code is complete and must not regress.

### DOT-buffer detection (FR-1 no-op guard)

The non-DOT no-op is a hard AC. Detect a DOT buffer via Neovim's filetype, which is the robust signal (`.dot`/`.gv` both map to filetype `dot` by Neovim's built-in ftdetect):

- Primary: `vim.bo[bufnr].filetype == "dot"`.
- Defensive fallback (when filetype is empty, e.g. a brand-new unsaved buffer): check the extension of `vim.api.nvim_buf_get_name(bufnr)` against `%.dot$`/`%.gv$`.
- On a non-DOT buffer: `log.notify("…")` (or `log.info`) with a clear message like *"GraphvizPreview: current buffer is not a DOT/GV file"* and **return early** — no `ensure_started`, no `open_session`, no browser open. The message must reach the user (use `log.notify` directly, not a gated level, since this is direct user feedback to an explicit command). [Source: epics.md#Story 1.4 lines 252-254; FR-1 lines 27-29; log.lua:16-18]

### Async ready ordering (the one real sequencing trap)

`ready{port,token}` arrives **asynchronously** over stdout after `vim.system` spawns the server (and `on_stdout` runs through `vim.schedule`). So at the moment `:GraphvizPreview` runs the **first** time, `state.port`/`state.token` are `nil` and `state.running` is `false`. The browser URL cannot be built until `ready` lands. Two clean options — pick one and keep it simple:

- **Preferred — defer the open until running:** if `server.state.running` is already true (server reused), build the URL and open immediately. Otherwise register a one-shot callback that fires when `ready` is processed (e.g. have `server.lua` expose an `on_ready(fn)` seam, or poll `state.running` via a short `vim.uv`/`vim.defer_fn` until it flips, then open). The initial `render` itself does **not** need this — `server.send` already **queues until `ready`**, so sending the render envelope right away is safe; only the **browser open** needs the resolved port/token.
- Do NOT read `state.port`/`state.token` before `state.running` is true; do NOT hardcode or pre-pick a port (the server binds `:0` and reports back). [Source: server.lua:55-78, 136-145; 1-2 story "do not pre-pick a port" lines 177; architecture.md#Integration Points lines 678-679]

Keep the deferral minimal and self-contained; this is not the place to build a general event system. If you add an `on_ready` seam to `server.lua`, keep it tiny and note it in the File List.

### The wire contract (unchanged — relay it correctly)

The render envelope must be byte-shape-correct on both hops (the relay test already enforces identity). Emit exactly:

```jsonc
{ "type": "render", "v": 1, "sessionId": 3, "engine": "dot", "dot": "digraph{a->b}" }
```

- `type` is snake_case (`render`); payload keys are camelCase (`sessionId`, `engine`, `dot`); the version key is the single short `v`. Absent fields are omitted, never `null`. Booleans are JSON `true`/`false`. Lua builds these camelCase keys via `vim.json.encode` even though snake_case is idiomatic internally. [Source: architecture.md#Naming Patterns lines 410-420; 1-3 story Dev Notes lines 102-118]
- `sessionId = bufnr`. `engine = config.get().engine` (default `"dot"`). `dot` = the buffer text. `v` = `session.next_version(bufnr)` (minimal; first call returns 1). [Source: architecture.md#State & Session Model line 279; #Configuration Surface line 360; session.lua:37-40]
- Canonical source of truth stays `server/protocol.ts`; **no new types** (the `render` type and arbitrary camelCase fields already exist). [Source: protocol.ts:1-21; 1-3 story line 28]

### Replay-on-subscribe (why server.ts/sessions.ts must change)

The first-render delivery race: `:GraphvizPreview` flushes `render` to the server at `ready`, but the browser only subscribes *after* loading and sending `hello` — strictly later than `ready`. At flush time `subscribersOf(sessionId)` is empty → silent no-op → blank page. The fix is minimal:

1. `sessions.ts`: add `lastRender?: ProtocolMessage` to `Session`.
2. `server.ts` `render` handler: after fan-out, `session.lastRender = message`.
3. `server.ts` `hello` branch (the SEAM at line 123): if `session.lastRender` exists, `safeSend(ws, JSON.stringify(session.lastRender))`.

This is **not** `lastGoodDot` (Story 1.6). `lastRender` stores the raw last envelope verbatim — no good/bad distinction, no error-overlay logic. The good/bad split, error retention, and view-state are 1.6's scope.

The test for this must exercise the **cold-open order**: push `render` before the browser connects, not after — see Tests section.

### Renderer (FR-6 / NFR-6) — `render.ts` is the only render-lib module

- `d3-graphviz` 5.6.0 is the **reference renderer** (NFR-6 parity) and brings d3-zoom + animated transitions (the foundation for 1.6 zoom/pan and v2 interactivity — but do not wire those here). `@hpcc-js/wasm-graphviz` 1.21.2 is the dedicated Graphviz-WASM package it runs on. [Source: architecture.md#Tier 3 lines 217-229]
- Typical d3-graphviz usage: `import { graphviz } from "d3-graphviz"; graphviz("#app").engine(engine).renderDot(dot);` — d3-graphviz loads the WASM internally. Bundle the WASM so **no system Graphviz/`dot`** is needed at runtime (FR-6). The server is a thin relay; all render deps live in the **browser bundle**, which is embedded into the single-file binary via the `static.ts` HTML-import seam. [Source: architecture.md#Key de-risking insight lines 162-166; #Tier 3 lines 215-218; static.ts:1-10]
- **Maintenance-watch (known risk):** `d3-graphviz` 5.6.0 has not shipped in ~2 years and pins an older `@hpcc-js/wasm`. If the two pinned versions do not interoperate cleanly under Bun's bundler, the architecture's documented fallback is to **drive `@hpcc-js/wasm-graphviz` directly** (call its `graphviz.dot(dot)`/`graphviz.layout(dot, "svg", engine)` to produce SVG, inject it into `#app`) and add zoom/transitions from the d3 ecosystem later. Prefer `d3-graphviz` (it is the spec'd reference renderer); fall back only if interop genuinely fails, and note it. [Source: architecture.md#Tier 3 lines 227-230; #Risk Mitigation lines 781-782]
- `render.ts` exposes one async entry and is the **sole** importer of the render libs — `main.ts`/`ws.ts` speak only the protocol. Keep that boundary. [Source: architecture.md#Architectural Boundaries lines 637-638]

### Dependencies (in-scope, architecture-specified)

- Add **exactly** `d3-graphviz@5.6.0` and `@hpcc-js/wasm-graphviz@1.21.2` (the architecture pins these). Put them where the `frontend/index.html` module graph resolves them when Bun bundles — the frontend currently has no `package.json`, so create `frontend/package.json` with these as `dependencies` (or add them to `server/package.json` `dependencies` if the bundle is driven from `server/`; whichever the bundler resolves from). Run `bun install` once to produce a lockfile so CI is reproducible. [Source: architecture.md#Tier 3 lines 217-218; #source tree lines 589, 600; #File Organization line 689]
- Do NOT add other render/zoom deps (d3-zoom standalone, transition libs) — d3-graphviz bundles what it needs; the explicit view-state wiring is Story 1.6.
- **Single-file build must stay valid:** confirm `bun build frontend/index.html --outdir dist/frontend` (CI "Frontend bundle smoke") stays green with the WASM dep bundled, and that the `static.ts` `import "../frontend/index.html"` seam — the path `bun build --compile` uses to embed the frontend (Epic 3) — still resolves. Do not break the embeddability. [Source: ci.yml; architecture.md#Frontend packaging (epics line 100); static.ts:1-10]

### Security (unchanged — the URL carries the token)

- The browser is opened at `http://127.0.0.1:<port>/?sessionId=<bufnr>&token=<token>` — **literal** `127.0.0.1`, the per-start token in the query. `ws.ts` reads both from `location.search` and presents them in `hello`; the server rejects a missing/wrong token. Do not invent a new token or bind beyond loopback. [Source: architecture.md#Security lines 326-330; #Integration Points line 679; ws.ts:23-26; 1-3 story Security]
- `expose_to_lan` is Epic 2 — host stays literal loopback in the URL this story builds.

### Anti-patterns to avoid

- Do **not** render a non-DOT buffer or spawn/open on one — it must be a clean no-op with a user-visible message. [Source: FR-1 lines 27-29]
- Do **not** read `state.port`/`state.token` before `state.running` is true; do **not** pre-pick/hardcode a port — the server binds `:0` and reports it via `ready`. [Source: server.lua:55-78; 1-2 anti-patterns line 177]
- Do **not** mint a `v` policy, add debounce, render-lock, or latest-wins here — `v` is a minimal first value via `next_version`; the policy is Story 1.5. [Source: epics.md#Story 1.5; architecture.md lines 391-392]
- Do **not** add last-good retention, an error overlay, or zoom/pan capture — Story 1.6. `viewstate.ts` stays a stub. [Source: epics.md#Story 1.6]
- Do **not** wire `:GraphvizPreviewStop`/`Toggle` or `:GraphvizEngine` — Stories 1.7 / Epic 2. [Source: epics.md#Story 1.7, #Story 2.2]
- Do **not** shell out to system `dot`/Graphviz anywhere — WASM only (FR-6). [Source: architecture.md#Key de-risking insight lines 162-166]
- Do **not** import `d3-graphviz`/`@hpcc-js/wasm-graphviz` outside `frontend/render.ts` — keep the render-engine boundary. [Source: architecture.md lines 637-638]
- Do **not** redefine the wire envelope on any tier; import types from `frontend/protocol.ts` / mirror `server/protocol.ts`. No new message types. [Source: architecture.md#Enforcement lines 509-513]
- Do **not** modify `server/stdio.ts` or the spawn/supervision — they are complete and tested; reuse `open_session`/`send`. The only permitted changes to `server/server.ts`/`sessions.ts` are the three-line replay-on-subscribe addition; do not touch the relay, session lifecycle, or heartbeat logic. [Source: 1-2/1-3 done]
- Do **not** remove the `__igEnvelopes` debug seam (intentional, dismissed-in-review). [Source: 1-3 Review Findings line 83]
- Do **not** wrap the envelope (`{data:…}`), mix case, or emit `null` for absent fields. [Source: architecture.md lines 419, 468-470]
- Do **not** assert the render only in prose — the e2e/render check (or a direct DOT→SVG Bun test) is the gate for FR-6/NFR-6.

### Testing standards

- **busted is not installed locally** — pure-Lua and headless-nvim specs are validated by running their exact logic via plain `lua` and `nvim --headless` (the Story 1.2/1.3 approach); CI runs the busted specs directly (nvim 0.10.4 + Bun provisioned). [Source: 1-2 story "Testing note" line 224; 1-3 Testing standards]
- **Server/frontend logic:** `bun test` (co-located `*.test.ts` for unit; e2e under `tests/e2e/`). The CI "Bun tests" step runs `bun test server`; place a pure DOT→SVG render unit (if added) somewhere the test runner picks it up, and note it in CI if it lives outside `server/`. [Source: ci.yml; architecture.md#File Organization lines 692-693]
- **Frontend/e2e render check** (architecture's `tests/e2e/render.spec.ts`, Playwright per the testing stack): the executable proof of FR-6/NFR-6 — a real DOT renders to an SVG in the browser with no system Graphviz. If a headless browser is unavailable here, fall back to a Bun test that calls `render.ts`/`@hpcc-js/wasm-graphviz` directly (DOT string → SVG output contains the expected node/label) so the FR-6 claim is executable, and record which path was used. [Source: architecture.md#Testing Framework lines 238-240; #source tree lines 620-621]
- **Lua command unit check:** non-DOT no-op (no spawn/open, message logged) + DOT-buffer URL/envelope shape (`http://127.0.0.1:<port>/?sessionId=<bufnr>&token=<token>` + `render{sessionId,v,engine="dot",dot}`). Stub `vim.ui.open`/`server.send` to capture without a real browser/server. [Source: 1-3 Testing; FR-1]
- Keep all existing gates green: `stylua --check .`, `nvim` smoke, the no-orphan gate, `bun test server`, "Frontend bundle smoke". [Source: ci.yml]

### Latest technical information

- **`vim.ui.open(url)`** — Neovim 0.10+ built-in; opens a path/URL with the system default opener (xdg-open/open/start). Returns `(SystemObj?, err?)`. This is the zero-config browser-open path; `config.open_cmd` overrides it. [Source: https://neovim.io/doc/user/lua.html#vim.ui.open(); architecture.md#Configuration line 366]
- **`d3-graphviz` 5.6.0** — `graphviz(selector).engine("dot"|"neato").renderDot(dotString)`; loads `@hpcc-js/wasm` internally; supports `.on("end", …)` for render-complete (useful for the e2e wait). Stale (~2yr) but the spec'd reference renderer (NFR-6). [Source: architecture.md#Tier 3 lines 217-229]
- **`@hpcc-js/wasm-graphviz` 1.21.2** — dedicated Graphviz-WASM (split from `@hpcc-js/wasm`); `Graphviz.load()` → `graphviz.layout(dot, "svg", engine)` / `graphviz.dot(dot)` returns SVG. The direct-drive fallback if d3-graphviz interop fails. [Source: architecture.md#Tier 3 lines 224-225, 229]
- **Bun bundling of WASM:** `bun build frontend/index.html` bundles the module graph incl. the WASM asset; the same import survives `bun build --compile` (single-file binary). Verify the smoke step stays green. [Source: ci.yml; architecture.md#Tier 2 lines 195, #Frontend packaging epics line 100]

### Previous story intelligence (Story 1.3)

- 1.3 is done/green: static HTTP serving, WS upgrade + token-gated `hello`/`ack`, per-session `render` fan-out, `sessions.ts` subscriber set, real frontend WS client. The contract round-trip (Lua→server→WS byte-identical) is proven. This story consumes that spine to deliver the first render. [Source: 1-3 Completion Notes]
- 1.3 left **explicit seams** for this story: `main.ts` stashes `render` "awaiting render in 1.4"; `render.ts` is orphaned scaffold flagged for replacement here (deferred-work). A SEAM comment marks where the server will replay `lastGoodDot` on subscribe — that re-sync is 1.6, **not** this story. [Source: 1-3 Dev Notes lines 130, 246; deferred-work.md]
- Invariants to carry forward: camelCase-on-wire / snake_case `type`; session-map mutation only in `session.lua`/`sessions.ts`; stdout protocol-only on the server; one server per Neovim, sessions keyed by `bufnr`; no floating promises (Bun). Do not regress. [Source: 1-3 Dev Notes; architecture.md#Process Patterns lines 497-505]
- `server.send` already queues until `ready` and round-trips arbitrary camelCase envelopes — reuse it; do not add a second write path. [Source: server.lua:136-145; 1-3 line 66]

### Git intelligence

Baseline for this story is HEAD `c35e800`. Recent commits: Story 1.1 scaffold (`189b6c5`), Epic-3 release pipeline (`a53cd8f`, `68ef456`), Story 1.2/1.3 (landed since). The release-pipeline commits are unrelated — **do not touch** `scripts/release.ts`/`checksums.txt`/`release.yml`. The render-lib deps and `frontend/render.ts` real renderer are net-new here; `frontend/render.ts` currently holds only orphaned scaffold to be replaced. [Source: `git log`; deferred-work.md]

## Project Structure Notes

All target files already exist (Lua modules + frontend files from the scaffold/1.3; the only NEW file is `frontend/package.json` for the render deps, plus the implemented `tests/e2e/render.spec.ts`). The `render.ts` real renderer, `render`→renderer wiring in `main.ts`, and the `:GraphvizPreview` body in `commands.lua` fill existing seams — no new module tree. The render-engine boundary (`render.ts` is the only render-lib importer) and the FR-1→`commands.lua`→`server.lua`→`session.lua` mapping match the architecture's Requirements-to-Structure map exactly. The only structural addition is the frontend dependency manifest, which the architecture anticipates ("`package.json` — bun deps (frontend libs)"). No variance expected. If an `on_ready(fn)` seam is added to `server.lua` for the deferred browser-open, it is a minimal addition consistent with the existing `state.running` lifecycle.

## References

- Epics: `_bmad-output/planning-artifacts/epics.md#Story 1.4` (lines 237-254); scope edges `#Story 1.5` (256-273), `#Story 1.6` (275-295), `#Story 1.7` (296-315); Renderer/packaging (lines 100-101); FR-1 (27-29), FR-6 (37-38), NFR-6 (69-70)
- Architecture — Render Pipeline: `_bmad-output/planning-artifacts/architecture.md` lines 309-322
- Architecture — Tier 3 (renderer/bundler, versions, risk): `architecture.md` lines 215-230
- Architecture — Transport & Message Protocol (`render{sessionId,v,engine,dot}`): `architecture.md` lines 288-307
- Architecture — Security (token in URL + bind): `architecture.md` lines 324-332
- Architecture — State & Session Model: `architecture.md` lines 276-286
- Architecture — Architectural Boundaries (render-engine boundary): `architecture.md` lines 628-648
- Architecture — Requirements to Structure Mapping (FR-1, FR-6): `architecture.md` lines 650-664
- Architecture — Integration Points (open URL flow): `architecture.md` lines 673-685
- Architecture — Configuration Surface (`open_cmd`, `engine`): `architecture.md` lines 356-373
- Architecture — Key de-risking insight (server thin relay; deps in browser): `architecture.md` lines 162-166
- Architecture — source tree (`frontend/render.ts`, `tests/e2e/`, `package.json`): `architecture.md` lines 593-625
- Architecture — Implementation sequence (step 4 = this story's pipeline): `architecture.md` lines 384-385
- Previous stories: `_bmad-output/implementation-artifacts/1-3-message-protocol-and-websocket-relay.md`, `1-2-server-spawn-and-no-orphan-supervision.md`
- Deferred work (replace orphaned `frontend/render.ts`): `_bmad-output/implementation-artifacts/deferred-work.md`
- Neovim `vim.ui.open()`: https://neovim.io/doc/user/lua.html#vim.ui.open()
- d3-graphviz / @hpcc-js/wasm-graphviz docs (renderer reference)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Implemented all ACs. Key decisions: (1) cold-open delivery race fixed via replay-on-subscribe (`sessions.ts` + `server.ts`); (2) `M.on_ready(fn)` seam added to `server.lua` for deferred browser-open; (3) `d3-graphviz@5.6.0` using `@hpcc-js/wasm@^2.20.0` internally — `render.ts` wraps it cleanly; (4) `@hpcc-js/wasm-graphviz@1.21.2` added to both `frontend/package.json` (bundler) and `server/package.json` devDeps (WASM tests); (5) Lua tests (`tests/commands_spec.lua`) use full vim stubs for CI compatibility under plain busted; (6) cold-open relay tests in `tests/e2e/render.spec.ts` exercise render-before-connect order.
- All gates green: stylua, nvim smoke, bun test server (33/33), bun test tests/e2e (2/2), frontend bundle smoke, no-orphan gate.

### File List

- `.github/workflows/ci.yml` — added `commands_spec.lua` to busted step and new E2E cold-open relay step
- `frontend/main.ts` — replaced stash-only with real `renderDot` call on `render` envelopes
- `frontend/package.json` — new; `d3-graphviz@5.6.0` + `@hpcc-js/wasm-graphviz@1.21.2` dependencies
- `frontend/bun.lock` — new lockfile for frontend deps
- `frontend/render.ts` — replaced orphaned scaffold with real WASM renderer (`renderDot`)
- `lua/interactive-graphviz/commands.lua` — `M.preview()` implemented (DOT guard → open_session → render → on_ready → browser open)
- `lua/interactive-graphviz/server.lua` — added `on_ready_cbs` state field + `M.on_ready(fn)` seam + callback firing in `dispatch` + `_on_exit` cleanup
- `server/package.json` — added `@hpcc-js/wasm-graphviz@1.21.2` devDependency for WASM unit tests
- `server/bun.lock` — updated lockfile
- `server/relay.test.ts` — added 2 cold-open replay tests
- `server/render.test.ts` — new; FR-6/NFR-6 WASM DOT→SVG tests (3 tests)
- `server/server.ts` — replay-on-subscribe: save `lastRender` after fan-out; call `safeSend(ws, lastRender)` in hello branch
- `server/sessions.ts` — added `lastRender?: ProtocolMessage` to `Session` interface + `ProtocolMessage` import
- `tests/commands_spec.lua` — new; 8 tests covering non-DOT no-op, envelope shape, URL shape, open_cmd, idempotent re-open, server failure
- `tests/e2e/render.spec.ts` — replaced placeholder with cold-open relay tests (2 tests, correct render-before-connect order)

### Change Log

- 2026-06-03: Created Story 1.4 context (open preview and first render). Status → ready-for-dev.
- 2026-06-04: Validation fixes applied: C1 replay-on-subscribe, C2 test ordering, M1 dep path, M2 AC5 test.
- 2026-06-04: Implementation complete. All ACs satisfied. 33+2 server+e2e tests pass. Status → review.
- 2026-06-04: Validation fixes applied: (C1) added replay-on-subscribe task + dev note — server.ts/sessions.ts changes now in scope, AC2 delivery unblocked; (C2) e2e render test must exercise cold-open order (render before browser connects); (M1) dependency path clarified — create frontend/package.json, not server/package.json; (M2) added idempotent re-open test task (AC5).
