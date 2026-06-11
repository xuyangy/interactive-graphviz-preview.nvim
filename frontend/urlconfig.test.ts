import { afterEach, describe, expect, test } from "bun:test";
import { applyUrlConfig, parseUrlConfig } from "./urlconfig";
import { getPreserveView, setPreserveView } from "./viewstate";
import { _resetHighlightMode, getHighlightMode } from "./interact";
import { _resetSearchConfig, getSearchConfig } from "./search";
import { getAnimate, setAnimate } from "./animate";

// Spec "promote interactivity config" — the URL is the one Lua→browser config
// channel. parseUrlConfig is pure (no DOM needed: URLSearchParams is a plain
// global in Bun), so the I/O matrix rows are unit-tested directly; applyUrlConfig
// is asserted through the modules' existing getters. No real browser/WASM render
// is involved (see MEMORY browser-render-untested).

afterEach(() => {
  // Restore the module-level config seams to their defaults so tests never bleed.
  setPreserveView(true);
  _resetHighlightMode();
  _resetSearchConfig();
  setAnimate(true);
});

describe("parseUrlConfig (pure)", () => {
  test("legacy URL with only sessionId/token yields an empty partial (all defaults)", () => {
    expect(parseUrlConfig("?sessionId=3&token=tok-abc")).toEqual({});
  });

  test("empty string yields an empty partial", () => {
    expect(parseUrlConfig("")).toEqual({});
  });

  test("full default-valued param set parses to the explicit defaults", () => {
    const cfg = parseUrlConfig(
      "?sessionId=3&token=t&preserve_view=1&highlight_mode=bidirectional&animate=1" +
        "&search_scope=both&search_case=0&search_regex=0",
    );
    expect(cfg).toEqual({
      preserveView: true,
      highlightMode: "bidirectional",
      animate: true,
      search: { scope: "both", caseSensitive: false, regex: false },
    });
  });

  test("non-default values parse through (booleans 0/1, enums as strings)", () => {
    const cfg = parseUrlConfig(
      "?preserve_view=0&highlight_mode=upstream&animate=0&search_scope=nodes&search_case=1&search_regex=1",
    );
    expect(cfg).toEqual({
      preserveView: false,
      highlightMode: "upstream",
      animate: false,
      search: { scope: "nodes", caseSensitive: true, regex: true },
    });
  });

  test("tampered boolean values are treated as absent (no key)", () => {
    const cfg = parseUrlConfig("?preserve_view=banana&animate=yes&search_case=true");
    expect(cfg.preserveView).toBeUndefined();
    expect(cfg.animate).toBeUndefined();
    // search_case was garbage → no meaningful search subfield → no search key
    expect(cfg.search).toBeUndefined();
  });

  test("tampered enum values pass through (the setters own enum clamping)", () => {
    const cfg = parseUrlConfig("?highlight_mode=junk&search_scope=galaxy");
    expect(cfg.highlightMode).toBe("junk");
    expect(cfg.search).toEqual({ scope: "galaxy" });
  });

  test("partial search params produce a partial search object", () => {
    expect(parseUrlConfig("?search_scope=nodes")).toEqual({ search: { scope: "nodes" } });
    expect(parseUrlConfig("?search_regex=1")).toEqual({ search: { regex: true } });
  });

  test("never throws on a malformed query string", () => {
    expect(() => parseUrlConfig("?&&==&%%%&preserve_view")).not.toThrow();
    expect(parseUrlConfig("?preserve_view")).toEqual({}); // valueless param ≠ "1"/"0"
  });
});

describe("applyUrlConfig (feeds the clamping setters)", () => {
  test("legacy URL leaves every module getter at its default", () => {
    applyUrlConfig("?sessionId=3&token=tok-abc");
    expect(getPreserveView()).toBe(true);
    expect(getHighlightMode()).toBe("bidirectional");
    expect(getAnimate()).toBe(true);
    expect(getSearchConfig()).toEqual({ caseSensitive: false, regex: false, scope: "both" });
  });

  test("non-default params land in every module getter", () => {
    applyUrlConfig(
      "?preserve_view=0&highlight_mode=upstream&animate=0&search_scope=nodes&search_case=1&search_regex=1",
    );
    expect(getPreserveView()).toBe(false);
    expect(getHighlightMode()).toBe("upstream");
    expect(getAnimate()).toBe(false);
    expect(getSearchConfig()).toEqual({ caseSensitive: true, regex: true, scope: "nodes" });
  });

  test("tampered URL never throws; setters clamp to defaults (I/O matrix row)", () => {
    expect(() => applyUrlConfig("?highlight_mode=junk&animate=banana&search_scope=galaxy")).not.toThrow();
    expect(getHighlightMode()).toBe("bidirectional"); // setHighlightMode clamps
    expect(getAnimate()).toBe(true); // garbage boolean → no call → default
    expect(getSearchConfig().scope).toBe("both"); // setSearchConfig ignores bad scope
  });

  test("partial search config keeps defaults for unset subfields", () => {
    applyUrlConfig("?search_case=1");
    expect(getSearchConfig()).toEqual({ caseSensitive: true, regex: false, scope: "both" });
  });
});
