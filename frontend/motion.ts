// motion.ts — the DOM-side animation gate (Story 5.4, AC1/AC4/AC5). The pure
// config gate + decision logic live in animate.ts (unit-tested without a real
// matchMedia); this module owns the one matchMedia read. Extracted from
// render.ts (plan item #1b) so both the d3 render/pan transitions (render.ts)
// and the emphasis CSS gate (emphasis.ts) consult the SINGLE predicate and
// can never diverge: animate only when the config gate is on AND the
// environment does not request reduced motion.

import { animationsEnabledWith, getAnimate } from "./animate";

/** True when motion should be used right now (config gate ∧ ¬prefers-reduced-motion). */
export function animationsEnabled(): boolean {
  let reducedMotion = false;
  try {
    // matchMedia is absent in non-DOM contexts; treat absence as "no preference".
    reducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    reducedMotion = false;
  }
  return animationsEnabledWith(getAnimate(), reducedMotion);
}
