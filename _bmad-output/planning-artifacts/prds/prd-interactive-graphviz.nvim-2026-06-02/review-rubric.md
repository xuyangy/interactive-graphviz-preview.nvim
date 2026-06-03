# PRD Quality Review — interactive-graphviz.nvim

## Overall verdict

This is a strong, well-calibrated capability spec for a solo/hobby dev-tool: it has a clear thesis (port a proven VSCode experience to Neovim with zero-prerequisite install, then chase a bidirectional-sync differentiator), honest scope boundaries, and FRs that mostly carry testable consequences. The split of mechanism detail into `addendum.md` keeps the PRD at the right altitude for a chain-top doc feeding architecture and stories. The main soft spots are a handful of FRs left bare of consequences (FR-3, FR-10) and NFR thresholds that stay adjectival ("short debounce window," "within a moment") rather than naming even a loose default — acceptable for a hobby tool but the one place downstream story-writers will have to invent the bound themselves. Gate: PASS.

## Decision-readiness — strong

Decisions are stated as decisions, not hedged. Auto-open defaulting **on** (FR-4) is committed with a rationale (matches the reference); WASM-only render with no system-`dot` hybrid is a named choice with the trade-off surfaced (large-graph performance deferred, §6.2). The counter-metric SM-C1 is the clearest signal of real decision-making: it explicitly forbids the tempting move (adding render paths/prerequisites to win benchmarks) and ties it to the install-simplicity thesis. The `[NOTE FOR PM]` on the interactivity layer (§6.2) sits at a genuine tension — "the interactive promise in the name… emotionally load-bearing" — not a safe checkpoint.

Open Questions (§8) are honestly scoped down to architecture-level detail, and the doc says so up front rather than padding the list with rhetorical questions. A decision-maker (the author himself) can act on this today.

## Substance over theater — strong

No persona theater: two UJs with named protagonists (Sam, Dana), each driving a distinct JTBD (author-while-writing vs. read-remote-generated), and no surplus personas to look thorough. The Vision is product-specific — it names the actual reference being ported, the actual constraint (Neovim has no webview), and the actual reframing ("visual parity is a porting problem, not a research problem"). It could not swap into another PRD.

NFRs mostly avoid boilerplate: NFR-1 (zero prerequisites) and NFR-4 (localhost-only bind) are product-specific and load-bearing. NFR-2 (render responsiveness) is the one that leans adjectival — see Done-ness. The differentiator claim (bidirectional sync) is honestly hedged as a north star, deferred, not oversold as v1 novelty.

## Strategic coherence — strong

There is a clear thesis and the features follow from it. The arc is explicit: v1 = render + live reload + zero-prereq install (parity floor); v2 = interactivity layer (parity with reference); north star = bidirectional graph↔buffer sync (differentiator neither reference ships). Prioritization follows the thesis, not ease — the hard, identity-defining "interactive" features are deferred precisely because the install-simplicity + live-reload core is what proves the bet first.

