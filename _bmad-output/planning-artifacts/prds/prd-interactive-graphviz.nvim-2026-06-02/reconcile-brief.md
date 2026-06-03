# Brief → PRD Reconciliation — interactive-graphviz.nvim

Source: `briefs/brief-interactive-graphviz.nvim-2026-06-02/brief.md`
Target: `prds/prd-interactive-graphviz.nvim-2026-06-02/prd.md` (+ `addendum.md`)
Date: 2026-06-02

This reconciliation walks the brief section by section and checks whether each idea — functional
and qualitative — survived into the PRD or addendum. Functional coverage is strong. The notable
losses are qualitative: positioning framing, the "honest moat" candor, and some emotional/tone
language that a FR structure tends to flatten.

---

## A. Functional content — well captured

| Brief idea | PRD location | Verdict |
|---|---|---|
| Browser-tab live preview via `d3-graphviz` + Graphviz-WASM | FR-6, §1, Glossary, Dependency Targets | Captured |
| Update-as-you-type (debounced) | FR-7, NFR-2 | Captured |
| Auto-open on `.dot`/`.gv` (configurable, default on) | FR-4, §9 | Captured + sharpened (default explicitly "on") |
| Layout-engine selection (7 engines) | FR-8, Glossary, addendum | Captured (full engine list preserved) |
| Commands `:GraphvizPreview` / `Stop` / `Toggle` | FR-1, FR-2, FR-3 | Captured |
| Export SVG / DOT | FR-10, FR-11 | Captured |
| Cross-platform prebuilt server, no Node/yarn at runtime | FR-12, FR-13, NFR-1, NFR-5 | Captured + sharpened (named platforms, checksum, tag-pin) |
| v2 interactivity (highlight neighbors, multi-select, zoom/pan, search, animation) | §6.2 | Captured as out-of-scope/deferred |
| Deferred bidirectional sync, theme integration | §6.2 | Captured as deferred |
| Out-of-scope language features → Tree-sitter + dot-language-server | §2.2, §5, addendum §"Recommended-companions" | Captured |
| markdown-preview.nvim architecture (RPC/WS/server lifecycle) | addendum (whole doc) | Captured (correctly routed out of capability PRD) |

The PRD also *adds* value the brief did not specify (UJ-1/UJ-2 journeys, NFR-3 no-orphans,
NFR-4 localhost-only security, syntax-error resilience FR-9). These are enrichments, not gaps.

---

## B. Gaps — qualitative / positioning ideas the PRD dropped or softened

### Gap 1 — "Honest moat assessment" candor is gone (real omission, intentional-feeling but worth flagging)
**Brief** (§What Makes This Different, lines 76–78):
> "Honest moat assessment: there is no deep technical moat — the renderer is open and the pattern
> is known. The advantage is **being first and well-integrated in the Neovim ecosystem**, plus the
> bidirectional-sync vision as a follow-on hook."

**PRD:** The "first + well-integrated" advantage survives implicitly via SM-3 and the Vision, but
the explicit, candid "no deep technical moat" framing is dropped entirely. Nothing in the PRD or
addendum states the strategic honesty that this competes on *integration polish and being first*,
not defensibility.
**Verdict:** Real omission of a strategic-positioning statement. Low functional impact (a PRD
arguably need not carry moat candor), but it is a deliberate authorial stance that was silently
lost. Worth a one-line note in Vision or a strategy section.

### Gap 2 — "Parity without reinvention / competes on integration polish" framing softened (partial)
**Brief** (lines 67–69):
> "Parity without reinvention. By reusing the exact renderer ... the project removes the risk from
> the hard parts and **competes on integration polish**."

**PRD:** §1 captures the "porting-and-integration problem rather than a research problem" half well.
But the positioning verb — that the product's competitive basis is *integration polish* — is not
stated as positioning anywhere. It reads as a technical fact in the PRD, not as the product's angle.
**Verdict:** Partial distortion — the technical claim survived, the positioning intent thinned.

### Gap 3 — "Reach for it instead of the alt-tab workflow" emotional adoption signal is narrowed (minor)
**Brief** (Success Criteria, lines 95–97):
> "the plugin is usable enough that you (and early users) reach for it instead of the alt-tab
> workflow — and it gets installed/starred by Neovim users seeking the VSCode extension's equivalent."

