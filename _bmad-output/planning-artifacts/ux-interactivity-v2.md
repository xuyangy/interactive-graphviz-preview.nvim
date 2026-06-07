---
title: UX — Interactivity Layer (v2)
status: lightweight spec
created: 2026-06-07
scope: Epic 5 (FR-15–FR-18)
parity_reference: vscode-interactive-graphviz
---

# UX — Interactivity Layer (v2)

A lightweight spec for the v2 interaction surface. Modeled on `vscode-interactive-graphviz` parity.
It feeds Epic 5 story acceptance criteria; it is not a full UX design doc. The only surface is the
browser Preview — there is no Neovim-side UI for these features (commands/config remain the Lua
surface). All affordances are **frontend-local**.

## Browser keybindings & gestures

| Input | Action | Story |
|-------|--------|-------|
| Click node | Highlight node + neighbors per `highlight_mode` | 5.2 |
| Shift+click node | Add to multi-select highlight set | 5.2 |
| `Esc` | Clear all highlighting / exit search | 5.2 / 5.3 |
| `/` | Open search box (focus input) | 5.3 |
| `0` or `r` | Reset view to fit-to-viewport | 5.1 |
| Scroll / drag | Zoom / pan | 5.1 |

## Highlight semantics

- **Selected** — the clicked node(s): strongest emphasis (full opacity + accent stroke).
- **Neighbor** — nodes/edges in-relation per `highlight_mode`
  (`single` = just the node; `upstream` / `downstream` = directional; `bidirectional` = both):
  emphasized but distinct from selected.
- **Dimmed** — everything else: reduced opacity so the highlighted subgraph reads clearly.
- **Cluster** — clicking within a cluster offers highlighting the whole cluster.
- Clearing (`Esc` / click empty canvas) restores all elements to full opacity.

## Search affordances

- Compact search box (opened with `/`); shows a **result counter** (e.g. `3/12`).
- Toggles: **case-sensitive**, **regex**. Scope respected (nodes and/or edges).
- Matches use the same highlight/dim treatment as click-highlight; `Esc` closes and clears.

## Motion

- Highlight changes and re-renders animate via d3-graphviz transitions (FR-18), **config-gated**
  with a non-animated fallback. Animations must never block interaction or stale the latest render
  (respects the existing render-lock + `v` token).

## Non-goals (this surface, v2)

- No bidirectional sync (click → Neovim cursor) — that is v3 and activates the dormant return channel.
- No in-Preview engine picker or export controls — engine stays command/config-driven; export deferred.
- No theming to match the Neovim colorscheme — deferred.
