---
title: Sprint Change Proposal — interactive-graphviz.nvim v2
date: 2026-06-07
facilitator: Amelia (Developer, correct-course)
project_lead: Xuyangy
status: approved
scope_classification: Moderate
---

# Sprint Change Proposal — interactive-graphviz.nvim v2 scope

## Section 1 — Issue Summary

**Trigger.** Not a mid-sprint defect — the planned **v1 → v2 inflection**. v1 has shipped:
all three epics are `done` (12/12 stories), released `v0.1.0 → v0.1.1 → v0.1.2` (the last
adding a Windows x64 prebuilt). With v1 out, the PRD's parked scope becomes the live question.

**Core problem (precisely).** The plugin is named **interactive**-graphviz.nvim but v1 ships
**zero interactivity**. PRD §6.2 explicitly parks the interactivity layer for v2 and tags it
*"the 'interactive' promise in the name — emotionally load-bearing."* This is a **planned
strategic continuation**, not a failure.

**Change signal vs. v2 definition.** `deferred-work.md` was offered as the change signal, but it
is **tech debt, not a v2 definition** — 20 code-review deferrals, mostly tactical hardening. One
item is a genuine half-delivered feature: `preserve_view` is configured but never wired at render
time (`frontend/render.ts`, `frontend/viewstate.ts`). The actual v2 definition lives in **PRD §6.2**.

**Evidence.**
- PRD §6.2 — interactivity layer + bidirectional sync deferred to v2.
- `architecture.md:295` — browser→server return channel "warm but dormant — Reserved for v2 sync".
- `architecture.md:330` — per-session token "load-bearing once the return channel becomes active in v2".
- `deferred-work.md` — `preserve_view` not read at render time; plus N-tabs, empty-DOT, `open_cmd` quoting.
- Epic 3 retro AI#2 + project memory — Windows stdin-EOF no-orphan death **unverified**.

## Section 2 — Impact Analysis

**Decided scope (author, 2026-06-07):** v2 center of gravity = **Interactivity Layer** (parity with
`vscode-interactive-graphviz`); deferred backlog **triaged to user-facing items only**; run
**incrementally**; **lightweight UX section**; hardening as **one consolidated story**.

**Epic impact.** Epics 1–3 closed and unaffected — no rollback, no reopened ACs. Two new epics:
- **Epic 4 — v1 Hardening (user-facing slice)** — sequenced first; de-risks before adding surface.
- **Epic 5 — Interactivity Layer** — the parity target.

**Artifact conflicts.**
- **PRD** — additive: mint FR-15–FR-18 + NFR-7; move §6.2 interactivity into §6.1 in-scope.
  Core goals intact; **SM-C1 preserved** (interactivity is frontend-local, adds no install prerequisites).
- **Architecture — LOW impact (headline finding).** The chosen interactivity layer is **almost
  entirely Tier-3 (frontend)**: highlight / search / zoom operate on the already-delivered SVG
  client-side. **No new wire messages, no Lua changes**; the return channel stays dormant (reserved
  for a future v3 bidirectional-sync). Needs one new subsection + two frontend modules.
- **UI/UX — the real new surface.** v1 had no UX spec (only surface was SVG + error overlay). v2
  adds search box, highlight styling, browser keybindings, reset-view. Lightweight UX section added.
- **Other.** Browser-interaction tests are a new (and currently absent) test layer; README needs an
  interactivity section; CI largely unaffected.

**Technical impact.** New frontend modules `frontend/interact.ts`, `frontend/search.ts`; extend
`frontend/viewstate.ts` to drive zoom/pan + `preserve_view`. Config seam (FR-14) gains
`interactive`, `highlight_mode`, `search`. No server/Lua protocol surface added.

## Section 3 — Recommended Approach

**Selected: Direct Adjustment (Option 1 / Hybrid).** Add Epics 4 + 5; existing epics untouched.

- **Effort:** Medium · **Risk:** Low — the architectural seam is pre-built and the work is
  frontend-isolated.
- **Rejected — Rollback (Option 2):** N/A, nothing to revert.
- **Rejected — MVP Review (Option 3):** N/A, v1 MVP shipped intact; this is purely additive.

Rationale: delivers the name's promise (parity) on the lowest-risk path the architecture allows,
while keeping the bidirectional-sync differentiator cleanly deferred behind the still-dormant
return channel.

## Section 4 — Detailed Change Proposals

### A — PRD (`prds/prd-interactive-graphviz.nvim-2026-06-02/prd.md`)
- **A1** New feature group **§4.5 Interactivity** with **FR-15** (zoom/pan & reset, wires
  `preserve_view`), **FR-16** (click-to-highlight neighbors: single/upstream/downstream/bidirectional
  + cluster + multi-select + ESC), **FR-17** (live search: case-sensitive/regex/scope/result-counter),
  **FR-18** (animated transitions, config-gated).
- **A2** §6.2: remove the interactivity bullet from Out-of-Scope; add to §6.1 In-Scope as
  "v2 — Interactivity (FR-15–FR-18)". Bidirectional sync, theme, export, auto-open, extra engines
  **remain** deferred.
- **A3** Add **NFR-7** (interaction responsiveness; frontend-local; preserves NFR-1 / SM-C1).

### B — Architecture (`architecture.md`, after "Render Pipeline")
New subsection **"Interaction Layer (v2 — frontend-local)"**: client-side only; no new wire messages;
return channel stays dormant; new modules `interact.ts` / `search.ts`; `viewstate.ts` extended to
close the `preserve_view` deferred item; config additions on the FR-14 seam.

### C — Epics (`epics.md`)
- **Epic 4 — v1 Hardening**, one story **4.1** (N-tabs idempotency · empty-DOT feedback ·
  `open_cmd` quoted-args · Windows no-orphan verification — closes retro AI#2).
- **Epic 5 — Interactivity Layer**: **5.1** zoom/pan + reset (wires `preserve_view`, FR-15) ·
  **5.2** click-to-highlight (FR-16) · **5.3** live search (FR-17) · **5.4** animated transitions & polish (FR-18).

### D — UX (`planning-artifacts/ux-interactivity-v2.md`, new)
Lightweight: browser keybindings (click=highlight, Shift+click=multi-select, `/`=search, `Esc`=clear,
`0`/`r`=reset), highlight color semantics, search affordances; modeled on reference-extension parity.

### E — Backlog & status bookkeeping
- `deferred-work.md`: annotate the 4 items pulled into Story 4.1 (`→ Epic 4.1`) and `preserve_view`
  (`→ Story 5.1`); leave theoretical/style items as documented debt.
- `sprint-status.yaml`: add `epic-4`, `4-1`, `epic-5`, `5-1`…`5-4` as `backlog`.

## Section 5 — Implementation Handoff

**Scope classification: Moderate** — backlog reorganization + bounded PRD/architecture annotations;
no replan, no rollback.

- **create-story / Developer (Amelia):** apply approved artifact edits (done in this session for
  A–E); then run `create-story` for Story 4.1 first, then Epic 5 stories in order 5.1→5.4.
- **Sequencing:** Epic 4 (hardening) → Epic 5 (5.1 zoom/pan establishes the view-state foundation the
  rest builds on).
- **Success criteria:** (Epic 4) the four user-facing defects are gone and Windows no-orphan is
  verified end-to-end; (Epic 5) a user reaches parity-grade interaction — highlight neighbors, search,
  zoom/pan/reset — entirely client-side with no new install prerequisites (SM-C1 intact).

**Deferred to a future v3 (unchanged):** bidirectional graph↔buffer sync (activates the dormant
return channel), theme integration, export SVG/DOT, auto-open, additional layout engines.
