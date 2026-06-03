---
title: "Product Brief: interactive-graphviz.nvim"
status: draft
created: 2026-06-02
updated: 2026-06-02
---

# Product Brief: interactive-graphviz.nvim

## Executive Summary

`interactive-graphviz.nvim` brings the interactive Graphviz/DOT preview experience —
popularized by the VSCode extension `vscode-interactive-graphviz` — into Neovim. Today, a
Neovim user editing a `.dot` file has no first-class way to *see* their graph as they write
it, let alone interact with it; they must alt-tab to a separate tool, re-run `dot` by hand, or
switch editors entirely. This plugin closes that gap: open a `.dot` file, and a live graph
preview renders in a browser tab and updates as you type.

Because Neovim has no webview, the plugin borrows the proven architecture of
`markdown-preview.nvim`: a lightweight local server drives a browser tab, with Neovim and the
browser kept in sync over a live channel. The graph itself is rendered with the same engine the
VSCode extension uses (`d3-graphviz` + Graphviz-WASM), so visual fidelity and interactivity are
not a research problem — they are a porting and integration problem.

The first release is deliberately small: render + live-reload. From there, the roadmap adds the
"interactive" layer (click-to-highlight neighbors, search, zoom/pan) to reach parity with the
VSCode extension, and leaves room for a genuine differentiator neither reference fully delivers:
**bidirectional sync between the graph and the Neovim buffer**.

## The Problem

Neovim users who work with Graphviz/DOT — to document architectures, visualize dependency
graphs, model state machines, or inspect tool-generated graphs — have no good in-editor preview.
Their options today:

- **Alt-tab workflow:** edit in Neovim, manually run `dot -Tpng/-Tsvg`, open the output in an
  image viewer or browser, and refresh by hand after every change. This is slow and breaks flow.
- **Switch to VSCode** just for the `vscode-interactive-graphviz` extension — abandoning their
  entire Neovim setup for one feature.
- **Static, non-interactive previews** from generic image/markdown plugins — you see a picture,
  but you can't click a node to trace its neighbors or search a large graph.

The cost is friction and context-switching on a task that is inherently visual. For large graphs,
the lack of search and highlight makes the static-image approach nearly unusable.

## The Solution

A Neovim plugin that delivers live, interactive Graphviz preview without leaving the editor: open
a `.dot`/`.gv` file and the graph renders in a browser tab, re-rendering live (debounced) as you
edit. Pick the layout engine, drive it with simple commands, and export the result as SVG or DOT.
(The Scope section itemizes the v1 feature set.)

The interactive layer (next milestone) makes the rendered graph explorable: click a node to trace
its connections and highlight neighbors (upstream/downstream/bidirectional), multi-select,
zoom/pan, and a live search box that filters nodes/edges/clusters as you type.

**Architecture:** reuse the `markdown-preview.nvim` pattern — a prebuilt single-file local server
(HTTP + WebSocket) shipped per-platform so users need no Node/yarn at runtime; a prebuilt static
frontend (the `d3-graphviz`/WASM viewer) served by that server; Neovim ↔ server over msgpack-RPC;
server → browser over WebSocket push. On buffer change, Neovim sends the new DOT source, the
server re-broadcasts, and the browser re-renders.

## What Makes This Different

- **It exists for Neovim at all.** The closest interactive experience lives only in VSCode. For
  Neovim users, "stay in your editor" is the whole value proposition.
- **Parity without reinvention.** By reusing the exact renderer (`d3-graphviz`/WASM) and a proven
  Neovim↔browser bridge, the project removes the risk from the hard parts and competes on
  integration polish.
- **The differentiator nobody shipped: bidirectional sync.** Both the VSCode extension and
  markdown-preview.nvim leave the browser→editor return channel largely unused. Wiring it up —
  click a node in the browser to jump the Neovim cursor to its source line, and highlight the node
  under the cursor in the browser — would make this *more* interactive than the original.
  (Deferred, but it is the north star.)

Honest moat assessment: there is no deep technical moat — the renderer is open and the pattern is
known. The advantage is **being first and well-integrated in the Neovim ecosystem**, plus the
bidirectional-sync vision as a follow-on hook.

## Who This Serves

**Primary:** any Neovim user who authors or reads Graphviz/DOT files and wants to see and explore
the graph without leaving the editor. The audience is intentionally broad — anyone who touches
DOT, whether they are drawing architecture diagrams, dependency graphs, CI/build graphs, or state
machines, or simply inspecting tool-generated DOT output.

**Secondary:** terminal-first developers on remote/SSH/tmux setups who already accept a
browser-tab preview workflow (as with markdown-preview.nvim).

## Success Criteria

- **v1 (MVP) ships and works:** open a `.dot` file, preview renders in the browser, edits
  trigger a live reload reliably across the supported platforms; install requires no manual
  Node/yarn setup.
- **Adoption signal:** the plugin is usable enough that you (and early users) reach for it instead
  of the alt-tab workflow — and it gets installed/starred by Neovim users seeking the VSCode
  extension's equivalent.
- **v2 (parity):** click-to-highlight, search, and zoom/pan land, reaching functional parity with
  `vscode-interactive-graphviz` for the interactive use cases.

As a community plugin, success is qualitative — it works reliably, it gets adopted, and it
replaces the alt-tab workaround — rather than tied to revenue or business KPIs.

## Scope

**In — v1 (MVP):**
- Browser-tab live preview rendered via `d3-graphviz` + Graphviz-WASM
- Update-as-you-type (debounced)
- Auto-open on `.dot`/`.gv` (configurable)
- Layout-engine selection (dot, neato, fdp, circo, twopi, osage, patchwork)
- Commands: `:GraphvizPreview`, `:GraphvizPreviewStop`, `:GraphvizPreviewToggle`
- Export: Save as SVG / Save as DOT
- Cross-platform install with prebuilt server binary (no Node/yarn at runtime)

**Next — v2 (parity), not in first release:**
- Click node → highlight neighbors (single/upstream/downstream/bidirectional)
- Cluster highlight, multi-select (Ctrl/Shift+click), ESC to clear
- Zoom/pan + reset view
- Live search (case-sensitive, regex, scope nodes/edges/clusters, result counter)
- Animated transitions

**Deferred — "fancy later":**
- Browser→Neovim source-jump (click node → cursor to source line)
- Reverse cursor sync (buffer cursor → browser highlight)
- Theme integration (recolor graph to match colorscheme)

**Out of scope (but documented as recommended companions):**
- DOT syntax highlighting, diagnostics, autocomplete/rename/find-references. The docs will direct
  users to native Neovim tooling instead: Tree-sitter `dot` (`:TSInstall dot`) and
  `dot-language-server` wired through `nvim-lspconfig`. This plugin is a *preview* tool, not a
  language server.

## Vision

If it succeeds, `interactive-graphviz.nvim` becomes the default way Neovim users work with
Graphviz — the plugin people install the moment they open a `.dot` file, the answer to "is there
a Neovim equivalent of `vscode-interactive-graphviz`?" Beyond parity, the
bidirectional graph↔buffer sync turns the preview from a passive picture into a navigation
surface for the source: explore the graph, jump to the code, and back. Longer term, the same
bridge could preview DOT emitted by other tools (build systems, profilers, dependency analyzers)
directly from within the editor.
