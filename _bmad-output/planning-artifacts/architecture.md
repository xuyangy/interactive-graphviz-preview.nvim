---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-06-02'
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-interactive-graphviz.nvim-2026-06-02/prd.md
  - _bmad-output/planning-artifacts/prds/prd-interactive-graphviz.nvim-2026-06-02/addendum.md
  - _bmad-output/planning-artifacts/briefs/brief-interactive-graphviz.nvim-2026-06-02/brief.md
workflowType: 'architecture'
project_name: 'interactive-graphviz.nvim'
user_name: 'Xuyangy'
date: '2026-06-02'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements (v1, as refined with author 2026-06-02):**
- *Preview session lifecycle (FR-1, FR-2, FR-3, FR-5):* command-driven start
  (`:GraphvizPreview`), stop, toggle, and guaranteed teardown. **FR-4 (auto-open)
  dropped from v1** — preview opens by command only. Architecturally: process
  supervision + per-session state owned by the Neovim/Lua tier.
- *Live rendering & layout (FR-6, FR-7, FR-8, FR-9):* WASM render with zero system
  Graphviz; debounced (200ms default) latest-wins live reload (load-bearing — the
  core Job); **layout engines trimmed to `dot` + `neato`** for v1, with the engine
  list kept as a config seam (other 5 deferred); error resilience sharpened to
  **keep last good render AND show a visible error message** on syntax error;
  **preserve zoom/pan across reload where cheap** (best-effort v1 nicety; zoom/pan
  UI itself remains v2).
- *Export (FR-10, FR-11):* **deferred to Tier 3** — not in v1.
- *Installation & distribution (FR-12, FR-13):* per-platform prebuilt binary with
  in-source checksum verification + tag pinning; Node/yarn source-build fallback.
  **No Windows prebuilt in v1 — stated explicitly ("not yet on Windows").** Install
  failure must fail fast, clearly, with helpful copy (no silent compiler failure).
- *Configuration (FR-14):* idiomatic Neovim `setup{}`; zero-config must work.

**Non-Functional Requirements (design drivers):**
- NFR-1 Zero external prerequisites (no system Graphviz, no runtime Node) —
  load-bearing (SM-2). Counter-metric SM-C1: never trade install simplicity for
  features (explicitly forbids a system-`dot` hybrid render path).
- NFR-2 Render responsiveness within the debounce window; rapid edits coalesced.
- NFR-3 Reliability / no orphans — **must hold on abnormal termination, not just
  the happy path** (see Cross-Cutting Concerns).
- NFR-4 Security / least exposure — localhost-only bind default, LAN opt-in.
- NFR-5 Portability — Neovim 0.10+; Linux+macOS x64/arm64 prebuilt; source-build
  fallback elsewhere; Windows explicitly deferred.
- NFR-6 Render fidelity — parity with the d3-graphviz/WASM reference renderer.

**Scale & Complexity:**
- Primary domain: Neovim editor plugin + bundled local client-server +
  browser-WASM renderer.
- Complexity level: Medium — narrow (and now narrower) feature surface, elevated by
  cross-runtime/cross-process coordination and a supply-chain/distribution pipeline.
- Estimated architectural components: 3 tiers (Lua plugin core; local HTTP/WS server
  binary; static browser frontend) + distribution/build tooling.

### Technical Constraints & Dependencies

- Neovim has no webview → browser-tab rendering driven by a local server (pattern
  borrowed from markdown-preview.nvim).
- Render engine fixed: `d3-graphviz` + `@hpcc-js/wasm`, bundled in the frontend.
  Render pipeline choice must keep v2 interactivity (click-to-highlight, search,
  zoom/pan) a known-cheap next step — the name commits to it.
- Server shipped as a prebuilt single-file executable; Node/yarn only for the
  source-build fallback. System Graphviz must not be required.
- Transport: Neovim↔server over msgpack-RPC (job channel); server→browser over
  WebSocket push. The browser→server return channel may exist as dormant plumbing,
  but **no v1 feature may depend on it and no v1 decision may grow more complex to
  serve deferred v2 sync** (SM-C1 in spirit). It is kept *warm*, not dark — see
  cross-cutting concerns.
- Distribution: GitHub Releases artifacts; platform detection via `uname -sm`;
  checksums shipped in-source (not fetched beside the artifact); pin to release tag.
- Editor floor: Neovim 0.10+ (stable `vim.system()`).

### Key Architectural Decision Locked — Server Multiplexing Model

**Decision: one Server process per Neovim instance** (multiplexing all preview
sessions/buffers over a single server). Chosen unanimously by the architecture
roundtable over the alternatives (per-buffer; global machine-wide singleton).

Rationale:
- It is the only model where the no-orphan guarantee rests on a single robust
  mechanism — the server self-terminates on RPC-pipe EOF (which the OS guarantees
  on parent death, including `kill -9`), backed by a heartbeat. One parent, one
  pipe, one death signal. (Per-buffer multiplies this N-fold; a global singleton
  has no single parent to bind its life to and forces cross-process refcounting that
  is unverifiable under `kill -9`.)
- It amortizes the expensive WASM runtime + frontend bundle across all previews in
  the editor, and draws the ownership boundary exactly where the OS already draws
  one (the Neovim process).
- Multi-instance isolation is free: each Neovim gets its own server + ephemeral port.

Locked design details that flow from this decision:
- Server holds `sessions` keyed by `bufnr`; each session carries a monotonic
  per-session render version token, the last-good DOT/render, and its WebSocket
  subscribers. Refcount is `#sessions`, **not** subscriber count.
- Stop / last-buffer-close is a graceful in-process state change (session removed);
  it does **not** kill the server — the server stays warm and is killed only by
  pipe EOF / heartbeat. Lua-side `vim.system()` cleanup is the graceful path only,
  never the sole no-orphan guarantee.
- Port: bind ephemeral `:0`, read back, report to Lua over RPC; no rendezvous file,
  no stale-port race.
- Browser tabs: **one tab per buffer/session, keyed by a session id in the URL**;
  each tab subscribes to one session and re-syncs that session's last-good render on
  reconnect. No single-tab-multiple-graph composition (would require richer
  browser→server messaging — out of scope).
