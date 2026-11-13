// Pro pairings that are not a saved default or alternative. alan's rule of 2026-10-10 made each one an alternative
// automatically; he withdrew that on 2026-11-13: a pairing seen in pro games must not get a saved-alternative bonus or
// saved-support eligibility just for being observed. They are still derived at load from each record's
// observedProPairings (earlier-2026 history never counts) and listed in `proAlternatives`, which is display only ("From
// pro games"): never in `alternatives`, never scored, never a saved pairing. Only alan's hand-saved alternatives score.
// The Pro Evidence itself (observedProPairings, sources) is untouched.
import type { ObservedPairing } from "./schema";

interface Pairing {
  clashDefault: string[];
  alternatives: string[];
  alternativeNotes: Record<string, string>;
  observedProPairings: ObservedPairing[];
  proAlternatives?: string[];
}

/** alan's hand-saved alternatives. `alternatives` no longer holds pro pairings; the filter guards older callers. */
export const handAlts = (r: { alternatives: string[]; proAlternatives?: string[] }) => r.alternatives.filter((a) => !r.proAlternatives?.includes(a));

export function withProAlternatives<T extends Pairing>(r: T): T {
  const listed = new Set([...r.clashDefault, ...r.alternatives]);
  const add = [...new Set(r.observedProPairings.filter((o) => o.era !== "earlier-2026" && !listed.has(o.champion)).map((o) => o.champion))];
  if (!add.length) return r;
  return { ...r, proAlternatives: add };
}