**PRD:** SM-1 captures "author uses it in place of the alt-tab/manual-`dot` workflow and does not
abandon it"; SM-3 captures the install/star signal. So this is mostly captured. The mild loss is
the **"early users"** dimension of SM-1 (PRD's SM-1 narrows to "the author"; the brief explicitly
included early users reaching for it). Early-user adoption now lives only in SM-3's star/install
proxy, not as a behavioral "reach for it" metric.
**Verdict:** Minor narrowing, not a true omission.

### Gap 4 — Bidirectional sync as "north star" / "more interactive than the original" — emotional weight preserved but reframed (minor, good)
**Brief** (lines 70–74, 137–141):
> "The differentiator nobody shipped ... would make this *more* interactive than the original.
> (Deferred, but it is the north star.)" and the Vision's "navigation surface for the source."

**PRD:** §1 keeps "a differentiator neither reference fully ships"; §6.2 keeps "the differentiator
north star." The Vision's poetic "passive picture → navigation surface" framing is *not* carried
into the PRD's §1 Vision (which ends at "bidirectional sync between the rendered graph and the
buffer"). The vivid metaphor is lost, though the substance survives.
**Verdict:** Minor tone loss; substance intact.

### Gap 5 — "Inspect tool-generated DOT" + longer-term "preview DOT emitted by other tools" vision (partial)
**Brief** Vision (lines 139–141):
> "Longer term, the same bridge could preview DOT emitted by other tools (build systems, profilers,
> dependency analyzers) directly from within the editor."

**PRD:** The *present-tense* "read/inspect tool-generated DOT" job is well captured (JTBD §2.1,
UJ-2 with the build-tool `deps.dot` example). But the **forward-looking** "same bridge could
preview DOT from build systems / profilers / dependency analyzers" longer-term vision is **not**
carried into PRD §1 Vision. The PRD's Vision arc stops at bidirectional sync.
**Verdict:** Real omission of a longer-horizon vision statement (correctly *not* a v1 requirement,
but it was a stated vision the PRD's Vision section dropped).

---

## C. Audience / scope nuances

### Note 1 — "intentionally broad" audience framing (captured, reframed)
**Brief** (Who This Serves, lines 82–88): primary audience "intentionally broad — anyone who touches
DOT"; secondary "terminal-first developers on remote/SSH/tmux."
**PRD:** JTBD §2.1 and the personas (Sam, Dana-over-SSH UJ-2) capture both segments concretely. The
explicit "intentionally broad" qualifier is gone, but the breadth is demonstrated by example rather
than asserted. Acceptable reframe, not a gap.

### Note 2 — "borrows the proven architecture" risk-reduction framing (captured in addendum)
Brief's architecture narrative (lines 19–23, 57–61) is fully and correctly relocated to `addendum.md`,
consistent with the PRD's stated split (capabilities here, mechanism there). No loss.

### Note 3 — Counter-metric is a PRD *addition*, well-aligned
SM-C1 ("do not chase feature breadth at the cost of install simplicity") has no direct brief
sentence but faithfully operationalizes the brief's "deliberately small first release" intent
(lines 25–27). Good enrichment.

---

## D. Summary of verdicts

- **Real omissions (qualitative/positioning):**
  1. "Honest moat / no deep technical moat" candor (Gap 1).
  2. "Competes on integration polish" as positioning (Gap 2, partial).
  3. Longer-term "preview DOT from build systems / profilers / dependency analyzers" vision (Gap 5).
- **Minor tone/scope narrowing (substance intact):** early-user "reach for it" signal (Gap 3),
  "passive picture → navigation surface" metaphor (Gap 4).
- **Correctly out of scope / correctly relocated:** architecture detail → addendum; language
  features → non-goals; v2/deferred features → §6.2.
- **No functional requirement from the brief was dropped.**

**Recommendation:** Add one or two sentences to PRD §1 Vision (or a short "Positioning" note) to
restore: (a) the moat honesty + "first and well-integrated / integration polish" angle, and (b) the
longer-term "preview DOT from other tools" horizon. These are the only material losses; everything
else is faithful or an intentional structural relocation.
