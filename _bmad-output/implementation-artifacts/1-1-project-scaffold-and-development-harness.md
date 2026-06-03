---
baseline_commit: NO_VCS
---

# Story 1.1: Project scaffold and development harness

Status: done

Created: 2026-06-02T19:09:38+0200
Story Key: 1-1-project-scaffold-and-development-harness

## Story

As the plugin author,
I want the three-tier project scaffolded with stubs and a working dev/test harness,
so that every subsequent story has a place to live and a way to be tested.

## Acceptance Criteria

1. Given an empty repository, when the scaffold story is complete, then the layout matches the architecture with these top-level areas present as stubs only: `plugin/`, `lua/interactive-graphviz/`, `server/`, `frontend/`, `tests/`, `.github/workflows/`.
2. Real protocol behavior waits for Story 1.3 and real rendering waits for Story 1.4. This story must not implement working preview, relay, render, install, or release behavior beyond smokeable stubs.
3. The Lua plugin loads in Neovim 0.10+ without error and exposes `require("interactive-graphviz").setup()`.
4. The Bun server scaffold runs from source via `bun run server/server.ts`.
5. The frontend scaffold bundles to static assets via Bun.
6. `server/protocol.ts` and `lua/interactive-graphviz/protocol.lua` exist as canonical-envelope stubs, with `protocol.lua` clearly stating that `server/protocol.ts` is canonical.
7. CI scaffold (`.github/workflows/ci.yml`) runs scaffold/smoke checks for Stylua, busted, and `bun test` on a clean checkout.

## Tasks / Subtasks

- [x] Create baseline repository structure and ignore rules (AC: 1, 2)
  - [x] Add `.gitignore` entries for `dist/`, `node_modules/`, `.bun/`, and local test/build output.
  - [x] Add `.stylua.toml`.
  - [x] Add `README.md` and `LICENSE` placeholders only if absent; keep README minimal and aligned to v1 live-preview scope.
  - [x] Add `doc/interactive-graphviz.txt` placeholder or a documented TODO for vimdoc autogeneration.
- [x] Create Lua plugin scaffold (AC: 1, 3, 6)
  - [x] Add `plugin/interactive-graphviz.lua` as a lazy command-definition entrypoint only. Do not eager-load the whole plugin.
  - [x] Add `lua/interactive-graphviz/init.lua` exposing `setup(opts)`.
  - [x] Add stub modules: `config.lua`, `commands.lua`, `session.lua`, `server.lua`, `lifecycle.lua`, `render.lua`, `protocol.lua`, `install.lua`, `log.lua`, `health.lua`.
  - [x] Ensure stubs are loadable and return tables/functions without side effects.
  - [x] In `protocol.lua`, add a comment that `server/protocol.ts` is the canonical message contract.
- [x] Create Bun server scaffold (AC: 1, 4, 6)
  - [x] Add `server/package.json` with scripts for `start`, `test`, and `build` or equivalent Bun-native names.
  - [x] Add `server/server.ts` that starts as a smokeable stub and exits/serves safely; no production protocol relay yet.
  - [x] Add `server/protocol.ts` with canonical envelope type stubs only.
  - [x] Add stub files: `sessions.ts`, `stdio.ts`, `health.ts`, `static.ts`.
  - [x] Add at least one Bun smoke test (`server/*.test.ts`) that proves the protocol stub imports and the test runner works.
- [x] Create frontend scaffold (AC: 1, 5)
  - [x] Add `frontend/index.html`, `main.ts`, `render.ts`, `ws.ts`, `viewstate.ts`, and `protocol.ts`.
  - [x] Ensure frontend code is buildable without implementing real Graphviz rendering.
  - [x] Keep `render.ts` as a placeholder for future `d3-graphviz` and `@hpcc-js/wasm-graphviz` integration; no real render behavior in this story.
- [x] Create test harness (AC: 3, 4, 5, 7)
  - [x] Add `tests/minimal_init.lua`.
  - [x] Add one Lua smoke spec proving `require("interactive-graphviz").setup({})` is callable.
  - [x] Add placeholder test file locations for future `session_spec.lua`, `config_spec.lua`, `lifecycle_spec.lua`, `tests/integration/orphan_spec.lua`, and `tests/e2e/render.spec.ts` if not implemented.
  - [x] Configure test commands so a dev agent can run Lua smoke tests locally.
- [x] Add CI scaffold (AC: 7)
  - [x] Add `.github/workflows/ci.yml` with jobs/steps for Stylua check, Lua smoke tests, and `bun test`.
  - [x] Add `.github/workflows/release.yml` as a placeholder for the later Bun `--compile` matrix; do not implement release publishing in this story.
