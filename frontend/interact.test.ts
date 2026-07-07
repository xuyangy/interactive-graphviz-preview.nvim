import { afterEach, describe, expect, test } from "bun:test";
import {
  Selection,
  buildModelFromTitles,
  clusterContainsHighlight,
  clusterOf,
  computeClusterHighlightSet,
  computeHighlightSet,
  edgeKey,
  getHighlightMode,
  isHighlightMode,
  parseDotModel,
  parseEdgeTitle,
  setHighlightMode,
  shouldClearHighlight,
  unionHighlight,
  type GraphModel,
  _resetHighlightMode,
} from "./interact";

// Pure-unit tests (bun test, no DOM) for Story 5.2's highlight model. Mirrors
// the stub-injection pattern in viewstate.test.ts. The real click→SVG-emphasis
// path has no automated harness (browser WASM render path is untested) and is
// verified manually in a browser — see the Dev Agent Record.

afterEach(() => {
  _resetHighlightMode();
});

// A small directed fixture graph:
//   a -> b -> c
//   a -> d
// Adjacency: a→{b,d}; b→{c}; predecessors: b←{a}; c←{b}; d←{a}.
function fixture(): GraphModel {
  return parseDotModel("digraph G { a -> b -> c; a -> d; }");
}

describe("highlight_mode resolver (AC5, mirrors preserve_view)", () => {
  test("defaults to bidirectional (zero new wire surface)", () => {
    expect(getHighlightMode()).toBe("bidirectional");
  });

  test("setHighlightMode accepts each valid mode", () => {
    for (const m of ["single", "upstream", "downstream", "bidirectional"] as const) {
      setHighlightMode(m);
      expect(getHighlightMode()).toBe(m);
    }
  });

  test("clamps unknown values to the default", () => {
    setHighlightMode("sideways");
    expect(getHighlightMode()).toBe("bidirectional");
    setHighlightMode(42);
    expect(getHighlightMode()).toBe("bidirectional");
    setHighlightMode(undefined);
    expect(getHighlightMode()).toBe("bidirectional");
  });

  test("isHighlightMode type guard", () => {
    expect(isHighlightMode("upstream")).toBe(true);
    expect(isHighlightMode("nope")).toBe(false);
    expect(isHighlightMode(null)).toBe(false);
  });
});

