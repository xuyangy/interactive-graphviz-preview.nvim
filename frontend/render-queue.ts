/**
 * Pure v-guard + render-lock state machine for live reload (FR-7).
 * No d3-graphviz / @hpcc-js/wasm-graphviz import — those live in render.ts only.
 *
 * SEAM (Story 1.6): pass render errors to the error overlay instead of
 * logging + discarding. The renderFn rejection path is where that hooks in.
 */

export type RenderFn = (dot: string, engine: string) => Promise<void>;

interface QueueEntry {
  dot: string;
  engine: string;
  v: number;
}

export function createRenderQueue(renderFn: RenderFn) {
  let inFlight = false;
  let lastAppliedV = 0;
  let pending: QueueEntry | null = null;

  function run(entry: QueueEntry): void {
    inFlight = true;
    let promise: Promise<void>;
    try {
      promise = renderFn(entry.dot, entry.engine);
    } catch (syncErr) {
      // renderFn threw synchronously before returning a Promise — treat as rejection
      // so the queue does not lock up permanently.
      console.error("interactive-graphviz: render error (sync throw)", syncErr);
      inFlight = false;
      if (pending !== null) {
        const next = pending;
        pending = null;
        if (next.v >= lastAppliedV) {
          run(next);
        }
      }
      return;
    }
    promise
      .then(() => {
        // v-guard on completion: only advance if this render is still the latest.
        if (entry.v >= lastAppliedV) {
          lastAppliedV = entry.v;
        }
      })
      .catch((err: unknown) => {
        // Error overlay is Story 1.6 — log for now.
        console.error("interactive-graphviz: render error", err);
      })
      .finally(() => {
        inFlight = false;
        if (pending !== null) {
          const next = pending;
          pending = null;
          // Guard again: pending may have gone stale while we were in-flight.
          if (next.v >= lastAppliedV) {
            run(next);
          }
        }
      });
  }

  return {
    /**
     * Queue a render. Applies v-guard (discard stale) and render-lock (coalesce
     * while in-flight, keeping only the latest pending entry).
     */
    queueRender(dot: string, engine: string, v: number): void {
      // v-guard: discard out-of-order renders immediately.
      if (v < lastAppliedV) return;

      if (inFlight) {
        // Render-lock: keep only the latest pending entry.
        if (pending === null || v >= pending.v) {
          pending = { dot, engine, v };
        }
        return;
      }
      run({ dot, engine, v });
    },

    // ── Test seams ─────────────────────────────────────────────────────────
    // Do NOT call these from production code.
    _resetForTest(): void {
      inFlight = false;
      lastAppliedV = 0;
      pending = null;
    },
    _lastAppliedV(): number {
      return lastAppliedV;
    },
    _isInFlight(): boolean {
      return inFlight;
    },
  };
}
