---
baseline_commit: 10bd3d0
---

# Story 6.4: Sync config, hardening, and docs

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Neovim user,
I want the sync features configurable from `setup()` with typo-safe validation and real docs,
so that v3 is a finished, discoverable feature rather than hidden plumbing.

This is the **closing story of Epic 6** (and of the v3 plan): no new features, no protocol work.
It has four jobs: (1) warn-on-unknown config keys plugin-wide, (2) pay down the three sync.lua
hardening items the 6.3 review deferred here, (3) document both sync directions in README + vimdoc
+ UX spec, and (4) a bookkeeping sweep. When this story is done, Epic 6 flips to `done` and the
epic retrospective unlocks.

## Acceptance Criteria

_From `epics.md` Story 6.4 [Source: _bmad-output/planning-artifacts/epics.md:634] plus the
deferred-work items tagged `→ Story 6.4` [Source: _bmad-output/implementation-artifacts/deferred-work.md:11]._

1. **(AC1 — sync config surface, confirmed + documented)** Given `setup{ sync = { ... } }`,
   `sync.jump_on_click` (boolean, default `true`), `sync.highlight_on_cursor` (boolean, default
   `true`), and `sync.cursor_debounce_ms` (positive integer, default `150`) have **documented**
   defaults, are validated with clear fallback messages, and zero-config works (FR-14). The
   validation itself shipped in 6.2/6.3 (config.lua:240–282) — this AC's new surface is the
   *documentation* (AC3) and a confirming look that the warning copy is clear; do not rewrite
   working validation. [Source: _bmad-output/planning-artifacts/epics.md:642]
2. **(AC2 — unknown keys warn)** Unknown **top-level** keys and unknown **subfields of `search`
   and `sync`** produce a clear warning instead of silent acceptance (and are dropped, not
   merged). `setup{ search = { case_sensitve = true } }` (typo) or `setup{ debouce_ms = 100 }`
   warns naming the offending key; every legitimate key/subfield continues to produce zero
   warnings; zero-config produces zero warnings. Closes the deferred-work warn-on-unknown-keys
   item. [Source: _bmad-output/planning-artifacts/epics.md:646]
   [Source: _bmad-output/implementation-artifacts/deferred-work.md:68]
3. **(AC3 — docs)** README, vimdoc, and the UX spec document **both sync directions, their gates,
   and the focus-stays-in-browser caveat**. Concretely: README gains the `sync` table in its
   config block and a sync feature section; vimdoc gains the `sync` keys **and a COMMANDS section**
   (closing the deferred-work vimdoc gap); the config-apply rule in both distinguishes
   URL-carried keys (apply at preview open) from Lua-side sync keys (see AC5's live-toggle
   nuance). [Source: _bmad-output/planning-artifacts/epics.md:649]
   [Source: _bmad-output/implementation-artifacts/deferred-work.md:56]
4. **(AC4 — bookkeeping sweep)** Epic 6 story file headers match sprint-status; the stale
   "return channel … v2" phrasing in `architecture.md` is reconciled with the v3 "Return Channel
   Activation" section; the misleading `sync.lua` comment promising "replay-on-reconnect is Story
   6.4 work" is corrected; resolved deferred-work items get their ✅ annotations;
   `epic-6-retrospective: optional` is added to sprint-status (the pattern every other epic
   follows). [Source: _bmad-output/planning-artifacts/epics.md:651]
5. **(AC5 — 6.3 review hardening trio)** The three deferred-work items tagged `→ Story 6.4` from
   the 6.3 review are fixed: (a) echo suppression is **per-buffer** (keyed by bufnr) and armed
   only for buffers with an active cursor watch; (b) `emit_for_cursor` **re-reads
   `sync.highlight_on_cursor` at emission time**, so a mid-session `setup()` disable stops
   emissions without re-preview; (c) the `vim.schedule`d `emit_for_cursor` calls are
   **pcall-wrapped with a log.warn**, symmetric with the CursorMoved callback guard. Existing
   behavior pinned by the 207-case busted suite is otherwise unchanged.
   [Source: _bmad-output/implementation-artifacts/deferred-work.md:12]

## Tasks / Subtasks

