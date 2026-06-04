---
baseline_commit: f9f70ab
created: 2026-06-04T23:29:45+0200
---

# Story 2.2: Layout engine selection (dot/neato)

Status: review

## Story

As a user reading a dense graph,
I want to switch the layout engine,
so that I can get a more readable arrangement.

## Acceptance Criteria

1. **Given** an open preview using the default engine `dot`, **when** the user runs `:GraphvizEngine neato` or sets `engine = "neato"` in config, **then** the current graph re-renders with the selected algorithm (FR-8).
2. **Given** an engine name not present in `config.get().engines`, **when** the user runs `:GraphvizEngine <engine>`, **then** the command rejects it with an informative user-facing message and does not mutate config or send a render.
3. **Given** a valid engine switch while a preview is active, **when** the command runs, **then** the next `render` envelope carries `engine = "<selected>"`, a newly minted `v`, the current buffer DOT, and the same `sessionId`.
4. **Given** no active preview for the current buffer, **when** `:GraphvizEngine <valid-engine>` runs, **then** config is updated for future previews and no server/session is started implicitly.
5. **Given** the configured `engines` list changes in `setup{}`, **when** command completion or validation runs, **then** that list is the only allowlist for selectable engines; v1 defaults remain `{ "dot", "neato" }`.
6. **Given** the frontend receives a `render` envelope with `engine = "neato"`, **when** it renders, **then** it applies that engine via d3-graphviz before `renderDot`; `dot` remains the fallback if the field is absent.

## Tasks / Subtasks

- [x] **`lua/interactive-graphviz/config.lua` - add runtime engine setter** (AC: 1, 2, 4, 5)
  - [x] Add `M.set_engine(engine)` or equivalent small API that validates against current `M.options.engines`.
  - [x] On valid input, update `M.options.engine` and return `true`.
  - [x] On invalid input, return `false, message`; do not reset to default and do not emit duplicate warnings from `setup{}` validation.
  - [x] Keep `setup{}` as the source for defaults and `engines` allowlist; do not introduce a second engine list.

- [x] **`lua/interactive-graphviz/commands.lua` - implement `M.engine(opts)`** (AC: 1, 2, 3, 4)
  - [x] Replace the placeholder with real command handling for `:GraphvizEngine {engine}`.
  - [x] Read the selected engine from `opts.args`; if empty, report current engine and available engines.
  - [x] Validate through `config.set_engine()`; invalid engines must call `log.notify` or `log.warn` with a clear message such as `GraphvizEngine: unknown engine 'fdp'; expected one of: dot, neato`.
  - [x] If the current buffer has an active session and the server is alive, send a fresh `render` envelope with current DOT, current `sessionId`, `engine`, and `session.next_version(bufnr)`.
  - [x] If no active session exists, only update config for future previews. Do not call `server.open_session`, `server.ensure_started`, or `M.preview()`.
  - [x] Preserve existing `preview`, `stop`, and `toggle` behavior; do not change browser open logic.

- [x] **Protocol/server guardrails** (AC: 3, 6)
  - [x] `server/protocol.ts` and `lua/interactive-graphviz/protocol.lua` already include `set_engine`; do not add a new message type unless implementation truly needs one.
  - [x] Prefer the existing `render{sessionId,v,engine,dot}` path for immediate re-render. The server already relays render envelopes verbatim and stores the last cleanly relayed render for reconnects.
  - [x] Do not mutate `server/sessions.ts` unless the implementation deliberately supports server-side `set_engine`; current ACs can pass without changing server session state because the render envelope carries `engine`.

- [x] **Frontend validation / minimal change check** (AC: 6)
  - [x] Confirm `frontend/main.ts` reads `msg.engine` with fallback `"dot"` and calls `queueRender(dot, engine, v)`.
  - [x] Confirm `frontend/render.ts` calls `graphviz("#app").engine(engine).renderDot(dot)`. d3-graphviz requires `.engine(engine)` before `renderDot`.
  - [x] If adding tests, prefer `server/render-queue.test.ts` for engine propagation through the pure queue and `server/render.test.ts` for WASM `neato` support; avoid browser-only rewrites unless needed.

