---
title: UX — Bidirectional Sync (v3)
status: as-built (Epic 6 shipped)
created: 2026-06-11
scope: Epic 6 (FR-19–FR-20)
companion: ux-interactivity-v2.md
---

# UX — Bidirectional Sync (v3)

A lightweight spec for the v3 sync surface, sibling to `ux-interactivity-v2.md`. It feeds Epic 6
story acceptance criteria. Unlike v2, this surface spans **both** sides of the bridge: the browser
Preview and the Neovim cursor. Both directions are config-gated and on by default.

## Graph → buffer (click → source jump, Story 6.2)

| Input | Action |
|-------|--------|
| Click node | v2 highlight behavior unchanged **plus** the Neovim cursor jumps to the node's source line |
| Click node absent from buffer | Informative Neovim notify ("node not found in buffer"); no cursor move; Preview highlight still applies |

- The jump is a **side effect** of the existing click — no new browser affordance, no visual change
  in the Preview beyond v2's highlight.
- **Focus caveat (documented, out of scope):** OS window focus stays in the browser; the cursor
  moves in Neovim without raising its window. Focus switching is OS/WM territory.
- Gate: `sync.jump_on_click` (default `true`).

## Buffer → graph (cursor → emphasis, Story 6.3)

- When the cursor rests on a node's line (debounced, `sync.cursor_debounce_ms` = 150 ms), that node
  receives a **passive emphasis** in the Preview: an outline/pulse treatment that
  - never dims other elements (it is not the highlight/dim regime), and
  - never contends with the v2 precedence rule (open search query owns the highlight; click
    selection next; cursor echo is purely additive beneath both).
- Leaving the node's line (or disabling) clears the emphasis. Last-wins; no trail.
- Gate: `sync.highlight_on_cursor` (default `true`).
- **As-built treatment (Story 6.3):** blue `#4fc3f7` stroke-only outline on an `ig-cursor` class;
  a subtle pulse that is animation-gated (respects `animate = false` and reduced-motion);
  precedence encoded in CSS via `:not(.ig-selected):not(.ig-neighbor)` so search/click emphasis
  always wins over the cursor echo.

## Anti-feedback rule

A click-initiated jump (6.2) must not echo back as a cursor emphasis (6.3) — one-shot suppression
on the sync-initiated CursorMoved. The user sees: click → highlight (browser) + cursor lands
(editor), with no flicker or re-emphasis round-trip.

## Non-goals (this surface, v3)

- No reverse text editing from the Preview — the browser never mutates the buffer.
- No edge-click or cluster-click jump — nodes only in v3; revisit after field feedback.
- No focus raising of either window.
- No theming — still deferred.
