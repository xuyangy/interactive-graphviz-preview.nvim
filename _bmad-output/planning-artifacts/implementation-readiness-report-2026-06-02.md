---
stepsCompleted: [1, 2, 3, 4, 5, 6]
status: complete
project_name: interactive-graphviz.nvim
date: 2026-06-02
documentsIncluded:
  prd: _bmad-output/planning-artifacts/prds/prd-interactive-graphviz.nvim-2026-06-02/prd.md
  architecture: _bmad-output/planning-artifacts/architecture.md
  epics: _bmad-output/planning-artifacts/epics.md
  ux: null
---

# Implementation Readiness Assessment Report

**Date:** 2026-06-02
**Project:** interactive-graphviz.nvim

## 1. Document Discovery

### Files Selected for Assessment

- PRD: `_bmad-output/planning-artifacts/prds/prd-interactive-graphviz.nvim-2026-06-02/prd.md`
- Architecture: `_bmad-output/planning-artifacts/architecture.md`
- Epics and stories: `_bmad-output/planning-artifacts/epics.md`
- UX design: none found

### Discovery Notes

- No duplicate whole-versus-sharded document conflicts were found.
- No standalone UX design document was found. This is not currently blocking because `epics.md` states that the minimal browser preview UI is specified in the architecture.

## 2. PRD Analysis

### Functional Requirements

FR-1: A user can run `:GraphvizPreview` on a `.dot`/`.gv` buffer to open a Preview in a browser tab rendering that buffer's Graph. The command launches the Server if needed, opens the default browser to the Preview URL, renders the initial Graph without further user action, and is a no-op with an informative message on non-DOT buffers.

FR-2: A user can run `:GraphvizPreviewStop` to end the Preview session. The Server is shut down when no Preview sessions remain, no orphaned process survives, and stopping is idempotent when nothing is running.

FR-3: A user can run `:GraphvizPreviewToggle` to start the Preview if stopped or stop it if running. Toggle behaves as start when no session is running, behaves as stop when a session is running, and never leaves inconsistent state such as double-start or orphaned Server.

FR-4: A user can configure the plugin to auto-open a Preview when a `.dot`/`.gv` file is opened. Default is on, matching the VSCode reference; a config option disables it; when enabled, opening a matching file behaves as if `:GraphvizPreview` was run.

FR-5: The plugin terminates the Server on the last Preview buffer closing and on Neovim exit. After quitting Neovim no Server process remains, and closing the previewed buffer ends its session and frees the browser tab per config.

FR-6: The Frontend renders the Graph from the buffer's DOT source using bundled Graphviz-WASM. Rendering succeeds with no system Graphviz / `dot` installed, and output matches Graphviz semantics for valid DOT.

FR-7: The Preview re-renders when the DOT buffer changes, debounced to coalesce rapid edits. After typing pauses, the Preview reflects the change within the debounce window, default 200 ms and configurable, and rapid consecutive edits do not queue a backlog of renders.

FR-8: A user can choose the Layout engine from `dot`, `neato`, `fdp`, `circo`, `twopi`, `osage`, `patchwork`. Default engine is `dot`; changing the engine re-renders the current Graph; the engine is selectable via plugin command and config, not an in-preview UI control in v1.

FR-9: When the DOT buffer contains a parse/render error, the Preview does not blank the last good Graph and surfaces that an error occurred. A render error preserves the previously rendered Graph in view and informs the user that rendering failed.

FR-10: A user can save the currently rendered Graph as an SVG file. The exported SVG is the currently displayed Graph reflecting the active Layout engine, and the user chooses save location and filename.

FR-11: A user can save the current DOT source via the Preview. The exported DOT matches the buffer's current source.

FR-12: On install, the plugin obtains a Prebuilt binary matching the user's platform. Prebuilt binaries are provided for Linux x64/arm64 and macOS x64/arm64, install requires neither Node nor yarn at runtime, and binary integrity is verified against a published checksum pinned to a release tag.

FR-13: When no Prebuilt binary matches the platform, the plugin can build the Server from source. On uncovered platforms such as Windows, Alpine/musl, or BSD, the source build produces a working Server given Node/yarn present, and the fallback path is documented and discoverable when triggered.

