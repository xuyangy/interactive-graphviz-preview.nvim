---
title: interactive-graphviz.nvim
status: final
created: 2026-06-02
updated: 2026-06-02
---

# PRD: interactive-graphviz.nvim
*Working title — confirm.*

## 0. Document Purpose

This PRD is for the plugin author (Xuyangy) and any contributors, and it feeds the downstream
architecture and epics/stories workflows. It reflects the v1 scope refined and locked during
architecture on 2026-06-02: command-started live preview, `dot`/`neato` layout selection, and
zero-prerequisite installation. Auto-open, export, and the remaining layout engines are deferred.
It builds on the
[product brief](../../briefs/brief-interactive-graphviz.nvim-2026-06-02/brief.md) and the
[brainstorming session](../../../brainstorming/brainstorming-session-2026-06-02-1713.md) — it does
not duplicate them. Vocabulary is anchored in the Glossary (§3); features are grouped with
functional requirements (FRs) nested and globally numbered (FR-N) for stable downstream reference;
inferences are tagged `[ASSUMPTION]` inline and indexed in §9. Transport/mechanism detail
(JSON-lines stdio, WebSocket, server lifecycle) lives in `addendum.md`, not here — this PRD states
capabilities, not implementation.

## 1. Vision

`interactive-graphviz.nvim` lets a Neovim user open a Graphviz/DOT file and immediately see the
graph render in a live browser preview that updates as they type — no alt-tabbing, no manual `dot`
runs, no switching to VSCode. It brings the experience of the popular
`vscode-interactive-graphviz` extension to the Neovim ecosystem, where no first-class equivalent
exists today.

Because Neovim has no webview, the plugin drives a browser tab from a small bundled local server,
rendering the graph with the same engine the VSCode extension uses (Graphviz compiled to WASM).
This makes visual parity a porting-and-integration problem rather than a research problem, and lets
v1 stay deliberately small: render plus live reload, installable with zero external prerequisites
(no system Graphviz, no Node at runtime).

The longer arc adds an interactive layer (click-to-highlight neighbors, search, zoom/pan) to reach
parity with the reference, and ultimately a differentiator neither reference fully ships:
bidirectional sync between the rendered Graph and the Neovim buffer — turning the Preview from a
passive picture into a navigation surface for the source. Further out, the same bridge could
preview DOT emitted by other tools (build systems, profilers, dependency analyzers) from inside the
editor.

There is no deep technical moat here — the renderer is open and the bridge pattern is known. The
advantage is being first and well-integrated in the Neovim ecosystem and competing on integration
polish, with bidirectional sync as the follow-on hook.

## 2. Target User

### 2.1 Jobs To Be Done
- **See my graph while I write it** — author DOT (architecture diagrams, dependency graphs, state
  machines, CI/build graphs) with live visual feedback, without leaving Neovim.
- **Read a graph someone/something produced** — inspect tool-generated DOT output and navigate it.
- **Stay in my editor** — get a VSCode-grade preview without abandoning a Neovim setup.
- **Install it and have it just work** — no system Graphviz to install, no runtime Node toolchain to
  manage.
