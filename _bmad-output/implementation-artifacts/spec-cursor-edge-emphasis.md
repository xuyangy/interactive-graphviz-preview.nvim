---
title: 'Cursor sync: edge lines emphasize the edge + both endpoint nodes'
type: 'feature'
created: '2026-07-05'
status: 'done'
baseline_commit: 'bed1327'
context: []
---

> Retroactive spec (2026-07-05): authored alongside the implementation to keep the
> BMAD trail complete — the intent below was negotiated with the human in-session
> ("any position on an edge line light up edge + both ends") before code was written.

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Story 6.3 cursor echo resolves only NODES: resting the cursor on an
edge line (`a -> b;`) outlines just the first node on the line. The edge itself — the
thing the line actually declares — and its other endpoint get no emphasis, so the
buffer→graph link is weakest exactly where DOT sources spend most of their lines.

**Approach:** Extend the existing emphasize pipeline end-to-end without touching the
wire or the server. The Lua resolver detects an edge statement on the cursor line and
sends the edge key in the SVG edge `<title>` form (`a->b` / `a--b`) through the
EXISTING `emphasize.nodeId` string field — the prebuilt server validates
string-or-null and relays verbatim, so zero server changes and no protocol bump. The
browser matches the key against `g.edge` titles and adds the `ig-cursor` treatment to
the edge AND both endpoint nodes (endpoints via the existing `parseEdgeTitle`).
**Edge lines win regardless of column** (human decision): cursor on `a`, the
operator, `b`, or trailing punctuation all emphasize the edge + both ends; chains
prefer the segment under the cursor.

## Boundaries & Constraints

**Always:**
- Touch ONLY: `lua/interactive-graphviz/sync.lua` (edge-aware resolver),
  `frontend/render.ts` (edge matching + CSS), their test files, `README.md`,
  `doc/interactive-graphviz.txt`.
- The edge key MUST be byte-identical to the SVG edge `<title>` text graphviz emits
  (verified against real `dot -Tsvg`: `node one->b` for quoted ids, `a--b`
  undirected, `x:p->y` for ports) — unescaped ids joined by the bare operator.
- Edge detection is STRICT: the raw text between two adjacent candidate spans must be
  exactly `->` or `--` plus whitespace. Anything else (`;`, `[`, `=`, `:port`,
  comment text) is not an edge — degrade to the Story 6.3 node resolution. Miss ≡
  single-node emphasis or cleared, never a wrong edge.
- Browser endpoints light ONLY when a LIVE edge matched the key — a key that merely
  parses as an edge must not light stray same-named nodes.
- Edge CSS follows the cursor-echo laws: same `#4fc3f7` hue, stroke-only (never
  element opacity), thinner than the node outline (2px vs 3px), yields to
  click/search ownership via `:not(.ig-neighbor)`, pulse behind the animation gate.
- Dedupe, debounce, echo suppression, and the vim.NIL clear envelope stay exactly as
  Story 6.3/6.4 built them — the edge key is just another `last_sent` string.
- Pan target for an edge is the edge group (its bbox spans the run between the
  endpoints); the existing pan-only/interrupt rules apply unchanged.

**Ask First:**
- Any new protocol field (e.g. `edgeId`) — requires a server re-release; the
  string-reuse approach was chosen specifically to avoid that.
- Port-aware edge keys (`a:p->b`), subgraph-endpoint expansion (`{a b} -> c`), or
  multi-segment chain emphasis — deliberate degradations in v1.
- Changing WHEN edges win (e.g. node-token-under-cursor beats the edge) — the
  line-level rule is a human decision.

**Never:**
- Do not modify `server/` — the relay must stay byte-compatible with the shipped
  prebuilt binary.
- Do not let edge emphasis dim anything or contend with the highlight/search regimes.
- Do not break `find_node_at` (Story 6.2/6.3 consumers) — the shared candidate
  scanner must keep both resolvers in agreement.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Cursor anywhere on an edge line | `  a -> b;`, any column | `emphasize{nodeId:"a->b"}`; browser outlines edge + nodes a and b | N/A |
| Undirected | `a -- b;` | Key `a--b` (matches undirected SVG title) | N/A |
| Quoted endpoint | `"node one" -> b;` | Key `node one->b` (unescaped body) | N/A |
| Chain | `a -> b -> c;` cursor on c | Key `b->c`; cursor past the chain → first segment `a->b` | N/A |
| Two statements per line | `a -> b; c -> d;` cursor on d | Key `c->d` | N/A |
| Attrs after edge | `a -> b [color=red];` | Key `a->b` (attrs never break detection) | N/A |
| Arrow inside quoted attr value | `x [label="a -> b"];` | NOT an edge — node resolution (`x` on x) | N/A |
| Ports | `rec:out -> b;` | Degrade to node emphasis (`rec`) — never a wrong key (SVG title would be `rec:out->b`) | documented degradation |
| Edge in comment | `/* a -> b */ c;` | Comment dead; `c` resolves | N/A |
| Stale browser / key matches nothing | Edge renamed since last render | Nothing lights — miss ≡ clear | N/A |
| Multi-edge (same title twice) | `a -> b; a -> b;` | All matching edge groups light; first one pans | N/A |
| Click/search active | Edge or endpoint owned by highlight regime | ig-cursor added additively; owned stroke wins via `:not()` | N/A |

</frozen-after-approval>

## Code Map

- `lua/interactive-graphviz/sync.lua:260` — `candidates_at`: shared candidate scanner (ids + byte spans), extracted from `find_node_at` so both resolvers agree
- `lua/interactive-graphviz/sync.lua:306` — `edge_op_between`: the strict gap test (`->`/`--` + whitespace only)
- `lua/interactive-graphviz/sync.lua:331` — `find_emphasis_at`: edge-wins resolution; segment-under-cursor for chains, first edge as fallback, node rules otherwise
- `lua/interactive-graphviz/sync.lua:530` — `emit_for_cursor` now calls `find_emphasis_at`; envelope/dedupe/vim.NIL clear unchanged
- `frontend/render.ts:887` — `CURSOR_EMPHASIS_CSS` + pulse: new `g.edge.ig-cursor:not(.ig-neighbor)` stroke rules
- `frontend/render.ts:1038` — `applyCursorEmphasis`: edge pass first (decides endpoints), node pass includes `parseEdgeTitle` endpoints, pan prefers the edge group
- `tests/sync_spec.lua:522` — `find_emphasis_at` describe (12 cases) + updated watcher-emission expectations
- `frontend/render.dom.test.ts:490+` — edge-key emphasis, miss ≡ clear, additive-beneath-click, re-render survival, stylesheet law
- `README.md` "Editor↔graph sync" + `doc/interactive-graphviz.txt` `sync` section — edge-line behavior + degradations documented
