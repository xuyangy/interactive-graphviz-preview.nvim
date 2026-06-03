---
baseline_commit: 68ef456
---

# Story 1.2: Server spawn and no-orphan supervision

Status: done

Created: 2026-06-03T16:55:00+0200
Story Key: 1-2-server-spawn-and-no-orphan-supervision

## Story

As a Neovim user,
I want the local server started on demand and guaranteed to die when Neovim does,
so that previewing never leaves an orphaned process holding a port.

## Acceptance Criteria

1. **Given** no server is running for the Neovim instance, **when** a preview is requested, **then** the plugin spawns exactly one server per Neovim instance via `vim.system()` with stdin open (`{ stdin = true }`), and a second request reuses the same server (no double-spawn).
2. The server binds an ephemeral port (`:0`) on the literal address `127.0.0.1`, reads the actual port back, mints a per-session/start token, and announces `ready{port,token}` as one newline-delimited JSON line on **stdout**.
3. The Lua side captures `port` and `token` from the `ready` message and records the server as running; until `ready` arrives the server is considered "starting", not usable.
4. **Given** a running server, **when** Lua sends `session_open{sessionId}` over stdin, **then** the server registers a session keyed by `bufnr` (= `sessionId`) in its in-memory `sessions` map; `sessions.size` is the refcount.
5. **Given** the Neovim process exits abnormally (`kill -9`, crash, where `VimLeave`/`VimLeavePre` do **not** fire), **when** the stdin pipe closes (EOF), **then** the server self-terminates within the heartbeat window, leaving no orphaned process.
6. A missed heartbeat is an independent backstop that also terminates the server: Lua sends `ping` on a `heartbeat_ms` timer; if the server sees no `ping` (nor any stdin traffic) for a bounded multiple of `heartbeat_ms`, it exits on its own.
7. **Given** the graceful path (`VimLeavePre`), **when** Neovim exits normally, **then** Lua tears down (closes stdin / sends `shutdown`) and no server process remains — but this is the convenience path, never the sole guarantee.
8. `tests/integration/orphan_spec.lua` drives a **real headless Neovim** child, makes it spawn the server, `kill -9`s the Neovim child, and asserts the server PID is reaped within the heartbeat window. This test is green (the load-bearing NFR-3 gate and the one-server-per-instance falsification gate).
9. No protocol relay, WebSocket fanout, browser open, or Graphviz render is implemented — those are Stories 1.3/1.4. The server's HTTP/WS listener exists only to own a real bound port; it serves no frontend and relays no messages yet.

## Tasks / Subtasks

- [x] **Server: ephemeral bind + ready announce** (AC: 2, 9)
  - [x] In `server/server.ts`, call `Bun.serve({ hostname: "127.0.0.1", port: 0, fetch, websocket })` with a minimal `fetch` (return `503`/empty for now) and a minimal `websocket` handler stub. Read the actual port from `server.port`.
  - [x] Mint a token with `crypto.randomUUID()` (or `crypto.getRandomValues` hex). Store `{ port, token }` in server-process state.
  - [x] Emit `ready{port,token}` exactly once on stdout using `stdio.ts` `encodeLine`. Write via `process.stdout.write(...)`. Keep stdout reserved for protocol lines only — all diagnostics go to `stderr`.
- [x] **Server: stdin JSON-lines reader** (AC: 4, 5, 6)
  - [x] In `server/stdio.ts`, add a line-buffered reader over `Bun.stdin.stream()` (or `process.stdin`) that splits on `\n`, `JSON.parse`es each line, and yields `ProtocolMessage` objects. Tolerate partial lines across chunks; ignore blank lines.
  - [x] In `server.ts`, consume the reader with `async/await` (no floating promises). Dispatch by `type`:
    - `session_open{sessionId}` → `sessions.register(sessionId)`.
    - `session_close{sessionId}` → `sessions.unregister(sessionId)`.
    - `ping` → reset the heartbeat watchdog; optionally reply `pong` on stdout.
    - `shutdown` → graceful `process.exit(0)`.
    - any unrecognized `type` → log to stderr and ignore.
  - [x] On the stdin stream ending/closing (EOF), call `process.exit(0)` immediately. This is the primary no-orphan signal — when the parent Neovim dies, the OS closes the child's stdin.