- *(Builder's own JTBD: I want this for my own Neovim workflow and to fill an obvious ecosystem gap.)*

### 2.2 Non-Users (v1)
- Users who want DOT **language features** (syntax highlighting, autocomplete, rename, diagnostics)
  *from this plugin* — those are served by Tree-sitter `dot` + `dot-language-server`, which the docs
  will point to. This plugin is a preview tool, not a language server.
- Users on platforms without a prebuilt binary who are unwilling to run a source build (they can
  still use it via the build-from-source fallback, but it is not a zero-step install for them).

### 2.3 Key User Journeys

- **UJ-1. Sam edits an architecture diagram and watches it form.**
  Sam, a backend engineer documenting a service's architecture in `services.dot`, runs
  `:GraphvizPreview`. A browser tab opens showing the rendered graph. As Sam adds nodes and edges
  in Neovim, the preview re-renders within a moment of each pause in typing. When the layout looks
  right, Sam keeps working in the editor with visual confidence instead of rerunning `dot` manually.
  **Climax:** the graph updates live as Sam types — the alt-tab-and-rerun loop is gone.
  **Edge case:** if the DOT has a syntax error, the preview holds the last good render and surfaces
  the error rather than blanking.

- **UJ-2. Dana inspects a tool-generated dependency graph over SSH.**
  Dana opens a large `deps.dot` emitted by a build tool on a remote box (no system Graphviz
  installed). `:GraphvizPreview` renders it in a local browser tab via the bundled WASM engine — no
  prerequisite install needed. Dana switches the layout engine from `dot` to `neato` to get a more
  readable arrangement of the dense graph. **Resolution:** Dana reads the structure without
  installing anything on the remote host.

## 3. Glossary

- **DOT** — the Graphviz source language; files with `.dot` or `.gv` extensions.
- **Graph** — the rendered visual output produced from DOT source.
- **Preview** — the live, browser-rendered view of a Graph for a given DOT buffer.
- **Preview session** — an active Preview tied to a specific Neovim buffer; has a lifecycle
  (start / running / stop).
- **Server** — the bundled local process (HTTP + WebSocket) that serves the frontend and relays
  updates between Neovim and the browser.
- **Frontend** — the static browser-side renderer (`d3-graphviz` + Graphviz-WASM) that draws the Graph.
- **Layout engine** — the Graphviz algorithm used to lay out the Graph. v1 supports `dot` and
  `neato`; `fdp`, `circo`, `twopi`, `osage`, and `patchwork` are deferred.
- **Live reload** — automatic re-render of the Preview when the DOT buffer changes.
- **Prebuilt binary** — the per-platform compiled Server executable shipped via releases, requiring
  no Node/yarn at runtime.
- **Build-from-source fallback** — building the Server locally (requires Bun) when no Prebuilt
  binary matches the platform.

## 4. Features

### 4.1 Preview session lifecycle
**Description:** Users start, stop, and toggle a Preview for the current DOT buffer via commands,
with clean lifecycle teardown. Realizes UJ-1, UJ-2.

**Functional Requirements:**

#### FR-1: Start preview
A user can run `:GraphvizPreview` on a `.dot`/`.gv` buffer to open a Preview in a browser tab
rendering that buffer's Graph.
**Consequences (testable):**
- Running the command on a DOT buffer launches the Server (if not running) and opens the default
  browser to the Preview URL.
- The initial Graph renders without further user action.
- Running it on a non-DOT buffer is a no-op with an informative message.

#### FR-2: Stop preview
A user can run `:GraphvizPreviewStop` to end the Preview session.
**Consequences (testable):**
- The Server is shut down when no Preview sessions remain; no orphaned process survives.
- Stopping is idempotent (no error if nothing is running).

#### FR-3: Toggle preview
A user can run `:GraphvizPreviewToggle` to start the Preview if stopped, or stop it if running.
**Consequences (testable):**
- When no Preview session is running for the buffer, toggle behaves as FR-1 (start).
- When a Preview session is running for the buffer, toggle behaves as FR-2 (stop).
- Toggle never leaves the session in an inconsistent state (no double-start, no orphaned Server).

#### FR-5: Lifecycle cleanup
The plugin terminates the Server on the last Preview buffer closing and on Neovim exit.
**Consequences (testable):**
- After quitting Neovim, no Server process remains.
- Closing the previewed buffer ends its session and frees the browser tab per config.

### 4.2 Live rendering and layout
**Description:** The Preview renders the Graph from DOT using the bundled WASM engine and re-renders
live as the buffer changes; the user can switch layout engines. Realizes UJ-1, UJ-2.

**Functional Requirements:**

#### FR-6: Render DOT to Graph (zero system dependency)
The Frontend renders the Graph from the buffer's DOT source using bundled Graphviz-WASM.
**Consequences (testable):**
- Rendering succeeds with **no system Graphviz / `dot` installed**.
- Output matches Graphviz semantics for valid DOT (parity with the reference renderer).

#### FR-7: Live reload on buffer change
The Preview re-renders when the DOT buffer changes, debounced to coalesce rapid edits.
**Consequences (testable):**
- After the user pauses typing, the Preview reflects the change within the debounce window —
  **default 200 ms**, configurable (FR-14).
- Rapid consecutive edits do not queue a backlog of renders (latest-wins).

#### FR-8: Layout engine selection
A user can choose the Layout engine from the v1-supported set: `dot` and `neato`.
**Consequences (testable):**
- Default engine is `dot`.
- Changing the engine re-renders the current Graph with the selected algorithm.
- The engine is selectable via a plugin command and via config (not an in-Preview UI control in v1).
- The implementation keeps the engine list as an explicit extension seam for deferred engines
  (`fdp`, `circo`, `twopi`, `osage`, `patchwork`).

#### FR-9: Syntax-error resilience
When the DOT buffer contains a parse/render error, the Preview does not blank the last good Graph
and surfaces that an error occurred.
**Consequences (testable):**
- A render error preserves the previously rendered Graph in view.
- The user is informed a render failed (message/indicator).

### 4.5 Interactivity *(v2 — added 2026-06-07; parity target)*
**Description:** The user interacts with the rendered Graph the way the plugin's name promises —
highlight neighbors, search, and zoom/pan/reset — reaching parity with `vscode-interactive-graphviz`.
All interactions are **frontend-local** (operate on the already-rendered SVG client-side; no server
round-trip, no new install prerequisites). Realizes the "interactive" promise; see §6 MVP Scope (v2).

**Functional Requirements:**

#### FR-15: Zoom/pan & reset view
A user can zoom and pan the Graph and reset it to fit; view-state is preserved across live-reload.
**Consequences (testable):**
- Zoom/pan operate smoothly on the rendered SVG; a reset affordance returns to fit-to-viewport.
- With `preserve_view` enabled, the zoom/pan transform survives a re-render (wires the existing
  `preserve_view` config); with it disabled, the view resets on reload.

#### FR-16: Click-to-highlight neighbors
Clicking a node highlights it and its neighbors; the highlight relation is configurable.
**Consequences (testable):**
- Highlight modes: single / upstream / downstream / bidirectional (config `highlight_mode`).
- Cluster highlight, multi-select (Shift+click), and ESC-to-clear are supported.
- Non-matching elements are dimmed; clearing restores the full Graph.

#### FR-17: Live search
A user can search nodes/edges by label and see matches highlighted.
**Consequences (testable):**
- Case-sensitive and regex toggles; search scope respected; a result counter shows match count.
- Matches are highlighted and non-matches dimmed.

#### FR-18: Animated transitions
Highlight changes and re-renders animate smoothly; config-gated.
**Consequences (testable):**
- Transitions use d3-graphviz; a non-animated fallback exists.
- Interactions stay responsive without perceptible lag (NFR-7).

### 4.3 Installation and distribution
**Description:** The plugin installs with no runtime Node/yarn and no system Graphviz, via a
per-platform Prebuilt binary, with a Build-from-source fallback for uncovered platforms.

**Functional Requirements:**

#### FR-12: Prebuilt binary install
On install, the plugin obtains a Prebuilt binary matching the user's platform.
**Consequences (testable):**
- Prebuilt binaries are provided for **Linux (x64, arm64)** and **macOS (x64, arm64)**.
- Install requires neither Node nor yarn at runtime.
- Binary integrity is verified against a published checksum, pinned to a release tag.

#### FR-13: Build-from-source fallback
When no Prebuilt binary matches the platform, the plugin can build the Server from source.
**Consequences (testable):**
- On an uncovered platform (e.g. Windows, Alpine/musl, BSD), the source build produces a working
  Server given Bun present.
- The fallback path is documented and discoverable when triggered.

### 4.4 Configuration
**Description:** A user can configure the plugin's behavior through standard Neovim plugin config.

**Functional Requirements:**

#### FR-14: Configuration surface
A user can configure at least: default Layout engine, selectable engine list, debounce interval,
browser open command, Server bind/port behavior, LAN exposure, heartbeat interval, logging level,
and best-effort view preservation.
**Consequences (testable):**
- Documented defaults exist for every option; the plugin works with zero configuration.
- The Server binds to **localhost only by default**; LAN exposure is explicit opt-in.
- Config follows idiomatic Neovim conventions (a `setup{}` / `vim.g` surface); exact keys finalized
  in architecture.

## 5. Non-Goals (Explicit)
- **Not a DOT language server.** No syntax highlighting, autocomplete, rename, find-references, or
  diagnostics built into this plugin (point users to Tree-sitter `dot` + `dot-language-server`).
- **Not a terminal/in-buffer graph renderer.** v1 renders in a browser tab; no Sixel/Kitty-image or
  ASCII in-buffer rendering.
- **Not a DOT editor/formatter.** No reformatting, linting, or refactoring of DOT source.
- **Not becoming a general diagram tool.** Scope is Graphviz/DOT, not Mermaid/PlantUML/etc.
- **No Windows prebuilt binary in v1** (source-build fallback covers it in the interim).

## 6. MVP Scope

### 6.1 In Scope (v1)
- Preview session lifecycle: `:GraphvizPreview` / `:GraphvizPreviewStop` / `:GraphvizPreviewToggle`,
  clean lifecycle teardown (FR-1–FR-3, FR-5).
- Live browser rendering via bundled Graphviz-WASM, debounced live reload, layout-engine selection,
  error resilience (FR-6–FR-9).
- Prebuilt-binary install for Linux + macOS (x64/arm64) with source-build fallback (FR-12–FR-13).
- Idiomatic configuration surface with safe defaults (FR-14).
- Docs that set expectations and point to recommended companions for language features.

### 6.1b In Scope (v2 — added 2026-06-07)
- **Interactivity layer (parity target):** click-to-highlight neighbors, live search, zoom/pan +
  reset, multi-select, ESC-clear, animated transitions (FR-15–FR-18). Frontend-local; adds no
  install prerequisites (preserves SM-C1). Delivered by Epic 5; see `sprint-change-proposal-2026-06-07.md`.
- **v1 hardening (user-facing slice):** the triaged `deferred-work.md` defects + Windows no-orphan
  verification. Delivered by Epic 4.

### 6.2 Out of Scope for MVP
- ~~**Interactivity layer**~~ — **promoted to v2 scope (§6.1b, FR-15–FR-18) on 2026-06-07.**
- **Auto-open Preview on DOT file open.** v1 is command-started only; revisit after the manual
  lifecycle is stable.
- **Export SVG / Export DOT from the Preview.** Deferred until after the live preview loop and
  zero-prerequisite installation are working.
- **Additional layout engines** — `fdp`, `circo`, `twopi`, `osage`, `patchwork`. v1 ships `dot`
  and `neato`; the config keeps an engine-list seam for these.
- **Bidirectional graph↔buffer sync** — click node → cursor to source line; cursor → browser
  highlight. *Deferred ("fancy later"); the differentiator north star.*
- **Theme integration** — recolor Graph to match Neovim colorscheme. *Deferred.*
- **System-`dot` hybrid render path** — WASM-only for v1; revisit only if large-graph performance
  becomes a real complaint.
- **Windows prebuilt binary** — deferred; source-build fallback in the interim.

## 7. Success Metrics

As an open-source community plugin, success is qualitative:

**Primary**
- **SM-1**: The author and early users reach for it in place of the alt-tab/manual-`dot` workflow
  and do not abandon it. Validates FR-1, FR-6, FR-7.
- **SM-2**: A clean install yields a working Preview on a supported platform with **zero** extra
  prerequisites (no system Graphviz, no Node at runtime). Validates FR-6, FR-12.

**Secondary**
- **SM-3**: The plugin is adopted by Neovim users seeking the `vscode-interactive-graphviz`
  equivalent (install/star signal, "is there a Neovim version?" answered "yes"). Validates the
  Vision.

**Counter-metrics (do not optimize)**
- **SM-C1**: Do not chase feature breadth at the cost of install simplicity — adding render paths or
  prerequisites to win large-graph benchmarks would betray SM-2. Counterbalances SM-2 vs. the
  deferred system-`dot` path.

## 8. Open Questions
No phase-blocking product questions remain for v1. Architecture has resolved the render-lock,
configuration shape, and checksum-verification approach. Binary signing/notarization remains a
post-v1 hardening decision.

## 9. Assumptions Index
*All product-level assumptions resolved with the author or downstream architecture on 2026-06-02:*
- §4.1 — Auto-open was originally considered, then dropped from v1 during architecture; preview opens
  by command only. ✅ Resolved.
- §4.2 FR-8 — Layout engine selectable via **command + config** (no in-Preview UI control in v1);
  v1 supports `dot` and `neato`, with other engines deferred. ✅ Resolved.
- §4.4 FR-12 — Prebuilt binaries are checksum-verified and tag-pinned. ✅ Resolved.
- §4.4 FR-14 — Configuration follows idiomatic Neovim `setup{}`/`vim.g` conventions. ✅ Resolved.

---

## Cross-Cutting NFRs

- **NFR-1 (Zero external prerequisites):** On a supported platform, the plugin runs with no system
  Graphviz and no Node/yarn at runtime. *(Load-bearing — see SM-2.)*
- **NFR-2 (Render responsiveness):** After typing pauses, the Preview reflects buffer changes within
  the debounce window (default **200 ms**, configurable); rapid edits are coalesced latest-wins (FR-7).
- **NFR-3 (Reliability / no orphans):** The Server starts on demand and is always cleaned up — on
  stop, last-buffer-close, and Neovim exit. Port conflicts are handled by auto-selecting a free port.
- **NFR-4 (Security / least exposure):** The Server binds to localhost only by default; LAN exposure
  is explicit opt-in. Prebuilt binaries are integrity-verified (checksum, pinned tag).
- **NFR-5 (Portability target):** Neovim **0.10+** (for stable `vim.system()`); Prebuilt binaries
  for Linux + macOS (x64/arm64); source-build fallback elsewhere.
- **NFR-6 (Render fidelity):** The rendered Graph matches Graphviz semantics for valid DOT (parity
  with the `d3-graphviz`/WASM reference renderer).
- **NFR-7 (Interaction responsiveness — v2):** Highlight, search, and zoom/pan respond without
  perceptible lag. All interactions are **frontend-local** (no server round-trip), preserving NFR-1
  and SM-C1 — interactivity adds no install prerequisites.

## Dependency & Runtime Targets
- **Editor:** Neovim 0.10+.
- **Render engine:** `d3-graphviz` + `@hpcc-js/wasm` (Graphviz-WASM), bundled in the Frontend.
- **Server runtime:** shipped as a Prebuilt binary (no runtime Node); Bun needed only for the
  Build-from-source fallback.
- **System Graphviz:** **not required.**
