---
stepsCompleted: [1]
inputDocuments:
  - "https://github.com/tintinweb/vscode-interactive-graphviz (reference product)"
  - "https://github.com/iamcco/markdown-preview.nvim (architectural prior art)"
session_topic: "interactive-graphviz.nvim — a Neovim plugin matching tintinweb's VSCode interactive Graphviz preview"
session_goals: "Define and prioritize the functionality surface into build tiers; settle the v1 MVP scope"
selected_approach: "AI-recommended techniques (First Principles / Assumption Reversal), pivoted to pragmatic feature prioritization per user steer"
techniques_used:
  - "Reference grounding (competitive/prior-art teardown)"
  - "Assumption reversal (challenged 'interactive = webview/mouse')"
  - "Tiered feature enumeration + prioritization"
ideas_generated:
  - "Tier 1 MVP feature set"
  - "Tier 2 interactivity parity set"
  - "Tier 3 language server (dropped)"
  - "Tier 4 differentiators (deferred)"
context_file: ""
---

# Brainstorming Session: interactive-graphviz.nvim

**Date:** 2026-06-02
**Facilitator:** BMad Brainstorming
**Participant:** Xuyangy

## Session Overview

**Topic:** Designing `interactive-graphviz.nvim` — a Neovim plugin that delivers the
functionality of tintinweb's [vscode-interactive-graphviz](https://github.com/tintinweb/vscode-interactive-graphviz)
inside the Neovim ecosystem.

**Goals:** Generate and prioritize the functionality surface; settle a buildable v1 MVP.

### Session Setup

Two reference products framed the session:

1. **vscode-interactive-graphviz (tintinweb)** — the target feature set. Fundamentally a
   **VSCode webview app**: renders DOT via **d3-graphviz + Graphviz-WASM** into an SVG, with a
   jQuery interaction layer for click-to-highlight, edge tracing, multi-select, zoom/pan, and
   live search. Also ships editor-side DOT language features (highlight, autocomplete, rename,
   find-refs, diagnostics) and SVG/DOT export.

2. **markdown-preview.nvim (iamcco)** — the **architectural prior art** for browser-based preview
   from Neovim. Pattern: a prebuilt single-file **Node HTTP + socket.io server** (downloaded
   per-platform via `install.sh`, so users need no Node/yarn) → browser tab renders content →
   Neovim bridges via **job + msgpack-RPC** → **websocket push** for live updates. Notably it
   **already renders Graphviz `dot` client-side**, and it under-uses its browser→nvim **return
   channel**.

### Key Insights

- **Neovim has no webview/DOM** — but markdown-preview.nvim proves the browser-tab + local-server
  pattern works cleanly and is the accepted path.
- **Rendering is solved prior art** — d3-graphviz/Graphviz-WASM is the same renderer VSCode uses
  and is already used by markdown-preview.nvim. The real work is the interaction layer, not pixels.
- **The neglected return channel is the differentiator** — wiring browser node-clicks back to the
  Neovim cursor (jump-to-source) and reverse cursor→graph highlight is something *neither* reference
  fully delivers.
- **User steer:** Do not over-optimize for keyboard/buffer-native purity. Browser + mouse is an
  acceptable interaction surface. Prioritize functionality and parity — "as long as it works."

## Ideas Generated — Tiered Functionality Surface

### Tier 1 — Core Preview  ✅ **MVP (v1)**
1. Live preview in a browser tab, graph rendered via **d3-graphviz + Graphviz-WASM** (same engine as VSCode)
2. **Update-as-you-type**, debounced
3. Auto-open preview on opening a `.dot`/`.gv` file (configurable)
4. **Engine selection** — dot, neato, fdp, circo, twopi, osage, patchwork
5. Commands: `:GraphvizPreview`, `:GraphvizPreviewStop`, `:GraphvizPreviewToggle`
6. **Export** — Save as SVG / save as DOT

### Tier 2 — Interactivity  ✅ **v2 (parity target)**
7. **Click node → highlight connected edges/neighbors**; direction = single / upstream / downstream / bidirectional
8. Click cluster → highlight
9. Ctrl/Shift+click **multi-select**; ESC clears
10. **Zoom / pan** + reset-view button
11. **Live search box** — filter as you type; case-sensitive toggle; regex toggle; scope = nodes/edges/clusters; result counter
12. Animated transitions between renders

### Tier 3 — Editor-side Language Smarts  ❌ **DROPPED from plugin scope — document the workaround**
Not built into this plugin, but the plugin **documentation must point users to the existing
Neovim-native ways to get these** (a "Recommended companions" / "Language features" section):
13. **DOT syntax highlighting** — Tree-sitter `dot` (Neovim already ships this; `:TSInstall dot`)
14. **Diagnostics** — syntax errors surfaced in the buffer (via the DOT language server below)
15. **Autocomplete / rename / find-references** — via a **DOT language server** (`dot-language-server` exists; wire it through `nvim-lspconfig`)

### Tier 4 — Differentiators  🅿️ **DEFERRED ("parity first, fancy later")**
16. **Click node in browser → jump Neovim cursor to that node's source line** (the neglected return channel)
17. **Reverse sync** — cursor on a node in the buffer → highlight it in the browser
18. Theme integration — recolor graph to match the Neovim colorscheme

## Prioritization Outcome

| Priority | Scope | Decision |
|----------|-------|----------|
| **MVP (v1)** | Tier 1 — render, live-reload, auto-open, engine selection, commands, SVG/DOT export | **In** |
| **v2 (parity)** | Tier 2 — click-to-highlight, multi-select, zoom/pan, live search | **Next** |
| **Later** | Tier 4 — browser→Neovim source-jump, reverse cursor sync, theme integration | **Deferred** |
| **Out** | Tier 3 — language server, autocomplete, rename, diagnostics | **Dropped from build — but documented as a recommended-companions workaround** |

> **Documentation requirement:** The README/docs must include a **"Language features (recommended
> companions)"** section explaining that this plugin focuses on *preview*, and that DOT syntax
> highlighting, diagnostics, and autocomplete/rename/find-references are best obtained via native
> Neovim tooling: Tree-sitter `dot` (`:TSInstall dot`) + `dot-language-server` wired through
> `nvim-lspconfig`. Set expectations clearly so users aren't surprised these aren't built in.

## Architecture Direction (emergent)

Reuse the markdown-preview.nvim pattern:
1. Prebuilt single-file **Node server** (HTTP + WebSocket), downloaded per-platform via `install.sh` — no Node/yarn required at runtime.
2. **Prebuilt static frontend** = interactive Graphviz viewer (d3-graphviz / Graphviz-WASM), committed to the repo and served by the server.
3. **Neovim → server** via job + msgpack-RPC; **server → browser** via websocket push.
4. On buffer change, RPC-notify new DOT content → re-broadcast to browser → re-render.
5. Auto-open default browser, with a `browserfunc`-style escape hatch.
6. Keep the **browser→nvim return channel** in mind from day one — it's the Tier 4 differentiator path.

## Next Steps

- Consider a **product brief** (`bmad-product-brief`) to lock the concept, or jump to **Quick Dev**
  (`bmad-quick-dev`) given the small, well-understood MVP.
- The Tier 1 MVP is small enough that a thin vertical slice (open `.dot` → browser renders → edit
  → live reload) is a strong first milestone.
