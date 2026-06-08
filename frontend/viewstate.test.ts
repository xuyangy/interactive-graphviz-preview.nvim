import { afterEach, describe, expect, test } from "bun:test";
import { zoomIdentity } from "d3-zoom";
import {
  captureViewState,
  defaultViewState,
  getPreserveView,
  restoreViewState,
  setPreserveView,
  type ViewState,
  type ZoomAccessor,
} from "./viewstate";

// ── Stub ZoomAccessor ─────────────────────────────────────────────────────────
// Models the live d3-graphviz zoom state. `transformOnNode` is what
// d3.zoomTransform(node) will return — d3-zoom stores the transform on the DOM
// node under the `__zoom` property, so we set that to drive zoomTransform().

function makeNode(transform: unknown | null): Element {
  // d3.zoomTransform reads node.__zoom; absent => zoomIdentity.
  const node = {} as unknown as Element;
  if (transform != null) {
    (node as unknown as { __zoom: unknown }).__zoom = transform;
  }
  return node;
}

function makeAccessor(opts: {
  node?: Element | null;
  hasSelection?: boolean;
  hasBehavior?: boolean;
  onTransform?: (selection: unknown, transform: unknown) => void;
}): ZoomAccessor {
  const { node = null, hasSelection = true, hasBehavior = true, onTransform } = opts;
  return {
    zoomSelection() {
      if (!hasSelection) return null;
      return { node: () => node };
    },
    zoomBehavior() {
      if (!hasBehavior) return null;
      return {
        transform(selection: unknown, transform: unknown) {
          onTransform?.(selection, transform);
        },
      };
    },
  };
}

afterEach(() => {
  // Reset module-level preserve flag between tests (default is true).
  setPreserveView(true);
});

describe("defaultViewState", () => {
  test("preserves by default with no transform", () => {
    const vs = defaultViewState();
    expect(vs.preserve).toBe(true);
    expect(vs.transform).toBeNull();
  });
});

describe("preserve_view flag (Decision D1, AC3/AC4)", () => {
  test("defaults to true (matches Lua default, zero new wire surface)", () => {
    expect(getPreserveView()).toBe(true);
  });

  test("setPreserveView toggles the resolved value", () => {
    setPreserveView(false);
    expect(getPreserveView()).toBe(false);
    setPreserveView(true);
    expect(getPreserveView()).toBe(true);
  });
});

describe("captureViewState (AC2)", () => {
  test("returns a transform when one is active", () => {
    const t = zoomIdentity.translate(40, 25).scale(2);
    const accessor = makeAccessor({ node: makeNode(t) });
    const vs = captureViewState(accessor);
    expect(vs).not.toBeNull();
    expect(vs?.transform).toBe(t);
    expect(vs?.preserve).toBe(true);
  });

  test("returns null on a fresh canvas (no zoom selection yet)", () => {
    const accessor = makeAccessor({ hasSelection: false });
    expect(captureViewState(accessor)).toBeNull();
  });

  test("returns null when selection node is null", () => {
    const accessor = makeAccessor({ node: null });
    expect(captureViewState(accessor)).toBeNull();
  });

  test("returns null for the identity transform (nothing to restore)", () => {
    const accessor = makeAccessor({ node: makeNode(null) }); // no __zoom => identity
    expect(captureViewState(accessor)).toBeNull();
  });

  test("returns null when preserve_view is false (AC3)", () => {
    setPreserveView(false);
    const t = zoomIdentity.translate(10, 10).scale(3);
    const accessor = makeAccessor({ node: makeNode(t) });
    expect(captureViewState(accessor)).toBeNull();
  });
});

describe("restoreViewState (AC2/AC3)", () => {
  test("reapplies the captured transform via the zoom behavior", () => {
    const t = zoomIdentity.translate(40, 25).scale(2);
    let applied: unknown = null;
    const accessor = makeAccessor({
      node: makeNode(t),
      onTransform: (_sel, transform) => {
        applied = transform;
      },
    });
    const vs: ViewState = { preserve: true, transform: t };
    restoreViewState(accessor, vs);
    expect(applied).toBe(t);
  });

  test("is a no-op when vs is null", () => {
    let called = false;
    const accessor = makeAccessor({
      node: makeNode(null),
      onTransform: () => {
        called = true;
      },
    });
    restoreViewState(accessor, null);
    expect(called).toBe(false);
  });

  test("is a no-op (fit-reset) when preserve_view is false (AC3)", () => {
    setPreserveView(false);
    const t = zoomIdentity.translate(40, 25).scale(2);
    let called = false;
    const accessor = makeAccessor({
      node: makeNode(t),
      onTransform: () => {
        called = true;
      },
    });
    restoreViewState(accessor, { preserve: true, transform: t });
    expect(called).toBe(false);
  });

  test("is a no-op when the new zoom behavior does not exist yet", () => {
    const t = zoomIdentity.translate(40, 25).scale(2);
    const accessor = makeAccessor({ node: makeNode(t), hasBehavior: false });
    // Should not throw.
    expect(() => restoreViewState(accessor, { preserve: true, transform: t })).not.toThrow();
  });
});