- [x] Validate story completion (AC: all)
  - [x] Run or document runnable commands for Stylua, Lua smoke tests, `bun test`, and frontend bundle smoke.
  - [x] Confirm no real preview/relay/render/distribution behavior was implemented early.

### Review Findings

- [x] [Review][Patch] CI does not provision Neovim before running the Neovim smoke test [.github/workflows/ci.yml:13]
- [x] [Review][Patch] Required future test placeholder files are missing [_bmad-output/implementation-artifacts/1-1-project-scaffold-and-development-harness.md:54]
- [x] [Review][Patch] Manual release workflow succeeds even though release is unimplemented [.github/workflows/release.yml:3]
- [x] [Review][Patch] Engine command completion is hard-coded instead of reading configured engines [plugin/interactive-graphviz.lua:26]

## Dev Notes

### Scope Boundary

This is a scaffold story. The developer must create structure, loadable stubs, smoke tests, and CI wiring only. Do not implement:

- server supervision, stdin EOF handling, heartbeat, port/token readiness, or session lifecycle (Story 1.2)
- JSON-lines protocol relay or WebSocket fanout (Story 1.3)
- browser opening or initial Graphviz render (Story 1.4)
- live reload/debounce/version tokens (Story 1.5)
- last-good render/error overlay/view preservation (Story 1.6)
- stop/toggle/cleanup behavior (Story 1.7)
- layout configuration behavior (Epic 2)
- binary install/release/checksum behavior (Epic 3)

### Architecture Guardrails

- Three tiers are mandatory: Lua Neovim plugin, Bun local server, browser frontend. [Source: `_bmad-output/planning-artifacts/architecture.md` "Primary Technology Domain"]
- Lua entrypoint pattern: `plugin/interactive-graphviz.lua` defines lazy commands/keymaps only; core modules live under `lua/interactive-graphviz/` and load on demand. [Source: `_bmad-output/planning-artifacts/architecture.md` "Tier 1 - Lua Plugin Scaffold"]
- Server toolchain is Bun. Use `Bun.serve` later for HTTP/WebSocket, but this story only needs a smokeable `server.ts` scaffold. [Source: `_bmad-output/planning-artifacts/architecture.md` "Tier 2 - Server Binary Toolchain"]
- Frontend renderer dependencies are future-facing in this story: `d3-graphviz` 5.6.0 and `@hpcc-js/wasm-graphviz` 1.21.2 belong in the frontend bundle later. Do not wire real render behavior now. [Source: `_bmad-output/planning-artifacts/architecture.md` "Tier 3 - Frontend Renderer + Bundler"]
- `server/protocol.ts` is canonical. `lua/interactive-graphviz/protocol.lua` mirrors it and must say `protocol.ts` is canonical. Do not let each tier invent a separate field set. [Source: `_bmad-output/planning-artifacts/architecture.md` "Structure Patterns"; "Enforcement Guidelines"]
- Wire conventions for future stories: camelCase field keys, snake_case `type` values, and one JSON object per line/frame. In this story, stubs should make this convention visible but not fully implement it. [Source: `_bmad-output/planning-artifacts/architecture.md` "Format Patterns"]
- Server stdout is reserved for protocol messages in future stories. Even scaffold output should avoid setting a precedent of free-form stdout logging; prefer stderr for smoke diagnostics. [Source: `_bmad-output/planning-artifacts/architecture.md` "Process Patterns"]

### Required Project Structure

Create this structure as the target scaffold. Files can be stubs unless explicitly required for smoke tests.

```text
interactive-graphviz.nvim/
|-- README.md
|-- LICENSE
|-- .gitignore
|-- .stylua.toml
|-- doc/
|   `-- interactive-graphviz.txt
|-- plugin/
|   `-- interactive-graphviz.lua
|-- lua/interactive-graphviz/
|   |-- init.lua
|   |-- config.lua
|   |-- commands.lua
|   |-- session.lua
|   |-- server.lua
|   |-- lifecycle.lua
|   |-- render.lua
|   |-- protocol.lua
|   |-- install.lua
|   |-- log.lua
|   `-- health.lua
|-- server/
|   |-- package.json
|   |-- bunfig.toml
|   |-- server.ts
|   |-- sessions.ts
|   |-- protocol.ts
|   |-- stdio.ts
|   |-- health.ts
|   |-- static.ts
|   `-- server.test.ts
|-- frontend/
|   |-- index.html
|   |-- main.ts
|   |-- render.ts
|   |-- ws.ts
|   |-- viewstate.ts
|   `-- protocol.ts
|-- dist/
|-- tests/
|   |-- minimal_init.lua
|   |-- scaffold_spec.lua
|   |-- integration/
|   |   `-- .gitkeep
|   `-- e2e/
|       `-- .gitkeep
`-- .github/workflows/
    |-- ci.yml
    `-- release.yml
```