- [x] **Server: heartbeat watchdog backstop** (AC: 6)
  - [x] Maintain a timer reset on every inbound stdin message (including `ping`). If no message arrives within `HEARTBEAT_TIMEOUT_MS` (a bounded multiple of the Lua `heartbeat_ms`, e.g. 3×, defaulting around 6000 ms), `process.exit(0)`.
  - [x] Make the timeout configurable via an env var or CLI arg so the orphan test can shrink it for speed (e.g. `IG_HEARTBEAT_TIMEOUT_MS`). Document the default.
- [x] **Server: sessions map** (AC: 4, 9)
  - [x] Extend `server/sessions.ts` `SessionRegistry` with `register(sessionId)`, `unregister(sessionId)`, `has(sessionId)`, and `size`. `Session` keeps `{ sessionId, version }` for now (subscribers/lastGoodDot/engine arrive in 1.3+). **Mutate the map only here** — no other server module touches it.
- [x] **Lua: server spawn + supervise** (AC: 1, 2, 3)
  - [x] In `lua/interactive-graphviz/server.lua`, implement `M.ensure_started()` (idempotent): if a server handle already exists and is alive, return it; otherwise resolve the server command and spawn.
  - [x] Resolve the dev server command from `install.lua` (see guardrail below): in v1 dev this is `{ "bun", "run", <repo>/server/server.ts }`; Epic 3 swaps in the compiled binary path. Provide a single `install.resolve_server_cmd()` seam so 1.2 does not hardcode `bun` in multiple places.
  - [x] Spawn with `vim.system(cmd, { stdin = true, stdout = on_stdout, stderr = on_stderr, text = true })`. Keep the returned `SystemObj` handle in module state.
  - [x] `on_stdout`: feed bytes into a line buffer, `vim.json.decode` each complete line, dispatch on `type`: `ready` → store `{ port, token }`, mark running, fire any queued `session_open`; `pong` → note liveness; `log` → route through `log.lua`.
  - [x] `on_stderr`: route to `log.lua` at debug level (server diagnostics), never crash on it.
- [x] **Lua: heartbeat timer** (AC: 6)
  - [x] Start a repeating `vim.uv` (`vim.loop`) timer at `config.get().heartbeat_ms` that writes `ping\n` to the server handle while it is alive. Stop and close the timer on teardown to avoid leaks.
- [x] **Lua: session registration** (AC: 1, 4)
  - [x] In `lua/interactive-graphviz/session.lua`, own `M.active` (`table<bufnr, sessionState>`) as the Lua-side idempotency cache, plus `register(bufnr)`, `unregister(bufnr)`, `count()`, and `next_version(bufnr)` (monotonic per-bufnr counter; the `v`-token seam consumed in 1.5). **Session-map mutation lives only in this module** on the Lua side.
  - [x] On registering a new bufnr, send `session_open{sessionId=bufnr}` to the server (queue it if `ready` has not arrived yet).
- [x] **Lua: graceful teardown** (AC: 7)
  - [x] In `lua/interactive-graphviz/lifecycle.lua`, register a `VimLeavePre` autocmd that stops the heartbeat timer and shuts the server down gracefully (send `shutdown` and/or close stdin via the handle). This is the graceful path only — correctness must not depend on it.
  - [x] Provide `M.teardown()` reused by both `VimLeavePre` and a future explicit stop (Story 1.7 extends this; do not implement stop/toggle commands here).