Success Metrics validate the thesis rather than measuring activity: SM-1 (author doesn't abandon it), SM-2 (clean zero-prereq install works), SM-3 (ecosystem-gap adoption signal). No DAU/MAU vanity metrics — correct for a hobby plugin. A counter-metric (SM-C1) is present and named. MVP scope kind is coherently "problem-solving / capability" and the scope logic matches.

## Done-ness clarity — adequate

Most FRs carry a "Consequences (testable)" block with verifiable conditions (FR-1, FR-2, FR-4, FR-6, FR-7, FR-8, FR-9, FR-12, FR-13, FR-14 all do, and several are genuinely good — e.g., FR-2 "no orphaned process survives," FR-7 "latest-wins, no backlog"). This is above the bar for a hobby tool. But there are real gaps an engineer will hit:

- **FR-3 (Toggle)** and **FR-10 (Export SVG)** have no consequences block at all. FR-10's testability is partly rescued by FR-11's shared block ("exported SVG is the live-rendered Graph"), but FR-3 is bare.
- The debounce/responsiveness bound is adjectival throughout: "within a moment of each pause" (UJ-1), "a short debounce window" (FR-7), "a small, configurable debounce window" (NFR-2). The doc explicitly defers the default value to Open Question 1, which is a defensible choice — but it means no FR currently states a number an engineer or test can check. For a hobby tool this is acceptable; flag it so story-writers know they must pick a default, not infer one.

### Findings
- **medium** FR-3 has no testable consequences (§4.1 FR-3) — Toggle's behavior (start-if-stopped / stop-if-running, idempotency) is only implied. *Fix:* add a one-line Consequences block, e.g. "Toggling from stopped starts a Preview; toggling from running stops it; no error in either state."
- **low** FR-10 lacks its own Consequences block (§4.3 FR-10) — relies on FR-11's shared block. *Fix:* either move the shared consequence under FR-10 or note explicitly that FR-10–FR-11 share consequences.
- **low** Render-responsiveness bound stays adjectival (§UJ-1, §FR-7, §NFR-2; default deferred to §8 Q1) — no concrete debounce default anywhere. *Fix:* either state a loose default (e.g., "~150–300ms") as the starting point or add `[NOTE FOR PM]` that the default is a required architecture decision, not an inferable one.

## Scope honesty — strong

This is the document's best dimension. The Non-Goals section (§5) does real work: not a language server, not a terminal renderer, not an editor/formatter, not a general diagram tool, no Windows prebuilt in v1 — each omission is the kind a reader could otherwise silently assume, and each is stated. §6.2 Out-of-Scope is honest about the emotionally hard cut (the interactivity layer that the name "interactive" advertises) and flags it with a `[NOTE FOR PM]` rather than burying it.

The Assumptions Index (§9) roundtrips cleanly: four assumptions, each tied to a §/FR, each marked Resolved with the author on a dated session. Open-items density is low and appropriate for the stakes — three architecture-level Open Questions, four resolved assumptions, one live `[NOTE FOR PM]`. Nothing is de-scoped silently. The non-user segments (§2.2) are named, including the partial exclusion (uncovered-platform users who must source-build).

## Downstream usability — adequate

Glossary (§3) is present and domain nouns are used consistently (Preview, Server, Frontend, Layout engine, Prebuilt binary all capitalized and used identically across FRs, UJs, NFRs). FR IDs are contiguous FR-1…FR-14, unique, no gaps. SM IDs (SM-1..3, SM-C1) and UJ IDs (UJ-1, UJ-2) are clean. Cross-references resolve — SM-1 cites FR-1/6/7, NFRs back-reference FRs, features name which UJs they realize. UJs each have a named protagonist carrying context inline. The PRD/addendum split is clean and the addendum is correctly scoped to mechanism.

Minor downstream friction: a few FR consequences reference "see NFRs" / "default configurable" without a value (FR-7), so a story-writer extracting FR-7 alone gets a dangling bound — but the Glossary-term discipline otherwise makes sections extractable. NFRs are numbered and cross-referenced, which helps architecture source-extract.

### Findings
- **low** FR-7 consequence points to "see NFRs" for the debounce default, but NFR-2 also gives no number (§4.2 FR-7 → §NFR-2) — the cross-ref resolves to another adjective. *Fix:* land a default value in one place once Open Question 1 is decided.

## Shape fit — strong

Correctly shaped as a solo dev-tool capability spec with light UJ formalization. Two UJs is exactly right — enough to anchor the two real usage modes (author / read-remote) without over-formalizing a single-developer plugin. It is not over-formalized (no persona matrices, no invented stakeholders) and not under-formalized (the two journeys that matter have named protagonists and climax/edge-case beats). Rigor is appropriately light while the substance bar is met. As a chain-top PRD, it correctly pushes mechanism to the addendum and keeps capability-level statements in the PRD, which is what architecture and story workflows need.

## Mechanical notes

- **Glossary drift:** None material. Domain nouns (Preview, Preview session, Server, Frontend, Layout engine, Live reload, Prebuilt binary, Build-from-source fallback) are capitalized and used consistently. Minor: "Graph" is sometimes lowercase in prose ("the graph render," Vision §1) vs. the defined capitalized "Graph" — cosmetic only.
- **ID continuity:** FR-1…FR-14 contiguous, unique, no gaps or duplicates. NFR-1…NFR-6, SM-1..3 + SM-C1, UJ-1..2 all clean. All cross-references (FRs cited in SMs/NFRs/features) resolve.
- **Assumptions Index roundtrip:** Four `[ASSUMPTION]`-class entries in §9, each mapped to a §/FR (FR-4, FR-8, FR-12, FR-14) and each Resolved. No orphan index entries; the inline assumptions are reflected in the FR text. Clean roundtrip.
- **UJ protagonist naming:** Both UJs have named protagonists (Sam, Dana) with role/context inline. No floating UJs.
- **Required sections:** All present for the stakes — Vision, Target User/JTBD/UJs, Glossary, Features+FRs, Non-Goals, MVP Scope, Success Metrics, Open Questions, Assumptions Index, Cross-Cutting NFRs, Dependency/Runtime Targets. Nothing missing for a hobby chain-top PRD.