describe("parseDotModel (DOT → pure graph model)", () => {
  test("parses nodes and directed edges incl. chains", () => {
    const m = fixture();
    expect([...m.nodes].sort()).toEqual(["a", "b", "c", "d"]);
    expect(m.edges).toContainEqual({ from: "a", to: "b", undirected: false });
    expect(m.edges).toContainEqual({ from: "b", to: "c", undirected: false });
    expect(m.edges).toContainEqual({ from: "a", to: "d", undirected: false });
  });

  test("parses undirected edges (graph / --)", () => {
    const m = parseDotModel("graph G { x -- y; }");
    expect(m.edges).toContainEqual({ from: "x", to: "y", undirected: true });
  });

  test("handles quoted ids", () => {
    const m = parseDotModel('digraph { "node one" -> "node two"; }');
    expect(m.nodes.has("node one")).toBe(true);
    expect(m.nodes.has("node two")).toBe(true);
    expect(m.edges).toContainEqual({ from: "node one", to: "node two", undirected: false });
  });

  test("strips ports from unquoted ids", () => {
    const m = parseDotModel("digraph { a:p -> b:q; }");
    expect(m.edges).toContainEqual({ from: "a", to: "b", undirected: false });
  });

  test("skips attribute lists and standalone attributes", () => {
    const m = parseDotModel(
      'digraph { rankdir=LR; node [shape=box]; a -> b [label="e"]; }',
    );
    expect([...m.nodes].sort()).toEqual(["a", "b"]);
    expect(m.edges).toEqual([{ from: "a", to: "b", undirected: false }]);
  });

  test("ignores comments", () => {
    const m = parseDotModel(
      "digraph { // line comment\n /* block\n comment */ a -> b; # hash\n }",
    );
    expect(m.edges).toContainEqual({ from: "a", to: "b", undirected: false });
  });

  test("empty / blank DOT yields an empty model", () => {
    expect(parseDotModel("").nodes.size).toBe(0);
    expect(parseDotModel("   ").edges.length).toBe(0);
  });

  test("derives cluster membership from subgraph cluster_* blocks", () => {
    const m = parseDotModel(
      "digraph { subgraph cluster_a { n1; n2; n1 -> n2; } n3; n2 -> n3; }",
    );
    const members = m.clusters.get("cluster_a");
    expect(members).toBeDefined();
    expect([...(members ?? [])].sort()).toEqual(["n1", "n2"]);
    expect(m.nodes.has("n3")).toBe(true);
    expect(members?.has("n3")).toBe(false);
  });

  test("graphviz clusters by name PREFIX: cluster0/clusterA/bare cluster all count", () => {
    // The underscore is convention, not syntax — `subgraph cluster0 { a }`
    // renders a box, so the parser must record its membership too (the
    // cluster-dim rule treats missing membership as unrelated → would dim a
    // box whose member is highlighted).
    const m = parseDotModel(
      "digraph { subgraph cluster0 { a } subgraph clusterA { b } subgraph cluster { c } }",
    );
    expect([...(m.clusters.get("cluster0") ?? [])]).toEqual(["a"]);
    expect([...(m.clusters.get("clusterA") ?? [])]).toEqual(["b"]);
    expect([...(m.clusters.get("cluster") ?? [])]).toEqual(["c"]);
  });

  test("quoted cluster IDs (spaces and all) are clusters; the recorded name is unquoted", () => {
    const m = parseDotModel('digraph { subgraph "cluster one two" { a; b } }');
    // The SVG <title> carries the unquoted content — keys must match it.
    expect([...(m.clusters.get("cluster one two") ?? [])].sort()).toEqual(["a", "b"]);
  });

  test("a subgraph without the cluster prefix is still NOT a cluster", () => {
    const m = parseDotModel('digraph { subgraph inner { a } subgraph "not cluster" { b } }');
    expect(m.clusters.size).toBe(0);
    expect(m.nodes.has("a")).toBe(true);
    expect(m.nodes.has("b")).toBe(true);
  });

  test("cluster=true promotes a named subgraph (graphviz ≥2.50 attribute form)", () => {
    const m = parseDotModel("digraph { subgraph box { cluster=true; a; b } c }");
    expect([...(m.clusters.get("box") ?? [])].sort()).toEqual(["a", "b"]);
    expect(m.clusters.size).toBe(1); // c stays outside
  });

  test("cluster=true is retroactive and works in the graph-attr bracket form", () => {
    // Graph attrs describe the subgraph as a whole, so members seen BEFORE the
    // attribute still count.
    const m = parseDotModel(
      'digraph { subgraph box2 { a; graph [style=filled, cluster="true"]; b } }',
    );
    expect([...(m.clusters.get("box2") ?? [])].sort()).toEqual(["a", "b"]);
  });

  test("anonymous cluster=true folds into the enclosing cluster (unmatchable %N title — documented)", () => {
    const m = parseDotModel("digraph { subgraph cluster_o { { cluster=true; a } b } }");
    expect(m.clusters.size).toBe(1);
    expect([...(m.clusters.get("cluster_o") ?? [])].sort()).toEqual(["a", "b"]);
  });

  test("cluster=false does not demote a prefix-named cluster (graphviz still draws its box)", () => {
    const m = parseDotModel("digraph { subgraph cluster_x { cluster=false; a } }");
    expect([...(m.clusters.get("cluster_x") ?? [])]).toEqual(["a"]);
  });

  test("cluster=true on a NODE or inside a label does not promote the subgraph", () => {
    const m = parseDotModel(
      'digraph { subgraph inner { a [cluster=true]; label="cluster=true"; b } }',
    );
    expect(m.clusters.size).toBe(0);
    expect(m.nodes.has("a")).toBe(true);
  });

  test("prefix case-insensitivity pinned: ClusterA / CLUSTER_X draw boxes in graphviz", () => {
    // Verified against the bundled WASM build — the NAME prefix is
    // case-independent even though the cluster ATTR name is not.
    const m = parseDotModel("digraph { subgraph ClusterA { a } subgraph CLUSTER_X { b } }");
    expect([...(m.clusters.get("ClusterA") ?? [])]).toEqual(["a"]);
    expect([...(m.clusters.get("CLUSTER_X") ?? [])]).toEqual(["b"]);
  });

  test("attr NAME is case-sensitive: Cluster=true draws no box, so no promotion", () => {
    const m = parseDotModel("digraph { subgraph box { Cluster=true; a } }");
    expect(m.clusters.size).toBe(0);
  });

  test("attr VALUE is case-independent, and a quoted name still counts", () => {
    const m = parseDotModel(
      'digraph { subgraph up { cluster=TRUE; a } subgraph yes { cluster=yes; b } subgraph q { "cluster"=true; c } }',
    );
    expect([...(m.clusters.get("up") ?? [])]).toEqual(["a"]);
    expect([...(m.clusters.get("yes") ?? [])]).toEqual(["b"]);
    expect([...(m.clusters.get("q") ?? [])]).toEqual(["c"]);
  });

  test("cluster=true inside a quoted attr VALUE is string content, not an attribute", () => {
    // The reviewer's decoy: graphviz draws no box for this (verified) — the
    // quote-aware token scan must not promote it.
    const m = parseDotModel('digraph { subgraph inner { graph [label="cluster=true"]; a; b } }');
    expect(m.clusters.size).toBe(0);
    // …but a REAL cluster attr next to such a decoy label still promotes.
    const m2 = parseDotModel(
      'digraph { subgraph box { graph [label="cluster=true is my name", cluster=true]; a } }',
    );
    expect([...(m2.clusters.get("box") ?? [])]).toEqual(["a"]);
  });

  test("an ESCAPED quote inside a quoted value does not end the token (still no promotion)", () => {
    // graphviz keeps `cluster=true` as label text here (verified — no box);
    // a tokenizer that stops at \" would leak it out as a real attribute.
    const m = parseDotModel(
      String.raw`digraph { subgraph inner { graph [label="x \" cluster=true"]; a; b } }`,
    );
    expect(m.clusters.size).toBe(0);
    expect(m.nodes.has("a")).toBe(true);
  });

  test("nesting semantics preserved: plain subgraph folds up, nested cluster keeps its members", () => {
    const m = parseDotModel(
      "digraph { subgraph cluster_a { subgraph inner { n1 } subgraph cluster_b { n2 } n3 } }",
    );
    expect([...(m.clusters.get("cluster_a") ?? [])].sort()).toEqual(["n1", "n3"]);
    expect([...(m.clusters.get("cluster_b") ?? [])]).toEqual(["n2"]);
  });

  test("truncated input (unbalanced braces) still commits accumulated membership", () => {
    const m = parseDotModel("digraph { subgraph cluster_a { n1");
    expect([...(m.clusters.get("cluster_a") ?? [])]).toEqual(["n1"]);
  });
});

