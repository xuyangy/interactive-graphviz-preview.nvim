---
title: 'GraphvizUrl command: recover the full preview URL via :messages'
type: 'feature'
created: '2026-07-02'
status: 'done'
route: 'one-shot'
---

# GraphvizUrl command: recover the full preview URL via :messages

## Intent

**Problem:** The preview URL is announced once at startup via `vim.notify` — notification UIs
(noice.nvim, nvim-notify) intercept, truncate, and expire that message, and the long token-bearing
URL is then unrecoverable.

**Approach:** Add a `:GraphvizUrl` command that rebuilds the current buffer's full preview URL from
live server state and echoes it with `nvim_echo(…, history=true)`, so the complete URL always lands
in `:messages` regardless of notification plugins. The URL builder was extracted from `M.preview`
into a shared `preview_url()` helper so the two paths can never drift.

## Suggested Review Order

1. [lua/interactive-graphviz/commands.lua](../../lua/interactive-graphviz/commands.lua) — the
   extracted `preview_url()` helper (verify it is byte-identical to the old inline builder), then
   `M.url()` with its three guards (no session / server exited / pre-ready) and the
   `nvim_echo` + token-exposure rationale.
2. [plugin/interactive-graphviz.lua](../../plugin/interactive-graphviz.lua) — the `:GraphvizUrl`
   registration (dispatch pattern, no args).
3. [tests/commands_spec.lua](../../tests/commands_spec.lua) — the `commands.url` describe: happy
   path (history=true, full URL), preview-parity test, non-default-config parity, and the three
   guard tests each asserting the distinguishing message substring; plus the shape-asserting
   `nvim_echo` stub.
4. [README.md](../../README.md) — the command-table row (active-preview requirement + token note).
5. [_bmad-output/implementation-artifacts/deferred-work.md](deferred-work.md) — one deferred item:
   vimdoc has no COMMANDS section (pre-existing; earmarked for Story 6.4's docs pass).
