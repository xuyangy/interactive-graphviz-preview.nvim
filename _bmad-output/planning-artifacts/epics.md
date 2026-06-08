---
stepsCompleted: [1, 2, 3, 4]
status: 'complete'
completedAt: '2026-06-02'
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-interactive-graphviz.nvim-2026-06-02/prd.md
  - _bmad-output/planning-artifacts/prds/prd-interactive-graphviz.nvim-2026-06-02/addendum.md
  - _bmad-output/planning-artifacts/architecture.md
---

# interactive-graphviz.nvim - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for interactive-graphviz.nvim,
decomposing the requirements from the PRD and Architecture into implementable stories.
There is no UX Design document; the minimal browser-side UI is specified in the
Architecture's render-pipeline section.

## Requirements Inventory

### Functional Requirements

*(v1 scope as refined with the author and locked in the Architecture. FR-4 was
dropped from v1 — command-only start; FR-10/FR-11 export were deferred to Tier 3.)*

FR-1: A user can run `:GraphvizPreview` on a `.dot`/`.gv` buffer to open a Preview in
a browser tab rendering that buffer's Graph; on a non-DOT buffer it is a no-op with an
informative message.
FR-2: A user can run `:GraphvizPreviewStop` to end the Preview session; idempotent; no
orphaned process survives.
FR-3: A user can run `:GraphvizPreviewToggle` to start the Preview if stopped or stop
it if running, never leaving an inconsistent state.
FR-5: The plugin terminates the Server on the last Preview buffer closing and on Neovim
exit — no Server process remains after quitting Neovim.
FR-6: The Frontend renders the Graph from the buffer's DOT using bundled Graphviz-WASM,
with no system Graphviz/`dot` installed.
FR-7: The Preview re-renders when the DOT buffer changes, debounced (default 200 ms,
configurable); rapid edits are coalesced latest-wins.
FR-8: A user can choose the Layout engine (v1: `dot` default, `neato`) via command and
config; changing it re-renders the current Graph.
FR-9: When the DOT buffer has a parse/render error, the Preview preserves the last good
Graph and surfaces a visible error message.
FR-12: On install, the plugin obtains a Prebuilt binary matching the user's platform
(Linux x64/arm64, macOS x64/arm64); requires no Node/yarn at runtime; integrity verified
against a published checksum pinned to a release tag.
FR-13: When no Prebuilt binary matches the platform, the plugin can build the Server
from source (Bun); the fallback path is documented and discoverable when triggered.
FR-14: A user can configure at least: default Layout engine, debounce interval, browser
open command, and Server bind/port behavior; documented defaults exist; zero-config works.

*(Deferred — not in v1: FR-4 auto-open; FR-10 export SVG; FR-11 export DOT.)*

### NonFunctional Requirements

NFR-1: Zero external prerequisites — on a supported platform the plugin runs with no
system Graphviz and no Node/yarn at runtime. *(Load-bearing — SM-2. Counter-metric
SM-C1: never trade install simplicity for features.)*
NFR-2: Render responsiveness — after typing pauses, the Preview reflects changes within
the debounce window (default 200 ms); rapid edits coalesced latest-wins.
NFR-3: Reliability / no orphans — the Server starts on demand and is always cleaned up
on stop, last-buffer-close, and Neovim exit (incl. abnormal termination); port conflicts
handled by auto-selecting a free port.
NFR-4: Security / least exposure — Server binds to localhost only by default; LAN
exposure is explicit opt-in; prebuilt binaries are integrity-verified.
NFR-5: Portability — Neovim 0.10+; prebuilt binaries for Linux + macOS (x64/arm64);
source-build fallback elsewhere; no Windows prebuilt in v1.
NFR-6: Render fidelity — the rendered Graph matches Graphviz semantics for valid DOT
(parity with the d3-graphviz/WASM reference renderer).

### Additional Requirements

*(Technical requirements drawn from the Architecture that shape implementation.)*

- **Starter / greenfield init (Epic 1, Story 1):** scaffold three sub-projects — Lua
  plugin (`nvim-lua-plugin-template` conventions: busted/plenary, Stylua, vimdoc,
  LuaRocks), `server/` (Bun), `frontend/` (static) — plus the `release.yml`
  `bun build --compile` cross-compile matrix.
- **Server multiplexing model:** one Server process per Neovim instance; sessions keyed
  by `bufnr`; refcount = `sessions.size`; browser is a stateless view.