FR-14: A user can configure at least auto-open on/off, default Layout engine, debounce interval, browser open command, and Server bind/port behavior. Documented defaults exist for every option; zero-config works; the Server binds to localhost only by default with LAN exposure as explicit opt-in; config follows idiomatic Neovim `setup{}` / `vim.g` conventions.

Total FRs: 14

### Non-Functional Requirements

NFR-1: Zero external prerequisites. On a supported platform, the plugin runs with no system Graphviz and no Node/yarn at runtime. This is load-bearing for SM-2.

NFR-2: Render responsiveness. After typing pauses, the Preview reflects buffer changes within the debounce window, default 200 ms and configurable; rapid edits are coalesced latest-wins.

NFR-3: Reliability / no orphans. The Server starts on demand and is always cleaned up on stop, last-buffer-close, and Neovim exit. Port conflicts are handled by auto-selecting a free port.

NFR-4: Security / least exposure. The Server binds to localhost only by default; LAN exposure is explicit opt-in. Prebuilt binaries are integrity-verified with checksum and pinned tag.

NFR-5: Portability target. Neovim 0.10+ for stable `vim.system()`; Prebuilt binaries for Linux and macOS x64/arm64; source-build fallback elsewhere.

NFR-6: Render fidelity. The rendered Graph matches Graphviz semantics for valid DOT, with parity against the `d3-graphviz` / WASM reference renderer.

Total NFRs: 6

### Additional Requirements

- The plugin is not a DOT language server and must point users to Tree-sitter `dot` plus `dot-language-server` for language features.
- The plugin is not an in-buffer, terminal, ASCII, formatter, refactoring, or general diagram tool.
- No Windows prebuilt binary is in v1; source-build fallback covers Windows in the interim.
- The render engine is `d3-graphviz` plus `@hpcc-js/wasm`, bundled in the Frontend.
- The Server runtime is shipped as a Prebuilt binary; Node/yarn is needed only for the source-build fallback.
- System Graphviz is not required.
- Open architecture-level decisions in the PRD: render-lock need for large graphs, exact config key shape, and checksum/signing mechanism details.

### PRD Completeness Assessment

The PRD is mostly complete and testable: FRs and NFRs are explicitly numbered, consequences are concrete, and non-goals are clear. The primary readiness risk is scope drift between the PRD and later planning artifacts: the PRD still includes FR-4 auto-open and FR-10/FR-11 export as MVP scope, while downstream architecture and epics appear to have narrowed v1 by dropping auto-open and deferring export. This must be resolved in coverage validation so sprint planning does not inherit contradictory v1 scope.

## 3. Epic Coverage Validation

### Epic FR Coverage Extracted

- FR-1: Covered in Epic 1, especially Story 1.4.
- FR-2: Covered in Epic 1, especially Story 1.7.
- FR-3: Covered in Epic 1, especially Story 1.7.
- FR-5: Covered in Epic 1, especially Stories 1.2 and 1.7.
- FR-6: Covered in Epic 1, especially Story 1.4.
- FR-7: Covered in Epic 1, especially Story 1.5.
- FR-9: Covered in Epic 1, especially Story 1.6.
- FR-8: Covered in Epic 2, especially Story 2.2, but narrowed to `dot` and `neato`.
- FR-14: Covered in Epic 2, especially Story 2.1, but narrowed by removing auto-open configuration.
- FR-12: Covered in Epic 3, especially Stories 3.1 and 3.2.
- FR-13: Covered in Epic 3, especially Story 3.3.

Total FRs claimed in epics: 11

### Coverage Matrix