describe("computeHighlightSet (AC1 — four modes)", () => {
  test("single = just the clicked node, no neighbors, no edges", () => {
    const h = computeHighlightSet(fixture(), ["a"], "single");
    expect([...h.nodes].sort()).toEqual(["a"]);
    expect(h.edges.size).toBe(0);
    expect([...h.selected]).toEqual(["a"]);
  });

  test("downstream = successors + connecting edges", () => {
    const h = computeHighlightSet(fixture(), ["a"], "downstream");
    expect([...h.nodes].sort()).toEqual(["a", "b", "d"]);
    expect(h.edges.has(edgeKey("a", "b"))).toBe(true);
    expect(h.edges.has(edgeKey("a", "d"))).toBe(true);
    expect(h.edges.has(edgeKey("b", "c"))).toBe(false);
  });

  test("upstream = predecessors + connecting edges", () => {
    const h = computeHighlightSet(fixture(), ["c"], "upstream");
    expect([...h.nodes].sort()).toEqual(["b", "c"]);
    expect(h.edges.has(edgeKey("b", "c"))).toBe(true);
    expect(h.edges.has(edgeKey("a", "b"))).toBe(false);
  });

  test("bidirectional = both directions", () => {
    const h = computeHighlightSet(fixture(), ["b"], "bidirectional");
    expect([...h.nodes].sort()).toEqual(["a", "b", "c"]);
    expect(h.edges.has(edgeKey("a", "b"))).toBe(true);
    expect(h.edges.has(edgeKey("b", "c"))).toBe(true);
    expect(h.edges.has(edgeKey("a", "d"))).toBe(false);
  });

  test("undirected edges count both directions in every directional mode", () => {
    const m = parseDotModel("graph G { x -- y; }");
    const up = computeHighlightSet(m, ["x"], "upstream");
    const down = computeHighlightSet(m, ["x"], "downstream");
    expect(up.nodes.has("y")).toBe(true);
    expect(down.nodes.has("y")).toBe(true);
    expect(up.edges.has(edgeKey("x", "y", true))).toBe(true);
  });

  test("selecting a non-existent node is a no-op", () => {
    const h = computeHighlightSet(fixture(), ["zzz"], "bidirectional");
    expect(h.nodes.size).toBe(0);
    expect(h.selected.size).toBe(0);
  });

  test("multi-select unions per-node highlight sets (AC2)", () => {
    // bidirectional from a => {a,b,d}; from c => {b,c}; union => {a,b,c,d}
    const h = computeHighlightSet(fixture(), ["a", "c"], "bidirectional");
    expect([...h.nodes].sort()).toEqual(["a", "b", "c", "d"]);
    expect([...h.selected].sort()).toEqual(["a", "c"]);
  });
});