- **Transport:** Neovim↔server via custom newline-delimited JSON over `vim.system()`
  stdio (NOT native msgpack-RPC); server↔browser via `Bun.serve` WebSocket; one shared
  JSON envelope on both hops; canonical type in `server/protocol.ts`, mirrored in
  `protocol.lua`.
- **Supervision / no-orphan:** server self-terminates on stdin EOF + heartbeat; Lua
  cleanup (`VimLeavePre`, buffer autocmds) is the graceful path only. Verified by a
  headless-nvim `kill -9 → server reaped` test (the load-bearing gate + multiplexing
  falsification gate).
- **Port:** ephemeral `bind :0`, read back, announced via `ready{port,token}`.
- **Render correctness:** monotonic per-session `v` token minted only at the Neovim
  source, carried end-to-end; browser discards renders with stale `v`; frontend
  render-lock; last-good-render + visible error overlay; preserve zoom/pan across reload
  where feasible.
- **Security:** bind literal `127.0.0.1`; per-session token required in browser URL +
  WS `hello`; `expose_to_lan` explicit opt-in.
- **Distribution / supply-chain:** SHA-256 checksum manifest committed in-source,
  tag-pinned, verified fail-closed (temp → verify → atomic rename → chmod); platform +
  libc (glibc/musl) detection; macOS quarantine xattr strip; loud Bun source-build
  fallback via dedicated process group; install failures fail fast with helpful copy.
- **Frontend packaging:** bundled frontend embedded into the Bun binary (single-file).
- **Renderer:** `d3-graphviz` 5.6.0 + `@hpcc-js/wasm-graphviz` 1.21.2.
- **Observability:** `:checkhealth` (nvim ≥0.10, binary+checksum, Bun, port-bind);
  `/health` endpoint; structured logs correlated by `sessionId`/`v`.
- **Consistency rules:** camelCase wire fields + snake_case `type`; session-map mutation
  confined to one module per tier; stdout reserved for the protocol on the server.

### UX Design Requirements

*(No UX Design document exists. The only user-facing visual surface is the browser
Preview, fully specified by the Architecture render pipeline: the rendered SVG, the
non-blocking error overlay on parse failure, and zoom/pan view-state preservation across
reload. No separate UX-DR items.)*

### FR Coverage Map

- FR-1: Epic 1 — `:GraphvizPreview` opens a browser render of the buffer's Graph.
- FR-2: Epic 1 — `:GraphvizPreviewStop`, idempotent, no orphan.
- FR-3: Epic 1 — `:GraphvizPreviewToggle` delegates to start/stop.
- FR-5: Epic 1 — lifecycle cleanup on last-buffer-close and Neovim exit.
- FR-6: Epic 1 — WASM render in the browser, zero system Graphviz.
- FR-7: Epic 1 — debounced (200 ms) live reload, latest-wins, v-token guard.
- FR-9: Epic 1 — last good render preserved + visible error message.
- FR-8: Epic 2 — `dot`/`neato` selection via command + config.
- FR-14: Epic 2 — `setup{}` configuration surface; zero-config works.
- FR-12: Epic 3 — prebuilt binary install + tag-pinned checksum verification.
- FR-13: Epic 3 — Bun source-build fallback when no prebuilt matches.

*All 11 v1 FRs covered. FR-4 (auto-open), FR-10 (export SVG), FR-11 (export DOT)
intentionally excluded from v1.*

## Epic List

### Epic 1: Live Graphviz Preview
A user runs `:GraphvizPreview` on a `.dot`/`.gv` buffer and sees their graph render in
a browser tab that live-updates as they type — holding the last good render with a
visible error when the DOT is mid-edit broken — and can stop/toggle it with guaranteed
teardown (no orphaned process). The core loop (SM-1); stands alone as a complete, usable
plugin running the server from source/local build in dev. Carries the foundational
three-tier scaffold, one-server-per-instance supervision (the `kill -9 → reaped` gate),
the JSON-over-stdio transport + WebSocket relay, and the render pipeline.
**FRs covered:** FR-1, FR-2, FR-3, FR-5, FR-6, FR-7, FR-9
**NFRs exercised:** NFR-2, NFR-3, NFR-4 (bind), NFR-6