| FR Number | PRD Requirement | Epic Coverage | Status |
| --- | --- | --- | --- |
| FR-1 | Start preview with `:GraphvizPreview` for `.dot`/`.gv`; non-DOT no-op with message. | Epic 1 / Story 1.4 | Covered |
| FR-2 | Stop preview idempotently; shut down Server when no sessions remain; no orphan. | Epic 1 / Story 1.7 | Covered |
| FR-3 | Toggle preview start/stop without inconsistent state. | Epic 1 / Story 1.7 | Covered |
| FR-4 | Configurable auto-open on `.dot`/`.gv` file open, default on. | Not covered; epics explicitly say dropped from v1. | Missing / scope conflict |
| FR-5 | Terminate Server on last Preview buffer closing and on Neovim exit. | Epic 1 / Stories 1.2 and 1.7 | Covered |
| FR-6 | Render DOT with bundled Graphviz-WASM and no system Graphviz. | Epic 1 / Story 1.4 | Covered |
| FR-7 | Debounced live reload, default 200 ms, latest-wins. | Epic 1 / Story 1.5 | Covered |
| FR-8 | Layout engine selection among `dot`, `neato`, `fdp`, `circo`, `twopi`, `osage`, `patchwork`. | Epic 2 / Story 2.2 covers `dot` and `neato` only. | Partial / scope narrowed |
| FR-9 | Preserve last good graph and surface render errors. | Epic 1 / Story 1.6 | Covered |
| FR-10 | Export currently rendered Graph as SVG. | Not covered; epics explicitly say deferred to Tier 3. | Missing / scope conflict |
| FR-11 | Export current DOT source via Preview. | Not covered; epics explicitly say deferred to Tier 3. | Missing / scope conflict |
| FR-12 | Prebuilt binary install for Linux/macOS x64/arm64, no runtime Node/yarn, checksum pinned to release tag. | Epic 3 / Stories 3.1 and 3.2 | Covered |
| FR-13 | Build-from-source fallback for uncovered platforms, documented and discoverable. | Epic 3 / Story 3.3 | Covered |
| FR-14 | Configure auto-open, default layout engine, debounce interval, browser command, and Server bind/port behavior. | Epic 2 / Story 2.1 covers config except auto-open. | Partial / scope narrowed |

### Missing Requirements

#### Critical Missing FRs

FR-4: Configurable auto-open on DOT file open.
- Impact: If the PRD remains authoritative, v1 implementation will miss a declared lifecycle behavior and a config option.
- Recommendation: Either update the PRD to mark FR-4 as deferred, or add an Epic 2 story/acceptance criteria for auto-open and `auto_open` config. Because architecture and epics both explicitly dropped this from v1, the cleaner fix is to update the PRD.

FR-10: Export SVG.
- Impact: If the PRD remains authoritative, v1 will miss a declared user journey outcome from UJ-1.
- Recommendation: Either update the PRD to defer export, or add an export story. Because architecture and epics explicitly defer export, the cleaner fix is to update the PRD and put export into a later epic.

FR-11: Export DOT.
- Impact: If the PRD remains authoritative, v1 will miss a declared Preview-based export path.
- Recommendation: Either update the PRD to defer export, or add an export story. Given the v1 focus, deferring this in the PRD is the lower-risk alignment fix.

#### High Priority Partial Coverage

FR-8: PRD lists seven engines; epics implement only `dot` and `neato`.
- Impact: Users expecting all PRD-listed engines in v1 will see an implementation shortfall.
- Recommendation: Update PRD v1 wording to `dot` and `neato`, with the full engine list deferred, or expand Story 2.2 acceptance criteria to all seven.

FR-14: PRD includes auto-open configuration; epics do not.
- Impact: Same root conflict as FR-4; configuration docs and implementation may disagree.
- Recommendation: Align PRD with the architecture's command-only v1 start model, or restore auto-open in epics.

### Coverage Statistics

- Total PRD FRs: 14
- FRs fully covered exactly as written: 9
- FRs partially covered or intentionally narrowed: 2
- FRs missing from v1 epics: 3
- Exact PRD coverage percentage: 64.3%
- Refined v1 coverage claimed by epics: 11/11, 100%

### Coverage Assessment

The epics are internally coherent for the refined v1 scope, but the PRD is no longer aligned with that refined scope. Implementation should not proceed to sprint planning until the PRD is either updated to reflect the locked architecture scope, or the epics are expanded to restore FR-4, FR-10, FR-11, full FR-8 engine coverage, and FR-14 auto-open configuration.

## 4. UX Alignment Assessment

### UX Document Status

Not found. No whole or sharded UX design document exists under `_bmad-output/planning-artifacts`.