- [x] **Tests** (AC: 1-6)
  - [x] Extend `tests/config_spec.lua` for `set_engine`: valid switch, invalid rejection, custom `engines` allowlist, and no fallback-to-default side effect on invalid runtime command.
  - [x] Extend `tests/commands_spec.lua` for:
    - valid `M.engine({ args = "neato" })` updates config and sends a render when session is active;
    - valid engine with no active session updates config only;
    - invalid engine logs/reports and sends nothing;
    - empty args reports current/available engines and sends nothing.
  - [x] Add or extend a TS test proving engine argument is preserved by `createRenderQueue` and/or that `Graphviz.load().layout(..., "svg", "neato")` remains green. `server/render.test.ts` already has a `neato` WASM gate.
  - [x] Keep stubs local to each test file. Follow existing `package.loaded[...]` injection patterns in `tests/commands_spec.lua` and `tests/config_spec.lua`.

## Dev Notes

### Scope

This story is engine selection only. It does not add new layout engines beyond configured values, export, graph interactivity, source-build/install behavior, or frontend UI controls. The command is the user-facing surface; config remains the default/future-session surface.

### Current state to build on

- `plugin/interactive-graphviz.lua` already defines `:GraphvizEngine` with optional args and completion from `config.get().engines`; it dispatches to `commands.engine(opts)`.
- `commands.lua` currently has `M.engine()` as a scaffold placeholder. This is the primary implementation point.
- `config.lua` already validates `engine`, `engines`, and all setup keys. It has no runtime setter yet. Add a focused setter instead of re-running full `setup{}` from the command path.
- `commands.preview()` and `render.lua` already include `engine = config.get().engine` in `render` messages. A command-triggered active-session re-render should use the same envelope shape.
- `frontend/main.ts` already reads `msg.engine` and falls back to `"dot"`.
- `frontend/render.ts` already calls `.engine(engine)` before `.renderDot(dot)`.
- `server/server.ts` relays `render` envelopes verbatim. No server-side transformation is needed for FR-8.
- `server/protocol.ts` and `protocol.lua` already list `set_engine`, but no server handler exists. Use `render` unless a concrete need appears; adding a `set_engine` handler would require extra tests and server session semantics.

### Previous story intelligence

Story 2.1 established:
- `config.lua` is the single source of defaults and option validation.
- `bind` security is controlled by `expose_to_lan`; do not disturb it.
- Validation warnings are emitted after `M.options` is fully written because `log.lua` reads config at call time.
- `setup{}` must not kill or restart a running server. This story follows the same rule: changing the engine should not restart the server.
- Recent deferred notes in `config.lua` are readability only (`validate()` mutates a disposable merged table; engines validation IIFE is complex). Do not refactor them unless needed for the setter.

Recent commits:
- `f9f70ab Fix CI Bun dependency setup` changed only CI dependency setup.
- `345b473 Complete Story 2.1: configuration surface via setup` added config validation, server env vars, tests, and this story's config foundation.

### Architecture guardrails

- Wire format: `type` values are snake_case; payload fields are camelCase. Lua wire tables must use `sessionId`, not `session_id`.
- `v` is minted only at the Neovim source through `session.next_version(bufnr)`.
- Lua session map mutation stays in `session.lua`; this story should only query `session.has()` and mint `v`.
- Server session map mutation stays in `server/sessions.ts`; avoid touching it.
- Server stdout remains protocol-only; diagnostics go through existing log paths.
- The frontend render engine remains `d3-graphviz` 5.6.0 plus `@hpcc-js/wasm-graphviz` 1.21.2 as pinned in `frontend/package.json`.

### Latest technical check

- d3-graphviz documents `graphviz.engine(engine)` as the way to set the layout engine, and the engine must be set before `dot()` or `renderDot()`.
- d3-graphviz lists `dot` and `neato` among supported engines. Keep v1 restricted by `config.get().engines` even though the renderer can support more.
- `@hpcc-js/wasm-graphviz` is already pinned in this repo at 1.21.2; do not upgrade dependencies in this story.

### Files to modify

