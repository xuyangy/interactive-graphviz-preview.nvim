---
title: 'View toolbar: save-as-SVG download button'
type: 'feature'
created: '2026-07-03'
status: 'done'
baseline_commit: 'ed77c3e0c1d810b8a8687fc5789c6cb6398f2404'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The rendered graph can only be viewed in the browser — there is no way to save it as a file for sharing, docs, or offline use.

**Approach:** Add a fourth button to the existing view toolbar (`installViewToolbar`, shipped `ed77c3e`): a download icon that serializes the live rendered SVG in `#app` (what is actually drawn — no re-render) and triggers a browser download named `graph.svg`. Silent no-op before the first render, mirroring the other buttons' guards. Document it in the README toolbar row and the vimdoc view-controls subsection.

## Boundaries & Constraints

**Always:**
- Touch ONLY: `frontend/render.ts` (serialize + save + button), `frontend/render.dom.test.ts` (tests), `README.md`, `doc/interactive-graphviz.txt`.
- Serialize the LIVE `#app` SVG via `XMLSerializer` on a **clone** — never mutate the on-screen SVG.
- The exported file must be a clean standalone graph: strip the plugin's transient emphasis classes (`ig-selected`, `ig-neighbor`, `ig-dimmed`, `ig-cursor`, and any other `ig-*`) from the clone (their stylesheet lives in `<head>` and does not ship with the file), keep Graphviz's own classes (`node`, `edge`, `graph`, `cluster`), prepend an XML prolog, and guard the root namespaces — if the serialized `<svg>` lacks `xmlns` or `xmlns:xlink`, inject them (the proven pattern from vscode-interactive-graphviz's `content/save.js`).
- Download via Blob + `URL.createObjectURL` + a temporary `<a download="graph.svg">` click, then `revokeObjectURL` — zero new dependencies.
- Split for testability: an exported `serializeGraphSvg(): string | null` (DOM-read + clean + serialize; null when no SVG) and a `saveGraphSvg()` wrapper that does the Blob/anchor dance — mirroring the pure/DOM split used elsewhere in render.ts.
- The button follows the established idiom exactly: same `addButton` helper, inline SVG icon (`currentColor`, `aria-hidden`, 16px, hand-drawn download glyph consistent with the existing three), tooltip + matching `aria-label`, guarded no-throw handler.
- WYSIWYG transform: the current zoom/pan transform serializes as-is (the pre-zoom baseline is not recoverable from the DOM without d3 internals). The docs must say the graph is saved "as currently rendered".

**Ask First:**
- Any scheme to un-bake the zoom transform (resetting zoom before save, reading d3-graphviz private fields, or capturing per-render baselines) — adds coupling; out of scope unless the human asks.
- Embedding the highlight stylesheet instead of stripping classes (i.e. exporting the emphasized view).
- Any new Lua config key, command, or wire surface (e.g. a `:GraphvizExport` command).

**Never:**
- Do not re-render, re-layout, or touch the WASM path to produce the export.
- Do not modify the live SVG, the existing three buttons, or their handlers.
- Do not add PNG/PDF export — SVG only.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Save after render | Graph rendered | `graph.svg` downloads; content contains the drawn nodes/edges + XML prolog | N/A |
| Save while highlight/emphasis active | Node clicked / cursor emphasis on | Exported SVG has NO `ig-*` classes; on-screen SVG keeps them (clone untouched original) | N/A |
| Save before first render | Fresh page, `#app` empty | Silent no-op, no download, no throw | null-guard + try/catch |
| Save while error overlay shows | Last good render on screen | The last good graph exports (overlay lives outside `#app`) | N/A |
| Save after zoom/pan | User zoomed in | Current transform serializes as-is (WYSIWYG; documented) | N/A |
| Repeated saves | Two clicks | Two downloads; object URL revoked after each (no leak) | N/A |

</frozen-after-approval>

## Code Map

- `frontend/render.ts:415-455` — `installViewToolbar` + `addButton` helper: the fourth button slots in after zoom-out; `mousedown` preventDefault and styling come free
- `frontend/render.ts:365-390` — the three `ICON_*` constants: the pattern for the new `ICON_DOWNLOAD` (inline, `currentColor`, `aria-hidden`, 16px)
- `frontend/render.ts:396-410` — `zoomBy`: the guarded no-throw handler shape to mirror
- `frontend/render.ts:355-360` — highlight class names to strip are the `ig-*` family (see `applyHighlightToDom` / `applyCursorEmphasis` usages)
- `frontend/render.dom.test.ts:493` — the `describe("view toolbar…")` block to extend; `FIXTURE_SVG` in `#app` via `setupApp()` is the serialization fixture
- `README.md:92` — the toolbar row in the gesture table to extend with the download button
- `doc/interactive-graphviz.txt:52-58` — the `*interactive-graphviz-view-controls*` subsection to extend

## Tasks & Acceptance

**Execution:**
- [x] `frontend/render.ts` — add `ICON_DOWNLOAD` (hand-drawn download glyph: down-arrow into a tray, stroke/fill style consistent with the existing icons); add `serializeGraphSvg(): string | null` (query `#app svg`; null if absent; deep-clone; remove all `ig-*` classes from every element's classList, dropping empty `class` attrs; serialize with `XMLSerializer`; inject `xmlns`/`xmlns:xlink` on the root if missing, per vscode-interactive-graphviz `content/save.js`; prepend `<?xml version="1.0" encoding="UTF-8"?>\n`); add `saveGraphSvg()` (guarded try/catch: serialize → Blob `image/svg+xml` → objectURL → temp anchor `download="graph.svg"` click → revoke); add the fourth `addButton(ICON_DOWNLOAD, "Save as SVG", () => saveGraphSvg())` in `installViewToolbar`
- [x] `frontend/render.dom.test.ts` — extend the toolbar describe: button count becomes 4 with the new tooltip present; `serializeGraphSvg` returns null on empty `#app`; with the fixture + an active click-highlight and cursor emphasis, the serialized output contains the node titles, the XML prolog, and an `xmlns="http://www.w3.org/2000/svg"` root declaration (the fixture SVG omits it — exercising the namespace guard) but NO `ig-` substring, while the live SVG still has its `ig-*` classes; clicking the save button pre-render does not throw
- [x] `README.md` — extend the toolbar row: home / zoom / save-as-SVG (saved as currently rendered)
- [x] `doc/interactive-graphviz.txt` — extend the view-controls subsection with the download button (saves `graph.svg`, as currently rendered); regenerate helptags

**Acceptance Criteria:**
- Given a rendered graph with an active highlight, when the save button is clicked, then the downloaded SVG contains the graph content with no `ig-*` classes and the on-screen SVG is unchanged
- Given a fresh preview before any render, when the save button is clicked, then nothing downloads and nothing throws
- Given the full frontend suite, when `bun test` runs in `frontend/`, then all pre-existing tests pass and the new tests are green
- Given the README and vimdoc, when read after this change, then the save button is documented in both, including the "as currently rendered" behavior

## Spec Change Log

## Verification

**Commands:**
- `bun test --cwd /Users/xuyangy/trash/git/interactive-graphviz.nvim/frontend` — expected: 0 failures, extended toolbar tests green

**Manual checks (if no CLI):**
- Open a preview, click the download button: `graph.svg` lands in Downloads and opens standalone in a browser/viewer showing the full drawn graph; click a node first and re-save: the exported file shows no emphasis styling