### Epic 2: Layout Engines & Configuration
A user can switch the layout engine between `dot` and `neato` (via `:GraphvizEngine`
and config) to make a dense graph readable, and configure the plugin's behavior
(default engine, debounce, browser command, bind/port) through an idiomatic `setup{}`
surface that also works with zero config. Builds on Epic 1; Epic 1 stands without it
(`dot` is the default).
**FRs covered:** FR-8, FR-14

### Epic 3: Zero-Prerequisite Installation & Distribution
A clean install on a supported platform yields a working preview with no system
Graphviz and no Node/yarn at runtime — via a tag-pinned, checksum-verified prebuilt
binary, with a clear Bun source-build fallback when no artifact matches, and install
failures that fail fast with helpful copy. SM-2 as its own user outcome; productionizes
the binary Epic 1 ran from source. Touches `install.lua`, `release.yml`,
`checksums.txt`, and health checks.
**FRs covered:** FR-12, FR-13
**NFRs exercised:** NFR-1, NFR-5, NFR-4 (integrity)

### Epic 4: v1 Hardening (user-facing slice) — *v2, added 2026-06-07*
A consolidated pass that closes the user-facing defects triaged from `deferred-work.md`
plus the open Epic-3-retro verification item, de-risking before v2 adds interaction
surface. Small and self-contained; no new product promise.
**Deferred items consumed:** N-tabs idempotency, empty-DOT feedback, `open_cmd` quoting,
Windows no-orphan verification (retro AI#2).

### Epic 5: Interactivity Layer — *v2, added 2026-06-07*
A user can interact with the rendered Graph the way the plugin's name promises — click a
node to highlight its neighbors, search nodes/edges, and zoom/pan/reset — reaching parity
with `vscode-interactive-graphviz`. Entirely **frontend-local**: operates on the already-
rendered SVG client-side, adds **no new wire messages and no install prerequisites** (the
browser→server return channel stays dormant, reserved for a future v3 bidirectional sync),
so NFR-1 / SM-C1 are preserved.
**FRs covered:** FR-15, FR-16, FR-17, FR-18
**NFRs exercised:** NFR-7 (interaction responsiveness), NFR-1 / SM-C1 (no new prerequisites)

## Epic 1: Live Graphviz Preview

A user runs `:GraphvizPreview` on a `.dot`/`.gv` buffer and watches their graph render
in a browser tab that live-updates as they type, holds the last good render with a
visible error on syntax errors, and tears down cleanly with no orphaned process. The
core loop (SM-1). Stories follow the architecture's implementation sequence; each is
single-dev-agent sized and depends only on earlier stories.

### Story 1.1: Project scaffold and development harness

As the plugin author,
I want the three-tier project scaffolded with stubs and a working dev/test harness,
So that every subsequent story has a place to live and a way to be tested.

**Acceptance Criteria:**

**Given** an empty repository
**When** the scaffold story is complete
**Then** the layout matches the architecture (`plugin/`, `lua/interactive-graphviz/`,
`server/`, `frontend/`, `tests/`, `.github/workflows/`) with the documented module files
present as stubs only; real protocol behavior waits for Story 1.3 and real rendering waits for
Story 1.4
**And** the Lua plugin loads in Neovim 0.10+ without error and exposes a `setup()` entry
**And** the `server/` (Bun) runs from source via `bun run server/server.ts`
**And** the `frontend/` bundles to static assets via Bun
**And** `server/protocol.ts` and `protocol.lua` exist as canonical-envelope stubs with a comment
marking `protocol.ts` as canonical
**And** CI (`ci.yml`) runs scaffold/smoke checks for Stylua, busted, and `bun test` green on a
clean checkout

### Story 1.2: Server spawn and no-orphan supervision

As a Neovim user,
I want the local server started on demand and guaranteed to die when Neovim does,
So that previewing never leaves an orphaned process holding a port.

**Acceptance Criteria:**

**Given** no server is running for the Neovim instance
**When** a preview is requested
**Then** the plugin spawns one server per Neovim instance via `vim.system()` with stdin
open, the server binds an ephemeral port (`:0`) on literal `127.0.0.1`, and announces
`ready{port,token}` over stdout
**And** the server registers a session keyed by `bufnr` in its in-memory `sessions` map
**Given** the Neovim process exits abnormally (`kill -9`, crash)
**When** the stdin pipe closes (EOF)
**Then** the server self-terminates within the heartbeat window, leaving no orphaned
process — verified by `tests/integration/orphan_spec.lua` driving a real headless Neovim
**And** a missed heartbeat is a backstop that also terminates the server
**And** the headless `kill -9 → reaped` test is green (the load-bearing NFR-3 gate and the
one-server-per-instance falsification gate)

### Story 1.3: Message protocol and WebSocket relay

As the system,
I want one JSON envelope flowing Neovim→server→browser with the return channel warm,
So that all three tiers share a single, contract-tested communication spine.

**Acceptance Criteria:**

**Given** a running server
**When** Neovim writes a newline-delimited JSON message to stdin
**Then** the server parses it and broadcasts the corresponding message only to the
WebSocket subscribers of that `sessionId`
**And** the server serves the static frontend over HTTP and accepts WebSocket
connections via `Bun.serve`
**And** a browser connection presents `sessionId` + `token` in `hello`; connections
without a valid token are rejected
**Given** the (v1-dormant) browser→server return channel
**When** the browser sends `hello`/`ack`
**Then** the server handles them and a contract test round-trips a no-op message
Lua→server→frontend, asserting the same envelope shape on both hops
**And** any unrecognized inbound browser message is logged and ignored (channel stays
warm without growing v1 surface)

### Story 1.4: Open preview and first render

As a Neovim user editing a `.dot`/`.gv` file,
I want `:GraphvizPreview` to open a browser tab showing my rendered graph,
So that I can see my graph without leaving the editor.

**Acceptance Criteria:**

**Given** a `.dot`/`.gv` buffer
**When** the user runs `:GraphvizPreview`
**Then** the server starts if not running and the default browser opens to
`http://127.0.0.1:<port>/?sessionId=<bufnr>&token=<token>`
**And** the initial Graph renders from the buffer's DOT using bundled
`@hpcc-js/wasm-graphviz`/`d3-graphviz` with no system Graphviz installed (FR-6)
**And** the render matches Graphviz semantics for valid DOT (NFR-6)
**Given** a non-DOT buffer
**When** the user runs `:GraphvizPreview`
**Then** it is a no-op with an informative message (FR-1)

### Story 1.5: Live reload on buffer change

As a Neovim user authoring DOT,
I want the preview to re-render as I type,
So that I get live visual feedback without re-running anything.

**Acceptance Criteria:**

**Given** an open preview
**When** the buffer changes and the user pauses
**Then** the preview reflects the change within the debounce window (default 200 ms,
configurable), and a monotonic per-session `v` token is minted at the Neovim source and
carried end-to-end (FR-7, NFR-2)
**Given** rapid consecutive edits
**When** renders are dispatched
**Then** only the latest is shown — the frontend applies a completed render only if its
`v` ≥ the last applied `v`, and does not begin a new WASM render while one is in flight
(latest-wins; no stale-render-wins; no backlog)

### Story 1.6: Error resilience and view preservation

As a Neovim user whose DOT is frequently broken mid-edit,
I want the preview to hold the last good graph and tell me about the error,
So that live reload never blanks my screen while I work.

**Acceptance Criteria:**

**Given** a preview showing a good render
**When** the buffer's DOT becomes a parse/render error
**Then** the last good Graph remains on screen and a non-blocking visible error message
is shown (FR-9); the canvas never blanks
**Given** the error is corrected
**When** the next valid render arrives
**Then** the error indicator clears and the new Graph is shown
**Given** the renderer/library exposes zoom/pan state in v1 and `preserve_view` is enabled
**When** a reload re-renders
**Then** the zoom/pan view-state is preserved where feasible
**And** if the renderer cannot expose this state cheaply in v1, the story still passes when
last-good render and visible error-overlay behavior are correct

### Story 1.7: Stop, toggle, and lifecycle cleanup

As a Neovim user,
I want to stop or toggle the preview and have it clean up automatically,
So that sessions never linger and no server survives my editing session.

**Acceptance Criteria:**

**Given** a running preview
**When** the user runs `:GraphvizPreviewStop`
**Then** the session is removed; stopping is idempotent (no error if nothing runs) (FR-2)
**Given** a buffer with/without a running preview
**When** the user runs `:GraphvizPreviewToggle`
**Then** it starts if stopped and stops if running, never leaving an inconsistent state
(no double-start, no orphan) (FR-3)
**Given** the last preview buffer is closed or Neovim exits gracefully
**When** teardown runs (buffer autocmd / `VimLeavePre`)
**Then** the session is removed and, on the graceful path, the server is shut down; after
quitting Neovim no server process remains (FR-5)
**And** session-map mutation occurs only in the designated module per tier

## Epic 2: Layout Engines & Configuration

A user can choose `dot`/`neato` and configure the plugin idiomatically. Builds on Epic 1;
Epic 1 works without it (`dot` default).

### Story 2.1: Configuration surface via setup{}

As a Neovim user,
I want to configure the plugin through an idiomatic `setup{}` with safe defaults,
So that it works with zero config but adapts to my preferences.

**Acceptance Criteria:**

**Given** the plugin
**When** the user calls `require("interactive-graphviz").setup(opts)` (or nothing)
**Then** every documented key has a default and the plugin works with zero config (FR-14):
`engine`, `engines`, `debounce_ms`, `bind`, `port`, `expose_to_lan`, `open_cmd`,
`preserve_view`, `heartbeat_ms`, `log_level`
**And** invalid option values are reported with a clear message and fall back to defaults
**And** the server binds `127.0.0.1` by default; `expose_to_lan = true` is the only way to
bind beyond loopback and is documented as a deliberate downgrade (NFR-4)

### Story 2.2: Layout engine selection (dot/neato)

As a user reading a dense graph,
I want to switch the layout engine,
So that I can get a more readable arrangement.

**Acceptance Criteria:**

**Given** an open preview using the default engine `dot`
**When** the user runs `:GraphvizEngine neato` (or sets `engine` in config)
**Then** the current Graph re-renders with the selected algorithm (FR-8)
**And** only engines in the configured `engines` list (v1: `dot`, `neato`) are accepted;
an unknown engine is rejected with an informative message
**And** the engine is carried in the `render` message and applied by the frontend
**And** the `engines` list is the single seam for re-introducing further engines without
touching the render pipeline

## Epic 3: Zero-Prerequisite Installation & Distribution

A clean install yields a working preview with no system Graphviz and no Node/yarn at
runtime (SM-2). Builds on Epic 1 (distributes the working preview); Epic 1 works in dev
without it.

### Story 3.1: Cross-compiled release pipeline with checksums

As the plugin maintainer,
I want CI to cross-compile per-platform binaries with checksums on each tagged release,
So that users can install a prebuilt binary with no runtime toolchain.

**Acceptance Criteria:**

**Given** a tagged release
**When** `release.yml` runs on a single CI runner
**Then** `bun build --compile` produces binaries for linux x64/arm64 (incl. musl) and
macOS x64/arm64, each with the frontend embedded (single-file) (FR-12, NFR-5)
**And** a SHA-256 `checksums.txt` manifest is generated and the binaries + manifest are
published to the GitHub Release pinned to the tag
**And** no Windows prebuilt is produced in v1 (covered by fallback)

### Story 3.2: Prebuilt binary install with integrity verification

As a Neovim user on a supported platform,
I want the plugin to fetch and verify the right prebuilt binary on install,
So that it just works with zero prerequisites and a tampered/corrupt download is refused.

**Acceptance Criteria:**

**Given** a supported platform
**When** the plugin installs
**Then** `install.lua` detects platform + libc (glibc/musl) via `uname -sm`, downloads the
tag-pinned artifact to a temp path, verifies it against the in-source checksum, and only
then atomically renames and `chmod +x` (FR-12); install requires no Node/yarn at runtime
(NFR-1)
**Given** a checksum mismatch or truncated download
**When** verification runs
**Then** the binary is not run and the failure is reported clearly (fail-closed)
**Given** macOS
**When** the binary is downloaded
**Then** the `com.apple.quarantine` xattr is stripped so the spawn is not blocked

### Story 3.3: Source-build fallback, failure UX, and health check

As a Neovim user on an uncovered platform,
I want a clear source-build fallback and good diagnostics,
So that I can still get a working server and understand any failure.

**Acceptance Criteria:**

**Given** no prebuilt binary matches the platform (e.g. Windows, BSD)
**When** install runs
**Then** the plugin builds from source with Bun, loudly and explicitly ("no prebuilt
binary for <platform>; building from source, requires Bun ≥ X"), spawning via a dedicated
process group so no wrapper can orphan the real server (FR-13)
**Given** any install failure
**When** it occurs
**Then** it fails fast, clearly, with helpful copy (no silent compiler failure)
**Given** the user runs `:checkhealth`
**When** diagnostics run
**Then** it verifies Neovim ≥ 0.10, binary presence + checksum match, Bun availability for
fallback, and port-bind capability, reporting each result

## Epic 4: v1 Hardening (user-facing slice)

*Added by correct-course 2026-06-07. Closes the user-facing items triaged from
`deferred-work.md` plus the open Epic-3-retro verification item. One consolidated story.*

### Story 4.1: User-facing hardening pass

As a Neovim user,
I want the rough edges from v1 fixed,
So that the preview behaves predictably before interactivity is layered on.

**Acceptance Criteria:**

**Given** a preview is being started
**When** the user runs `:GraphvizPreview` several times in rapid succession before the
server is `ready`
**Then** exactly one browser tab opens — an idempotency guard coalesces the queued
open-callbacks (no N-tabs) (FR-1; closes Story 1.4 / 1.7 deferral)
[lua/interactive-graphviz/server.lua, commands.lua]

**Given** a `.dot`/`.gv` buffer that is empty or whitespace-only
**When** a render is dispatched
**Then** the user gets a visible, informative message instead of a silent blank preview
[frontend/main.ts, lua/interactive-graphviz/commands.lua]

**Given** an `open_cmd` with quoted multi-word arguments (e.g. `open -a "Google Chrome"`)
**When** the browser is opened
**Then** the command is parsed/escaped correctly and launches as intended (no naive
`%s+` split breakage) [lua/interactive-graphviz/commands.lua]

**Given** the Windows x64 prebuilt server (shipped in v0.1.2)
**When** Neovim exits abnormally and the stdin pipe closes (EOF)
**Then** the server self-terminates with no orphaned process — **verified end-to-end on
Windows**, closing Epic-3-retro Action Item #2 and the project-memory "Windows no-orphan
unverified" note [server/, tests/integration]

## Epic 5: Interactivity Layer

*Added by correct-course 2026-06-07. The PRD §6.2 parity target. Frontend-local — no new
wire messages, no Lua changes, return channel stays dormant. UX affordances specified in
`ux-interactivity-v2.md`. Stories sequenced so 5.1 establishes the view-state foundation.*

### Story 5.1: Zoom/pan and reset view

As a user reading a Graph,
I want to zoom, pan, and reset-to-fit, with my view kept across live-reload,
So that I can navigate a large Graph without losing my place when it re-renders.

**Acceptance Criteria:**

**Given** a rendered Graph
**When** the user zooms/pans (and presses the reset affordance, `0`/`r`)
**Then** the SVG zooms/pans smoothly and reset returns to fit-to-viewport (FR-15)

**Given** `preserve_view = true` and a live-reload re-render
**When** the new Graph is applied
**Then** the prior zoom/pan transform is reapplied — `captureViewState`/`restoreViewState`
in `viewstate.ts` are wired into the render path, **closing the deferred `preserve_view`
item**; with `preserve_view = false` the view resets on reload
[frontend/render.ts, frontend/viewstate.ts]

### Story 5.2: Click-to-highlight neighbors

As a user inspecting a Graph,
I want to click a node and see its neighbors highlighted,
So that I can trace relationships in a dense Graph.

**Acceptance Criteria:**

**Given** a rendered Graph
**When** the user clicks a node
**Then** the node and its neighbors are highlighted and non-matching elements are dimmed,
per the configured `highlight_mode` (single / upstream / downstream / bidirectional) (FR-16)

**Given** highlighted state
**When** the user Shift+clicks additional nodes (multi-select) or presses `Esc`
**Then** multi-select accumulates the highlight set and `Esc` clears all highlighting;
clicking a node within a cluster offers cluster highlight
[frontend/interact.ts]

### Story 5.3: Live search

As a user looking for something in a Graph,
I want to search nodes/edges by label,
So that I can find and focus elements without scanning visually.

**Acceptance Criteria:**

**Given** a rendered Graph
**When** the user opens search (`/`) and types a query
**Then** matching nodes/edges are highlighted, non-matches dimmed, and a result counter
shows match count; case-sensitive and regex toggles work; search scope is respected (FR-17)
[frontend/search.ts]

### Story 5.4: Animated transitions and polish

As a user,
I want highlight and re-render changes to animate,
So that the Graph is pleasant and legible to interact with.

**Acceptance Criteria:**

**Given** `interactive` features are enabled
**When** highlights change or the Graph re-renders
**Then** transitions animate via d3-graphviz, config-gated, with a non-animated fallback;
interactions stay responsive without perceptible lag (FR-18, NFR-7)