### UX/UI Implied by Existing Documents

UX is implied, but narrow:

- The primary user-facing surface is a browser Preview opened from Neovim.
- The Preview renders SVG output, updates live, preserves last good render on errors, and shows a visible non-blocking error overlay.
- Best-effort zoom/pan state preservation is specified in architecture and epics.
- Engine selection and other controls are deliberately Neovim command/config surfaces, not in-preview controls for v1.

### Alignment Issues

- The refined v1 architecture and epics agree that there is no separate UX document and that the minimal browser-side UI is specified in the architecture render pipeline.
- The architecture supports the UX needs it names: browser tab launch, error overlay, last-good render preservation, zoom/pan state preservation, and browser e2e coverage for render/error/stale-guard behavior.
- The PRD still includes export and auto-open as MVP UX behaviors, while architecture and epics remove/defer them. This is the same scope conflict identified in Step 3 and should be resolved before implementation planning.

### Warnings

- Missing UX documentation is acceptable for the refined v1 only because the browser UI is minimal and explicitly specified in architecture. If v1 restores export, auto-open, in-preview controls, search, click interactions, or bidirectional sync, a UX pass should be added before sprint planning.
- The visible error overlay acceptance criteria do not define exact copy, severity styling, or placement. This is probably acceptable for v1, but the first implementation story should keep it non-blocking and test-visible.

## 5. Epic Quality Review

### Epic Structure Validation

Epic 1, Live Graphviz Preview:
- User value: strong. A user can open a DOT buffer and get a live browser preview.
- Independence: strong. It stands alone as a usable development-mode plugin before layout customization and distribution work.
- Concern: Story 1.1 is a broad scaffold story, but this is acceptable for a greenfield project if treated as a setup/harness story and kept to stubs plus green test harness.

Epic 2, Layout Engines & Configuration:
- User value: strong enough. Users can configure behavior and switch `dot`/`neato`.
- Independence: valid dependency on Epic 1 only.
- Concern: Epic 2 intentionally implements a narrowed FR-8/FR-14 scope versus the PRD.

Epic 3, Zero-Prerequisite Installation & Distribution:
- User value: strong. A clean install works without runtime tooling.
- Independence: valid dependency on Epic 1; Epic 2 is not strictly required for Epic 3, but ordering after Epic 2 does not create a forward dependency.
- Concern: Story 3.1 is maintainer-facing, but it directly enables user-facing installation and is acceptable in a distribution epic.

### Story Quality Assessment

Stories are generally single-outcome, sequential, and testable. No story depends on future stories. Acceptance criteria mostly use Given/When/Then and include relevant error/security cases.

#### Critical Violations

None found in epic/story structure.

#### Major Issues

1. Story 1.1 may be oversized if interpreted as full implementation rather than scaffold.
   - Evidence: it includes Lua plugin load, Bun server source run, frontend bundle, canonical protocol files, and CI running Stylua/busted/Bun tests.
   - Impact: Could become a multi-day setup story that delays the first demonstrable preview path.
   - Recommendation: Keep Story 1.1 strictly to stubs, harness, and smoke tests. Move any real protocol behavior into Story 1.3 and real rendering into Story 1.4.

2. Story 1.6 assumes the user can zoom/pan, but v1 otherwise treats zoom/pan UI as deferred or best-effort.
   - Evidence: Story 1.6 includes "Given the user has zoomed/panned the graph" and config-gated `preserve_view`; architecture calls zoom/pan preservation best-effort and says zoom/pan UI itself remains v2.
   - Impact: Implementation may accidentally grow interactive UI scope or fail an ambiguous acceptance criterion.
   - Recommendation: Clarify that preservation applies only if the renderer/library exposes zoom/pan in v1, or move the zoom/pan preservation AC to a nice-to-have/non-blocking criterion.

3. PRD versus epic scope conflict should be resolved before sprint planning.
   - Evidence: FR-4, FR-10, FR-11 are PRD MVP items but explicitly excluded from epics; FR-8 and FR-14 are narrowed.
   - Impact: Sprint planning may choose the epics as source of truth while stakeholders still expect the PRD MVP.
   - Recommendation: Update the PRD to match the refined architecture and epics, or expand the epics to match the PRD.