describe("Selection state machine (AC2)", () => {
  test("set replaces; add unions; clear resets; isEmpty", () => {
    const sel = new Selection();
    expect(sel.isEmpty()).toBe(true);

    sel.set("a");
    expect(sel.toArray()).toEqual(["a"]);

    sel.add("b"); // Shift+click
    expect(sel.toArray().sort()).toEqual(["a", "b"]);

    sel.set("c"); // plain click replaces
    expect(sel.toArray()).toEqual(["c"]);

    sel.clear(); // Esc / empty-canvas
    expect(sel.isEmpty()).toBe(true);
  });

  test("retain prunes nodes missing after live-reload (AC4)", () => {
    const sel = new Selection();
    sel.set("a");
    sel.add("gone");
    sel.retain(fixture()); // fixture has a,b,c,d but not "gone"
    expect(sel.toArray()).toEqual(["a"]);
  });

  test("retain clears selection entirely when no selected node survives", () => {
    const sel = new Selection();
    sel.set("ghost");
    sel.retain(fixture());
    expect(sel.isEmpty()).toBe(true);
  });
});

describe("shouldClearHighlight (Esc predicate, search-safe seam for 5.3)", () => {
  test("triggers for un-modified Escape when nothing is focused", () => {
    expect(shouldClearHighlight({ key: "Escape" }, undefined)).toBe(true);
  });

  test("does not trigger for other keys", () => {
    expect(shouldClearHighlight({ key: "Enter" }, undefined)).toBe(false);
    expect(shouldClearHighlight({ key: "Esc" }, undefined)).toBe(false); // exact "Escape" only
  });

  test("does not trigger while typing in INPUT/TEXTAREA (search owns Esc)", () => {
    expect(shouldClearHighlight({ key: "Escape" }, "INPUT")).toBe(false);
    expect(shouldClearHighlight({ key: "Escape" }, "TEXTAREA")).toBe(false);
  });

  test("does not trigger with a modifier held", () => {
    expect(shouldClearHighlight({ key: "Escape", metaKey: true }, undefined)).toBe(false);
    expect(shouldClearHighlight({ key: "Escape", ctrlKey: true }, undefined)).toBe(false);
  });
});

