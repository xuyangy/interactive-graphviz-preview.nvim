// graph-dom.ts — the one bridge between the LIVE graphviz-shaped SVG under
// #app and the pure graph models (interact.ts / search.ts). Extracted from
// render.ts as behavior-preserving code motion (plan item #8a): every read of
// the rendered DOM — the g.node/g.edge/g.cluster scans, <title> extraction,
// and the click-target walk — goes through here, so the title→element cache
// (plan item #8b) has exactly one module to live in. No d3: render.ts remains
// the only module that imports d3-graphviz. Writers (class toggles) stay with
// their owners in render.ts; this module locates and reads elements only.
//
// Graphviz emits each node as <g class="node"><title>NAME</title>…>, each
// edge as <g class="edge"><title>A-&gt;B</title>…> (A--B undirected), each
// cluster as <g class="cluster"><title>cluster_NAME</title>…>. The <title>
// text is the stable identity every lookup keys on.

import { buildModelFromTitles, type GraphModel } from "./interact";

/** The #app container the renderer draws into, or null before/without a DOM. */
export function appElement(): HTMLElement | null {
  return document.getElementById("app");
}

/** All rendered node groups (empty when nothing has rendered / no #app). */
export function nodeGroups(): Element[] {
  const app = appElement();
  return app ? Array.from(app.querySelectorAll("g.node")) : [];
}

/** All rendered edge groups (empty when nothing has rendered / no #app). */
export function edgeGroups(): Element[] {
  const app = appElement();
  return app ? Array.from(app.querySelectorAll("g.edge")) : [];
}

/** All rendered cluster groups (empty when nothing has rendered / no #app). */
export function clusterGroups(): Element[] {
  const app = appElement();
  return app ? Array.from(app.querySelectorAll("g.cluster")) : [];
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
 * stays pure in interact.ts.
 */
export function extractModelFromApp(): GraphModel {
  if (appElement() === null) return buildModelFromTitles({ nodeTitles: [], edgeTitles: [] });
  const nodeTitles = nodeGroups().map((g) => groupTitle(g));
  const edgeTitles = edgeGroups().map((g) => groupTitle(g));
  const clusterTitles = clusterGroups().map((g) => groupTitle(g));
  return buildModelFromTitles({ nodeTitles, edgeTitles, clusterTitles });
}

/**
 * Pure predicate: does this click target a node group? Returns the node title or
 * null (background / empty-canvas click). Walks up from the event target to the
 * nearest g.node within #app (event delegation), so it survives re-renders.
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
