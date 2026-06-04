# Deferred Work

## Deferred from: code review of story 1-2-server-spawn-and-no-orphan-supervision (2026-06-03)

- Unbounded `stdout_buf` (Lua) / `LineBuffer` (TS) growth on a newline-less huge line. Trusted local channel; add a max-line cap that drops + diagnoses an over-long unterminated buffer. [lua/interactive-graphviz/server.lua:206, server/stdio.ts]
- Orphan integration test relies on raw `kill -0 <pid>` liveness, which is vulnerable to PID reuse. Harden with a process identity check (start-time or cmdline) rather than bare PID existence. [tests/integration/orphan_spec.lua]

## Deferred from: code review of story 1-3-message-protocol-and-websocket-relay (2026-06-03)

- `frontend/render.ts` is orphaned scaffold: `frontend/main.ts` dropped its `createRenderer` import in this story, leaving the file unreferenced dead code. Remove it (or repurpose) during Story 1.4 frontend render wiring. [frontend/render.ts] ✅ resolved in Story 1.4

## Deferred from: code review of story 1-4-open-preview-and-first-render (2026-06-04)

- Empty DOT buffer sends a render envelope; frontend silently ignores it (`if (dot)` guard in `main.ts`). User gets a blank preview with no feedback. Story 1.6 error feedback will surface this. [frontend/main.ts, lua/interactive-graphviz/commands.lua]
- Multiple rapid `:GraphvizPreview` calls before `ready` queue N browser-open callbacks — N browser tabs open. Story 1.7 idempotency guard will fix this. [lua/interactive-graphviz/server.lua]
- Concurrent `renderDot` calls race for `#app` — second call can interrupt or corrupt first d3-graphviz transition. Story 1.5 render-lock will address this. [frontend/render.ts]
- `lastRender` replayed on reconnect may be invalid/errored DOT (no good/bad distinction). Story 1.6 introduces `lastGoodDot` to replace `lastRender`. [server/sessions.ts]
- `lastRender` lost on server restart — browser reconnect gets blank preview. Known architectural limitation; no server-side persistence is in scope.
- `open_cmd` with quoted arguments (e.g. `open -a "Google Chrome"`) is split naively by `vim.split("%s+")`, breaking multi-word commands. Configuration edge case; consider documenting or using `vim.fn.shellescape`. [lua/interactive-graphviz/commands.lua]
- No `nvim_buf_is_valid` guard in `is_dot_buffer` — theoretical error if called with invalid bufnr. Story 1.7 lifecycle cleanup will add buffer validity checks. [lua/interactive-graphviz/commands.lua]
- `commands_spec.lua` never exercises the `on_ready` deferred-queue path (all stubs fire `fn()` immediately). Requires an integration test with a real Neovim + real server; deferred to Story 1.7 scope.
- Very large DOT buffer: no size limit before `server.send`. `vim.json.encode` on a multi-MB buffer may be slow and exhaust the stdin pipe buffer. Pre-existing; relates to the unbounded `stdout_buf` deferred from Story 1.2 review. [lua/interactive-graphviz/commands.lua]
- AC5 "already-connected browser receives new render on `:GraphvizPreview` re-run" not exercised end-to-end. Components are separately verified (Lua stub confirms `send` called twice; relay tests confirm delivery). Full integration gate deferred to Story 1.7.

## Deferred from: code review of story 1-5-live-reload-on-buffer-change (2026-06-04)

- `vim.uv.new_timer()` return value unchecked for nil — pre-existing pattern from server.lua heartbeat; applies to render.lua debounce as well. Add nil guard if low-memory robustness is needed. [lua/interactive-graphviz/render.lua:38]
- Re-calling `start_watch` on an already-watched buffer leaves previous debounce timer alive (mitigated by timer-identity guard, practically safe). Story 1.7 could add `stop_watch` before `start_watch` in a re-open scenario for cleanliness. [lua/interactive-graphviz/render.lua:59-68]

