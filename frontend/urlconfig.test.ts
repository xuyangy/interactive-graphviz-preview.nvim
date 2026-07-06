import { afterEach, describe, expect, test } from "bun:test";
import {
  _resetAppliedConfig,
  applyConfigObject,
  applyUrlConfig,
  currentConfigSearch,
  filterConfigSearch,
  parseUrlConfig,
} from "./urlconfig";
import { getPreserveView, setPreserveView } from "./viewstate";
import { _resetHighlightMode, getHighlightMode } from "./interact";
import { _resetSearchConfig, getSearchConfig } from "./search";
import { getAnimate, setAnimate } from "./animate";
import { _resetSync, getJumpOnClick, setJumpOnClick } from "./sync";

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
  _resetSync();
  _resetAppliedConfig();
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
        "&search_scope=both&search_case=0&search_regex=0&sync_jump_on_click=1",
    );
    expect(cfg).toEqual({
      preserveView: true,
      highlightMode: "bidirectional",
      animate: true,
      search: { scope: "both", caseSensitive: false, regex: false },
      syncJumpOnClick: true,
    });
  });

  test("non-default values parse through (booleans 0/1, enums as strings)", () => {
    const cfg = parseUrlConfig(
      "?preserve_view=0&highlight_mode=upstream&animate=0&search_scope=nodes&search_case=1&search_regex=1" +
        "&sync_jump_on_click=0",
    );
    expect(cfg).toEqual({
      preserveView: false,
      highlightMode: "upstream",
      animate: false,
      search: { scope: "nodes", caseSensitive: true, regex: true },
      syncJumpOnClick: false,
    });
  });

  test("tampered boolean values are treated as absent (no key)", () => {
    const cfg = parseUrlConfig(
      "?preserve_view=banana&animate=yes&search_case=true&sync_jump_on_click=on",
    );
    expect(cfg.preserveView).toBeUndefined();
    expect(cfg.animate).toBeUndefined();
    // search_case was garbage → no meaningful search subfield → no search key
    expect(cfg.search).toBeUndefined();
    expect(cfg.syncJumpOnClick).toBeUndefined();
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
    expect(getJumpOnClick()).toBe(true);
  });

  test("non-default params land in every module getter", () => {
    applyUrlConfig(
      "?preserve_view=0&highlight_mode=upstream&animate=0&search_scope=nodes&search_case=1&search_regex=1" +
        "&sync_jump_on_click=0",
    );
    expect(getPreserveView()).toBe(false);
    expect(getHighlightMode()).toBe("upstream");
    expect(getAnimate()).toBe(false);
    expect(getSearchConfig()).toEqual({ caseSensitive: true, regex: true, scope: "nodes" });
    expect(getJumpOnClick()).toBe(false);
  });

  test("sync_jump_on_click=1 re-enables a previously disabled gate", () => {
    setJumpOnClick(false);
    applyUrlConfig("?sync_jump_on_click=1");
    expect(getJumpOnClick()).toBe(true);
  });

  test("tampered URL never throws; setters clamp to defaults (I/O matrix row)", () => {
    expect(() =>
      applyUrlConfig("?highlight_mode=junk&animate=banana&search_scope=galaxy&sync_jump_on_click=yes"),
    ).not.toThrow();
    expect(getHighlightMode()).toBe("bidirectional"); // setHighlightMode clamps
    expect(getAnimate()).toBe(true); // garbage boolean → no call → default
    expect(getSearchConfig().scope).toBe("both"); // setSearchConfig ignores bad scope
    expect(getJumpOnClick()).toBe(true); // garbage boolean → no call → default
  });

  test("partial search config keeps defaults for unset subfields", () => {
    applyUrlConfig("?search_case=1");
    expect(getSearchConfig()).toEqual({ caseSensitive: true, regex: false, scope: "both" });
  });
});

