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
import { setJumpOnClick } from "./sync";
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
  /** Story 6.2 — the browser-side graph→buffer jump gate. */
  syncJumpOnClick?: boolean;
}

/**
 * The 7 config param names — exactly the set parseUrlConfig reads. The
 * Lua↔TS contract test (urlparam-contract.test.ts) pins the same set on both
 * sides of the boundary, so a drift between this list and parseUrlConfig's
 * literal `params.get(...)` calls fails that test.
 */
const CONFIG_PARAM_KEYS = [
  "preserve_view",
  "highlight_mode",
  "animate",
  "search_scope",
  "search_case",
  "search_regex",
  "sync_jump_on_click",
] as const;

/**
 * Reduce a preview query string to ONLY the interactivity config params.
 * Whitelist, not blacklist: runtime credentials (`sessionId`, `token`) and
 * anything unknown are dropped. Used at export time (saveInteractiveHtml) —
 * an exported graph.html must carry the config that shaped the preview but
 * never the live session's auth token, which would otherwise leak in a
 * shareable file. Returns "" when no config params are present, else a
 * "?"-prefixed string.
 */
export function filterConfigSearch(search: string): string {
  const params = new URLSearchParams(search);
  const kept = new URLSearchParams();
  for (const key of CONFIG_PARAM_KEYS) {
    const value = params.get(key);
    if (value !== null) kept.set(key, value);
  }
  const out = kept.toString();
  return out.length > 0 ? `?${out}` : "";
}

// The effective config params, accumulated across every apply (boot URL,
// then each config_update). Export (saveInteractiveHtml) reads this instead
// of window.location.search: after a live config push, the URL's params are
// STALE — an exported file must carry the config actually in force. Merge
// semantics (per-key set, never cleared) mirror the setters themselves: an
// absent key leaves the previously applied value in force. Only values that
// PARSED are recorded (re-encoded from the typed partial, not the raw
// params): a garbage boolean like animate=banana makes no setter call — the
// previous value stays in force — so recording it raw would export a config
// that never was. Enum strings pass through raw; the setters clamp garbage
// identically on the exported page's boot, so raw stays faithful for them.
const appliedParams = new URLSearchParams();

/** The accumulated effective config as a "?"-prefixed query string ("" when empty). */
export function currentConfigSearch(): string {
  const out = appliedParams.toString();
  return out.length > 0 ? `?${out}` : "";
}

/** Reset the applied-config accumulator. Tests only. */
export function _resetAppliedConfig(): void {
  for (const key of [...appliedParams.keys()]) appliedParams.delete(key);
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

  const syncJumpOnClick = parseBoolParam(params.get("sync_jump_on_click"));
  if (syncJumpOnClick !== undefined) cfg.syncJumpOnClick = syncJumpOnClick;

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
  if (cfg.syncJumpOnClick !== undefined) setJumpOnClick(cfg.syncJumpOnClick);
  // Record the EFFECTIVE params for export (see currentConfigSearch): re-encode
  // from the parsed partial so unparseable values (which made no setter call)
  // are never recorded. Booleans re-encode canonically as "1"/"0".
  const b = (v: boolean) => (v ? "1" : "0");
  if (cfg.preserveView !== undefined) appliedParams.set("preserve_view", b(cfg.preserveView));
  if (cfg.highlightMode !== undefined) appliedParams.set("highlight_mode", cfg.highlightMode);
  if (cfg.animate !== undefined) appliedParams.set("animate", b(cfg.animate));
  if (cfg.search?.scope !== undefined) appliedParams.set("search_scope", cfg.search.scope);
  if (cfg.search?.caseSensitive !== undefined)
    appliedParams.set("search_case", b(cfg.search.caseSensitive));
  if (cfg.search?.regex !== undefined) appliedParams.set("search_regex", b(cfg.search.regex));
  if (cfg.syncJumpOnClick !== undefined)
    appliedParams.set("sync_jump_on_click", b(cfg.syncJumpOnClick));
  return cfg;
}

/**
 * Apply a config_update message's `config` payload (plan item #3): a record of
 * the SAME param names/encodings the preview URL carries, produced by the Lua
 * side's config.wire_params(). Re-encodes the whitelisted string entries as a
 * query string and funnels through applyUrlConfig, so the two Lua→browser
 * config channels share one parser, one clamping path, and one export
 * accumulator. Returns the applied partial, or null for a non-object payload
 * (malformed frame — apply nothing rather than half-apply garbage).
 */
export function applyConfigObject(config: unknown): UrlConfig | null {
  if (typeof config !== "object" || config === null || Array.isArray(config)) return null;
  const params = new URLSearchParams();
  for (const key of CONFIG_PARAM_KEYS) {
    const value = (config as Record<string, unknown>)[key];
    if (typeof value === "string") params.set(key, value);
  }
  return applyUrlConfig(`?${params.toString()}`);
}