- Accepted trade-off: a server crash blacks out *all* previews in that Neovim
  instance (blast radius = instance, correlated with a failure the user already
  expects). Mitigation: Lua detects pipe death and offers a one-key restart.
- Falsification gate: if a deterministic `kill -9 parent → server reaped within
  heartbeat window` test cannot be made green, fall back to per-buffer (Option A).

### Cross-Cutting Concerns Identified

- **Process lifecycle & guaranteed cleanup (highest leverage).** Four non-equivalent
  triggers — `:stop`, last-buffer-close, `VimLeavePre`, and abnormal nvim
  termination (`kill -9`/crash, where `VimLeave` does NOT fire). The server must be
  able to die on its own (parent-death / RPC-pipe-EOF detection) + heartbeat.
  Source-build fallback that spawns via a wrapper requires process-group kill.
- **Port allocation.** Bind to port 0 / ephemeral, read back; never hardcode.
- **Render correctness.** Debounce is throughput; a monotonic per-session render
  sequence/version number is the correctness guarantee against out-of-order render
  completion (stale-render-wins bug). Carry it end-to-end; surface in the DOM.
- **Error resilience.** Keep last good render + visible error indicator; detection
  lives browser-side (WASM returns parse errors there). Never blank the canvas
  mid-edit. Preserve zoom/pan across reload where cheap.
- **Transport asymmetry.** RPC and WebSocket have different failure/reconnect
  semantics; browser tab closes independently. Principle: server is the state
  holder, browser is a stateless view that re-syncs (not replays) on reconnect.
  Keep the return channel *warm* with a real ack/heartbeat (also doubles as a
  liveness probe), never built-but-dark.
- **Security.** Bind literal 127.0.0.1 by default; explicit LAN opt-in; reserve a
  per-session token in the handshake (cheap now, expensive to retrofit when the
  return channel becomes active in v2).
- **Supply-chain integrity.** Checksum verification (fail closed) + tag pinning;
  consider signing the checksum manifest and reproducible builds.
- **Platform portability.** glibc vs musl is a real fracture line for "prebuilt"
  Linux binaries (Alpine/dev-containers); macOS Gatekeeper quarantine xattr can
  break spawn. Source-build fallback must be loud and explicit.
- **Testability hooks to architect in NOW:** single source-of-truth message schema +
  per-hop contract tests; injectable/virtual clock for debounce; `/health` endpoint
  (PID/port/version/render-state); observable lifecycle state machine + PID registry
  for orphan-scanning (the `kill -9 → reaped` test is the load-bearing gate);
  headless-driveable frontend exposing render-complete/error state; a "force the
  source-build fallback" switch for CI.

## Starter Template Evaluation

### Primary Technology Domain

Three-tier system (not a single-framework app): a Lua Neovim plugin, a bundled
single-binary local server (HTTP + WebSocket relay), and a static browser frontend
(Graphviz-WASM renderer). "Starter" here means per-tier scaffold + toolchain rather
than one project generator. Versions verified via web search (June 2026).

**Key de-risking insight:** the server is a *thin relay* that serves static assets
and forwards messages — all heavy render dependencies (`@hpcc-js/wasm-graphviz`,
`d3-graphviz`) live in the browser bundle, not the binary. The binary's native-dep
surface is near zero, so the single-executable toolchain was chosen on
cross-compilation + musl coverage + longevity, not npm-compatibility.

### Tier 1 — Lua Plugin Scaffold

**Selected:** `nvim-lua/nvim-lua-plugin-template` conventions (or
`ellisonleao/nvim-plugin-template`).

**Provides:** busted + plenary.nvim test harness, Stylua formatting, GitHub Actions
CI, vimdoc autogeneration, LuaRocks packaging, and the idiomatic layout:
- `plugin/interactive-graphviz.lua` — small, lazy command/keymap definitions; no
  eager `require()`.
- `lua/interactive-graphviz/` — plugin modules (loaded on demand).
- `lua/interactive-graphviz/health.lua` — `:checkhealth` integration (verify Bun
  availability for fallback, binary presence/checksum, Neovim 0.10+).

**Rationale:** directly supports the headless-Neovim integration test that gates the
no-orphan NFR (the `kill -9 → server reaped` test). Targets Neovim 0.10+ for stable
`vim.system()`.

### Tier 2 — Server Binary Toolchain

**Selected:** **Bun `--compile`**.

**Rationale:**
- Cross-compiles all targets from a single CI runner (no macOS runner required),
  including explicit **musl** targets — directly resolves the glibc/musl fracture
  flagged as a top blind spot.
- Bun's built-in `Bun.serve` provides HTTP + WebSocket + static file serving
  natively — no express/socket.io dependency for the relay.
- Bundles the Tier-3 frontend too — one toolchain for server + frontend.

**Initialization / build command (CI, single `ubuntu-latest` runner):**
```bash
# install bun in CI, then:
bun build server.ts --compile --target=bun-linux-x64      -o dist/server-linux-x64
bun build server.ts --compile --target=bun-linux-arm64    -o dist/server-linux-arm64
bun build server.ts --compile --target=bun-linux-x64-musl -o dist/server-linux-x64-musl
bun build server.ts --compile --target=bun-darwin-x64     -o dist/server-darwin-x64
bun build server.ts --compile --target=bun-darwin-arm64   -o dist/server-darwin-arm64
# then emit SHA-256 checksums per artifact (shipped in-source, fail-closed)
```

**Trade-offs accepted:** younger runtime; larger binary (~50–90 MB, acceptable for a
dev tool shipped via releases); the **source-build fallback prerequisite becomes Bun
instead of Node/yarn** (deliberate change from the PRD addendum). A `bun-windows-x64`
artifact is available at near-zero build cost; **v1 still ships no Windows prebuilt**
per the product decision (testing/support burden, not build cost, is the reason) —
revisit-eligible.

### Tier 3 — Frontend Renderer + Bundler

**Selected:** `d3-graphviz` 5.6.0 + `@hpcc-js/wasm-graphviz` 1.21.2, bundled to static
assets via Bun's bundler.

**Rationale:**
- `d3-graphviz` is the reference renderer (parity, NFR-6) and brings d3-zoom +
  animated transitions — the foundation for v1 "preserve zoom/pan across reload" and
  the deferred v2 interactivity (click-to-highlight, search).