### File Responsibility Notes

- `plugin/interactive-graphviz.lua`: register `GraphvizPreview`, `GraphvizPreviewStop`, `GraphvizPreviewToggle`, and `GraphvizEngine` command placeholders if useful for smoke, but avoid real behavior.
- `init.lua`: expose `setup(opts)` and return a module table. It may delegate to `config.setup(opts)` if that stub exists.
- `config.lua`: defaults/validation stub only. Future config keys include `engine`, `engines`, `debounce_ms`, `bind`, `port`, `expose_to_lan`, `open_cmd`, `preserve_view`, `heartbeat_ms`, `log_level`.
- `server.lua`, `session.lua`, `lifecycle.lua`, `render.lua`: return empty or minimal module tables. Do not spawn processes, mutate sessions, or attach autocmds yet.
- `log.lua`: define a `notify` helper stub if needed, mapping future user-facing output through one place.
- `health.lua`: can expose a `check()` stub; full `:checkhealth` belongs later.
- `server/protocol.ts`: define minimal exported types/interfaces for the envelope; no full message union required yet.
- `frontend/protocol.ts`: import/re-export the server protocol type if pathing allows; otherwise document TODO without duplicating fields.

### Testing Requirements

- Lua smoke test must run in a minimal Neovim context and assert `require("interactive-graphviz").setup({})` does not error.
- Plenary supports running a directory with headless Neovim via `PlenaryBustedDirectory`; use this if the harness uses Plenary. Official Plenary docs show the command shape `nvim --headless -c "PlenaryBustedDirectory tests/plenary/ {options}"`. [Source: https://github.com/nvim-lua/plenary.nvim]
- The nvim-lua plugin template includes GitHub workflows/config for linters/tests and a minimal test setup with a rockspec and `.busted`; it documents `luarocks test --local` and `busted` as expected test paths. [Source: https://github.com/nvim-lua/nvim-lua-plugin-template]
- Busted tests use `describe` and `it` blocks; keep smoke tests simple and deterministic. [Source: https://lunarmodules.github.io/busted/]
- StyLua supports `--check` for CI formatting verification and exits non-zero if formatting is needed. Use that for CI rather than rewriting files in CI. [Source: https://github.com/JohnnyMorganz/StyLua]
- Bun server test must be runnable with `bun test` from the server workspace or repo root, depending on the package layout chosen.
- Frontend bundle smoke can use `bun build frontend/index.html --outdir dist/frontend` or equivalent. Official Bun docs support HTML entrypoints and production builds to `dist`. [Source: https://bun.com/docs/bundler/html-static]

### Latest Technical Information

- Neovim `vim.system()` runs commands directly rather than through a shell, returns a `SystemObj`, supports async `on_exit`, `wait()`, `kill()`, and `write()`, and can open stdin with `{ stdin = true }`. This matters for future Story 1.2, but Story 1.1 should only scaffold around the API. [Source: https://neovim.io/doc/user/lua.html#vim.system()]
- Bun supports compiling TypeScript/JavaScript entrypoints to standalone executables with `bun build --compile`; architecture uses this later for the release matrix. Story 1.1 only needs the project scripts/placeholders. [Source: https://bun.sh/docs/bundler]
- Bun HTML/static bundling supports building `index.html` to `dist` and can process scripts/styles/assets referenced by the HTML. Keep the frontend scaffold compatible with that flow. [Source: https://bun.com/docs/bundler/html-static]

### Previous Story Intelligence

No previous story exists. This is the first story in Epic 1 and establishes the baseline structure for all later implementation.

### Git Intelligence

The repository currently contains BMad outputs/configuration and no implementation source tree for the plugin. There are no prior implementation commits or patterns to preserve in source code. Treat the architecture's directory structure as authoritative.

### Anti-Patterns To Avoid

- Do not implement real runtime behavior early just to make smoke tests pass.
- Do not put Lua implementation in `plugin/interactive-graphviz.lua`; it should stay lazy and thin.
- Do not create a separate protocol schema in Lua or frontend; make `server/protocol.ts` visibly canonical.
- Do not use Express/socket.io; architecture chose Bun-native HTTP/WebSocket later.
- Do not add a Node/yarn runtime requirement.
- Do not add system Graphviz dependency.
- Do not use server stdout for human logs.
- Do not create release artifacts or checksums yet; Story 3 owns that.

## Project Structure Notes

This is a greenfield scaffold. There are no existing implementation files marked UPDATE. The dev agent should create new files only, except for top-level placeholders such as `README.md` or `.gitignore` if they already exist by the time development starts.

## References

- PRD: `_bmad-output/planning-artifacts/prds/prd-interactive-graphviz.nvim-2026-06-02/prd.md`
- PRD addendum: `_bmad-output/planning-artifacts/prds/prd-interactive-graphviz.nvim-2026-06-02/addendum.md`
- Architecture: `_bmad-output/planning-artifacts/architecture.md`
- Epics: `_bmad-output/planning-artifacts/epics.md`
- Readiness reassessment: `_bmad-output/planning-artifacts/implementation-readiness-report-2026-06-02-rerun.md`
- Bun bundler / executables: https://bun.sh/docs/bundler
- Bun HTML/static bundling: https://bun.com/docs/bundler/html-static
- Neovim `vim.system()`: https://neovim.io/doc/user/lua.html#vim.system()
- nvim-lua plugin template: https://github.com/nvim-lua/nvim-lua-plugin-template
- Plenary test harness: https://github.com/nvim-lua/plenary.nvim
- Busted docs: https://lunarmodules.github.io/busted/
- StyLua docs: https://github.com/JohnnyMorganz/StyLua

## Dev Agent Record

### Agent Model Used

TBD by dev agent.

### Debug Log References

- 2026-06-02T19:14:01+0200: Started implementation. Baseline commit unavailable because repository has no valid HEAD commit; set `baseline_commit: NO_VCS`.
- 2026-06-02T19:20:00+0200: Validation passed: `stylua --check plugin lua tests`, Neovim headless smoke with `-i NONE`, `bun run server/server.ts`, `bun test server`, frontend bundle smoke, and pure Lua syntax check for the Busted scaffold spec. Local `busted` binary is not installed; CI installs Busted before running the pure scaffold spec.
- 2026-06-02T19:26:36+0200: Final definition-of-done validation passed and story marked ready for review.
- 2026-06-03T15:41:40+0200: Code review patches applied and validated: CI now provisions Neovim 0.10.4, future test placeholders exist, the release placeholder fails explicitly until Epic 3, and engine completion reads configured engines.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Implemented scaffold only: repository structure, Lua plugin stubs, Bun server stubs, frontend stubs, smoke tests, and CI placeholders.
- Kept runtime scope constrained: no server spawn/supervision, real protocol relay, Graphviz rendering, install/download/checksum behavior, or release publishing was implemented.
- Story moved to `review` after all tasks/subtasks were checked, all acceptance criteria were validated, and the file list was completed.
- Validation commands run:
  - `stylua --check plugin lua tests`
  - `nvim --headless -i NONE -u tests/minimal_init.lua -l tests/nvim_smoke.lua -c qa`
  - `bun run server/server.ts`
  - `bun test server`
  - `bun build frontend/index.html --outdir dist/frontend`
  - `lua -e "assert(loadfile('tests/scaffold_spec.lua')); print('busted spec syntax ok')"`

### File List

- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `.gitignore`
- `.stylua.toml`
- `LICENSE`
- `README.md`
- `doc/interactive-graphviz.txt`
- `frontend/index.html`
- `frontend/main.ts`
- `frontend/protocol.ts`
- `frontend/render.ts`
- `frontend/viewstate.ts`
- `frontend/ws.ts`
- `tests/config_spec.lua`
- `tests/e2e/render.spec.ts`
- `tests/integration/orphan_spec.lua`
- `tests/lifecycle_spec.lua`
- `lua/interactive-graphviz/commands.lua`
- `lua/interactive-graphviz/config.lua`
- `lua/interactive-graphviz/health.lua`
- `lua/interactive-graphviz/init.lua`
- `lua/interactive-graphviz/install.lua`
- `lua/interactive-graphviz/lifecycle.lua`
- `lua/interactive-graphviz/log.lua`
- `lua/interactive-graphviz/protocol.lua`
- `lua/interactive-graphviz/render.lua`
- `lua/interactive-graphviz/server.lua`
- `lua/interactive-graphviz/session.lua`
- `plugin/interactive-graphviz.lua`
- `server/bunfig.toml`
- `server/health.ts`
- `server/package.json`
- `server/protocol.ts`
- `server/server.test.ts`
- `server/server.ts`
- `server/sessions.ts`
- `server/static.ts`
- `server/stdio.ts`
- `tests/e2e/.gitkeep`
- `tests/integration/.gitkeep`
- `tests/minimal_init.lua`
- `tests/nvim_smoke.lua`
- `tests/scaffold_spec.lua`
- `tests/session_spec.lua`

### Change Log

- 2026-06-02: Added initial three-tier scaffold and smoke validation harness for Story 1.1.
