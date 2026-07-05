// graph-dom.ts — the one bridge between the LIVE graphviz-shaped SVG under
// #app and the pure graph models (interact.ts / search.ts). Every read of the
// rendered DOM — the g.node/g.edge/g.cluster scans, <title> extraction, and
// the click-target walk — goes through here. No d3: render.ts remains the
// only module that imports d3-graphviz. Writers (class toggles) stay with
// their owners in render.ts; this module locates and reads elements only.
//
// Graphviz emits each node as <g class="node"><title>NAME</title>…>, each
// edge as <g class="edge"><title>A-&gt;B</title>…> (A--B undirected), each
// cluster as <g class="cluster"><title>cluster_NAME</title>…>. The <title>
// text is the stable identity every lookup keys on.
//
// ── Snapshot cache (plan item #8b) ────────────────────────────────────────────
// The group scans + title reads are cached in a per-render snapshot, rebuilt
// lazily on first read after invalidation. Before the cache, every cursor
// frame (applyCursorEmphasis), every search keystroke (extractModelFromApp),
// and every click re-scanned all g.node/g.edge groups and re-read each
// <title> — O(graph) DOM traffic per interaction; now it is O(graph) once per
// render.
//
// Invalidation contract — the DOM this caches is mutated ONLY by d3-graphviz
// renders, so:
//  - render.ts calls invalidateGraphDom() around every render (renderDot
//    entry + settle, and the post-render reapply boundary), covering queued
//    renders AND the error-recovery render;
//  - a wholesale #app replacement (tests rebuild the fixture per case) is
//    self-detected: the snapshot remembers which #app element it was built
//    from and drops itself when the identity changes;
//  - an in-place subtree mutation WITHOUT a render-boundary call is outside
//    the contract and serves stale reads until invalidated — no production
//    path does this (verified: only d3-graphviz mutates the graph subtree).

import { buildModelFromTitles, type GraphModel } from "./interact";

/** One rendered group with its identity — the element plus its parsed title. */
export interface GroupEntry {
  el: Element;
  title: string;
}

interface GraphDomSnapshot {
  /** The #app element the snapshot was built from (identity-checked on read). */
  app: HTMLElement;
  nodes: GroupEntry[];
  edges: GroupEntry[];
  clusters: GroupEntry[];
  /** Lazily built pure model (per-snapshot, so per-render). */
  model: GraphModel | null;
}

let _snapshot: GraphDomSnapshot | null = null;

/** Drop the cached snapshot; the next read rebuilds from the live DOM. */
export function invalidateGraphDom(): void {
  _snapshot = null;
}

/** The #app container the renderer draws into, or null before/without a DOM. */
export function appElement(): HTMLElement | null {
  return document.getElementById("app");
}

function scanEntries(app: HTMLElement, selector: string): GroupEntry[] {
  return Array.from(app.querySelectorAll(selector), (el) => ({ el, title: groupTitle(el) }));
}

/** The current snapshot, rebuilding when invalidated or when #app was replaced. */
function currentSnapshot(): GraphDomSnapshot | null {
  const app = appElement();
  if (!app) {
    _snapshot = null;
    return null;
  }
  if (_snapshot && _snapshot.app === app) return _snapshot;
  _snapshot = {
    app,
    nodes: scanEntries(app, "g.node"),
    edges: scanEntries(app, "g.edge"),
    clusters: scanEntries(app, "g.cluster"),
    model: null,
  };
  return _snapshot;
}

/** All rendered node groups with titles (empty when nothing has rendered / no #app). */
export function nodeEntries(): GroupEntry[] {
  return currentSnapshot()?.nodes ?? [];
}

/** All rendered edge groups with titles (empty when nothing has rendered / no #app). */
export function edgeEntries(): GroupEntry[] {
  return currentSnapshot()?.edges ?? [];
}

/** All rendered cluster groups with titles (empty when nothing has rendered / no #app). */
export function clusterEntries(): GroupEntry[] {
  return currentSnapshot()?.clusters ?? [];
}

/** Read the textContent of the first <title> child of an SVG group, trimmed. */
export function groupTitle(group: Element): string {
  // The <title> is a direct child; querySelector(":scope > title") keeps us from
  // grabbing a descendant edge/node title in nested structures.
  const t = group.querySelector(":scope > title") ?? group.querySelector("title");
  return (t?.textContent ?? "").trim();
}

/**
 * Build the pure graph model from the LIVE SVG <title> elements. This is the
 * chosen extraction source (robust, mirrors what is actually drawn); the math
 * stays pure in interact.ts. Cached per snapshot — i.e. per render — so a
 * search keystroke or click re-uses the model instead of re-deriving it.
 */
export function extractModelFromApp(): GraphModel {
  const snap = currentSnapshot();
  if (snap === null) return buildModelFromTitles({ nodeTitles: [], edgeTitles: [] });
  if (snap.model === null) {
    snap.model = buildModelFromTitles({
      nodeTitles: snap.nodes.map((e) => e.title),
      edgeTitles: snap.edges.map((e) => e.title),
      clusterTitles: snap.clusters.map((e) => e.title),
    });
  }
  return snap.model;
}

/**
 * Pure predicate: does this click target a node group? Returns the node title or
 * null (background / empty-canvas click). Walks up from the event target to the
 * nearest g.node within #app (event delegation), so it survives re-renders.
 * Reads the live DOM directly (no scan, and the walk must reflect the exact
 * clicked element even mid-transition).
 */
export function nodeTitleFromClickTarget(target: EventTarget | null): string | null {
  let el = target as Element | null;
  const app = appElement();
  while (el && el !== app && el !== document.body) {
    if (el instanceof Element && el.classList?.contains("node") && el.tagName === "g") {
      return groupTitle(el);
    }
    el = el.parentElement;
  }
  return null;
}
