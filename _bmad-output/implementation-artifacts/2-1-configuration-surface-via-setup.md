---
baseline_commit: 5e18cca
---

# Story 2.1: Configuration surface via setup{}

Status: done

## Story

As a Neovim user,
I want to configure the plugin through an idiomatic `setup{}` with safe defaults,
so that it works with zero config but adapts to my preferences.

## Acceptance Criteria

1. **Given** the plugin, **when** the user calls `require("interactive-graphviz").setup(opts)` (or nothing), **then** every documented key has a default and the plugin works with zero config (FR-14): `engine`, `engines`, `debounce_ms`, `bind`, `port`, `expose_to_lan`, `open_cmd`, `preserve_view`, `heartbeat_ms`, `log_level`.
2. **Given** an invalid option value (e.g. `engine = "invalid"`, `debounce_ms = -1`, `log_level = "verbose"`), **when** `setup{}` processes the options, **then** a clear, user-facing error message is reported via `log.warn` and the invalid key falls back to its default value.
3. **Given** `expose_to_lan = false` (the default), **when** the server binds, **then** it binds to `127.0.0.1`; **given** `expose_to_lan = true`, **when** the server binds, **then** it binds to `0.0.0.0`; `expose_to_lan` is the only way to move beyond loopback; the behavior is documented as a deliberate security downgrade (NFR-4).
4. **Given** a server already running, **when** `setup{}` is called again (e.g. plugin manager re-init), **then** the new configuration is accepted but the running server is not killed or restarted; new sessions use the new config; the server's bind address can only change on the next spawn.
5. **Given** `log_level` is set to a valid value, **when** the plugin emits a log message, **then** it is gated correctly (off = silent; error/warn/info/debug as appropriate).

## Tasks / Subtasks

- [x] **`lua/interactive-graphviz/config.lua` — add option validation** (AC: 1, 2, 3, 5)
  - [x] Add a `M.validate(opts)` function (or inline in `M.setup`) that:
    - Validates `engine` is a string contained in `engines` (or the default `engines` list). Report via `log.warn` and reset to default on failure.
    - Validates `engines` is a non-empty list of strings (`{ "dot", "neato" }` minimum). If invalid, reset to default.
    - Validates `debounce_ms` is a positive integer (> 0). Reset to default on failure.
    - Validates `heartbeat_ms` is a positive integer (> 0). Reset to default on failure.
    - Validates `port` is 0 (ephemeral) or a positive integer in valid port range (1–65535). Reset to default (0) on failure.
    - Validates `bind` is a non-empty string. If `expose_to_lan = true`, override `bind` to `"0.0.0.0"`. If `expose_to_lan = false`, enforce `bind = "127.0.0.1"` (ignore any user-provided `bind` that differs from loopback when `expose_to_lan = false`). This is the security invariant.
    - Validates `log_level` is one of `"off"`, `"error"`, `"warn"`, `"info"`, `"debug"`. Reset to `"warn"` on failure.
    - Validates `open_cmd` is `nil` or a non-empty string. Reset to `nil` on failure.
    - Validates `preserve_view` is a boolean. Reset to `true` on failure.
  - [x] `M.setup(opts)` must call validation before storing `M.options`. Pattern: build merged options first, validate each key, emit warnings for bad values, store the corrected result.
  - [x] Return the final (possibly corrected) options table from `M.setup`.
  - [x] Zero-config must work: `M.setup({})` and `M.setup()` both produce the defaults with no warnings.

- [x] **`lua/interactive-graphviz/server.lua` — pass `bind` to spawn** (AC: 3, 4)
  - [x] In `M.ensure_started()`, read `config.get().bind` and pass it to the server binary via an environment variable `IG_BIND` (or a CLI argument if the server reads argv). Check how the server currently reads its bind address — see `server/server.ts` line 49 (`hostname: "127.0.0.1"` is currently hardcoded). The story must wire the config's `bind` to that hostname.
  - [x] If `bind` is hardcoded in `server.ts`, update `server.ts` to read `process.env.IG_BIND` (defaulting to `"127.0.0.1"` if absent). Pass `IG_BIND = config.get().bind` alongside `IG_HEARTBEAT_TIMEOUT_MS` in the `vim.system()` env table. This is the minimum viable seam — do NOT redesign the server.
  - [x] The server is never killed/restarted by `setup{}` (AC4). `bind` only takes effect on the next spawn (`M.ensure_started()` is idempotent once a server is alive).