- `@hpcc-js/wasm-graphviz` 1.21.2 is the current, actively-maintained dedicated
  Graphviz-WASM package (split from the monolithic `@hpcc-js/wasm`).

**Trade-off / risk:** `d3-graphviz` 5.6.0 has not shipped in ~2 years and pins an
older `@hpcc-js/wasm`. Accepted because it is the reference renderer and parity is a
goal; flagged as a maintenance-watch item (fallback: drive `@hpcc-js/wasm-graphviz`
directly and supply zoom/transitions via the d3 ecosystem).

### Architectural Decisions Provided by These Scaffolds

- **Language & Runtime:** Lua (Neovim 0.10+); TypeScript on Bun for the server;
  TypeScript/JS for the browser frontend.
- **Build Tooling:** Bun (`--compile` for the binary, bundler for the frontend);
  Stylua + LuaRocks for the plugin.
- **Testing Framework:** busted + plenary.nvim (Lua, incl. headless-nvim integration
  tests); Bun's test runner for server/frontend logic; headless-driveable frontend
  (e.g. Playwright) for render-complete/error-state assertions.
- **Code Organization:** idiomatic `plugin/` + `lua/<plugin>/` split with
  `health.lua`; `server/` (Bun) and `frontend/` (static) sub-projects; `dist/` for
  built binaries + checksums.
- **Development Experience:** Bun watch/dev server for the frontend; hot rebuild of
  the binary; `:checkhealth` for user-side diagnostics.

**Note:** Project initialization (plugin template + Bun server/frontend scaffolds +
CI build matrix) should be the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Server multiplexing model: one server per Neovim instance (locked, step 2).
- Neovim↔server transport: custom JSON-lines over `vim.system()` stdio (NOT native
  msgpack-RPC) — resolves the addendum's `vim.system()` vs `jobstart(rpc)` conflict.
- Single message envelope shared across both hops (stdio + WebSocket).
- Process supervision: server self-terminates on stdin EOF + heartbeat; Lua cleanup
  is the graceful path only.
- Render correctness: monotonic per-session version token; latest-wins.
- Install integrity: SHA-256 manifest shipped in-source, verified fail-closed.

**Important Decisions (Shape Architecture):**
- Render pipeline: 200ms debounce (config) + frontend render-lock; last-good-render
  with a visible error overlay; preserve zoom/pan across reload.
- Security: bind literal `127.0.0.1`; per-session token in handshake; LAN opt-in.
- Configuration surface (`setup{}`) — concrete keys defined below.

**Deferred Decisions (Post-MVP):**
- Binary signing (GPG/cosign) — checksum verification ships in v1; signing later.
- Auto-restart of a crashed server — v1 surfaces a clear message + manual restart.
- Browser→server message handlers beyond the warm heartbeat (v2 bidirectional sync).
- Render path for very large graphs beyond render-lock (no system-`dot` — SM-C1).

### State & Session Model (the "data architecture")

No database. State is in-memory and process-scoped.
- **Server** owns `sessions: Map<sessionId, Session>` where `sessionId = bufnr`.
  `Session = { bufnr, version, lastGoodDot, engine, subscribers:Set<WebSocket> }`.
  Refcount is `sessions.size`, never subscriber count. Server is the state holder;
  browsers are stateless views that re-sync on (re)connect.
- **Neovim/Lua** keeps `M.active: table<bufnr, sessionState>` as a UI/idempotency
  cache only — never authoritative for cleanup.
- Stop / last-buffer-close removes a session (graceful, in-process); it does NOT kill
  the server. The server dies only on stdin EOF or a missed heartbeat.

### Transport & Message Protocol (the "API & communication")

- **Neovim → server:** `vim.system({bin}, { stdin = true, stdout = on_msg })`;
  newline-delimited JSON written via `handle:write(vim.json.encode(msg).."\n")`.
- **Server → browser:** `Bun.serve` native WebSocket; same JSON envelope.
- **Browser → server:** same WS, **warm but dormant** — v1 sends only a `hello`
  (subscribe to a sessionId + token) and periodic `ack`/heartbeat; no v1 feature
  depends on it. Reserved for v2 sync.
- **Envelope:** `{ type: string, v?: number, sessionId?: number, ... }`. `v` is the
  monotonic per-session render version, stamped at the Neovim source and carried
  end-to-end; the browser discards any completed render whose `v` is older than the
  one displayed (resolves PRD Open Q1 — overlapping renders).

Message set (v1):
- Lua→server: `session_open{sessionId}`, `render{sessionId,v,engine,dot}`,
  `set_engine{sessionId,engine}`, `session_close{sessionId}`, `ping`, `shutdown`.
- server→Lua: `ready{port,token}` (startup announce), `pong`, `log{level,msg}`.
- server→browser: `render{v,engine,dot}`, `error_display{v,message}`,
  `session_closed`.
- browser→server: `hello{sessionId,token}`, `ack{v}` (dormant beyond these in v1).

### Render Pipeline (the "frontend architecture")

- Debounce buffer changes (default **200ms**, configurable) — latest-wins coalescing
  in Lua; cancel the pending timer on stop.
- **Frontend render-lock:** the browser does not begin a new WASM render while one is
  in flight; it keeps only the latest pending DOT and renders it when free
  (complements the `v` token — debounce = throughput, render-lock + `v` = correctness;
  resolves PRD Open Q1).
- **Error resilience:** WASM parse/render errors are caught browser-side; the last
  good SVG stays on screen and a non-blocking **visible error overlay** is shown.
  The canvas never blanks mid-edit.
- **Preserve zoom/pan across reload** where feasible (d3-zoom transform reapplied
  after re-render); best-effort, config-gated (`preserve_view`).
- Renderer: `d3-graphviz` 5.6.0 + `@hpcc-js/wasm-graphviz` 1.21.2, bundled static.

### Interaction Layer (v2 — frontend-local) *(added 2026-06-07)*

The v2 interactivity layer (Epic 5; FR-15–FR-18) is **entirely Tier-3 / browser-side**. It operates
on the already-rendered SVG client-side, so it requires **no new wire messages and no Lua changes**.

