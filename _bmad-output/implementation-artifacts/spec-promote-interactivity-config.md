---
title: 'Promote interactivity config to real Lua setup() keys'
type: 'feature'
created: '2026-06-10'
status: 'done'
baseline_commit: 'f52b7732953b9d9a6612779ffec2e34e120df49a'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Epic 5 shipped `highlight_mode`, `search`, and `animate` as frontend-local stubs with no Lua `setup()` key — users cannot configure the interactivity that shipped (retro AI#2). Worse, `preserve_view` IS a validated Lua key but the browser silently ignores it and hardcodes its own default; they agree only by coincidence.

**Approach:** Plumb config through the preview URL the plugin already opens (`?sessionId=…&token=…`): `commands.lua` appends config query params; the frontend parses `window.location.search` at startup and feeds the existing, already-clamping setters (`setPreserveView`/`setHighlightMode`/`setSearchConfig`/`setAnimate`). Zero new protocol messages, zero `server/` changes.

## Boundaries & Constraints

**Always:**
- No new wire-protocol message types; `server/` and `server/protocol.ts` stay untouched.
- New Lua keys follow `config.lua`'s existing validation conventions (loud `error()` on invalid values, same message style) and `config_spec.lua`'s test patterns.
- Invalid/garbage URL param values must never throw in the browser — the frontend setters' clamp-to-default behavior is the safety net.
- A `setup()` with none of the new keys produces behavior identical to today (defaults unchanged).

**Ask First:**
- Any change that touches `server/` or the protocol after all.
- Renaming or changing the default of any EXISTING config key.

**Never:**
- Live re-push of config to an already-open browser (config applies when a preview opens; re-run `:GraphvizPreview` to pick up changes — document this).
- New dependencies (frontend or Lua).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Highlight mode honored | `setup{ highlight_mode = "upstream" }`, preview opened | URL carries `highlight_mode=upstream`; node click highlights only upstream neighbors | N/A |
| Animation off | `setup{ animate = false }` | URL carries `animate=0`; emphasis/render are instant | N/A |
| Search defaults | `setup{ search = { scope = "nodes", case_sensitive = true } }` | Search box opens with nodes scope + Aa checked; unset field (`regex`) keeps default | N/A |
| preserve_view finally real | `setup{ preserve_view = false }` | URL carries `preserve_view=0`; frontend calls `setPreserveView(false)`; zoom resets across re-renders | N/A |
| Invalid Lua value | `setup{ highlight_mode = "sideways" }` | Loud config validation error naming key + allowed values | `error()` per config.lua convention |
| Tampered URL | Hand-edited `?highlight_mode=junk&animate=banana` | Page loads normally; setters clamp to defaults | Silent clamp, no throw |
| Legacy URL | URL with only `sessionId`/`token` (no config params) | All defaults — identical to today | N/A |

</frozen-after-approval>

## Code Map

- `lua/interactive-graphviz/config.lua` — defaults table + `validate()`; add the three new keys here (`preserve_view` already exists at line ~11/143)
- `lua/interactive-graphviz/commands.lua:141` — single point where the preview URL is built (`string.format(".../?sessionId=%d&token=%s", …)`)
- `frontend/urlconfig.ts` — NEW: pure parser from a query string to setter calls (unit-testable without DOM)
- `frontend/main.ts` — startup; currently calls `installResetKeybinding`/`installInteractionHandlers`/`installSearchHandlers` and never any config setter
- `frontend/render.ts` — already re-exports `setPreserveView`, `setHighlightMode`, `setSearchConfig`, `setAnimate` (main.ts imports only from render.ts)
- `frontend/interact.ts` / `search.ts` / `animate.ts` / `viewstate.ts` — the clamping setters; do NOT modify
- `tests/config_spec.lua` — validation test patterns to extend
- `tests/commands_spec.lua:199+` — preview-URL assertions to extend
- `README.md` + `doc/` — user-facing config documentation

## Tasks & Acceptance

**Execution:**
- [x] `lua/interactive-graphviz/config.lua` — add `highlight_mode` (string enum `single|upstream|downstream|bidirectional`, default `"bidirectional"`), `animate` (boolean, default `true`), `search` (table: `scope` enum `both|nodes|edges` default `"both"`, `case_sensitive` boolean default `false`, `regex` boolean default `false`); validate per existing conventions
- [x] `lua/interactive-graphviz/commands.lua` — append `preserve_view`, `highlight_mode`, `animate`, `search_scope`, `search_case`, `search_regex` query params to the preview URL (booleans as `1`/`0`; values are enum/boolean-validated so no URL-encoding hazard)
- [x] `frontend/urlconfig.ts` — NEW pure module: parse a query string (`URLSearchParams`), return a typed partial config; an `applyUrlConfig()` wrapper feeds the four setters; absent/garbage params yield no calls or clamp via the setters
- [x] `frontend/main.ts` — call `applyUrlConfig(window.location.search)` at startup, before handler installation
- [x] `tests/config_spec.lua` — validation cases for the three new keys (valid values, type errors, enum errors, nested `search` partials)
- [x] `tests/commands_spec.lua` — assert the preview URL carries the config params reflecting non-default `setup()` values and defaults otherwise
- [x] `frontend/urlconfig.test.ts` — NEW: unit cases for the I/O matrix rows (tampered values, legacy URL, partial search config)
- [x] `README.md` + `doc/interactive-graphviz.txt` — document the new keys, defaults, and the "applies on preview open" rule

**Acceptance Criteria:**
- Given `setup{ highlight_mode = "upstream" }`, when `:GraphvizPreview` opens, then the opened URL contains `highlight_mode=upstream` and the browser honors it on click.
- Given a `setup()` without any new keys, when a preview opens, then the URL gains only default-valued params and observed behavior matches today's defaults exactly.
- Given an existing browser tab reconnecting after a server restart, when it reloads the same URL, then the same config still applies (params live in the URL).

## Spec Change Log

- **2026-06-10 (review adjudication, no loopback):** the frozen block self-contradicts on invalid-Lua-value handling — it demands both "follow `config.lua`'s existing validation conventions" and "loud `error()`". The codebase convention (every existing key, `config_spec.lua`'s assertions, and the README's documented promise) is warn-and-clamp with zero `error()` calls; the `error()` parenthetical was a false premise about the codebase. The acceptance auditor judged warn-and-clamp the only coherent reading; implementation follows it (warning names key + bad value + allowed values). Frozen block left untouched per its own rule — recorded here for human sign-off at present-step. KEEP: warn-and-clamp with per-subfield isolation for `search`; always-emit-all-params URL design.

## Design Notes

- **Why the URL beats the alternatives:** a config message type violates the no-new-protocol constraint and would make the stateless relay config-aware; server-side HTML injection likewise. The URL is already the one Lua→browser channel that exists, survives reconnects for free, and needs no server knowledge.
- **Always emit all params** (even defaults): deterministic URLs, trivial assertions in `commands_spec.lua`, and no "absent vs default" ambiguity in the frontend parser.
- **Flat snake_case param names** (`search_case`, not nested JSON) keep parsing dependency-free and the URL human-readable.

## Verification

**Commands:**
- `busted tests/config_spec.lua tests/commands_spec.lua` -- expected: 0 failures (run via `eval "$(luarocks path --local)"`, PATH+=`~/.luarocks/bin`)
- `bun test frontend` -- expected: 0 failures including new `urlconfig.test.ts`
- `stylua --check lua tests` -- expected: clean
- `bun build frontend/index.html --outdir .bundle-check` -- expected: bundles, no new top-level dep (still 183-ish modules)

**Manual checks (if no CLI):**
- Real-browser spot check (optional, recipe in project memory): open a preview with `highlight_mode=single&animate=0` in the URL and confirm click highlights only the node, instantly.

## Suggested Review Order

**The plumbing path (design intent)**

- Entry point: the URL is the whole design — six params appended where sessionId/token already travel.
  [`commands.lua:141`](../../lua/interactive-graphviz/commands.lua#L141)

- The receiving end: pure parser, booleans only exact 1/0, enums clamp downstream.
  [`urlconfig.ts:59`](../../frontend/urlconfig.ts#L59)

- The side-effect wrapper: absent key = no setter call, so legacy URLs are byte-identical.
  [`urlconfig.ts:90`](../../frontend/urlconfig.ts#L90)

- Startup ordering is load-bearing: config before handlers so first render + search box honor it.
  [`main.ts:24`](../../frontend/main.ts#L24)

**Lua validation (new setup() keys)**

- Enum validation follows the warn-and-clamp house convention (see Spec Change Log adjudication).
  [`config.lua:163`](../../lua/interactive-graphviz/config.lua#L163)

- The nested-table case: validates into a FRESH table — never mutates caller-owned data.
  [`config.lua:184`](../../lua/interactive-graphviz/config.lua#L184)

**Tests**

- Pure parser cases: tampered values, legacy URL, malformed strings never throw.
  [`urlconfig.test.ts:22`](../../frontend/urlconfig.test.ts#L22)

- End-to-end getters: non-default params land in every module.
  [`urlconfig.test.ts:81`](../../frontend/urlconfig.test.ts#L81)

- URL emission under default and non-default setup().
  [`commands_spec.lua:390`](../../tests/commands_spec.lua#L390)

- Warn-and-clamp behavior for the new keys.
  [`config_spec.lua:364`](../../tests/config_spec.lua#L364)

**Docs**

- The apply-on-open rule + the reload-uses-baked-config trap, spelled out.
  [`interactive-graphviz.txt:77`](../../doc/interactive-graphviz.txt#L77)

- Same rule user-facing, plus corrected stale "no config key" claims.
  [`README.md:182`](../../README.md#L182)
