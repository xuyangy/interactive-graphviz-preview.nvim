---
title: Sprint Change Proposal — interactive-graphviz.nvim v3 (bidirectional sync)
date: 2026-06-11
facilitator: Amelia (Developer, correct-course)
project_lead: Xuyangy
status: approved (lead, 2026-06-11)
scope_classification: Moderate
---

# Sprint Change Proposal — interactive-graphviz.nvim v3 scope

## Section 1 — Issue Summary

**Trigger.** Not a defect — the planned **v2 → v3 inflection**, the same shape as the 2026-06-07
proposal that opened v2. v2 has shipped: Epics 4 + 5 `done`, debt paid down (2026-06-10), and
**v0.2.0 tagged + published 2026-06-11** at `ed658a2` with full `vscode-interactive-graphviz`
interactivity parity. The Epic 5 retro (Next Steps #3) explicitly directs: after the debt is paid
and the v2 tag is cut, scope **v3 — bidirectional graph↔buffer sync** via `correct-course`.

**Core problem (precisely).** The PRD's stated differentiator — *"bidirectional sync between the
rendered Graph and the Neovim buffer — turning the Preview from a passive picture into a navigation
surface for the source"* (PRD §1, "the differentiator north star", §6.2) — is still deferred. The
infrastructure for it has been deliberately kept warm since v1: the browser→server return channel
carries `hello`/`ack` only, every other inbound type is logged-and-ignored on both hops
(`server.ts` message switch; `server.lua:95`), and the per-session token was minted in v1
*specifically* because it becomes load-bearing "once the return channel becomes active"
(`architecture.md` Security). v3 is the change that lights it up.

**Evidence.**
- PRD §1 Vision + §6.2 Out-of-Scope — bidirectional sync named as the follow-on differentiator.
- `architecture.md` Interaction Layer (v2): return channel "still reserved for a future **v3
  bidirectional graph↔buffer sync**, which *is* the change that lights it up."
- PRD `addendum.md` Deferred-feature notes: "Bidirectional source-jump / reverse cursor sync:
  requires a DOT source-position map (node → source line) and use of the browser→Neovim return
  channel."
- Epic 5 retro Next Steps #3 + project memory — v3 scoping via correct-course is the agreed next move.
- Epic 5 delivered the reusable browser-side emphasis machinery (`applyHighlightToDom`, the
  `ig-*` class regime, `extractModelFromApp`) that the buffer→graph direction reuses outright.

## Section 2 — Impact Analysis

**Mode note.** Run in **batch mode** (single-command autonomous session); all checklist findings and
edit proposals are presented together for one review pass.

### Epic impact

Epics 1–5 closed and unaffected — no rollback, no reopened ACs. **One new epic:**

- **Epic 6 — Bidirectional Graph↔Buffer Sync (v3).** Activates the dormant return channel.
  Four stories (see Section 4C). Sequenced so 6.1 lays the protocol spine the rest build on —
  mirroring how 1.3 laid the v1 spine and 5.1 laid the v2 view-state foundation.

The two directions are deliberately split into separate stories because they are architecturally
asymmetric:

| Direction | Channel | New surface |
|---|---|---|
| **Graph→buffer** (click node → cursor jumps to source) | browser→server→Lua — **activates the return channel** | New wire messages on both hops; first feature data on server→Lua stdout beyond `ready`/`pong`/`log` |
| **Buffer→graph** (cursor on a node → emphasis in Preview) | Lua→server→browser — **existing forward path** | One new forward message type; frontend reuses Epic 5 emphasis machinery |

### Artifact conflicts

- **PRD — additive.** Mint **FR-19** (click→source jump), **FR-20** (cursor→graph emphasis),
  **NFR-8** (sync responsiveness + no feedback loops). New feature group §4.6. Move the
  bidirectional-sync bullet out of §6.2 into a new §6.1c "In Scope (v3)". Core goals intact.
  **SM-C1 preserved:** sync adds zero install prerequisites — same binary, same frontend bundle,
  no new deps.
- **Architecture — MODERATE impact (headline finding — this is the difference from v2).** Epic 5
  was Tier-3-only; Epic 6 is the **first protocol expansion since Story 1.3** and touches all three
  tiers: `protocol.ts` (canonical) + `protocol.lua` mirror + contract tests, the `server.ts`
  message switch (browser→Lua relay), and new Lua-side modules. One new subsection required
  ("Return Channel Activation (v3)") documenting the message set, the **`v`-token boundary** (sync
  messages do NOT mint `v` — `v` stays render-only), the node↔line mapping decision, and the
  echo-suppression rule. The security posture was pre-paid in v1: token-gated `hello`, localhost
  bind, un-subscribed sockets rejected — `node_click` is only accepted from a subscribed,
  token-validated socket. No new security surface decision needed, but the architecture doc's
  "Data flow (one-way in v1)" line must be updated.
- **UI/UX — small.** Extend `ux-interactivity-v2.md` (or a sibling `ux-sync-v3.md`): click
  behavior gains a side effect (cursor jump) but keeps its v2 visuals; cursor-echo emphasis needs a
  **distinct treatment** from click/search highlight (it must not fight the Epic 5 precedence rule
  "open search query owns the highlight") — recommend a passive outline/pulse on the cursor's node
  that never dims the rest of the graph. Both directions config-gated.
- **Other artifacts.** README gains a sync section; `deferred-work.md` re-triage (below); CI
  unaffected structurally (contract tests extend the existing `bun test` + busted lines).

### Technical impact (key design decisions baked into the stories)

1. **Node↔line mapping lives Lua-side.** On `node_click{nodeId}`, Lua scans the buffer for the
   node's first definition/occurrence (word-boundary match, quoted-ID aware). Rationale: no new
   deps, the mapping lives next to the buffer truth (which the browser's DOT snapshot may lag),
   and the frontend stays dumb — it already knows node names from SVG titles (Epic 5's
   `nodeTitleFromClickTarget`). The addendum's "DOT source-position map" is satisfied by on-demand
   scan, not a maintained map — cheapest thing that works; upgradeable later without protocol change.
2. **New wire messages** (canonical in `protocol.ts`, mirrored in `protocol.lua`):
   - browser→server: `node_click{sessionId, nodeId}` — relayed verbatim server→Lua on stdout.
   - Lua→server→browser: `emphasize{sessionId, nodeId|null}` — forward relay like `render`,
     `null` clears. No `v` on either (render-only token; sync is stateless last-wins).
3. **Hazard — feedback loop.** Click→jump moves the cursor, which triggers cursor-sync, which
   emphasizes the same node — benign but wasteful; a sync-initiated jump sets a one-shot
   suppression flag so it does not echo back. Documented as an explicit invariant.
4. **Hazard — stale node.** The clicked node may no longer exist in the edited buffer (browser
   renders lag by debounce). Graceful degradation: notify ("node not found in buffer"), no-op.
5. **Config (FR-14 seam):** `sync = { jump_on_click = true, highlight_on_cursor = true,
   cursor_debounce_ms = 150 }`. Browser-side gating of `node_click` emission rides the existing
   v0.2.0 URL-param path (`urlconfig.ts`) — which makes two deferred-work items land directly in
   this epic's blast radius (see triage).

### Deferred-work triage (pulled into Epic 6)

- **Warn-on-unknown config keys** — newly load-bearing: v3 adds a second nested config table
  (`sync`), doubling the silent-typo trap surface. → **Story 6.4**.
- **Lua↔TS URL-param contract test** — v3 extends the duplicated param contract beyond six params;
  the structural blind spot grows unless closed now. → **Story 6.1** (the contract-test story).
- **Real-browser WASM smoke** — remains documented debt (unchanged scope), but noted: an e2e
  sync round-trip test would subsume part of it; revisit at the Epic 6 retro.

## Section 3 — Recommended Approach

**Selected: Direct Adjustment (Option 1).** Add Epic 6; existing epics untouched.

- **Effort:** Medium · **Risk:** Medium-low. Higher than Epic 5 (first cross-tier protocol change
  since 1.3) but heavily de-risked by v1's pre-payment: warm channel, token auth, canonical
  protocol + contract-test pattern, and the unknown-type-ignored behavior on both hops meaning
  partial deployment states degrade silently rather than break.
- **Rejected — Rollback (Option 2):** N/A — nothing to revert; v2 shipped clean.
- **Rejected — MVP Review (Option 3):** N/A — v1/v2 scope shipped intact; this is the planned
  additive continuation of the PRD's own roadmap.

Rationale: this is the PRD's differentiator north star, the architecture has carried the seam for
it since day one, and Epic 5's emphasis machinery makes the reverse direction nearly free. Doing
it now, immediately after parity shipped, converts the plugin's name from "parity port" to the
thing neither reference fully ships.

## Section 4 — Detailed Change Proposals

### A — PRD (`prds/prd-interactive-graphviz.nvim-2026-06-02/prd.md`)

- **A1** New feature group **§4.6 Bidirectional Sync** *(v3 — added 2026-06-11; the differentiator)*:
  - **FR-19: Click-to-source jump.** Clicking a node in the Preview moves the Neovim cursor to
    that node's source line. Consequences (testable): cursor lands on the node's first
    definition/occurrence (quoted IDs handled); a node absent from the current buffer produces an
    informative message, never an error; gated by `sync.jump_on_click`; only token-validated,
    session-subscribed browser connections can trigger it (NFR-4 holds).
  - **FR-20: Cursor-to-graph emphasis.** Moving the cursor onto a node's line emphasizes that node
    in the Preview. Consequences (testable): debounced (`sync.cursor_debounce_ms`, default 150);
    emphasis is visually distinct from click/search highlight and never dims the graph; leaving a
    node line (or disabling) clears it; gated by `sync.highlight_on_cursor`.
- **A2** §6.2: remove the bidirectional-sync bullet from Out-of-Scope; add **§6.1c In Scope (v3)**:
  "Bidirectional graph↔buffer sync (FR-19–FR-20), activating the v1-dormant return channel.
  Delivered by Epic 6." Theme, export, auto-open, extra engines **remain** deferred.
- **A3** Add **NFR-8 (Sync integrity & responsiveness):** sync round-trips feel immediate at
  interactive scale; sync messages carry no `v` and can never displace or reorder renders; the two
  directions cannot feedback-loop (echo suppression); zero new install prerequisites (SM-C1).

### B — Architecture (`architecture.md`, after "Interaction Layer (v2)")

New subsection **"Return Channel Activation (v3)"**:
- Message set additions: browser→server `node_click{sessionId,nodeId}` (accepted only from
  subscribed+token-validated sockets; relayed verbatim to Lua over stdout); Lua→server→browser
  `emphasize{sessionId,nodeId|null}` (forward relay, `null` clears).
- **Invariants:** `v` is minted for `render` only — sync messages never carry or mutate it; sync is
  stateless last-wins; unknown types remain logged-and-ignored on every hop; stdout remains the
  protocol channel; session-map ownership unchanged.
- Node↔line mapping is **Lua-side on demand** (buffer scan, quoted-ID aware) in a new
  `lua/interactive-graphviz/sync.lua`; frontend emits `nodeId` only (from existing SVG-title
  machinery). New frontend module `frontend/sync.ts` (emit gate + cursor-echo emphasis rendering,
  reusing the Epic 5 emphasis seams).
- Echo suppression: a sync-initiated cursor jump sets a one-shot flag consumed by the next
  CursorMoved tick.
- Update the "Data flow (one-way in v1)" Integration Points line: the return channel now carries
  `node_click` as of v3.
- Security note: per-session token now load-bearing as designed; no bind/exposure change.

### C — Epics (`epics.md`) — new **Epic 6: Bidirectional Graph↔Buffer Sync**

- **Story 6.1 — Activate the return channel (protocol spine).** Add `node_click` + `emphasize` to
  `protocol.ts`/`protocol.lua`; server relays browser→Lua and Lua→browser; contract test
  round-trips browser→server→Lua and Lua→server→browser asserting one envelope shape on all hops;
  **includes the Lua↔TS URL-param contract test** (deferred-work item) since this story owns the
  cross-boundary contract. No user-visible behavior yet (Lua handler logs-and-ignores).
- **Story 6.2 — Click node → jump to source line (FR-19).** `sync.lua` node→line scan (quoted IDs,
  word boundaries); cursor move + stale-node notify; `sync.jump_on_click` gate end-to-end
  (URL-param emission gate browser-side); busted specs for the matcher incl. edge cases.
- **Story 6.3 — Cursor → graph emphasis (FR-20).** Debounced CursorMoved/CursorHold watcher;
  line→node match (reuses 6.2's matcher); `emphasize` flow; distinct passive emphasis treatment
  respecting Epic 5's highlight precedence; echo suppression with 6.2; `sync.highlight_on_cursor`
  gate.
- **Story 6.4 — Sync config, hardening, and docs.** `sync` table validation; **warn-on-unknown
  config keys** (top-level + `search` + `sync` subfields — closes the deferred-work item); README
  + vimdoc + UX-spec updates; bookkeeping sweep.

### D — UX (`ux-interactivity-v2.md` — extend, or sibling `ux-sync-v3.md`)

Lightweight additions: click keeps v2 visuals + gains cursor-jump side effect; cursor-echo
emphasis = passive outline/pulse, never dims, never contends with search/click precedence; both
directions config-gated; note that OS window focus does not change on jump (out of scope).

### E — Backlog & status bookkeeping

- `deferred-work.md`: annotate warn-on-unknown-keys `→ Story 6.4` and URL-param contract test
  `→ Story 6.1`; real-browser WASM smoke stays documented debt with an Epic-6-retro revisit note.
- `sprint-status.yaml`: add `epic-6` + `6-1`…`6-4` as `backlog` (after approval).

## Section 5 — Implementation Handoff

**Scope classification: Moderate** — one new epic + bounded PRD/architecture/UX edits; no replan,
no rollback. Same classification and handoff shape as the approved v2 proposal.

- **Developer (Amelia):** on approval, apply artifact edits A–E in this session; then
  `create-story` for 6.1 first, and 6.2→6.3→6.4 in order.
- **Sequencing rationale:** 6.1 (spine, no behavior) de-risks the protocol change in isolation;
  6.2 ships the headline feature; 6.3 completes bidirectionality reusing 6.2's matcher; 6.4 closes
  config/docs/debt.
- **Success criteria:** clicking a node in the Preview puts the cursor on its source line; moving
  the cursor onto a node emphasizes it in the Preview; both gates work from `setup()`; the
  contract test asserts the envelope on all three hops; no render-correctness invariant regresses
  (`v` untouched by sync); SM-C1 intact (zero new prerequisites).

**Remains deferred to v4+:** theme integration, export SVG/DOT, auto-open, additional layout
engines, real-browser WASM smoke (revisit at Epic 6 retro).