- **Return channel stays dormant.** The browser→server WS return channel remains "warm but dormant"
  (see *Transport & Message Protocol*); interactivity does **not** activate it. It is still reserved
  for a future **v3 bidirectional graph↔buffer sync**, which *is* the change that lights it up.
- **New frontend modules:** `frontend/interact.ts` (click-to-highlight + selection state machine:
  single/upstream/downstream/bidirectional, cluster, multi-select, ESC-clear) and
  `frontend/search.ts` (label search, case-sensitive/regex toggles, result counter, dim non-matches).
- **`viewstate.ts` wired into the render path.** Zoom/pan + reset and the existing `preserve_view`
  config are connected at render time (`captureViewState`/`restoreViewState`) — this **closes the
  deferred-work item** where `preserve_view` was configured but never read at render time.
- **Config additions (FR-14 seam):** `interactive=true`, `highlight_mode="bidirectional"`,
  `search={…}`. Zero-config keeps interactivity on by default; nothing changes for non-interactive use.
- **Invariant preserved:** no new install prerequisites (NFR-1 / SM-C1) — all of the above ships in
  the already-bundled, already-embedded frontend.

### Return Channel Activation (v3 — bidirectional sync) *(added 2026-06-11)*

Epic 6 (FR-19–FR-20) is the change the dormant return channel was reserved for. It is the **first
protocol expansion since Story 1.3** and touches all three tiers; the security posture was pre-paid
in v1 (token-gated `hello`, un-subscribed sockets rejected, localhost bind — no new exposure
decision needed).

**Message set additions** (canonical in `server/protocol.ts`, mirrored in `protocol.lua`):
- **browser→server: `node_click{sessionId, nodeId}`** — accepted only from a subscribed,
  token-validated socket; relayed **verbatim server→Lua over stdout** (the first feature data on
  that hop beyond `ready`/`pong`/`log`).
- **Lua→server→browser: `emphasize{sessionId, nodeId|null}`** — forward relay like `render`;
  `null` clears the emphasis.

**Invariants:**
- `v` is minted for `render` only — sync messages never carry or mutate it; sync is stateless
  last-wins and can never displace or reorder renders (NFR-8).
- Unknown types remain logged-and-ignored on every hop; stdout remains the protocol channel;
  session-map ownership is unchanged.
- **Echo suppression:** a sync-initiated cursor jump sets a one-shot flag consumed by the next
  CursorMoved tick, so click→jump does not echo an `emphasize` back to the browser.
- The clicked node may no longer exist in the edited buffer (browser lags by debounce): Lua
  degrades gracefully — informative notify, no-op.

**Node↔line mapping lives Lua-side, on demand.** New `lua/interactive-graphviz/sync.lua` scans the
buffer for the node's first definition/occurrence (word-boundary, quoted-ID aware) at click time.
No maintained source map, no new deps; the frontend stays dumb — it already derives `nodeId` from
SVG titles (Epic 5 machinery) and only emits it. Upgradeable to a real source map later without a
protocol change. New `frontend/sync.ts` owns the emit gate and the cursor-echo emphasis treatment
(reusing the Epic 5 emphasis seams; passive treatment that never contends with search/click
highlight precedence).

**Config additions (FR-14 seam):** `sync = { jump_on_click = true, highlight_on_cursor = true,
cursor_debounce_ms = 150 }`. Browser-side gating of `node_click` emission rides the v0.2.0
URL-param path (`frontend/urlconfig.ts`).

### Security

- Bind the literal `127.0.0.1` by default (not `0.0.0.0`, not `localhost`/`::1`).
- Ephemeral port (`bind :0`, read back, announced over `ready`).
- **Per-session token** minted at startup, required in the browser URL and the WS
  `hello`; the server rejects connections without it (cheap now; load-bearing once
  the return channel becomes active in v2).
- `expose_to_lan` is an explicit opt-in that changes the bind address; documented as
  a deliberate security downgrade.

### Distribution, Install & CI (the "infrastructure")

- Prebuilt binaries built with `bun build --compile` for linux x64/arm64 (+musl) and
  darwin x64/arm64, from a single CI runner; emitted to GitHub Releases per tag.
- **Integrity:** SHA-256 checksums in a manifest **committed to the plugin source**
  (not fetched beside the artifact), pinned to the release tag. Install verifies
  fail-closed: download to temp → verify → atomic rename → `chmod +x`. A checksum
  mismatch refuses to run and reports clearly. **Signing (GPG/cosign) deferred**
  (resolves PRD Open Q3 — *that* it is verified is decided; signing scheme is later).
- Platform detection via `uname -sm` plus libc detection (glibc vs musl) to pick the
  right artifact.
- macOS: strip the `com.apple.quarantine` xattr on the downloaded binary to avoid
  Gatekeeper spawn failures.
