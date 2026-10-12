// Shared motion helpers (alan, 2026-10-12). Durations and easing live as tokens in app/globals.css ("Motion"); scripts
// that scroll or animate read the visitor's reduced-motion preference here so JS motion follows the same rule as CSS.

/** True when the visitor asked the system for less motion. */
export const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** "smooth" for programmatic scrolling, or an instant jump under reduced motion. */
export const scrollBehavior = (): ScrollBehavior => (prefersReducedMotion() ? "auto" : "smooth");