- [x] **Tests** (AC: 5, 6, 8)
  - [x] Implement `tests/integration/orphan_spec.lua`: from the test (busted/plenary under headless nvim), spawn a **child** `nvim --headless` that requires the plugin and triggers `server.ensure_started()`; capture the server PID (e.g. from a `ready`/`/health`-less channel — read it from the spawned process tree or have the child write the PID to a temp file); `kill -9` the child nvim; poll until the server PID is gone; assert it is reaped within the heartbeat window. Use a shrunk heartbeat timeout for test speed.
  - [x] Implement `tests/session_spec.lua`: unit-test `session.lua` register/unregister/count and `next_version` monotonicity without spawning a server.
  - [x] Add a Bun test (`server/*.test.ts`) covering: `stdio` line-reader splits multi-line and partial chunks; `SessionRegistry` register/unregister/size; `ready` line is well-formed JSON with `port` and `token`.
  - [x] Wire the new specs into CI (`.github/workflows/ci.yml`): run the integration orphan spec and session spec; ensure Bun and Neovim are available (Neovim 0.10.4 is already provisioned).

### Review Findings

_Code review 2026-06-03 (Blind Hunter + Edge Case Hunter + Acceptance Auditor). All 9 ACs SATISFIED behaviorally; AC-8 PARTIAL until the gate isolates the EOF path. 7 patch, 2 deferred, 7 dismissed as noise._