- **Source-build fallback** uses **Bun** (`bun build --compile` locally), not
  Node/yarn — loud and explicit when triggered ("no prebuilt binary for <platform>;
  building from source, requires Bun ≥ X"). Spawn via a dedicated process group so a
  wrapper can't orphan the real server.
- **No Windows prebuilt in v1** (revisit-eligible — Bun could emit one cheaply); the
  fallback covers it. **Install failures fail fast, clearly, with helpful copy.**
- `:checkhealth` verifies Neovim 0.10+, binary present + checksum match, Bun
  availability (for fallback), and port-bind capability.

### Configuration Surface (FR-14 — resolves PRD Open Q2)

```lua
require("interactive-graphviz").setup({
  engine        = "dot",              -- default layout: "dot" | "neato"
  engines       = { "dot", "neato" }, -- selectable set (seam for future engines)
  debounce_ms   = 200,                -- live-reload debounce (NFR-2)
  bind          = "127.0.0.1",        -- localhost only by default (NFR-4)
  port          = 0,                  -- 0 = ephemeral/auto-pick free port (NFR-3)
  expose_to_lan = false,              -- explicit opt-in beyond loopback
  open_cmd      = nil,                -- browser open command; nil = OS default
  preserve_view = true,               -- keep zoom/pan across reload if feasible
  heartbeat_ms  = 2000,               -- liveness ping interval
  log_level     = "warn",             -- off|error|warn|info|debug
})
```
Commands: `:GraphvizPreview`, `:GraphvizPreviewStop`, `:GraphvizPreviewToggle`,
`:GraphvizEngine {dot|neato}`. Zero-config works (every key has a documented default).

### Decision Impact Analysis

**Implementation Sequence:**
1. Project init (plugin template + Bun server/frontend scaffolds + CI build matrix).
2. Lifecycle + supervision: spawn via `vim.system()`, stdin-EOF self-terminate +
   heartbeat, port announce, session table — gated by the headless `kill -9 → reaped`
   test (NFR-3; falsification gate for the multiplexing model).
3. Message envelope + JSON-lines stdio + Bun.serve WS relay + warm return-channel
   ping (contract test day one).
4. Render pipeline: debounce + `v` token + frontend render-lock + last-good-render +
   visible error overlay + zoom/pan preservation.
5. Layout-engine selection (`dot`/`neato`); config surface.
6. Distribution: Bun cross-compile matrix, in-source checksum verify (fail-closed),
   libc/quarantine handling, loud Bun source-build fallback, `:checkhealth`.

**Cross-Component Dependencies:**
- The `v` token is defined at the Lua source and is the contract spine for both the
  WS hop and the frontend render-lock; all three tiers must agree on it.
- The stdio pipe is simultaneously the control channel AND the parent-death signal —
  changing the transport would change the cleanup guarantee.
- The per-session token couples Security ↔ Transport ↔ the (dormant) return channel.
- Engine `engines` list is the single seam through which deferred layout engines
  re-enter without touching the render pipeline.

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:** 9 areas where agents working in three
languages (Lua, TypeScript/Bun, browser JS) across a shared JSON contract could
make divergent choices. The wire contract is the highest-risk surface — it is touched
by all three tiers.

### Naming Patterns

**Wire / Message Protocol (the contract — highest priority):**
- Message `type` values are **snake_case verb phrases**: `session_open`, `render`,
  `set_engine`, `session_close`, `error_display`, `session_closed`, `ready`, `ping`,
  `pong`, `hello`, `ack`, `shutdown`, `log`.
- Payload field keys are **camelCase**: `sessionId`, `lastGoodDot`, `engine`, `dot`,
  `port`, `token`, `message`, `level`. The version field is the single short key `v`.
- This camelCase-on-the-wire rule holds **even in Lua** (where snake_case is
  idiomatic) — Lua builds wire tables with camelCase keys via `vim.json.encode`, and
  uses snake_case only for internal Lua locals. The wire format never varies by tier.
- Booleans are JSON `true`/`false`; absent/optional fields are **omitted**, never
  `null`. Timestamps (if ever added) are epoch milliseconds (number), not strings.

**Lua (Neovim plugin):**
- Files: lowercase module dirs under `lua/interactive-graphviz/`; filenames
  `snake_case.lua` (e.g. `server.lua`, `session.lua`, `health.lua`).
- Functions/locals: `snake_case`. Module table is `local M = {}`; return `M`.
- Public API entry: `require("interactive-graphviz").setup(opts)`.
- User commands: `PascalCase` with the `Graphviz` prefix (`:GraphvizPreview`, …) —
  established by the PRD.

**TypeScript (Bun server) & browser JS:**
- Functions/vars: `camelCase`; types/interfaces/classes: `PascalCase`;
  constants: `UPPER_SNAKE_CASE`.
- Files: `camelCase.ts` (e.g. `server.ts`, `sessions.ts`, `protocol.ts`).
- The message envelope is defined **once** in `protocol.ts` as the source-of-truth
  type and imported by both server and frontend; Lua mirrors it in `protocol.lua`
  with a comment pointing at `protocol.ts` as canonical.

### Structure Patterns

```
interactive-graphviz.nvim/
├── plugin/interactive-graphviz.lua        # lazy command/keymap defs only
├── lua/interactive-graphviz/              # plugin modules (require-on-demand)
│   ├── init.lua                           # setup(), public API
│   ├── config.lua                         # defaults + validation
│   ├── server.lua                         # spawn/supervise via vim.system
│   ├── session.lua                        # session table, refcount, v token
│   ├── protocol.lua                       # wire types (mirror of protocol.ts)
│   └── health.lua                         # :checkhealth
├── server/                                # Bun server sub-project
│   ├── server.ts  sessions.ts  protocol.ts
│   └── *.test.ts                          # co-located Bun tests
├── frontend/                              # static browser renderer
│   ├── main.ts  render.ts  ws.ts  protocol.ts (import)
│   └── index.html
├── dist/                                  # built binaries + checksums.txt
├── tests/                                 # Lua busted specs + headless integration
└── .github/workflows/                     # CI (build matrix, tests)
```
- **Tests:** Lua specs in `tests/` (busted/plenary), incl. the headless-nvim
  `kill -9 → reaped` integration test; server/frontend unit tests **co-located**
  `*.test.ts` (Bun); browser e2e under `tests/e2e/` (Playwright).
- Shared protocol type lives in `server/protocol.ts`; never duplicate the field set —
  import it.

### Format Patterns

- All cross-tier messages are a single JSON object per line (newline-delimited on
  stdio; one JSON object per WS frame). No envelope-wrapping (`{data:…}`) — the
  message **is** the object; `type` discriminates.
- Errors are **not** thrown across the wire. A render/parse failure becomes an
  `error_display{v, message}` message; a transport/internal failure becomes a
  `log{level, message}` message. The `v` correlates an error to the render that
  caused it.

### Communication Patterns

- **The `v` token:** monotonic per-session integer, **incremented only at the Neovim
  source** when a `render` is dispatched, carried verbatim through stdio → server →
  WS → frontend. The frontend applies a completed render **only if** its `v` ≥ the
  last applied `v`; otherwise it is discarded (out-of-order guard). No other tier
  mints or mutates `v`.
- **Broadcast:** the server fans a `render` out to exactly the subscribers of that
  `sessionId`; it never broadcasts across sessions. New/reconnecting subscribers are
  sent the session's `lastGoodDot` at its current `v` on `hello`.
- **Return channel:** browser→server messages are limited in v1 to `hello` and `ack`;
  any other inbound type is logged and ignored (keeps the channel warm without
  growing v1 surface).

### Process Patterns

- **Error handling / user messaging:** user-facing notifications go through a single
  Lua helper (`require("interactive-graphviz.log")`), mapping to `vim.notify` levels;
  message text is sentence-case, no stack traces to the user. The server never prints
  free-form to stdout (stdout is the protocol channel) — diagnostics go via `log`
  messages or stderr.
- **Lifecycle invariants:** session-table mutation happens in exactly one module
  (`session.lua` on the Lua side, `sessions.ts` on the server side); no other module
  mutates the map. The server's death is owned by the stdin-EOF/heartbeat path only.
- **Logging:** structured, single-line, prefixed with `sessionId` and `v` where
  applicable, gated by the configured `log_level`. Same level vocabulary across tiers:
  `off|error|warn|info|debug`.
- **Async (Bun):** `async/await` only; no floating promises (every promise is awaited
  or explicitly `.catch`-logged). WS sends are wrapped so one dead socket can't throw
  across a broadcast loop.

### Enforcement Guidelines

**All AI agents MUST:**
- Treat `server/protocol.ts` as the canonical message contract; change it there first,
  then mirror `protocol.lua`, and update the contract test — never edit one tier's
  view of a message in isolation.
- Use camelCase field keys + snake_case `type` values on the wire, in every tier.
- Mint/mutate `v` only at the Neovim source; guard render application by `v` in the
  frontend.
- Mutate the session map only in the designated module; rely on stdin-EOF/heartbeat
  (not ad-hoc kills) for server death.
- Keep stdout reserved for the protocol on the server; route diagnostics via `log`.

**Pattern Enforcement:**
- Stylua (Lua) + Bun's formatter/linter (TS) in CI; a contract test asserts the same
  envelope round-trips Lua→server→frontend.
- Pattern violations are recorded in PR review against this section; updates to a
  pattern are made here first, then propagated.

### Pattern Examples

**Good:**
```jsonc
{ "type": "render", "v": 42, "sessionId": 3, "engine": "dot", "dot": "digraph{...}" }
{ "type": "error_display", "v": 42, "message": "syntax error near line 3" }
```
```lua
-- Lua builds camelCase wire keys even though snake_case is idiomatic internally
local seq = session.next_version(bufnr)         -- internal: snake_case
handle:write(vim.json.encode({                  -- wire: camelCase + snake_case type
  type = "render", v = seq, sessionId = bufnr, engine = engine, dot = text,
}) .. "\n")
```

**Anti-patterns (avoid):**
```jsonc
{ "type": "Render", "data": { "session_id": 3, "Version": 42 } }  // wrapped, mixed case
```
```ts
ws.send(JSON.stringify(msg));   // ❌ unguarded broadcast — a closed socket throws
graph.render(dot);              // ❌ applied without checking msg.v (stale-render bug)
```

## Project Structure & Boundaries

### Complete Project Directory Structure

```
interactive-graphviz.nvim/
├── README.md                          # sets expectations: v1 = live preview;
│                                       #   "interactive" roadmap; companions
│                                       #   (Tree-sitter dot, dot-language-server);
│                                       #   "not yet on Windows"
├── LICENSE
├── .gitignore                         # ignores dist/* binaries (built in CI), node_modules, .bun
├── .stylua.toml                       # Lua formatting (Tier-1 enforcement)
├── doc/
│   └── interactive-graphviz.txt       # vimdoc (autogen from README in CI)
│
├── plugin/
│   └── interactive-graphviz.lua       # lazy: defines commands/keymaps only; no eager require
│
├── lua/interactive-graphviz/
│   ├── init.lua                       # setup(opts), public API; wires commands → modules
│   ├── config.lua                     # defaults, validation, engines seam   [FR-8, FR-14]
│   ├── commands.lua                   # :GraphvizPreview/Stop/Toggle/Engine   [FR-1,2,3,8]
│   ├── session.lua                    # session table, refcount, v token      [FR-7]
│   ├── server.lua                     # spawn/supervise (vim.system), port, heartbeat [FR-1,5]
│   ├── lifecycle.lua                  # VimLeavePre + buffer autocmds, teardown [FR-2,5]
│   ├── render.lua                     # buffer-change debounce, latest-wins     [FR-7]
│   ├── protocol.lua                   # wire types (mirror of server/protocol.ts)
│   ├── install.lua                    # platform/libc detect, download+verify, fallback [FR-12,13]
│   ├── log.lua                        # vim.notify wrapper, level mapping
│   └── health.lua                     # :checkhealth (nvim ver, binary+checksum, Bun, port)
│
├── server/                            # Bun server sub-project (compiled to binary)
│   ├── server.ts                      # Bun.serve HTTP+WS; stdio reader; EOF/heartbeat self-exit [FR-5,6]
│   ├── sessions.ts                    # sessions Map<sessionId,Session>; broadcast routing [FR-7]
│   ├── protocol.ts                    # CANONICAL message envelope + types
│   ├── stdio.ts                       # newline-delimited JSON read/write over stdin/stdout
│   ├── health.ts                      # /health endpoint (pid, port, version, sessions)
│   ├── static.ts                      # serves built frontend assets
│   ├── package.json                   # bun deps (frontend libs); build scripts
│   ├── bunfig.toml
│   └── *.test.ts                      # co-located Bun unit/contract tests
│
├── frontend/                          # static browser renderer (bundled by Bun)
│   ├── index.html                     # mount point + session-id/token from URL
│   ├── main.ts                        # bootstrap, parse URL (sessionId, token)
│   ├── ws.ts                          # WebSocket client, hello/ack, reconnect+resync [FR-9]
│   ├── render.ts                      # d3-graphviz render; v-guard; render-lock;
│   │                                   #   last-good + error overlay; zoom/pan preserve [FR-6,7,9]
│   ├── viewstate.ts                   # d3-zoom transform capture/reapply across reload
│   └── protocol.ts                    # imports server/protocol.ts types
│
├── dist/                              # CI build output (git-ignored binaries)
│   ├── server-linux-x64
│   ├── server-linux-arm64
│   ├── server-linux-x64-musl
│   ├── server-linux-arm64-musl
│   ├── server-darwin-x64
│   ├── server-darwin-arm64
│   └── frontend/                      # bundled static assets embedded/served by binary
│
├── checksums.txt                      # SHA-256 manifest, COMMITTED in-source, tag-pinned [FR-12]
│
├── tests/
│   ├── minimal_init.lua               # headless nvim bootstrap for specs
│   ├── session_spec.lua               # refcount/v-token unit            [FR-7]
│   ├── config_spec.lua                # defaults/validation              [FR-14]
│   ├── lifecycle_spec.lua             # stop/toggle/teardown logic       [FR-2,3,5]
│   ├── integration/
│   │   └── orphan_spec.lua            # GATE: kill -9 nvim → server reaped [FR-5/NFR-3]
│   └── e2e/
│       └── render.spec.ts             # Playwright: render, error overlay, stale-guard [FR-6,7,9]
│
└── .github/workflows/
    ├── ci.yml                         # stylua, busted, bun test, e2e
    └── release.yml                    # bun --compile matrix + checksums → GitHub Release [FR-12]
```

### Architectural Boundaries

**Tier boundaries (3):**
- **Lua plugin ↔ Server:** the only contact is the `vim.system()` stdio pipe carrying
  newline-delimited JSON. Lua never imports server internals; the server never assumes
  Neovim API. The pipe is also the liveness/parent-death boundary.
- **Server ↔ Browser:** HTTP (serve static frontend) + WebSocket (JSON messages),
  scoped by `sessionId` + per-session `token`. The server holds state; the browser is
  a stateless view.
- **Browser ↔ render engine:** `render.ts` is the only module that touches
  `d3-graphviz`/`@hpcc-js/wasm-graphviz`; everything else speaks the protocol.

**Module boundaries (within Lua):** session-table mutation is confined to
`session.lua`; process spawn/supervision to `server.lua`/`lifecycle.lua`; user-facing
output to `log.lua`. `protocol.lua` is types-only.

**Module boundaries (within server):** `sessions.ts` owns the Map and all broadcast
routing; `stdio.ts` owns framing; `protocol.ts` owns types; `server.ts` wires them.

**No data/DB boundary** — all state is in-memory, process-scoped, lost on exit by
design (a previewer holds no durable data).

### Requirements to Structure Mapping

| Requirement | Primary location |
|---|---|
| FR-1 Start preview | `commands.lua` → `server.lua` (spawn) → `session.lua` (register) |
| FR-2 Stop preview | `commands.lua` → `session.lua` (unregister) + `lifecycle.lua` |
| FR-3 Toggle preview | `commands.lua` (delegates to start/stop) |
| FR-5 Lifecycle cleanup | `lifecycle.lua` (VimLeavePre/autocmds) + `server.ts` (EOF/heartbeat) |
| FR-6 WASM render (zero dep) | `frontend/render.ts` + `@hpcc-js/wasm-graphviz` |
| FR-7 Live reload (debounce) | `render.lua` (debounce/latest-wins) + `session.lua` (v) + `frontend/render.ts` (v-guard, render-lock) |
| FR-8 Engine dot/neato | `config.lua` (engines), `commands.lua` (`:GraphvizEngine`), `frontend/render.ts` |
| FR-9 Error resilience | `frontend/render.ts` (last-good + overlay), `error_display` message |
| FR-12 Prebuilt install + checksum | `install.lua` + `checksums.txt` + `release.yml` |
| FR-13 Source-build fallback (Bun) | `install.lua` (loud fallback path) |
| FR-14 Config surface | `config.lua` |

**Cross-cutting concerns:**
- No-orphan reliability → `server.lua` + `lifecycle.lua` + `server.ts`; verified by
  `tests/integration/orphan_spec.lua` (the load-bearing gate).
- Security → `server.ts` (127.0.0.1 bind, token check) + `install.lua` (integrity).
- Observability → `log.lua` + `server/health.ts` + structured logs correlated by
  `sessionId`/`v`.

### Integration Points

**Internal communication:**
- buffer change → `render.lua` debounce → `session.next_version()` → JSON `render`
  over stdio → `sessions.ts` broadcast → WS → `frontend/render.ts`.
- startup → server binds ephemeral port → `ready{port,token}` over stdout → `server.lua`
  opens browser at `http://127.0.0.1:<port>/?sessionId=<bufnr>&token=<token>`.

**External integrations:** GitHub Releases (binary artifacts + checksum pinning); the
user's default browser (or `open_cmd`); the OS process model (process group, EOF).

**Data flow (one-way in v1):** Neovim buffer → Lua → server → browser SVG. The
browser→server channel exists (hello/ack heartbeat) but carries no feature data in v1.
*(v3 — added 2026-06-11: the return channel now carries `node_click` browser→server→Lua; see
"Return Channel Activation (v3)".)*

### File Organization Patterns

- **Configuration:** Lua defaults in `config.lua`; Bun config in `bunfig.toml`/
  `package.json`; formatting in `.stylua.toml`.
- **Source:** one responsibility per module; types isolated in `protocol.*`.
- **Tests:** Lua specs + headless integration in `tests/`; server/frontend unit tests
  co-located `*.test.ts`; browser e2e in `tests/e2e/`.
- **Assets:** built frontend in `dist/frontend/`, served/embedded by the binary.

### Development Workflow Integration

- **Dev:** run server from source with `bun run server/server.ts` + frontend via Bun's
  watch bundler; point a dev Neovim at the source binary path.
- **Build:** `release.yml` runs the `bun build --compile` target matrix on one runner,
  bundles `frontend/`, emits binaries to `dist/`, generates `checksums.txt`.
- **Distribution:** plugin managers run no build step for prebuilt platforms;
  `install.lua` fetches the tag-pinned binary, verifies the in-source checksum, and
  falls back to a local Bun source build (loudly) only when no artifact matches.

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:** All choices reinforce rather than fight each other. The
single highest-leverage decision (one server per Neovim instance) rests on the same
mechanism the transport choice provides — the `vim.system()` stdio pipe doubles as the
parent-death/EOF signal. The Bun toolchain choice resolves the musl/cross-compile
risk the context analysis flagged. Versions are mutually compatible: Neovim 0.10+
(stable `vim.system()`), Bun (`Bun.serve` HTTP+WS), `d3-graphviz` 5.6.0 +
`@hpcc-js/wasm-graphviz` 1.21.2. No contradictory decisions remain — the addendum's
`vim.system()`-vs-`msgpack-RPC` conflict was explicitly resolved.

**Pattern Consistency:** The camelCase-field / snake_case-type wire convention is
enforceable across all three tiers; the `v`-token rule (mint only at source, guard at
frontend) is consistent with the render-lock and latest-wins decisions; the
"one module owns the session map" rule matches the lifecycle/cleanup invariants.

**Structure Alignment:** Every module in the tree maps to a decision or FR; the 3-tier
boundaries (stdio pipe / WS+token / render engine) are reflected one-to-one in the
directory layout; `protocol.ts` as canonical + `protocol.lua` mirror enforces the
single-source-of-truth contract.

### Requirements Coverage Validation ✅

**Functional Requirements Coverage (v1 subset):**
- FR-1/2/3/5 (lifecycle) → `commands.lua`, `server.lua`, `lifecycle.lua`, `session.lua`
  + server EOF/heartbeat. ✅
- FR-6 (zero-dep WASM render) → `frontend/render.ts` + `@hpcc-js/wasm-graphviz`. ✅
- FR-7 (debounced live reload) → `render.lua` + `v` token + frontend render-lock. ✅
- FR-8 (dot/neato + seam) → `config.lua`, `:GraphvizEngine`. ✅
- FR-9 (error resilience, visible) → `frontend/render.ts` + `error_display`. ✅
- FR-12/13 (prebuilt + checksum + Bun fallback) → `install.lua`, `checksums.txt`,
  `release.yml`. ✅
- FR-14 (config) → `config.lua`. ✅
- **FR-4 (auto-open):** intentionally **dropped** from v1 (command-only). ✅ (scope)
- **FR-10/FR-11 (export):** intentionally **deferred to Tier 3**, not covered by v1
  architecture. ✅ (scope) — flagged so downstream epics/stories don't expect them.

**Non-Functional Requirements Coverage:**
- NFR-1 zero prereqs → prebuilt Bun binary, WASM render, no system Graphviz/Node. ✅
- NFR-2 responsiveness → 200ms debounce + render-lock + `v` guard. ✅
- NFR-3 no orphans → EOF self-terminate + heartbeat; gated by `orphan_spec.lua`. ✅
- NFR-4 security → 127.0.0.1 literal bind + per-session token + LAN opt-in. ✅
- NFR-5 portability → Bun cross-compile matrix incl. musl; Windows deferred. ✅
- NFR-6 render fidelity → reference renderer (d3-graphviz/WASM). ✅

### Implementation Readiness Validation ✅

**Decision Completeness:** Critical decisions documented with versions, rationale, and
the falsification gate (the `kill -9 → reaped` test). **Structure Completeness:**
complete, specific tree with per-file responsibility and FR tags. **Pattern
Completeness:** the 9 cross-tier conflict points are covered with good/anti examples
and enforcement (CI lint + contract test).

### Gap Analysis Results

**Critical Gaps:** None. No open decision blocks implementation.

**Important Gaps:** None blocking. The `kill -9 → reaped` integration test is the one
hard prerequisite that must go green early (it is both an NFR-3 gate and the
multiplexing-model falsification gate) — already scoped as story 2.

**Minor Gaps / watch items (recorded, non-blocking):**
- **Frontend asset packaging — resolved here:** the bundled frontend is **embedded
  into the Bun binary** (single-file distribution) rather than shipped as loose files,
  consistent with the zero-prereq single-executable goal. `static.ts` serves from the
  embedded assets.
- **macOS binary trust:** stripping the `com.apple.quarantine` xattr handles Gatekeeper
  in most cases, but the binary is **unsigned/unnotarized** (signing deferred). On
  hardened macOS policies this may still warn; documented as a known limitation with a
  source-build escape hatch.
- **Large-DOT over JSON stdio:** escaping/transferring a very large DOT per render is
  bounded by debounce + latest-wins; no backpressure issue expected at v1 scale, but
  it is a watch item if multi-MB DOT files appear.
- **`d3-graphviz` staleness (~2yr):** accepted (reference renderer); fallback path is
  to drive `@hpcc-js/wasm-graphviz` directly. Maintenance-watch item.

### Validation Issues Addressed

The one ambiguity from the project-structure step (frontend embedded vs
served-from-disk) is resolved above in favor of embedding into the binary. All other
items are scope decisions or watch items, not defects.

### Architecture Completeness Checklist

**Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**Architectural Decisions**
- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed

**Implementation Patterns**
- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**Project Structure**
- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION (all 16 checklist items confirmed; no
Critical Gaps; scope deferrals for FR-4/FR-10/FR-11 are explicit and intentional).

**Confidence Level:** High — corroborated by an independent architecture roundtable
that reached unanimous agreement on the keystone decision and surfaced the
risks (orphans, install pipeline) the design now explicitly mitigates.

**Key Strengths:**
- No-orphan guarantee rests on a single robust mechanism (pipe EOF + heartbeat) with a
  mechanical CI gate.
- Zero-prerequisite install genuinely achieved via Bun cross-compile incl. musl.
- One shared message envelope across both hops; single canonical protocol source.
- v2 (interactivity, bidirectional sync) reachable without re-architecture — warm
  return channel, per-session token, d3 ecosystem — without complicating v1 (SM-C1).

**Areas for Future Enhancement:**
- Binary signing/notarization (supply-chain hardening beyond checksums).
- Windows prebuilt (cheap with Bun once testing/support is committed).
- v2 interactivity layer + bidirectional graph↔buffer sync.
- Large-graph render strategy (viewport culling) — never a system-`dot` path (SM-C1).

### Implementation Handoff

**AI Agent Guidelines:**
- Follow all architectural decisions exactly as documented; treat `server/protocol.ts`
  as the canonical contract.
- Use the wire-naming, `v`-token, and single-owner-of-session-map rules consistently.
- Respect the 3-tier boundaries; never cross them except via the defined protocol.
- The `kill -9 → reaped` test is load-bearing — implement supervision to satisfy it
  before building features on top.

**First Implementation Priority:** Project initialization — Lua plugin template +
`server/` (Bun) + `frontend/` scaffolds + the `release.yml` `bun build --compile`
matrix — then the lifecycle/supervision story gated by `tests/integration/orphan_spec.lua`.