- [x] **Task 1 — config.lua: warn-on-unknown-keys (AC2)**
  - [x] In `validate()` (config.lua:55), warn about and drop unknown **top-level** keys: any key
    of the merged `opts` not present in `M.defaults` (compare against `M.defaults` key set —
    note `bind` IS a defaults key, so a user-supplied `bind` stays "known"; the existing
    expose_to_lan override at config.lua:293–301 already governs it). Warning copy matches the
    house style: `"interactive-graphviz setup: unknown key 'debouce_ms' (ignored)"` — name the
    key, collect into `warnings` like every other check. Set `opts[k] = nil` for each.
    [Source: lua/interactive-graphviz/config.lua:55]
  - [x] **🚨 The `open_cmd` nil-default trap:** `M.defaults.open_cmd = nil` (config.lua:10) means
    the key does NOT exist in the defaults table — `pairs(M.defaults)` and
    `M.defaults[k] == nil` checks both miss it. A known-key set built naively from the defaults
    table would false-flag a legitimate `setup{ open_cmd = "firefox" }` as unknown. The known set
    must be `pairs(M.defaults)` **plus an explicit `open_cmd`** (or a hand-written allowlist).
    This is the #1 footgun in this story.
  - [x] Unknown **subfields of `search` and `sync`**: inside each fresh-table validation block
    (search: config.lua:196–234; sync: config.lua:243–281), iterate `pairs(user)` and warn for
    keys not in the corresponding defaults sub-table (`"interactive-graphviz setup: unknown key
    'search.case_sensitve' (ignored)"` — dotted path so typos are unambiguous). The fresh-table
    copy already drops them; only the warning is new. Do NOT restructure the blocks.
  - [x] **Determinism note for tests:** `pairs()` order is undefined — when asserting multiple
    unknown-key warnings, assert set-membership, not order.
  - [x] Extend `tests/config_spec.lua` (54 cases today): unknown top-level key warns + is absent
    from `M.options`; unknown `search` subfield warns (use the literal `case_sensitve` typo from
    deferred-work); unknown `sync` subfield warns; a full valid config (every documented key set)
    produces zero warnings; **`setup{ open_cmd = "firefox" }` produces zero warnings** (the
    nil-default trap above); zero-config produces zero warnings; unknown keys never affect
    sibling validation (a typo'd subfield + a valid one → valid one applies).

- [x] **Task 2 — sync.lua: per-buffer echo suppression (AC5a)**
  - [x] Replace the module-global `suppress_next` boolean (sync.lua:295) with a table keyed by
    bufnr. `M.consume_suppression(bufnr)` consumes only that buffer's flag;
    `handle_node_click` arms `suppress[bufnr]` (bufnr = session_id, sync.lua:317) — and arms it
    **only when the buffer has an active cursor watch** (`last_sent[bufnr] ~= nil` is the
    watch-liveness signal — it is set in `start_cursor_watch` and nil'd in `stop_cursor_watch`),
    which fully closes the "armed flag nothing consumes" scenario
    (`jump_on_click=true, highlight_on_cursor=false`). The watcher callback (sync.lua:500)
    passes its bufnr. Clear the flag in `stop_cursor_watch` and `stop_all`.
    [Source: _bmad-output/implementation-artifacts/deferred-work.md:12]
  - [x] Update the comment block above it — it currently reasons only about single-buffer
    staleness (the 6.3 review flagged the comment too). Keep the consume-once, self-healing,
    no-TTL design; per-buffer keying + arm-only-when-watched is the whole change.
  - [x] `tests/sync_spec.lua`: update the 4 existing suppression cases for the new signature; add
    the two-buffer scenario (arm for buffer A → buffer B's move is NOT swallowed, A's echo IS);
    add arm-refused-when-unwatched (no watch on bufnr → handle_node_click jump arms nothing).

- [x] **Task 3 — sync.lua: emission-time gate re-read (AC5b)**
  - [x] At the top of `emit_for_cursor` (sync.lua:404), after the buffer/session guards, return
    early when `config.get().sync.highlight_on_cursor ~= true` (defensive `.sync or {}` read,
    matching `debounce()`'s style at sync.lua:456). A mid-session
    `setup({sync={highlight_on_cursor=false}})` then stops emissions at the next debounce fire —
    no re-preview needed. The watcher augroup/timers keep running until the next
    preview/stop reconciliation (that teardown remains `reconcile_cursor_watch`'s job,
    commands.lua:100 — do NOT teach config.setup() to reach into watchers).
    [Source: _bmad-output/implementation-artifacts/deferred-work.md:20]
  - [x] Behavior note (document in Dev Agent Record, not code): a browser-side emphasis already
    painted when the gate flips off stays painted until the next preview/stop or clear frame —
    same "transient, last-wins" semantics as everything else in this channel. Do not add a
    farewell-clear frame; that invents lifecycle the design doesn't have.
  - [x] `tests/sync_spec.lua`: gate-off mid-session → debounce fire sends nothing; gate back on →
    next change emits again (config stub already exists in the spec harness — extend it).

- [x] **Task 4 — sync.lua: pcall symmetry on scheduled emits (AC5c)**
  - [x] Both `vim.schedule(function() emit_for_cursor(bufnr) end)` sites — the debounce-fire path
    (sync.lua:468) and the watch-start reconcile (sync.lua:516) — wrap the call:
    `local ok, err = pcall(emit_for_cursor, bufnr)` → on failure
    `log.warn("GraphvizSync: emphasis emission error for buffer " .. bufnr .. ": " .. tostring(err))`,
    mirroring the CursorMoved callback's guard copy (sync.lua:503–508). No behavior change on the
    happy path. [Source: _bmad-output/implementation-artifacts/deferred-work.md:32]
  - [x] `tests/sync_spec.lua`: stub a throwing internal (e.g. make the session stub error) →
    scheduled emit warns instead of propagating.

- [x] **Task 5 — README: document the sync surface (AC1, AC3)**
  - [x] Config block (README.md:157–176): add the `sync` table between `search` and
    `heartbeat_ms`, comment style matching the block:
    `sync = { jump_on_click = true, highlight_on_cursor = true, cursor_debounce_ms = 150 }`
    with one-line comments per key.
  - [x] New feature section "Editor↔graph sync" after "Searching"/"Animation" (README.md:139
    area): both directions (click node → Neovim cursor jumps to the node's source line;
    cursor on a node's line → passive blue outline in the Preview, debounced), their gates, the
    graceful-degradation behaviors (node absent → informative notify; non-node line → emphasis
    clears), and the **focus caveat verbatim in spirit**: OS window focus stays in the browser on
    click-jump; the cursor moves without raising the Neovim window (OS/WM territory, out of
    scope). [Source: _bmad-output/planning-artifacts/ux-sync-v3.md:24]
  - [x] Gesture table (README.md:81–91): extend the "Click a node" row — it now also moves the
    Neovim cursor to the node's source line (when `sync.jump_on_click`).
  - [x] Config-apply paragraph (README.md:182–187): add the sync nuance — `sync.jump_on_click`
    rides the preview URL like the interactivity keys (**applies at preview open**; tab reload
    re-applies the baked-in value), while `sync.highlight_on_cursor` and `sync.cursor_debounce_ms`
    are read Lua-side (**a `setup()` change applies from the next cursor movement** — no re-open
    needed, thanks to Task 3 and the existing per-debounce delay read at sync.lua:456).
  - [x] "Invalid values are rejected…" paragraph (README.md:178): add one sentence — unknown
    keys (including typos in `search`/`sync` subfields) now warn and are ignored.

- [x] **Task 6 — vimdoc: sync keys + COMMANDS section (AC3)**
  - [x] `doc/interactive-graphviz.txt`: add the `sync` table to the setup() block (line 19–37)
    and a `sync ~` entry in the keys section (pattern: the `search ~` entry at line 68–74) with
    all three subkeys, defaults, and one-line semantics.
  - [x] Update the apply-rule section (line 76–84) with the same URL-carried vs Lua-side
    distinction as the README (jump_on_click at-open; highlight_on_cursor/cursor_debounce_ms
    live).
  - [x] **NEW COMMANDS section** mirroring the README command table (all six:
    `:GraphvizPreview`, `:GraphvizPreviewStop`, `:GraphvizPreviewToggle`, `:GraphvizEngine`,
    `:GraphvizUrl`, `:checkhealth interactive-graphviz`), each with a `*:GraphvizPreview*`-style
    help tag. Update the CONTENTS index (line 4–10) — it currently says "see the README for
    commands"; commands are now discoverable via `:help`. Closes the deferred-work vimdoc item.
    [Source: _bmad-output/implementation-artifacts/deferred-work.md:56]
  - [x] Keep `tw=78` and the modeline (line 86); verify with
    `nvim --headless "+helptags doc" +q` (no duplicate-tag errors).

- [x] **Task 7 — UX spec: as-built confirmation (AC3)**
  - [x] `_bmad-output/planning-artifacts/ux-sync-v3.md` already documents both directions, gates,
    and the focus caveat (it fed the ACs) — the AC is satisfied by *verifying* it against
    as-built behavior, not rewriting it. Two additive touches: update the frontmatter `status:`
    from `lightweight spec` to `as-built (Epic 6 shipped)`, and record the shipped emphasis
    treatment in the buffer→graph section (blue `#4fc3f7` stroke-only outline, `ig-cursor` class,
    animation-gated pulse, precedence encoded via `:not(.ig-selected):not(.ig-neighbor)`).
    [Source: _bmad-output/planning-artifacts/ux-sync-v3.md:28]
    [Source: _bmad-output/implementation-artifacts/6-3-cursor-graph-emphasis.md:370]

- [x] **Task 8 — Bookkeeping sweep (AC4)**
  - [x] Story headers: confirm `6-1`…`6-3` files say `Status: done` matching sprint-status (they
    do at story-creation time — re-verify at dev time; fix any drift found).
  - [x] `architecture.md` stale return-channel phrasing: lines 140 and 385 say the return channel
    "becomes active in v2" — amend to v3 with a pointer to the "Return Channel Activation (v3)"
    section (architecture.md:343); the Transport bullets at lines 293/307 describe v1's dormant
    state — add a parenthetical "(activated in v3 — see Return Channel Activation)" rather than
    rewriting history; line 450's "(dormant)" gets the same pointer. Minimal diffs — this is a
    decision record, not a living doc.
    [Source: _bmad-output/implementation-artifacts/6-1-activate-the-return-channel-protocol-spine.md]
  - [x] `sync.lua:511–518` comment: "replay-on-reconnect is Story 6.4 work" is **wrong** — that
    fix needs Lua-side subscriber awareness (a protocol-level signal that does not exist), was
    deferred WITHOUT a 6.4 tag, and stays deferred. Correct the comment to point at
    deferred-work.md instead of promising it here.
    [Source: _bmad-output/implementation-artifacts/deferred-work.md:24]
  - [x] `deferred-work.md`: annotate the three AC5 items and the vimdoc-COMMANDS item
    `✅ resolved in Story 6.4 (2026-07-XX)` following the established inline convention (see the
    Story 6.1 ✅ entry at deferred-work.md:69 for the shape). The warn-on-unknown-keys item
    (line 68) too. Items NOT resolved by this story keep their entries untouched
    (reconnect-replay, render.stop_all, concatenated-quoted-IDs, attr-key false-match,
    server null-JSON).
  - [x] `sprint-status.yaml`: add `epic-6-retrospective: optional` after `6-4-…` (every prior
    epic has its retrospective key; epic-6's is missing). Story status flips stay the
    review workflow's job.

- [x] **Task 9 — Tests and verification (all ACs)**
  - [x] Full battery: busted over `tests/*_spec.lua` (207 green today; expect +10–15), `stylua
    --check .`, `bun test` in `frontend/` (151) and `server/` (71) — **both must pass with zero
    source changes; `git diff server/ frontend/` empty is the scope proof**, headless nvim smoke,
    helptags check (Task 6).
  - [x] `frontend/urlparam-contract.test.ts` must stay green UNTOUCHED — this story adds no URL
    param (the canonical set stays at 7); if you find yourself editing it, you've broken the
    scope boundary.
  - [x] Grep-verify: no `suppress_next` module-global remains; both scheduled emit sites are
    pcall-wrapped; README/vimdoc both contain `cursor_debounce_ms` (docs actually landed).

### Review Findings

- [x] [Review][Decision] Pending debounce timer survives suppression-consume — one `emphasize`
  echo escapes when a node click lands inside an open debounce window (user move arms
  `timers[buf]`; click jumps cursor and arms `suppress[buf]`; the jump's CursorMoved consumes the
  flag and returns without cancelling the pending timer, which then fires against the post-jump
  cursor and emits the echo). Pre-existing 6.3 interleaving, not introduced by this diff;
  self-heals in one tick. Fix is unambiguous and tiny (cancel `timers[bufnr]` on consume) —
  decide: patch now in this hardening story, or defer to deferred-work.md.
  [lua/interactive-graphviz/sync.lua:527]
- [x] [Review][Patch] Docs over-promise the mid-session `highlight_on_cursor=false` behavior — an
  outline already painted stays until the next preview/stop or clear frame (spec-sanctioned
  transient last-wins semantics), but README/vimdoc say a `setup()` change "applies from the next
  cursor movement" without that caveat. Add one clarifying clause to both apply-rule passages.
  [README.md, doc/interactive-graphviz.txt]
- [x] [Review][Patch] Weak spec assertion: `warn_calls[1]:find("3", 1, true)` ("names the buffer")
  passes if the digit 3 appears anywhere in the message — assert `"buffer 3"` instead.
  [tests/sync_spec.lua:861]
- [x] [Review][Patch] File List bookkeeping: sync_spec gained **+6** new cases (68→74), not the
  claimed "+7 new cases" — correct the File List line (the 74 total and the +14 overall busted
  delta are accurate). [story file File List]
- [x] [Review][Patch] Future-proof the `KNOWN_KEYS` comment: state explicitly that any future
  top-level key with a nil default must also be seeded into the literal, or it will false-flag
  as unknown (comment-only hardening of the story's #1 footgun).
  [lua/interactive-graphviz/config.lua:33]

## Dev Notes

### Scope Boundary

This story touches **Lua + docs + planning artifacts only**. Explicitly NOT this story:
- **No server or frontend changes** — `git diff server/ frontend/` must be empty. The 6.1-deferred
  server null-JSON hardening (deferred-work.md:64) is untagged debt; leave it.
- **No protocol changes, no new URL params** — the urlparam contract test's canonical set stays
  at 7. `highlight_on_cursor`/`cursor_debounce_ms` remain Lua-side gates by design (6.3 Design
  Decision 1).
- **No reconnect/replay fix** (deferred-work.md:24): needs a subscriber-awareness signal that
  would be a protocol change. Correct the misleading sync.lua comment (Task 8), don't implement.
- **No render.stop_all registry fix** (deferred-work.md:38): pre-existing Epic 1 debt, untagged.
- **No behavior changes to validation of KNOWN keys** — the existing warning copy and
  fresh-table pattern are pinned by 54 config_spec cases; Task 1 only adds unknown-key warnings.

### Previous Story Intelligence (6.3 + 6.2)

- **The fresh-table validation pattern is the house style** (config.lua:196–234 for `search`,
  243–281 for `sync`): validate into a `vim.deepcopy` of the defaults sub-table because the
  merged table can alias caller-owned data — never mutate `user`. Task 1's subfield warnings hook
  into these blocks; the drop-unknowns behavior is already emergent from the copy.
- **`last_sent[bufnr]` is the watch-liveness signal** — set (to a fresh sentinel table) in
  `start_cursor_watch` (sync.lua:493), nil'd in `stop_cursor_watch` (sync.lua:528). Task 2 reuses
  it to refuse arming suppression for unwatched buffers; do not invent a parallel registry.
- **The 6.3 review already fixed `stop_all` to iterate `last_sent`** (sync.lua:538–554) — keep
  that shape when adding the suppression-table cleanup.
- **Spec harness patterns exist for everything this story tests**: `tests/sync_spec.lua` already
  stubs timers, autocmds, config, server.send (with a NIL sentinel), and session; extend those
  stubs, don't invent new ones. Same for config_spec's warning capture.
- **6.3's "two agents, one checkout" note**: the working tree at dev start has occasionally
  carried adopted changes — start from a clean `git status` and verify baseline `10bd3d0`.
- **Commit style**: `feat(sync): …` / `fix(sync): …`; docs-heavy commits in this repo have used
  `docs(…): …` (e.g. `bb22a50 docs(planning): …`). A single story commit is the norm.

### Architecture Guardrails

- **The security invariant in validate() is load-bearing**: `bind` is forcibly derived from
  `expose_to_lan` AFTER all other checks (config.lua:293–301). Task 1's top-level scan runs
  against `M.defaults`' key set, which contains `bind` — a user-supplied `bind` is "known" (and
  then overridden), NOT an unknown key. Don't warn about it; the override is the designed
  behavior (NFR-4). [Source: _bmad-output/planning-artifacts/architecture.md:379]
- **Config write-before-warn ordering** (config.lua:306–319): warnings are collected during
  validate and emitted only after `M.options` is fully written, because log.warn reads
  `config.get().log_level` at call time. Task 1's new warnings MUST go through the same
  `warnings` table — never `log.warn` directly inside `validate()`.
- **`emphasize` invariants hold through the hardening**: never carries `v`, exact three-key
  envelope, `vim.NIL` on the clear frame (sync.lua:436–444). Tasks 2–4 must not touch the
  send-site shape. [Source: _bmad-output/planning-artifacts/architecture.md:357]
- **Sessions/watchers ownership**: `reconcile_cursor_watch` in commands.lua (100–122) is the ONLY
  place watchers start; `config.setup()` never reaches into sync/render modules. Task 3's
  emission-time check preserves that separation (the gate is read where the work happens).
- **Docs promise discipline**: README currently promises "invalid values are rejected with a
  warning" — after Task 1 that sentence finally covers typos too. Keep README and vimdoc
  byte-consistent on defaults (a drifted default in docs is a bug the 6.2 contract-test
  philosophy exists to prevent — here it's prose, so the only guard is care).

### Current Files To Touch (read each fully before editing)

| File | Change |
|---|---|
| `lua/interactive-graphviz/config.lua` | Task 1: unknown-key warnings (top-level + search/sync subfields) |
| `lua/interactive-graphviz/sync.lua` | Tasks 2–4: per-buffer suppression, emission-time gate, pcall wraps; Task 8: reconcile comment fix |
| `tests/config_spec.lua` | Task 1 cases |
| `tests/sync_spec.lua` | Tasks 2–4 cases (update 4 existing suppression cases) |
| `README.md` | Task 5: sync config + feature section + apply-rule + gesture row |
| `doc/interactive-graphviz.txt` | Task 6: sync keys + COMMANDS section + apply-rule |
| `_bmad-output/planning-artifacts/ux-sync-v3.md` | Task 7: status + as-built treatment |
| `_bmad-output/planning-artifacts/architecture.md` | Task 8: v2→v3 return-channel pointers |
| `_bmad-output/implementation-artifacts/deferred-work.md` | Task 8: ✅ annotations |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | Task 8: epic-6-retrospective key |

NOT touched: anything under `server/`, `frontend/`, `lua/interactive-graphviz/{server,render,
commands,protocol,session,lifecycle,install,health,log,init}.lua` (commands.lua's reconcile logic
is already correct — reread it to confirm, change nothing).

### Project Structure Notes

- No new files anywhere. No new modules, no new test files — every change lands in an existing
  file listed above.
- vimdoc tags: help tags must be globally unique; prefix all new ones `interactive-graphviz-`
  or use the literal command names (`*:GraphvizPreview*`). Run the helptags check.

### Testing Standards

- Lua: busted over `tests/*_spec.lua` — local harness `~/.luarocks` on Lua 5.4, CI runs 5.1:
  keep specs 5.1-compatible (no goto labels needed here; avoid `//` integer division etc.).
- Format: `stylua --check .` gates CI.
- Frontend/server suites run but must show zero diffs (scope proof, Task 9).
- Warning assertions: config_spec captures warnings via its log stub — assert substring presence
  (`:find(msg, 1, true)`), set-membership for multiples (pairs order is undefined).

### Git Intelligence

Baseline `10bd3d0` (6.3 feature+review, includes the stop_all patch). Substrate commits:
`ff87fff` (6.2 review patches), `aa32764` (6.2), `61082f1` (6.1). The three deferred hardening
items reference line numbers as of `10bd3d0` — verified accurate at story-creation time
(suppress_next at sync.lua:295, emit_for_cursor at :404, schedule sites at :468/:516).

### Project Context Reference

No `project-context.md` exists in this workspace at story-creation time; this story is grounded
in the BMad planning artifacts (epics.md Story 6.4, sprint-change-proposal-2026-06-11.md §C/E,
ux-sync-v3.md, architecture.md "Return Channel Activation (v3)"), the 6.1–6.3 story records,
deferred-work.md's `→ Story 6.4` tags, and the source files read above at baseline `10bd3d0`.

## Dev Agent Record

### Agent Model Used

Claude Fable 5 (claude-fable-5) via Claude Code

### Debug Log References

- Baseline at `10bd3d0` verified: clean tree (story artifacts only), 211 busted cases green
  (the suite had grown past the story's quoted 207 between story creation and dev start).
- Full battery after implementation: 225 busted / 0 fail (+14 new), `stylua --check` clean,
  `bun test` frontend 151 / server 71 all green with **zero** source diffs under
  `server/`/`frontend/` (scope proof), headless nvim smoke exit 0, `helptags doc` clean
  (no duplicate tags), all vimdoc lines ≤ 78 chars.
- Grep-verified: no `suppress_next` remains anywhere; exactly 2 `pcall(emit_for_cursor` sites;
  `cursor_debounce_ms` present in both README (3×) and vimdoc (3×);
  `frontend/urlparam-contract.test.ts` untouched (canonical set stays at 7).

### Completion Notes List

- **Task 1 (AC2):** `validate()` now warns about and drops unknown top-level keys and unknown
  `search`/`sync` subfields. The known-key set is built as `pairs(M.defaults)` **plus an explicit
  `open_cmd` seed** — the story's #1 footgun (nil default = invisible to `pairs`) is covered by a
  dedicated test (`setup{ open_cmd = "firefox" }` → zero warnings). Subfield warnings use dotted
  paths (`search.case_sensitve`); all new warnings flow through the collected `warnings` table
  (write-before-warn ordering preserved). Clearing `opts[k] = nil` during `pairs()` traversal is
  defined Lua behavior (only *adding* keys mid-traversal is undefined). 8 new config_spec cases;
  the 54 existing cases pass unchanged — no behavior change for known keys.
- **Task 2 (AC5a):** suppression is now a table keyed by bufnr with `consume_suppression(bufnr)`.
  Arming additionally requires `last_sent[bufnr] ~= nil` (the watch-liveness signal), closing the
  "armed flag nothing consumes" scenario. `NONE`/`last_sent` moved (unchanged) above
  `handle_node_click` so the local is in scope — no parallel registry invented. Flags cleared in
  `stop_cursor_watch` and `stop_all`. Spec: 4 existing cases updated (watch started first, bufnr
  arg), plus two-buffer isolation, arm-refused-when-unwatched, and stop-clears-pending cases.
- **Task 3 (AC5b):** `emit_for_cursor` re-reads `config.get().sync.highlight_on_cursor` after the
  buffer/session guards (defensive `.sync or {}`, matching `debounce()`'s style) and returns early
  when not `true`. Behavior note per story: an emphasis already painted when the gate flips off
  stays painted until the next preview/stop or clear frame — transient last-wins semantics; no
  farewell-clear frame added. Watcher teardown remains `reconcile_cursor_watch`'s job (re-read and
  confirmed correct, unchanged). The early return happens BEFORE the `last_sent` dedupe update, so
  re-enabling emits again on the next change (covered by the gate-off/gate-on spec case).
- **Task 4 (AC5c):** both `vim.schedule`d emit sites (debounce fire, watch-start reconcile) wrap
  the call in `pcall` with the story's exact `log.warn` copy, mirroring the CursorMoved guard.
  Spec: session stub gained a throwing mode; both sites covered (warn instead of propagate).
- **Task 5 (AC1/AC3):** README gains the `sync` table in the config block, an "Editor↔graph sync"
  feature section (both directions, gates, graceful degradation, the focus-stays-in-browser
  caveat), the extended "Click a node" gesture row, the URL-carried vs Lua-side apply-rule split
  (`jump_on_click` at preview open; `highlight_on_cursor`/`cursor_debounce_ms` live from the next
  cursor movement), and one sentence extending the validation promise to unknown keys/typos.
- **Task 6 (AC3):** vimdoc gains the `sync` table in the setup block, a `sync ~` keys entry
  (all three subkeys, defaults, semantics), the same apply-rule split, and a **new COMMANDS
  section** with help tags for all six commands; CONTENTS index updated (no longer defers
  commands to the README). `tw=78` + modeline kept; helptags check clean.
- **Task 7 (AC3):** `ux-sync-v3.md` verified against as-built behavior; frontmatter `status`
  flipped to `as-built (Epic 6 shipped)`; as-built emphasis treatment recorded (blue `#4fc3f7`
  stroke-only outline, `ig-cursor` class, animation-gated pulse, precedence via
  `:not(.ig-selected):not(.ig-neighbor)`) — each claim grep-confirmed against
  `frontend/render.ts` (lines 405–422) before writing.
- **Task 8 (AC4):** 6-1/6-2/6-3 story headers verified `Status: done` (no drift found).
  `architecture.md`: both "active in v2" lines, the two Transport dormant bullets, and the
  "(dormant)" cross-dependency line now carry "activated in v3 — see Return Channel Activation
  (v3)" pointers (minimal parentheticals, history not rewritten). The misleading
  "replay-on-reconnect is Story 6.4 work" comment in sync.lua corrected to point at
  deferred-work.md. deferred-work.md: ✅ annotations added to the three AC5 items, the vimdoc
  COMMANDS item, and the warn-on-unknown-keys item (2026-07-03); unresolved items untouched.
  `epic-6-retrospective: optional` added to sprint-status.
- Not done / stays deferred by design: reconnect-replay, `render.stop_all` registry,
  concatenated-quoted-IDs, attr-key false-match, server null-JSON (all untagged debt).

### File List

- `lua/interactive-graphviz/config.lua` — unknown-key warnings (top-level + search/sync subfields)
- `lua/interactive-graphviz/sync.lua` — per-buffer suppression, emission-time gate, pcall wraps,
  reconcile comment fix
- `tests/config_spec.lua` — 8 new unknown-key cases (62 total)
- `tests/sync_spec.lua` — suppression cases reworked + 6 new cases (74 total; +1 more from the review patch: 75)
- `README.md` — sync config block, feature section, gesture row, apply-rule, validation sentence
- `doc/interactive-graphviz.txt` — sync keys, apply-rule, COMMANDS section, CONTENTS update
- `_bmad-output/planning-artifacts/ux-sync-v3.md` — as-built status + shipped treatment
- `_bmad-output/planning-artifacts/architecture.md` — v2→v3 return-channel pointers (5 spots)
- `_bmad-output/implementation-artifacts/deferred-work.md` — 5 ✅ resolution annotations
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story status + epic-6-retrospective key

## Change Log

- 2026-07-03: Story 6.4 implemented — unknown-config-key warnings plugin-wide (AC2), the three
  6.3-review hardening items (per-buffer echo suppression, emission-time gate re-read, pcall
  symmetry — AC5), sync docs in README + vimdoc incl. new COMMANDS section (AC1/AC3), UX spec
  as-built confirmation (AC3), and the bookkeeping sweep (AC4). 225 busted / 151 frontend /
  71 server tests green; zero server/frontend source diffs.
- 2026-07-03: Code review (3 adversarial layers) — 5 patch findings applied: cancel a pre-jump
  debounce on suppression consume (closes the click-during-debounce echo interleaving, +1 spec
  case), mid-session gate-off caveat added to README + vimdoc apply-rule passages, `"buffer 3"`
  assertion strengthened, File List count corrected (+6, not +7), KNOWN_KEYS comment warns future
  nil-default keys must be seeded. 5 findings dismissed as false positives/spec-sanctioned after
  repo verification. 226 busted green post-patch. Status → done.