#### Minor Concerns

1. Story 1.2 has a technical-heavy acceptance set.
   - This is justified because no-orphan supervision is load-bearing, but it should still produce an observable user/system outcome: one server starts, announces readiness, and dies after parent EOF.

2. Error overlay details are testable but visually underspecified.
   - The story requires a visible non-blocking message, but does not define location/copy. This is acceptable for a minimal v1 if Playwright asserts visibility without over-constraining design.

3. Epic 3 can likely be implemented after Epic 1 without waiting for Epic 2.
   - This is not a structural violation, but sprint planning can choose to start distribution earlier if zero-prerequisite install is higher priority than layout/config.

### Dependency Analysis

- Epic 1 has a valid sequence: scaffold -> supervision -> protocol/relay -> first render -> live reload -> error resilience -> cleanup.
- Epic 2 depends on Epic 1 output and has no dependency on Epic 3.
- Epic 3 depends on a working server/frontend from Epic 1 and has no forward dependency.
- No circular dependencies found.
- No database/entity creation concerns apply.

### Best Practices Compliance Checklist

| Area | Result |
| --- | --- |
| Epics deliver user value | Pass |
| Epics can function independently in sequence | Pass |
| Stories appropriately sized | Mostly pass; Story 1.1 is borderline oversized |
| No forward dependencies | Pass |
| Database tables created when needed | Not applicable |
| Clear acceptance criteria | Pass with minor UX-detail caveats |
| Traceability to FRs maintained | Structurally pass for refined v1; blocked by PRD/epic scope conflict |

## 6. Summary and Recommendations

### Overall Readiness Status

NEEDS WORK before sprint planning.

The refined v1 implementation plan is coherent, but the planning artifacts are not aligned. The epics and architecture define a narrower v1 than the PRD: auto-open is dropped, export is deferred, engine support is narrowed to `dot`/`neato`, and auto-open configuration is removed. That is a source-of-truth problem. Do not proceed to sprint planning until the PRD is corrected or the epics are expanded.

### Critical Issues Requiring Immediate Action

1. PRD/epic scope conflict:
   - PRD includes FR-4 auto-open, FR-10 SVG export, and FR-11 DOT export as MVP scope.
   - Epics explicitly exclude those from v1.
   - PRD FR-8 lists seven engines, while epics implement `dot` and `neato`.
   - PRD FR-14 includes auto-open config, while epics omit it.

2. Story 1.1 sizing risk:
   - The scaffold story is acceptable only if it remains stubs plus harness.
   - If treated as real implementation across Lua, server, frontend, protocol, and CI, it becomes too large.

3. Story 1.6 zoom/pan ambiguity:
   - The story assumes zoom/pan exists, while architecture treats zoom/pan UI as deferred/best-effort.
   - Clarify whether this is blocking acceptance or a non-blocking nicety.

### Recommended Next Steps

1. Update the PRD to match the refined v1 scope from architecture and epics:
   - Mark FR-4 auto-open as deferred.
   - Mark FR-10/FR-11 export as deferred.
   - Narrow FR-8 v1 engines to `dot` and `neato`; keep the full list as future expansion.
   - Remove auto-open from FR-14 v1 config.

2. Add a short PRD addendum or decision note explaining that architecture locked a smaller v1 scope on 2026-06-02.

3. Tighten Story 1.1 wording so it explicitly creates stubs, harnesses, smoke tests, and CI wiring only.

4. Clarify Story 1.6 `preserve_view` acceptance:
   - Either make zoom/pan preservation conditional/non-blocking in v1.
   - Or explicitly include basic renderer-provided zoom/pan as v1 behavior.

5. Re-run implementation readiness after the PRD alignment edit. If the scope conflict is resolved, the likely next workflow is sprint planning.

### Final Note

This assessment identified 5 issues across 3 categories: artifact scope alignment, story sizing, and UX/interaction ambiguity. The epic structure is otherwise usable and well sequenced. The cleanest path is to align the PRD to the architecture/epics rather than expand v1 scope.

Assessor: Codex using `bmad-check-implementation-readiness`.