| File | Change type | Summary |
| --- | --- | --- |
| `lua/interactive-graphviz/config.lua` | MODIFY | Add runtime engine setter using current `engines` allowlist |
| `lua/interactive-graphviz/commands.lua` | MODIFY | Implement `M.engine(opts)` and active-session re-render |
| `tests/config_spec.lua` | MODIFY | Add runtime engine setter tests |
| `tests/commands_spec.lua` | MODIFY | Add `GraphvizEngine` command behavior tests |
| `server/render-queue.test.ts` or `server/render.test.ts` | MODIFY/OPTIONAL | Add focused engine propagation test only if existing coverage is insufficient |

Do not touch: `lua/interactive-graphviz/server.lua`, `lua/interactive-graphviz/session.lua`, `lua/interactive-graphviz/render.lua`, `server/sessions.ts`, `server/server.ts`, `frontend/ws.ts`, install/release files, or lifecycle/orphan tests unless a failing test proves they are required.

### Testing requirements

Run reasonable local validation:
- `nvim --headless -u tests/minimal_init.lua`
- `stylua --check lua/`
- `bun test server`
- If available, run the focused Lua specs for `commands_spec.lua` and `config_spec.lua`; prior story notes say plain `busted` may not be installed locally.

## Project Structure Notes

The implementation stays within existing modules. No new module, dependency, or frontend UI file is expected. `config.lua` remains the engine allowlist owner; `commands.lua` owns the user command; the existing `render` envelope carries the selected engine through server relay to frontend rendering.

## References

- Epics: `_bmad-output/planning-artifacts/epics.md` - Epic 2, Story 2.2
- Architecture: `_bmad-output/planning-artifacts/architecture.md` - Configuration Surface, Transport & Message Protocol, Render Pipeline, Requirements to Structure Mapping
- Previous story: `_bmad-output/implementation-artifacts/2-1-configuration-surface-via-setup.md`
- Deferred work: `_bmad-output/implementation-artifacts/deferred-work.md`
- Current code: `plugin/interactive-graphviz.lua`, `lua/interactive-graphviz/commands.lua`, `lua/interactive-graphviz/config.lua`, `frontend/main.ts`, `frontend/render.ts`, `server/protocol.ts`
- External check: d3-graphviz npm docs - `graphviz.engine(engine)` before `renderDot`; supported engines include `dot` and `neato`

## Dev Agent Record

### Agent Model Used

gpt-5-codex

### Debug Log References

- 2026-06-04T23:34:40+0200 - Story 2.2 moved from ready-for-dev to in-progress; baseline_commit preserved as f9f70ab.
- 2026-06-04T23:38:49+0200 - Busted unavailable locally; Lua specs validated with inline Busted-compatible harness.
- 2026-06-04T23:38:49+0200 - Bun server/e2e suites required unsandboxed execution for local server spawn/bind tests.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Story auto-discovered from sprint status as first backlog story.
- Existing implementation already carries `engine` through normal preview/live-reload render envelopes and frontend render path; missing work is runtime command/config mutation and tests.
- Story status set to ready-for-dev.
- Added `config.set_engine(engine)` with current `engines` allowlist validation, clear invalid-engine messages, and no setup-warning side effects.
- Implemented `commands.engine(opts)` for empty-arg reporting, runtime config mutation, active-session render refresh, and no implicit preview/server start when inactive.
- Confirmed protocol/server/frontend guardrails: reused existing `render` envelope and did not add a new server message path or mutate server session state.
- Added Lua command/config coverage and a pure render queue TS test proving selected engine propagation.
- Validations passed: `stylua --check lua/ tests/commands_spec.lua tests/config_spec.lua`; `nvim --headless -i NONE -u tests/minimal_init.lua -l tests/nvim_smoke.lua -c qa`; Lua unit specs via inline harness; `bun test server`; `bun test tests/e2e/render.spec.ts`.

### File List

- `_bmad-output/implementation-artifacts/2-2-layout-engine-selection-dot-neato.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `lua/interactive-graphviz/config.lua`
- `lua/interactive-graphviz/commands.lua`
- `server/render-queue.test.ts`
- `tests/config_spec.lua`
- `tests/commands_spec.lua`

### Change Log

- 2026-06-04T23:38:49+0200 - Implemented Story 2.2 layout engine selection command/config behavior, tests, and review status update.