- [x] **`lua/interactive-graphviz/server.lua` — pass `port` to spawn** (AC: 1, 4)
  - [x] Similarly, `port = 0` is already the behavior (Bun's ephemeral bind). If a user sets `port = 3000`, pass it to the server as `IG_PORT`. Update `server.ts` to read `process.env.IG_PORT` (defaulting to `0`). Pass `IG_PORT = tostring(config.get().port)` in the env table. Validate that a non-zero port is actually available is out of scope — document that port conflicts result in a server start failure reported via `log.error`.

- [x] **`server/server.ts` — read `IG_BIND` and `IG_PORT` env vars** (AC: 3)
  - [x] Replace hardcoded `hostname: "127.0.0.1"` with `process.env.IG_BIND ?? "127.0.0.1"`.
  - [x] Replace hardcoded `port: 0` with `Number.parseInt(process.env.IG_PORT ?? "0", 10)`.
  - [x] These are the only changes to `server.ts`. Do NOT touch the message dispatch, heartbeat, or WS handling.

- [x] **`lua/interactive-graphviz/init.lua` — wire setup to lifecycle and server** (AC: 1)
  - [x] `init.lua` currently calls only `config.setup(opts)`. No other wiring is needed at setup time — `server.lua` reads `config.get()` at spawn time. Confirm `init.lua` does not need changes. Document any lifecycle ordering concerns in a comment.

- [x] **`tests/config_spec.lua` — replace the placeholder with real tests** (AC: 1, 2, 3, 5)
  - [x] Replace the single-line placeholder (`-- Placeholder for Epic 2 configuration tests.`) with a full test suite.
  - [x] Tests run under plain busted (no Neovim). Stub `_G.vim` minimally: `vim.tbl_deep_extend`, `vim.deepcopy`, `vim.log.levels`.
  - [x] Test groups:
    - `M.setup()` with no args returns all defaults with correct types.
    - `M.setup({})` behaves identically to `M.setup()`.
    - `M.get()` returns the current options (after `setup`).
    - `M.setup({ engine = "neato" })` sets engine to "neato".
    - `M.setup({ engine = "invalid" })` resets engine to "dot" and logs a warning (spy on `log.warn`).
    - `M.setup({ debounce_ms = -1 })` resets debounce_ms to 200 and logs a warning.
    - `M.setup({ log_level = "verbose" })` resets to "warn" and logs a warning.
    - `M.setup({ expose_to_lan = true })` sets `bind` to `"0.0.0.0"`.
    - `M.setup({ expose_to_lan = false })` keeps `bind` at `"127.0.0.1"` regardless of any `bind` key.
    - `M.setup({ expose_to_lan = false, bind = "10.0.0.1" })` ignores the explicit `bind` and keeps `"127.0.0.1"` (security invariant).
    - Second call to `M.setup` overwrites the first (last-wins).
  - [x] Stub pattern: inject `log` via `package.loaded["interactive-graphviz.log"]` (same pattern used in `commands_spec.lua`).
  - [x] Do NOT run `busted` locally. Validate with `nvim --headless -u tests/minimal_init.lua` for module load, then `stylua --check lua/`.

- [x] **`server/*.test.ts` — add env-var bind/port test** (AC: 3)
  - [x] In `server.test.ts` (or a new `config.test.ts`), add a test that verifies the server reads `IG_BIND` and `IG_PORT` from the environment. Since `server.test.ts` already runs the `main()` function, extend existing patterns. If the test harness already stubs env, use it.
  - [x] Run with `bun test server` to validate.

## Dev Notes

### Scope for Story 2.1

This story is **configuration surface only**. It does NOT include:
- `:GraphvizEngine` command — that is Story 2.2.
- `set_engine` wire message — Story 2.2.
- Any changes to the render pipeline, debounce timer, or `v`-token behavior.
- Any changes to `session.lua`, `lifecycle.lua`, `render.lua`, `health.lua`, `install.lua`, `protocol.lua`, or the frontend.

### What Epic 1 established that this story builds on

Baseline HEAD is `5e18cca` (Story 1.7 complete).

- **`config.lua`** already exists at `lua/interactive-graphviz/config.lua` with `M.defaults`, `M.options`, `M.setup(opts)`, and `M.get()`. The current `M.setup` does zero validation — it only `vim.tbl_deep_extend`s the options. This story adds validation.
- **`M.defaults`** already defines all 10 keys with correct defaults:
  ```lua
  engine = "dot", engines = { "dot", "neato" }, debounce_ms = 200,
  bind = "127.0.0.1", port = 0, expose_to_lan = false, open_cmd = nil,
  preserve_view = true, heartbeat_ms = 2000, log_level = "warn"
  ```
- **`init.lua`** calls `require("interactive-graphviz.config").setup(opts or {})` — already correctly wired.
- **`server.lua`** hardcodes `hostname: "127.0.0.1"` and `port: 0` in `Bun.serve()`. Story 2.1 must wire `IG_BIND` / `IG_PORT` env vars to let Lua pass config at spawn time.
- **`log.lua`** already provides `M.warn(message)`. Use `require("interactive-graphviz.log").warn(msg)` for validation warnings. Note: `log.lua` calls `require("interactive-graphviz.config")` to get `log_level` — this creates a circular dependency if `config.lua` also calls `log` during setup. Avoid this by calling `log` only after `M.options` is fully set (i.e., validate and set `M.options` first, then call `log.warn` for any collected warnings).
- **`tests/config_spec.lua`** is a one-line placeholder — replace it entirely.
- **`tests/commands_spec.lua`** stub pattern: `package.loaded["interactive-graphviz.config"] = config_stub` — use the same pattern to stub `log` in config tests.

### Circular dependency avoidance (critical)

`log.lua` calls `require("interactive-graphviz.config").get().log_level`. If `config.lua` calls `require("interactive-graphviz.log").warn()` during `M.setup()`, there is no circular require (Lua's module cache handles this) — BUT the timing matters: `log` reads `config.get()` at call time, so if `M.options` is not yet fully written when `log.warn` is called, the log level check may use stale options.

Safe pattern: collect all validation warnings into a list, fully update `M.options`, then emit all warnings via `log.warn`. This guarantees `config.get()` returns the final options when `log.lua` reads the level.

### `expose_to_lan` security invariant (critical)

The `bind` field must be controlled by `expose_to_lan`, not by the raw `bind` key. Architecture (lines 326–330, 369):
- Default: `bind = "127.0.0.1"`, `expose_to_lan = false` — server binds loopback only.
- Opt-in: `expose_to_lan = true` → `bind` becomes `"0.0.0.0"` regardless of what the user wrote in `bind`.
- Never allow a user to set `bind = "0.0.0.0"` directly without `expose_to_lan = true`.

Enforced in `M.setup()`: after merging options, override `bind` based on `expose_to_lan`.

### Validation messages — format

Follow sentence-case pattern used in `commands.lua` and `server.lua`:
```lua
log.warn("interactive-graphviz setup: engine '" .. val .. "' not in engines list; using default 'dot'")
log.warn("interactive-graphviz setup: debounce_ms must be > 0; using default 200")
log.warn("interactive-graphviz setup: log_level '" .. val .. "' is invalid; using default 'warn'")
```

### Server env var pattern (already used)

`server.lua` already passes `IG_HEARTBEAT_TIMEOUT_MS` via the `env` table in `vim.system()`:
```lua
env = { IG_HEARTBEAT_TIMEOUT_MS = heartbeat_timeout_ms() }
```
Add `IG_BIND` and `IG_PORT` to the same table:
```lua
env = {
  IG_HEARTBEAT_TIMEOUT_MS = heartbeat_timeout_ms(),
  IG_BIND = config.get().bind,
  IG_PORT = tostring(config.get().port),
}
```
These are read by the server at startup. They cannot be changed after spawn (AC4).

### `server.ts` bind/port change (minimal)

Only two lines change in `server.ts`:
```ts
// Before:
hostname: "127.0.0.1",
port: 0,

// After:
hostname: process.env.IG_BIND ?? "127.0.0.1",
port: Number.parseInt(process.env.IG_PORT ?? "0", 10),
```
The security invariant is enforced on the Lua side (config.lua) — the server trusts `IG_BIND` because Lua guarantees it is never `0.0.0.0` unless `expose_to_lan = true`.

### `config_spec.lua` test patterns

Use the stub injection pattern from `commands_spec.lua`:
```lua
package.path = "./lua/?.lua;./lua/?/init.lua;" .. package.path

-- Stub vim before requiring config
_G.vim = {
  tbl_deep_extend = function(mode, base, override)
    -- minimal deep extend for tests
    local result = {}
    for k, v in pairs(base) do result[k] = v end
    for k, v in pairs(override or {}) do result[k] = v end
    return result
  end,
  deepcopy = function(t)
    local copy = {}
    for k, v in pairs(t) do copy[k] = v end
    return copy
  end,
  log = { levels = { WARN = 3, ERROR = 4, INFO = 2 } },
}

-- Stub log to capture warnings
local warn_calls = {}
package.loaded["interactive-graphviz.log"] = {
  warn = function(msg) table.insert(warn_calls, msg) end,
  error = function(_) end,
  info = function(_) end,
  debug = function(_) end,
  notify = function(_) end,
}

local config = require("interactive-graphviz.config")
```

Note: `vim.tbl_deep_extend` with mode `"force"` must override base with override. The stub above does this naively; test it against the actual defaults to ensure coverage.

### Files to modify

| File | Change type | Summary |
|------|-------------|---------|
| `lua/interactive-graphviz/config.lua` | MODIFY | Add validation logic with warn-on-bad-value + expose_to_lan bind enforcement |
| `lua/interactive-graphviz/server.lua` | MODIFY | Pass `IG_BIND` and `IG_PORT` env vars at spawn |
| `server/server.ts` | MODIFY | Read `IG_BIND` and `IG_PORT` from env instead of hardcoding |
| `tests/config_spec.lua` | REPLACE | Replace placeholder with full validation test suite |
| `server/*.test.ts` | MODIFY | Add env-var bind/port test (extend existing server.test.ts) |

Do NOT touch: `lua/interactive-graphviz/commands.lua`, `lua/interactive-graphviz/lifecycle.lua`, `lua/interactive-graphviz/session.lua`, `lua/interactive-graphviz/render.lua`, `lua/interactive-graphviz/log.lua`, `lua/interactive-graphviz/health.lua`, `lua/interactive-graphviz/install.lua`, `lua/interactive-graphviz/protocol.lua`, `lua/interactive-graphviz/init.lua` (unless a comment-only clarification is needed), `frontend/**`, `server/sessions.ts`, `server/stdio.ts`, `server/health.ts`, `server/static.ts`, `server/protocol.ts`, `tests/commands_spec.lua`, `tests/lifecycle_spec.lua`, `tests/session_spec.lua`, `tests/render_spec.lua`, `tests/scaffold_spec.lua`, `tests/integration/**`, `.github/workflows/`.

### Deferred items from previous stories relevant here

From `deferred-work.md` (Story 1.6 deferred):
- "`config.get().preserve_view` not read at render time in `render.ts`" — still deferred. Story 2.1 only ensures the key is properly validated and stored; the frontend will wire it in a future story.

### Local validation

- `nvim --headless -u tests/minimal_init.lua` — smoke check module loads.
- `stylua --check lua/` — formatting gate.
- `bun test server` — validates TypeScript server changes.
- Do NOT run `busted` locally (not installed).

## Project Structure Notes

All Lua changes are in `lua/interactive-graphviz/config.lua` (validation) and `lua/interactive-graphviz/server.lua` (env var passing). The server change is minimal (two lines in `server/server.ts`). No new modules. No frontend changes.

Architecture invariants preserved:
- `bind` is controlled by `expose_to_lan` — security invariant enforced in `config.lua`, not `server.ts`.
- Server spawn/supervision logic in `server.lua` is not restructured — only the `env` table gains two new keys.
- `sessions.ts` and the session map are not touched.
- `protocol.ts` is unchanged — no new wire message types.
- `config.lua` remains the single source of truth for defaults; `M.get()` continues to be the only read path used throughout the plugin.

## References

- Epics: `_bmad-output/planning-artifacts/epics.md#Story 2.1` — FR-14, NFR-4
- Architecture — Configuration Surface: `architecture.md` lines 356–373
- Architecture — Security: `architecture.md` lines 326–330
- Architecture — Structure Patterns (config.lua responsibility): `architecture.md` lines 569–582
- Architecture — Requirements to Structure Mapping FR-14: `architecture.md` line 664
- Architecture — Naming Patterns (wire fields): `architecture.md` lines 409–422
- Previous story: `_bmad-output/implementation-artifacts/1-7-stop-toggle-and-lifecycle-cleanup.md`
- Deferred work: `_bmad-output/implementation-artifacts/deferred-work.md` — preserve_view wiring still deferred
- Memory: `local-test-harness.md` — busted not installed locally; use `nvim --headless` + stylua check

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- Implemented full validation in `config.lua` via private `validate()` function; all 10 keys validated with warn-on-bad-value; warnings collected and emitted after M.options is fully set (avoids stale log_level during circular log→config reads).
- Security invariant enforced: `bind` is always overridden by `expose_to_lan` — users cannot set bind directly (NFR-4).
- Added `IG_BIND` and `IG_PORT` env vars to `server.lua` spawn env table; `server.ts` reads them with `?? "127.0.0.1"` / `?? "0"` fallbacks.
- `init.lua` required no functional changes; added lifecycle ordering comment.
- `tests/config_spec.lua` replaced from 1-line placeholder to full busted test suite (groups: defaults, valid overrides, invalid engine, invalid debounce_ms, invalid log_level, expose_to_lan security invariant, port validation, engines validation, preserve_view, open_cmd).
- `server.test.ts` extended with 5 new env-var tests (IG_BIND default, IG_BIND override, IG_PORT default, IG_PORT override, heartbeatTimeoutMs pattern verification).
- All CI gates pass: `stylua --check lua/` ✓, `bun test server` 57/57 pass ✓, `nvim --headless` module smoke ✓.

### File List

- `lua/interactive-graphviz/config.lua` — MODIFIED: added full validation logic with warn-on-bad-value + expose_to_lan bind enforcement
- `lua/interactive-graphviz/server.lua` — MODIFIED: added IG_BIND and IG_PORT to spawn env table
- `lua/interactive-graphviz/init.lua` — MODIFIED: added lifecycle ordering comment (no functional change)
- `server/server.ts` — MODIFIED: replaced hardcoded hostname/port with process.env.IG_BIND/IG_PORT reads
- `tests/config_spec.lua` — REPLACED: full validation test suite (was 1-line placeholder)
- `server/server.test.ts` — MODIFIED: added 5 env-var bind/port tests
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — MODIFIED: status updated in-progress → review

### Change Log

- Story 2.1 implemented: configuration validation surface, expose_to_lan security invariant, IG_BIND/IG_PORT env var wiring, config_spec.lua test suite (Date: 2026-06-04)

### Review Findings

- [x] [Review][Patch] TS env-var tests test inline expressions, not production `main()` code — they don't prove `server.ts` reads IG_BIND/IG_PORT [server/server.test.ts]
- [x] [Review][Patch] `expose_to_lan` non-boolean values not validated: no warning emitted, AC2 partially violated [lua/interactive-graphviz/config.lua]
- [x] [Review][Patch] `Number.parseInt(IG_PORT)` in `server.ts` doesn't guard against NaN the way `heartbeatTimeoutMs()` does [server/server.ts:50]
- [x] [Review][Defer] `validate()` mutates its argument in-place while also returning it — misleading API [lua/interactive-graphviz/config.lua] — deferred, pre-existing style choice, no current correctness issue
- [x] [Review][Defer] IIFE in `engines` validation is unnecessarily complex — deferred, pre-existing style, not a correctness issue
- [x] [Review][Defer] `ensure_started()` `is_running()` guard uses `state.alive` (pre-ready) — deferred, pre-existing
