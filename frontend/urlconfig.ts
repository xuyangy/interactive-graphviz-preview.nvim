// urlconfig.ts — resolve the interactivity config from the preview URL.
//
// The Lua side (commands.lua) appends the validated `setup()` interactivity
// keys to the preview URL it opens (`?sessionId=…&token=…&preserve_view=1&…`).
// This module parses that query string at startup and feeds the existing,
// already-clamping setters — the URL is the one Lua→browser channel that
// already exists. Zero new wire-protocol surface; the params live in the URL,
// so a tab reconnecting after a server restart re-applies the same config for
// free. Setters are imported from their home modules (not via render.ts) so
// this module's import graph stays free of the d3/WASM renderer.
//
// Robustness contract (spec: "Tampered URL" row): invalid/garbage param values
// must never throw —
//  - booleans only map exactly "1"/"0" → true/false; anything else is treated
//    as absent (no setter call), because setPreserveView takes a real boolean
//    (no clamp of its own) and setAnimate ignores non-booleans anyway;
//  - enums pass through as strings — setHighlightMode / setSearchConfig clamp
//    unknown values to their defaults themselves (do NOT duplicate validation).
// Absent params yield no setter call at all, so a legacy URL with only
// `sessionId`/`token` behaves exactly like today (all defaults).
//
// parseUrlConfig is pure (string → typed partial; no DOM, no module state), so
// it is unit-testable without a browser; applyUrlConfig is the thin side-effect
// wrapper main.ts calls once at startup.

import { setAnimate } from "./animate";
import { setHighlightMode } from "./interact";
import { setSearchConfig } from "./search";
import { setPreserveView } from "./viewstate";

/** The typed partial config carried by the preview URL. Absent key = no param. */
export interface UrlConfig {
  preserveView?: boolean;
  /** Passed through as-is; setHighlightMode clamps unknown values. */
  highlightMode?: string;
  animate?: boolean;
  /** Present when ANY search_* param is present; subfields stay partial. */
  search?: {
    /** Passed through as-is; setSearchConfig clamps unknown scopes. */
    scope?: string;
    caseSensitive?: boolean;
    regex?: boolean;
  };
}

/** Map exactly "1"/"0" to true/false; absent or garbage → undefined (no call). */
function parseBoolParam(value: string | null): boolean | undefined {
  if (value === "1") return true;
  if (value === "0") return false;
  return undefined;
}

/**
 * Parse a `window.location.search`-shaped query string into the typed partial
 * config. Pure: never throws on garbage; unknown params are ignored; keys are
 * present only when their param parsed meaningfully (booleans) or at all
 * (enums — the setters own enum validation).
 */
export function parseUrlConfig(search: string): UrlConfig {
  const params = new URLSearchParams(search);
  const cfg: UrlConfig = {};

  const preserveView = parseBoolParam(params.get("preserve_view"));
  if (preserveView !== undefined) cfg.preserveView = preserveView;

  const highlightMode = params.get("highlight_mode");
  if (highlightMode !== null) cfg.highlightMode = highlightMode;

  const animate = parseBoolParam(params.get("animate"));
  if (animate !== undefined) cfg.animate = animate;

  const scope = params.get("search_scope");
  const caseSensitive = parseBoolParam(params.get("search_case"));
  const regex = parseBoolParam(params.get("search_regex"));
  if (scope !== null || caseSensitive !== undefined || regex !== undefined) {
    cfg.search = {};
    if (scope !== null) cfg.search.scope = scope;
    if (caseSensitive !== undefined) cfg.search.caseSensitive = caseSensitive;
    if (regex !== undefined) cfg.search.regex = regex;
  }

  return cfg;
}

/**
 * Parse the query string and feed the four clamping setters. Keys absent from
 * the parsed config produce NO setter call (the module defaults stay in force).
 * Returns the parsed config for callers/tests.
 */
export function applyUrlConfig(search: string): UrlConfig {
  const cfg = parseUrlConfig(search);
  if (cfg.preserveView !== undefined) setPreserveView(cfg.preserveView);
  if (cfg.highlightMode !== undefined) setHighlightMode(cfg.highlightMode);
  if (cfg.animate !== undefined) setAnimate(cfg.animate);
  if (cfg.search !== undefined) setSearchConfig(cfg.search);
  return cfg;
}