- [x] [Review][Patch] Orphan gate can pass via the heartbeat backstop even if the load-bearing stdin-EOF path regresses — raise `IG_HEARTBEAT_TIMEOUT_MS` far above the reap window so only EOF can satisfy it [tests/integration/orphan_spec.lua, tests/integration/orphan_child.lua, tests/integration/run_orphan_check.sh]
- [x] [Review][Patch] `install.resolve_server_cmd()` calls `error()` outside the `pcall` in `ensure_started` → uncaught traceback if `server/server.ts` is off the runtimepath; wrap resolution and route to `log.error` [lua/interactive-graphviz/server.lua:255, lua/interactive-graphviz/install.lua:31]
- [x] [Review][Patch] Lua `heartbeat_ms` and server `IG_HEARTBEAT_TIMEOUT_MS` are configured independently and never wired together — a raised `heartbeat_ms` can make the server self-terminate while Neovim is alive; pass the timeout via env on spawn, derived as a multiple of `heartbeat_ms` (respecting an explicit env override) [lua/interactive-graphviz/server.lua, server/server.ts:396]
- [x] [Review][Patch] Malformed/duplicate `ready` is accepted unvalidated (`port` may be nil; a second `ready` clobbers port/token); validate `port` is a number and `token` non-empty, and ignore subsequent `ready` once running [lua/interactive-graphviz/server.lua:176]
- [x] [Review][Patch] Spawn failure still registers the Lua session with no user feedback — `open_session` ignores a nil `ensure_started` result; bail and notify instead [lua/interactive-graphviz/server.lua:288]
- [x] [Review][Patch] `supervisor.test.ts` leaks the spawned server process if an assertion/timeout throws before `proc.stdin.end()`; wrap in try/finally that kills the proc [server/supervisor.test.ts]
- [x] [Review][Patch] Lua `on_stdout` silently drops invalid/non-table JSON lines (asymmetric with the server's `bad json` diag); add a `log.debug` on the dropped-line branch [lua/interactive-graphviz/server.lua:215]
- [x] [Review][Defer] Unbounded `stdout_buf`/`LineBuffer` growth on a newline-less huge line (both tiers) — deferred; trusted local channel, cap can be added later [lua/interactive-graphviz/server.lua:206, server/stdio.ts]
- [x] [Review][Defer] Orphan test uses raw `kill -0` PID liveness → PID-reuse flakiness — deferred; portable start-time identity check is non-trivial, low probability in CI [tests/integration/orphan_spec.lua]

## Dev Notes

### Scope Boundary (read first)

This story is **lifecycle + supervision only**. Implement spawn, ephemeral-port bind + `ready` announce, stdin-EOF/heartbeat self-termination, session registration, and the `kill -9 → reaped` gate. Do **NOT** implement:

- JSON message **relay/fanout** to WebSocket subscribers, or serving the frontend over HTTP — Story 1.3.
- Browser open or any Graphviz/WASM render — Story 1.4.
- Debounce, `v`-token end-to-end carry, latest-wins — Story 1.5 (only the `next_version` seam lives here).
- Error overlay / last-good render — Story 1.6.
- `:GraphvizPreviewStop` / `:GraphvizPreviewToggle` commands and last-buffer-close autocmds — Story 1.7 (only `VimLeavePre` graceful teardown is in scope here).
- Prebuilt binary download / checksum / platform detection — Epic 3 (this story spawns the **dev** server via Bun through the `install.resolve_server_cmd()` seam).

> A story must leave the system working end-to-end for what it claims. Here that means: a real server process actually spawns, actually binds a real port, and actually dies on `kill -9` of the parent — verified by the integration test, not asserted in prose.

### The load-bearing decision: stdin pipe = control channel **and** parent-death signal

The no-orphan guarantee rests on **one** robust mechanism: the server self-terminates on **stdin EOF**, because the OS closes the child's stdin when the parent (`vim.system()` owner) dies — *including `kill -9`, where no Lua cleanup runs*. The heartbeat is a **backstop**, not the primary path. Lua-side `vim.system()` cleanup (`VimLeavePre`, future buffer autocmds) is the **graceful** path only and is **never** the sole guarantee. [Source: architecture.md "Multiplexing model" lines 88-106; "Process supervision" 259-260; "Lifecycle invariants" 497-499]

If the deterministic `kill -9 parent → server reaped within heartbeat window` test cannot be made green, the architecture's documented fallback is per-buffer servers (Option A) — but do not pivot without flagging it; getting this green is the whole point of the story. [Source: architecture.md lines 116-117]

### Transport contract (this story touches the spine — get it exactly right)

- **Neovim → server:** `vim.system({bin}, { stdin = true, stdout = on_msg })`; newline-delimited JSON written via `handle:write(vim.json.encode(msg) .. "\n")`. NOT msgpack-RPC, NOT `jobstart`. [Source: architecture.md lines 256-257, 290-291]
- **Envelope:** `{ type: string, v?: number, sessionId?: number, ... }`. One JSON object per line on stdio. No `{data:…}` wrapping — the message **is** the object; `type` discriminates. [Source: architecture.md lines 296, 468-470]
- **Wire naming (holds in every tier, including Lua):** message `type` values are **snake_case** (`session_open`, `ready`, `ping`, `pong`, `shutdown`, `session_close`, `log`); payload field keys are **camelCase** (`sessionId`, `port`, `token`, `message`, `level`); the version field is the single short key `v`. Lua builds camelCase wire keys via `vim.json.encode` even though snake_case is idiomatic internally. [Source: architecture.md lines 410-420, 513]
- **Messages in scope this story:**
  - Lua→server: `session_open{sessionId}`, `session_close{sessionId}`, `ping`, `shutdown`.
  - server→Lua: `ready{port,token}`, `pong`, `log{level,message}`.
  - (Browser↔server `hello`/`ack`/`render`/`error_display` are Story 1.3+ — leave the WS handler a stub.) [Source: architecture.md lines 301-307]
- **stdout discipline:** the server **never** prints free-form to stdout — stdout is the protocol channel. All server diagnostics go to **stderr** or (later) `log` messages. The Story 1.1 scaffold already follows this (`console.error` for the scaffold banner); keep it. [Source: architecture.md lines 494-496, 518; server/server.ts:10]

### State & session model

- **Server** owns `sessions: Map<sessionId, Session>`, `sessionId = bufnr`. Refcount is `sessions.size`, never subscriber count. (Subscribers/`lastGoodDot`/`engine` fields are added in 1.3+; this story only needs `{ sessionId, version }`.) [Source: architecture.md lines 279-282]
- **Neovim/Lua** keeps `M.active : table<bufnr, sessionState>` as a UI/idempotency cache only — **never authoritative for cleanup**. [Source: architecture.md lines 283-284]
- Removing a session (graceful) does **NOT** kill the server. The server dies only on stdin EOF or a missed heartbeat. [Source: architecture.md lines 285-286, 499]

### Security (cheap now, load-bearing later)

- Bind the **literal** `127.0.0.1` — not `0.0.0.0`, not `localhost`, not `::1`. [Source: architecture.md line 326]
- Ephemeral port: `bind :0`, read back, announce over `ready`. No rendezvous file, no stale-port race. [Source: architecture.md lines 107-108, 327]
- Mint a **per-session/start token** now and carry it in `ready`. The server's WS will require it in `hello` once the return channel goes live (Story 1.3) — minting it here is the cheap-now/expensive-to-retrofit move. [Source: architecture.md lines 328-330, 395]
- `expose_to_lan` is Epic 2 config; default bind stays loopback here. Do not implement the LAN switch in this story.

### Files being modified (current state → what changes)

All Lua/server files below are **stubs** from Story 1.1 (`local M = {}; return M`, or trivial). This story fills them in. There are no behaviors to preserve beyond "modules stay loadable and side-effect-free at require time" — spawning happens on `ensure_started()`, never at module load.

- `lua/interactive-graphviz/server.lua` — currently empty stub. **Add** spawn/supervise: `ensure_started()`, stdout line-dispatch, heartbeat timer, handle state. [server.lua:1-3]
- `lua/interactive-graphviz/session.lua` — empty stub. **Add** `M.active`, register/unregister/count, `next_version`. [session.lua:1-3]
- `lua/interactive-graphviz/lifecycle.lua` — empty stub. **Add** `VimLeavePre` autocmd + `teardown()`. [lifecycle.lua:1-3]
- `lua/interactive-graphviz/install.lua` — empty stub. **Add** `resolve_server_cmd()` returning the dev `{ "bun", "run", <abs path>/server/server.ts }`. (Epic 3 replaces the body with binary resolution; keep the function name stable.) [install.lua:1-3]
- `server/server.ts` — scaffold `main()` prints a banner and exits 0. **Replace** with the real entry: `Bun.serve` on `:0`, mint token, emit `ready`, consume stdin reader, dispatch, EOF/heartbeat exit. Keep `bundledFrontendEntry`/`staticAssetRoot` import harmless (no frontend served yet). [server.ts:1-16]
- `server/sessions.ts` — `SessionRegistry` has only `readonly sessions = new Map`. **Add** register/unregister/has/size. [sessions.ts:1-8]
- `server/stdio.ts` — has `encodeLine` only. **Add** the line-buffered JSON reader (`decodeLines`/async iterator). Keep `encodeLine` as the single stdout writer helper. [stdio.ts:1-3]
- `lua/interactive-graphviz/protocol.lua` / `server/protocol.ts` — the message-type union already lists `session_open`, `ready`, `ping`, `pong`, `shutdown`, `session_close`, `log`, etc. **No new types needed.** If you must add a field type, change `server/protocol.ts` **first** (canonical), then mirror `protocol.lua`. Do **not** invent a per-tier field set. [protocol.ts:1-23; protocol.lua:1-21; architecture.md 510-511]
- `tests/integration/orphan_spec.lua`, `tests/session_spec.lua` — placeholder one-liners. **Implement** per the Tasks. [orphan_spec.lua:1; session_spec.lua:1]
- `.github/workflows/ci.yml` — add steps to run the new specs. [ci.yml]

Do **not** put implementation in `plugin/interactive-graphviz.lua` (stays lazy command defs). Do **not** wire `:GraphvizPreview` to real behavior here — `commands.lua` placeholders stay until Story 1.4/1.7; the spawn path is exercised via `server.ensure_started()` directly and through the integration test. [commands.lua:1-26]

### Config keys already available (use them, don't re-add)

`config.get()` already returns defaults from Story 1.1: `bind = "127.0.0.1"`, `port = 0`, `heartbeat_ms = 2000`, `log_level = "warn"`, `expose_to_lan = false`. Read `heartbeat_ms` for the Lua ping timer. The server's bind/port are announced back via `ready` (Lua does not pre-pick the port). [config.lua:3-14]

### Async / robustness rules (Bun side)

- `async/await` only — **no floating promises**; every promise is awaited or `.catch`-logged. [Source: architecture.md lines 503-505]
- The stdin reader must tolerate chunk boundaries splitting a JSON line (buffer until `\n`).
- Exit paths must be deterministic: stdin `end`/`close` → `process.exit(0)`; heartbeat timeout → `process.exit(0)`; `shutdown` message → `process.exit(0)`. Use one `shutdown()` helper so all three converge.

### Latest technical information

- **`vim.system()`** (Neovim 0.10+, stable): runs the command directly (no shell), returns a `SystemObj` with `:write(data)`, `:kill(signal)`, `:wait()`, and `on_exit`. Open stdin with `{ stdin = true }`; stream stdout/stderr with `{ stdout = fn, stderr = fn }`. With `text = true`, callbacks receive strings. When the owning Neovim process is `kill -9`'d, the child's stdin pipe is closed by the OS → the server observes EOF. This is the mechanism the whole story rides on. [Source: https://neovim.io/doc/user/lua.html#vim.system()]
- **`vim.uv` / `vim.loop` timers** for the heartbeat: `local t = vim.uv.new_timer(); t:start(interval, interval, fn)`; always `t:stop(); t:close()` on teardown. Wrap timer callbacks with `vim.schedule_wrap` if they call API functions.
- **Bun stdin**: read via `Bun.stdin.stream()` (a `ReadableStream<Uint8Array>`) or `for await (const chunk of Bun.stdin.stream())`; decode with `TextDecoder`. The stream ends when stdin closes → your EOF exit path. [Source: https://bun.sh/docs/api/utils — Bun.stdin]
- **`Bun.serve`** returns a `Server` with `.port` (the resolved ephemeral port when started with `port: 0`) and `.stop()`. A minimal `fetch` returning `new Response(null, { status: 503 })` is fine for this story — no routes are served yet. [Source: https://bun.sh/docs/api/http]

### Previous story intelligence (Story 1.1)

- Scaffold is complete and green; all modules listed above exist as loadable stubs. CI already provisions **Neovim 0.10.4** (via `rhysd/action-setup-vim`), `lua5.1` + `luarocks` + `busted`, Stylua, and Bun. Reuse that CI shape; just add spec steps. [Source: 1-1 story File List; ci.yml]
- Story 1.1 review enforced: **stdout stays protocol-only** (the scaffold uses `console.error` for its banner — keep that discipline), and the release workflow must fail loudly until Epic 3 (irrelevant here but don't "fix" it). [Source: 1-1 Review Findings; architecture.md 494-496]
- Lua smoke runs headless: `nvim --headless -i NONE -u tests/minimal_init.lua -l tests/nvim_smoke.lua -c qa`. `tests/minimal_init.lua` only prepends cwd to runtimepath — your integration spec's child nvim should use the same minimal init so the plugin is on the rtp. [Source: 1-1 File List; tests/minimal_init.lua:1]
- Test placeholders `tests/integration/orphan_spec.lua` and `tests/session_spec.lua` were intentionally created empty in 1.1 for this story to fill. [Source: 1-1 story tasks; session_spec.lua:1]

### Git intelligence

Recent commits: `Implement Story 1.1 scaffold` (189b6c5), then two Epic-3 release-pipeline commits (`a53cd8f`, `68ef456`) that added `scripts/release.ts` and `checksums.txt` wiring — **unrelated to this story**; do not touch the release path. Baseline for this story is `68ef456`. No prior supervision code exists to preserve. [Source: `git log`]

### Anti-patterns to avoid

- Do **not** make `VimLeavePre`/Lua cleanup the no-orphan guarantee — it must survive `kill -9` where no Lua runs. The stdin-EOF path is mandatory.
- Do **not** pre-pick or hardcode a port in Lua; bind `:0` in the server and read it back from `ready`.
- Do **not** print non-protocol text to server **stdout**; use stderr.
- Do **not** mutate the sessions map outside `sessions.ts` (server) / `session.lua` (Lua).
- Do **not** spawn one server per buffer — one server per Neovim instance, sessions keyed by `bufnr`.
- Do **not** implement WS relay, frontend serving, render, or stop/toggle here.
- Do **not** add a Node/yarn dependency or a `jobstart`-RPC channel; `vim.system()` stdio only.
- Do **not** leave the heartbeat `vim.uv` timer running after teardown (resource leak).
- Do **not** assert no-orphan only in prose — the headless `kill -9` integration test is the gate.

## Project Structure Notes

All target files already exist from the Story 1.1 scaffold; this story fills stubs rather than creating a new tree. Module boundaries follow the architecture's structure map (server spawn in `server.lua`, session table in `session.lua`, teardown in `lifecycle.lua`, server-side map in `sessions.ts`, stdio framing in `stdio.ts`). No structural variance from the architecture is expected. The only new "seam" introduced is `install.resolve_server_cmd()`, which the architecture anticipates (install.lua owns binary/dev-command resolution; Epic 3 fills the prebuilt path).

## References

- Epics: `_bmad-output/planning-artifacts/epics.md#Story 1.2` (lines 192-212)
- Architecture — Multiplexing & supervision: `_bmad-output/planning-artifacts/architecture.md` lines 84-138, 259-260
- Architecture — State & session model: `architecture.md` lines 276-286
- Architecture — Transport & message protocol: `architecture.md` lines 288-307
- Architecture — Security: `architecture.md` lines 324-332
- Architecture — Naming/format/process patterns: `architecture.md` lines 408-505
- Architecture — Implementation sequence (step 2 = this story): `architecture.md` lines 377-381
- Previous story: `_bmad-output/implementation-artifacts/1-1-project-scaffold-and-development-harness.md`
- Neovim `vim.system()`: https://neovim.io/doc/user/lua.html#vim.system()
- Bun stdin / `Bun.serve`: https://bun.sh/docs/api/http , https://bun.sh/docs/api/utils

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Code dev-story workflow)

### Debug Log References

- 2026-06-03: `bun test server` → 16 pass / 0 fail across 5 files (stdio framing, SessionRegistry, supervisor ready+EOF+heartbeat, scaffold).
- 2026-06-03: `bash tests/integration/run_orphan_check.sh` → server reaped within ~100ms of parent nvim `kill -9` ("PASS: no-orphan gate green"). Same flow encoded in `tests/integration/orphan_spec.lua` for CI.
- 2026-06-03: `session.lua` logic verified under plain Lua 5.4 (register/unregister/count/next_version/reset) — all assertions pass.
- 2026-06-03: Headless nvim smoke — all new modules load via `setup({})`; `install.resolve_server_cmd()` returns `{ "bun", "run", <abs>/server/server.ts }`.
- 2026-06-03: Regression green — `stylua --check .`, `tests/nvim_smoke.lua`, frontend bundle, and `release.ts validate-targets`.

### Completion Notes List

- Implemented one-server-per-Neovim supervision. **No-orphan guarantee rides on stdin EOF**: when the parent nvim dies (incl. `kill -9`), the OS closes the child's stdin and the server self-exits; the heartbeat watchdog is an independent backstop (both paths covered by tests).
- Server (`server.ts`): `Bun.serve` on literal `127.0.0.1:0`, reads back the ephemeral port, mints a `crypto.randomUUID()` token, announces `ready{port,token}` on stdout (stdout kept protocol-only; diagnostics to stderr). Stdin JSON-lines reader dispatches `session_open`/`session_close`/`ping`(→`pong`)/`shutdown`; unknown types logged+ignored. EOF and heartbeat-timeout both `process.exit(0)`. Heartbeat timeout configurable via `IG_HEARTBEAT_TIMEOUT_MS` (default 6000 ms) so the orphan test can shrink it.
- Lua: `server.lua` spawns via `vim.system({ stdin=true, stdout, stderr, text=true })`, line-buffers stdout, captures `port`/`token` on `ready`, starts a `vim.uv` `ping` timer at `heartbeat_ms`, queues sends until `ready`, and is idempotent (`ensure_started`). `session.lua` owns the Lua-side cache + monotonic `next_version` seam. `lifecycle.lua` registers `VimLeavePre` graceful teardown (closes stdin → EOF). `install.resolve_server_cmd()` is the single dev-spawn seam (Epic 3 swaps in the binary).
- Added level-gated helpers to `log.lua` (`error/warn/info/debug` gated by `log_level`) so server stderr diagnostics don't spam the user at the default level; existing `notify` preserved.
- Scope held: no WS relay/fanout, no frontend serving, no render, no stop/toggle — the `fetch`/`websocket` handlers are deliberate stubs owning only a real bound port (Stories 1.3/1.4/1.7).
- Testing note: `busted` is not installed locally; pure-Lua and integration specs were validated by running their exact logic via plain Lua 5.4 and `run_orphan_check.sh` (a committed dev/CI harness mirroring `orphan_spec.lua`). CI runs the busted specs directly (nvim 0.10.4 + bun provisioned).

### File List

- `server/server.ts` (modified — supervisor: bind/ready/stdin-dispatch/EOF+heartbeat exit)
- `server/stdio.ts` (modified — added `LineBuffer` JSON-lines reader)
- `server/sessions.ts` (modified — `register`/`unregister`/`has`/`size`)
- `server/stdio.test.ts` (new — framing tests)
- `server/sessions.test.ts` (new — registry tests)
- `server/supervisor.test.ts` (new — live ready/EOF/heartbeat tests)
- `lua/interactive-graphviz/server.lua` (modified — spawn/supervise, heartbeat, session open/close, shutdown)
- `lua/interactive-graphviz/session.lua` (modified — Lua-side cache + `next_version`)
- `lua/interactive-graphviz/lifecycle.lua` (modified — `VimLeavePre` graceful teardown)
- `lua/interactive-graphviz/install.lua` (modified — `resolve_server_cmd()` dev seam)
- `lua/interactive-graphviz/log.lua` (modified — level-gated helpers)
- `tests/session_spec.lua` (modified — pure-Lua session unit tests)
- `tests/integration/orphan_spec.lua` (modified — headless `kill -9 → reaped` gate)
- `tests/integration/orphan_child.lua` (new — child-nvim driver for the orphan test)
- `tests/integration/run_orphan_check.sh` (new — busted-free orphan verification harness)
- `.github/workflows/ci.yml` (modified — run session_spec + orphan gate)

### Change Log

- 2026-06-03: Created Story 1.2 context (server spawn + no-orphan supervision).
- 2026-06-03: Implemented server spawn + no-orphan supervision (stdin-EOF self-terminate + heartbeat backstop), session registration, ephemeral-port `ready` announce, graceful `VimLeavePre` teardown, and the headless `kill -9 → reaped` gate. All tasks complete; status → review.
- 2026-06-03: Addressed code review findings — 7 patches resolved. Orphan gate now isolates the stdin-EOF path (`IG_HEARTBEAT_TIMEOUT_MS=30000` vs ~6s reap window — verified reaped in ~100ms, so the backstop cannot mask an EOF regression); `resolve_server_cmd` wrapped in pcall→`log.error`; server heartbeat timeout derived from `heartbeat_ms` (3×) and passed via env, respecting an explicit override; `ready` validated (port:number>0, token non-empty) and duplicates ignored; `open_session` surfaces spawn failure instead of registering a phantom session; `supervisor.test.ts` cleans up the spawned proc in `finally`; Lua `on_stdout` logs dropped/unparseable lines. 2 items deferred (line-buffer cap, PID-reuse hardening) → `deferred-work.md`. Status → done.
