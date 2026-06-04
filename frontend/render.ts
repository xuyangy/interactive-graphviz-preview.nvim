// render.ts is the ONLY module that imports d3-graphviz / @hpcc-js/wasm-graphviz.
// All other modules (main.ts, ws.ts) speak the wire protocol only.
//
// d3-graphviz 5.6.0 ships no TypeScript definitions; the import resolves to
// `any` — this is expected and intentional.
//
// SEAM (Story 1.6): last-good-render retention and error overlay go in the
// render-queue's renderFn, not here.

// eslint-disable-next-line import/no-unresolved
import { graphviz } from "d3-graphviz";
import { createRenderQueue } from "./render-queue";

/**
 * Render a DOT string into #app using the bundled WASM renderer.
 * No system Graphviz is required — the WASM module is bundled into this file
 * via Bun's bundler (FR-6).
 *
 * Called by the render queue only; external callers use queueRender.
 */
export function renderDot(dot: string, engine: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    try {
      graphviz("#app")
        .engine(engine)
        .on("end", () => resolve())
        .on("error", (err: unknown) => {
          console.error("interactive-graphviz: render error", err);
          reject(err instanceof Error ? err : new Error(String(err)));
        })
        .renderDot(dot);
    } catch (err) {
      console.error("interactive-graphviz: render error (sync)", err);
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

// v-guard + render-lock queue wired to the real WASM renderer.
const _queue = createRenderQueue(renderDot);

/**
 * Queue a render with v-guard and render-lock (Story 1.5).
 * Use this instead of renderDot directly from main.ts.
 */
export const queueRender = _queue.queueRender.bind(_queue);
