# PRD Addendum — interactive-graphviz.nvim

*Technical-how, transport/mechanism decisions, and downstream-bound detail that does not belong
in the capability-level PRD. Feeds `bmad-create-architecture`.*

## Architecture pattern (from markdown-preview.nvim prior art)

The plugin is a three-tier bridge:

1. **Neovim (Lua)** — plugin front end. Spawns and supervises the local server via `vim.system()`
   (Neovim 0.10+). Owns commands, config, autocommands, and the buffer→server message flow.
2. **Local server (bundled binary)** — HTTP + WebSocket server. Serves the static frontend and
   relays messages. Shipped as a prebuilt single-file executable per platform; no Node/yarn at
   runtime. Build-from-source fallback uses Bun when no prebuilt binary matches.
3. **Browser tab (static frontend)** — the renderer. `d3-graphviz` + `@hpcc-js/wasm` (Graphviz-WASM)
   draws the SVG. Prebuilt static assets committed to the repo and served by the server.

### Transport decisions
- **Neovim ↔ server:** newline-delimited JSON over `vim.system()` stdio. The architecture rejected
  native msgpack-RPC for v1 in favor of one shared JSON envelope across tiers.
- **Server → browser:** WebSocket push via `Bun.serve`. On buffer change, Neovim sends the new DOT
  source over stdio → server re-broadcasts over WS → browser re-renders.
- **Browser → server → Neovim:** the return channel exists only as warm plumbing in v1 (`hello` /
  `ack`). It is reserved for deferred bidirectional-sync features (click-node → cursor-to-source,
  cursor → highlight).

### Server lifecycle / reliability notes (for architecture)
- Bind to **localhost only by default**; expose-to-LAN is an opt-in config (mirrors
  markdown-preview's `open_to_the_world`).
- Port selection: configurable, with auto-pick of a free port on conflict.
- Clean server shutdown on `:GraphvizPreviewStop`, on last preview buffer close, and on graceful
  Neovim exit; abnormal termination is handled by server self-termination on stdin EOF plus heartbeat.
- Render throttling: debounce buffer-change events; use monotonic render versions and a frontend
  render lock so rapid edits coalesce latest-wins.

### Distribution / supply-chain notes (for architecture + security)
- Prebuilt binaries published to GitHub Releases; install code detects platform via `uname -sm`
  plus libc, downloads the matching artifact, verifies checksum, and marks it executable.
- **Integrity:** publish and verify checksums for downloaded binaries (the prior art does not, but
  this is the right thing to add). Pin to a release tag, not `latest`.

## Engine list
v1 supports `dot` (default) and `neato`. The config keeps an explicit engine-list seam for deferred
Graphviz-WASM engines: `fdp`, `circo`, `twopi`, `osage`, `patchwork`.

## Deferred-feature mechanism notes (v2 / "fancy later")
- **Click-to-highlight neighbors / multi-select / edge tracing:** operate on the rendered SVG DOM in
  the browser (the VSCode reference uses a jQuery SVG layer); direction modes
  single/upstream/downstream/bidirectional.
- **Live search:** matching logic is portable (operate on the parsed DOT model); visual highlight is
  browser-side.
- **Bidirectional source-jump / reverse cursor sync:** requires a DOT source-position map (node →
  source line) and use of the browser→Neovim return channel.

## Recommended-companions documentation (dropped Tier 3, must be in README)
This plugin is a *preview* tool, not a language server. Docs must point users to native Neovim
tooling for language features:
- **Syntax highlighting:** Tree-sitter `dot` (`:TSInstall dot`).
- **Diagnostics / autocomplete / rename / find-references:** `dot-language-server` via `nvim-lspconfig`.