describe("cluster highlight (AC3)", () => {
  const clustered = () =>
    parseDotModel(
      "digraph { subgraph cluster_a { n1; n2; n1 -> n2; } n3; n2 -> n3; }",
    );

  test("clusterOf returns the containing cluster or null", () => {
    const m = clustered();
    expect(clusterOf(m, "n1")).toBe("cluster_a");
    expect(clusterOf(m, "n3")).toBeNull();
  });

  test("computeClusterHighlightSet highlights members + intra-cluster edges", () => {
    const h = computeClusterHighlightSet(clustered(), "n1");
    expect([...h.nodes].sort()).toEqual(["n1", "n2"]);
    expect(h.edges.has(edgeKey("n1", "n2"))).toBe(true);
    // n2 -> n3 crosses the cluster boundary, so it is NOT an intra-cluster edge.
    expect(h.edges.has(edgeKey("n2", "n3"))).toBe(false);
  });

  test("computeClusterHighlightSet is empty for a node in no cluster", () => {
    const h = computeClusterHighlightSet(clustered(), "n3");
    expect(h.nodes.size).toBe(0);
    expect(h.edges.size).toBe(0);
  });
});

describe("buildModelFromTitles + parseEdgeTitle (SVG extraction source)", () => {
  test("parseEdgeTitle reads directed and undirected endpoints", () => {
    expect(parseEdgeTitle("a->b")).toEqual({ from: "a", to: "b", undirected: false });
    expect(parseEdgeTitle("x--y")).toEqual({ from: "x", to: "y", undirected: true });
    expect(parseEdgeTitle("not an edge")).toBeNull();
  });

  test("builds a model equivalent to the DOT parse for adjacency", () => {
    const m = buildModelFromTitles({
      nodeTitles: ["a", "b", "c", "d"],
      edgeTitles: ["a->b", "b->c", "a->d"],
      clusterTitles: ["cluster_a"],
    });
    const h = computeHighlightSet(m, ["a"], "downstream");
    expect([...h.nodes].sort()).toEqual(["a", "b", "d"]);
    expect(m.clusters.has("cluster_a")).toBe(true);
  });
});

describe("unionHighlight", () => {
  test("unions nodes, edges, and selected", () => {
    const a = computeHighlightSet(fixture(), ["a"], "downstream");
    const b = computeClusterHighlightSet(
      parseDotModel("digraph { subgraph cluster_z { a; z; a -> z; } }"),
      "a",
    );
    const u = unionHighlight(a, b);
    expect(u.nodes.has("a")).toBe(true);
    expect(u.selected.has("a")).toBe(true);
  });
});

describe("clusterContainsHighlight (cluster-dim rule)", () => {
  test("lit when a member is selected or a neighbor; dimmed when disjoint", () => {
    const set = computeHighlightSet(fixture(), ["a"], "downstream"); // nodes: a + successors
    expect(clusterContainsHighlight(new Set(["a", "z"]), set)).toBe(true); // member selected
    expect(clusterContainsHighlight(new Set(["b"]), set)).toBe(true); // member is a neighbor
    expect(clusterContainsHighlight(new Set(["z", "q"]), set)).toBe(false); // disjoint → dims
  });

  test("unknown or empty membership counts as unrelated (dims as scenery)", () => {
    const set = computeHighlightSet(fixture(), ["a"], "single");
    expect(clusterContainsHighlight(undefined, set)).toBe(false);
    expect(clusterContainsHighlight(new Set(), set)).toBe(false);
  });
});
