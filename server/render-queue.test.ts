/**
 * Unit tests for the frontend v-guard + render-lock state machine (FR-7).
 * Imports render-queue.ts directly — no DOM or d3-graphviz required.
 */

import { describe, expect, test, beforeEach } from "bun:test";
import { createRenderQueue } from "../frontend/render-queue";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Create a controllable mock render function.
 * resolveDelay controls how long the render takes (ms).
 * Returns the list of rendered dots in call order.
 */
function makeMockRenderer(resolveDelay = 0) {
  const rendered: string[] = [];
  let resolveFn: (() => void) | null = null;

  const fn = (dot: string, _engine: string): Promise<void> => {
    return new Promise<void>((resolve) => {
      rendered.push(dot);
      if (resolveDelay === 0) {
        resolve();
      } else {
        resolveFn = resolve;
        setTimeout(resolve, resolveDelay);
      }
    });
  };

  return { fn, rendered, flush: () => resolveFn?.() };
}

describe("render-queue: v-guard", () => {
  test("applies render when v > lastAppliedV", async () => {
    const { fn, rendered } = makeMockRenderer();
    const q = createRenderQueue(fn);
    q.queueRender("digraph{a}", "dot", 1);
    await sleep(10);
    expect(rendered).toEqual(["digraph{a}"]);
    expect(q._lastAppliedV()).toBe(1);
  });

  test("discards render when v < lastAppliedV (stale out-of-order)", async () => {
    const { fn, rendered } = makeMockRenderer();
    const q = createRenderQueue(fn);

    // Apply v=5 first.
    q.queueRender("digraph{v5}", "dot", 5);
    await sleep(10);
    expect(q._lastAppliedV()).toBe(5);

    // Attempt v=3 — stale, must be discarded.
    q.queueRender("digraph{v3}", "dot", 3);
    await sleep(10);
    expect(rendered).toEqual(["digraph{v5}"]);
    expect(q._lastAppliedV()).toBe(5);
  });

  test("applies render when v === lastAppliedV (same version, updated DOT)", async () => {
    const { fn, rendered } = makeMockRenderer();
    const q = createRenderQueue(fn);
    q.queueRender("digraph{v1-first}", "dot", 1);
    await sleep(10);
    q.queueRender("digraph{v1-updated}", "dot", 1);
    await sleep(10);
    expect(rendered).toEqual(["digraph{v1-first}", "digraph{v1-updated}"]);
  });

  test("lastAppliedV advances monotonically across sequential renders", async () => {
    const { fn } = makeMockRenderer();
    const q = createRenderQueue(fn);
    for (let v = 1; v <= 5; v++) {
      q.queueRender(`digraph{v${v}}`, "dot", v);
      await sleep(5);
    }
    expect(q._lastAppliedV()).toBe(5);
  });
});

describe("render-queue: render-lock + latest-wins", () => {
  test("queues at most one pending while in-flight; only the latest survives", async () => {
    const { fn, rendered } = makeMockRenderer(50); // slow render
    const q = createRenderQueue(fn);

    // Start v=1 in-flight.
    q.queueRender("digraph{v1}", "dot", 1);
    expect(q._isInFlight()).toBe(true);

    // Three rapid dispatches while in-flight — only the last (v=4) should survive.
    q.queueRender("digraph{v2}", "dot", 2);
    q.queueRender("digraph{v3}", "dot", 3);
    q.queueRender("digraph{v4}", "dot", 4);

    // Wait for v=1 + v=4 to complete.
    await sleep(150);
    expect(rendered).toEqual(["digraph{v1}", "digraph{v4}"]);
    expect(q._lastAppliedV()).toBe(4);
  });

  test("lower-v dispatch while in-flight does not replace higher-v pending", async () => {
    const { fn, rendered } = makeMockRenderer(50);
    const q = createRenderQueue(fn);

    q.queueRender("digraph{v1}", "dot", 1); // in-flight
    q.queueRender("digraph{v5}", "dot", 5); // pending = v5
    q.queueRender("digraph{v3}", "dot", 3); // v3 < v5 → must NOT replace pending

    await sleep(150);
    expect(rendered).toEqual(["digraph{v1}", "digraph{v5}"]);
  });

  test("pending render is discarded when stale: v=2 pending while v=10 in-flight", async () => {
    // Fresh queue — v=10 in-flight, v=2 queued as pending (v=2 >= lastAppliedV=0
    // so it passes the initial v-guard and becomes pending). When v=10 completes,
    // lastAppliedV advances to 10; the finally() guard (2 < 10) discards pending v=2.
    const { fn, rendered } = makeMockRenderer(50);
    const q = createRenderQueue(fn);

    q.queueRender("digraph{v10}", "dot", 10); // in-flight
    q.queueRender("digraph{v2}", "dot", 2); // pending (passes v-guard now; stale later)

    await sleep(150);
    expect(rendered).toEqual(["digraph{v10}"]);
    expect(q._lastAppliedV()).toBe(10);
  });

  test("no concurrent renders — second queueRender waits for first to finish", async () => {
    const { fn, rendered } = makeMockRenderer(30);
    const q = createRenderQueue(fn);

    q.queueRender("digraph{first}", "dot", 1);
    q.queueRender("digraph{second}", "dot", 2);

    // At t=0: first in-flight, second pending. At t≈30 first completes, second starts.
    expect(rendered.length).toBe(1); // second hasn't started yet
    await sleep(80);
    expect(rendered).toEqual(["digraph{first}", "digraph{second}"]);
  });
});

describe("render-queue: sync throw recovery", () => {
  test("queue unlocks after renderFn throws synchronously", async () => {
    let callCount = 0;
    const fn = (_dot: string, _engine: string): Promise<void> => {
      callCount++;
      if (callCount === 1) {
        throw new Error("sync boom");
      }
      return Promise.resolve();
    };
    const q = createRenderQueue(fn);

    // First call throws synchronously — queue must unlock.
    q.queueRender("digraph{v1}", "dot", 1);
    expect(q._isInFlight()).toBe(false);

    // Second call must proceed normally after the sync failure.
    q.queueRender("digraph{v2}", "dot", 2);
    await sleep(10);
    expect(q._isInFlight()).toBe(false);
    expect(callCount).toBe(2);
  });
});

describe("render-queue: _resetForTest", () => {
  let q: ReturnType<typeof createRenderQueue>;

  beforeEach(() => {
    q = createRenderQueue(async () => {});
    q._resetForTest();
  });

  test("reset clears lastAppliedV to 0", () => {
    expect(q._lastAppliedV()).toBe(0);
  });

  test("reset allows previously-stale v to be re-applied", async () => {
    const { fn, rendered } = makeMockRenderer();
    const q2 = createRenderQueue(fn);
    q2.queueRender("digraph{v5}", "dot", 5);
    await sleep(10);
    expect(q2._lastAppliedV()).toBe(5);
    q2._resetForTest();
    q2.queueRender("digraph{v3}", "dot", 3);
    await sleep(10);
    expect(rendered).toEqual(["digraph{v5}", "digraph{v3}"]);
    expect(q2._lastAppliedV()).toBe(3);
  });
});
