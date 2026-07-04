---
title: 'View toolbar: save-as-interactive-HTML export button'
type: 'feature'
created: '2026-07-04'
status: 'in-review'
baseline_commit: 'b669ae1'
context: ['spec-preview-save-svg-button.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The SVG export (shipped v0.4.0) is a static snapshot — none of the preview's interactivity (zoom/pan, click-highlight, `/` search) survives it. Sharing a large graph as SVG loses exactly what makes the preview useful.

**Approach:** Add a fifth button to the view toolbar that downloads a single self-contained `graph.html`. The file embeds (1) the last-rendered DOT + engine + the preview's config query string as a JSON payload, and (2) the app's own JS bundle inline. On open, the bundle detects the embedded payload ("static export mode"), re-renders the graph locally via the already-bundled WASM engine, and skips the WebSocket entirely — zoom, highlight, search, the toolbar, and the SVG export all work offline because they are the same code. This is viable precisely because the release build is two files (a 333-byte skeleton + one self-contained bundle) and every stylesheet is JS-injected.

## Boundaries & Constraints

**Always:**
- Touch ONLY: `frontend/render.ts` (assembly + save + button + static-mode helpers), `frontend/main.ts` (static-mode boot branch), `frontend/render.dom.test.ts` (tests), `README.md`, `doc/interactive-graphviz.txt`.
- Source of truth for the export is the existing `lastGoodDot` / `lastGoodEngine` stash (set on the per-render success boundary) — do NOT add a parallel stash and do NOT serialize the live SVG.
- Split for testability, mirroring `serializeGraphSvg`/`saveGraphSvg`: a pure exported `assembleInteractiveHtml(bundleSource: string, payload: ExportPayload): string` (string assembly + escaping; no DOM, no fetch) and an async `saveInteractiveHtml(): Promise<void>` wrapper (guards → fetch own bundle → assemble → Blob/anchor download as `graph.html`).
- Escaping is correctness-critical (script-content parsing): the JSON payload embeds with every `<` escaped as `<` (bulletproof inside a JS string); the bundle source embeds with `</script` (case-insensitive) escaped as `<\/script` — the standard inline-bundle trick, valid because that sequence can only occur inside JS strings/regex/comments.
- The payload rides `window.__igExport = {dot, engine, search}` in a classic inline `<script>` BEFORE the bundle; the bundle inlines as `<script type="module">` (preserving the built page's module semantics). `search` is the preview's `window.location.search` captured at export time, so the exported file reboots with the SAME setup() interactivity config via the existing `applyUrlConfig` path — zero new config plumbing.
- Static-mode boot in `main.ts`: when a valid `__igExport` payload exists — `applyUrlConfig(payload.search)`, install all handlers exactly as today, then `queueRender(dot, engine, 1)` once (or `showEmptyNotice` for blank DOT) and NEVER call `createWebSocketClient`/`setNodeClickSender`. Payload validation is defensive: `dot` must be a string, `engine`/`search` default to `"dot"`/`""` — garbage payloads fall through to normal live-preview boot.
- The exported page hides the save-as-HTML button (recursion is impossible — the bundle is inline, not re-fetchable) but KEEPS home/zoom/save-as-SVG. Gate via a `isStaticExportPage()` helper reading `__igExport` presence.
- Guards mirror the SVG button: `saveInteractiveHtml` is a silent no-op before the first successful render (`lastGoodDot === null`) and when no `<script src>` exists; the whole handler is try/catch so a fetch/Blob quirk never takes the preview down.
- The button follows the established idiom exactly: same `addButton` helper, hand-drawn 16px inline SVG icon (`currentColor`, `aria-hidden`, same coordinate scale as the existing four), tooltip + matching `aria-label`.
- Zero new dependencies, zero Lua/server/wire-protocol changes.

**Ask First:**
- Embedding the current zoom/pan or highlight selection state into the export (the export re-renders fresh and fits the viewport — the docs must say so).
- Any new Lua config key, command, or wire surface (e.g. `:GraphvizExportHtml`).
- Compressing the payload/bundle (base64, gzip) to shrink the file.

**Never:**
- Do not fetch the page's HTML skeleton from the server — reconstruct it from a constant (charset/viewport/title + `<main id="app">`); all styles are JS-injected so nothing else is needed.
- Do not touch the WASM path, the render queue, or the existing four buttons/handlers.
- Do not attempt live features in the export: no WebSocket, no cursor echo, no jump-on-click (already safe no-ops without a registered sender).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Save after render | Graph rendered | `graph.html` downloads; contains payload script + inline module bundle + `<main id="app">` | N/A |
| Open exported file | Fresh browser, file:// | Graph re-renders from embedded DOT; zoom/highlight/search/SVG-export work; no WS attempt | N/A |
| DOT contains `</script>` / `<!--` in a label | Hostile-ish label text | Payload has no raw `<` at all (`<`); file parses and boots | escaping, not sanitizing |
| Bundle contains `</script` in a string | Real bundle content | Escaped to `<\/script`; script element not terminated early | N/A |
| Save before first render | Fresh preview, nothing rendered | Silent no-op, no download, no throw | `lastGoodDot === null` guard + try/catch |
| Save while error overlay shows | Last good render on screen | The last GOOD dot exports (that is what the stash holds) | N/A |
| Exported page's toolbar | Static export mode | 4 buttons (no save-as-HTML); SVG export still works | N/A |
| Exported file with garbage payload (hand-edited) | `__igExport` not `{dot: string}` | Falls through to live-preview boot path (WS fails harmlessly) | payload validation |
| Config fidelity | Preview opened with `?highlight_mode=downstream&search_regex=1` | Exported file re-applies the same config via embedded search string | N/A |

</frozen-after-approval>

## Code Map

- `frontend/render.ts:172-205` — `lastGoodDot`/`lastGoodEngine` stash set in `renderDotWithFallback`: the export's data source
- `frontend/render.ts:449-472` — `saveGraphSvg`: the guard + Blob/anchor download pattern to mirror
- `frontend/render.ts:371-395` — the four `ICON_*` constants: the idiom for `ICON_HTML_EXPORT`
- `frontend/render.ts:480-522` — `installViewToolbar` + `addButton`: fifth button slots after save-as-SVG, gated on `!isStaticExportPage()`
- `frontend/main.ts:27` — `applyUrlConfig(window.location.search)`: static mode substitutes the embedded search string
- `frontend/main.ts:64-104` — `createWebSocketClient` + `setNodeClickSender`: the block static mode skips
- `frontend/urlconfig.ts:96` — `applyUrlConfig`: unchanged, reused verbatim by static boot
- `frontend/index.html` — the 12-line skeleton the assembly constant mirrors
- `frontend/render.dom.test.ts:497+` — toolbar describe (button count 4→5) + new export describe
- `README.md:93` — toolbar rows in the gesture table
- `doc/interactive-graphviz.txt:55-62` — view-controls subsection

## Tasks & Acceptance

**Execution:**
- [x] `frontend/render.ts` — add `ExportPayload` type, `isStaticExportPage()`, `readExportPayload()` (validating), `ICON_HTML_EXPORT` (hand-drawn document-with-code-brackets glyph), pure `assembleInteractiveHtml(bundleSource, payload)` (skeleton constant + `<`-escaped JSON payload script + `<\/script`-escaped inline module bundle), async `saveInteractiveHtml()` (guards → fetch `document.querySelector('script[src]').src` → assemble → Blob `text/html` → `graph.html` anchor download → revoke), and the fifth gated `addButton`
- [x] `frontend/main.ts` — static-mode branch: valid payload → `applyUrlConfig(payload.search)`, handlers install unchanged, blank-dot notice or single `queueRender`, skip WS + click-sender wiring entirely
- [x] `frontend/render.dom.test.ts` — toolbar count 4→5 with the new tooltip; static-export page shows 4 (no HTML button); `assembleInteractiveHtml` output contains the payload before the bundle, `<main id="app">`, `type="module"`, NO raw `<` in the payload JSON, `</script` in a bundle string escaped to `<\/script`, and the embedded dot round-trips through JSON.parse after unescaping; `readExportPayload` rejects garbage shapes; `saveInteractiveHtml` before any render resolves without throwing and creates no anchor
- [x] `README.md` — extend the toolbar row: save as interactive HTML (self-contained, ~1 MB; re-renders fresh at open, offline)
- [x] `doc/interactive-graphviz.txt` — extend the view-controls subsection: `graph.html`, self-contained/offline, interactivity preserved, sync features inert

**Acceptance Criteria:**
- Given a rendered graph, when the save-as-HTML button is clicked, then a single `graph.html` downloads whose text contains the embedded DOT payload and the inline bundle, with no unescaped `</script` inside either
- Given the exported file opened from disk, when it loads, then the graph renders and zoom/pan, click-highlight, `/` search, and save-as-SVG work with no network access and no WebSocket errors surfaced to the user
- Given a fresh preview before any render, when the button is clicked, then nothing downloads and nothing throws
- Given the full frontend suite, when `bun test` runs in `frontend/`, then all pre-existing tests pass and the new tests are green
- Given the README and vimdoc, when read after this change, then the button is documented including the fresh-render (non-WYSIWYG) semantics and file size caveat

## Spec Change Log

## Verification

**Commands:**
- `bun test --cwd /Users/xuyangy/trash/git/interactive-graphviz.nvim/frontend` — expected: 0 failures, new export tests green

**Manual checks (if no CLI):**
- Open a preview, render a graph, click the HTML-export button; open the downloaded `graph.html` from disk (file://) with the network disconnected: the graph draws, scroll-zoom + click-highlight + `/` search work, the toolbar shows 4 buttons, and save-as-SVG from inside the export produces a valid SVG
- Export a graph whose node label contains the literal text `</script>` and confirm the file still opens and renders