describe("filterConfigSearch (export-time credential stripping)", () => {
  test("drops sessionId/token, keeps every config param (values intact)", () => {
    const out = filterConfigSearch(
      "?sessionId=3&token=tok-secret&preserve_view=0&highlight_mode=upstream&animate=0" +
        "&search_scope=nodes&search_case=1&search_regex=1&sync_jump_on_click=0",
    );
    expect(out).not.toContain("token");
    expect(out).not.toContain("sessionId");
    expect(out).not.toContain("tok-secret");
    // Round-trip: the filtered string parses to the identical config.
    expect(parseUrlConfig(out)).toEqual({
      preserveView: false,
      highlightMode: "upstream",
      animate: false,
      search: { scope: "nodes", caseSensitive: true, regex: true },
      syncJumpOnClick: false,
    });
  });

  test("credentials-only or empty search filters to the empty string", () => {
    expect(filterConfigSearch("?sessionId=3&token=tok-abc")).toBe("");
    expect(filterConfigSearch("")).toBe("");
  });

  test("unknown params are dropped (whitelist, not blacklist)", () => {
    expect(filterConfigSearch("?future_secret=x&animate=1")).toBe("?animate=1");
  });

  test("never throws on a malformed query string", () => {
    expect(() => filterConfigSearch("?&&==&%%%&token")).not.toThrow();
  });
});

describe("applyConfigObject (config_update payload, plan item #3)", () => {
  test("a wire_params-shaped record applies through the same clamping setters", () => {
    const cfg = applyConfigObject({
      preserve_view: "0",
      highlight_mode: "upstream",
      animate: "0",
      search_scope: "nodes",
      search_case: "1",
      search_regex: "1",
      sync_jump_on_click: "0",
    });
    expect(cfg).not.toBeNull();
    expect(getPreserveView()).toBe(false);
    expect(getHighlightMode()).toBe("upstream");
    expect(getAnimate()).toBe(false);
    expect(getSearchConfig()).toEqual({ scope: "nodes", caseSensitive: true, regex: true });
    expect(getJumpOnClick()).toBe(false);
  });

  test("non-object payloads apply nothing and return null", () => {
    setAnimate(false);
    for (const bad of [null, undefined, "animate=1", 7, ["animate"]]) {
      expect(applyConfigObject(bad)).toBeNull();
    }
    expect(getAnimate()).toBe(false); // untouched
  });

  test("non-string values and unknown keys are ignored; enum garbage clamps", () => {
    const cfg = applyConfigObject({
      animate: 0, // number, not the wire encoding — ignored
      highlight_mode: "not-a-mode", // clamped by setHighlightMode
      token: "evil", // not a config param — never applied or recorded
      search_scope: "edges",
    });
    expect(cfg).toEqual({ highlightMode: "not-a-mode", search: { scope: "edges" } });
    expect(getAnimate()).toBe(true); // untouched default
    expect(getHighlightMode()).toBe("bidirectional"); // clamped
    expect(getSearchConfig().scope).toBe("edges");
    expect(currentConfigSearch()).not.toContain("token");
  });
});

describe("currentConfigSearch (export-time effective config)", () => {
  test("starts empty; accumulates the boot URL's whitelisted params only", () => {
    expect(currentConfigSearch()).toBe("");
    applyUrlConfig("?sessionId=3&token=tok-abc&animate=0&highlight_mode=upstream");
    const params = new URLSearchParams(currentConfigSearch());
    expect([...params.keys()].sort()).toEqual(["animate", "highlight_mode"]);
    expect(params.get("animate")).toBe("0");
    expect(params.get("highlight_mode")).toBe("upstream");
    // The runtime credentials never enter the accumulator (shareable-file safety).
    expect(currentConfigSearch()).not.toContain("token");
    expect(currentConfigSearch()).not.toContain("sessionId");
  });

  test("a config_update overlays per-key: updated keys change, absent keys survive", () => {
    applyUrlConfig("?animate=0&highlight_mode=upstream");
    applyConfigObject({ animate: "1" });
    const params = new URLSearchParams(currentConfigSearch());
    expect(params.get("animate")).toBe("1"); // updated
    expect(params.get("highlight_mode")).toBe("upstream"); // survives
  });

  test("the exported string round-trips through applyUrlConfig (export boot path)", () => {
    applyConfigObject({
      preserve_view: "0",
      highlight_mode: "downstream",
      animate: "0",
      search_scope: "edges",
      search_case: "1",
      search_regex: "0",
      sync_jump_on_click: "0",
    });
    const exported = currentConfigSearch();
    // Reset the live state, then boot "an exported page" from the string.
    setPreserveView(true);
    _resetHighlightMode();
    setAnimate(true);
    _resetSearchConfig();
    _resetSync();
    applyUrlConfig(exported);
    expect(getPreserveView()).toBe(false);
    expect(getHighlightMode()).toBe("downstream");
    expect(getAnimate()).toBe(false);
    expect(getSearchConfig()).toEqual({ scope: "edges", caseSensitive: true, regex: false });
    expect(getJumpOnClick()).toBe(false);
  });
});
