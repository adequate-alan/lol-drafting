// Shared motion helpers (alan, 2026-10-12). Durations and easing live as tokens in app/globals.css ("Motion"); scripts
// that scroll or animate read the visitor's reduced-motion preference here so JS motion follows the same rule as CSS.

/** True when the visitor asked the system for less motion. */
export const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** "smooth" for programmatic scrolling, or an instant jump under reduced motion. */
export const scrollBehavior = (): ScrollBehavior => (prefersReducedMotion() ? "auto" : "smooth");

/**
 * A new filter, sort or search shows its results from the first row (alan, 2026-10-16): the results' own scroll box goes
 * back to the top, the page itself stays where it is. Opening a row or a game never calls this.
 */
export const resultsToTop = (selector: string) => {
  const box = typeof document === "undefined" ? null : document.querySelector(selector);
  if (box && box.scrollTop) box.scrollTop = 0;
};
