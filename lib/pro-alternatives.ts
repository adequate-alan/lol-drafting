// alan (2026-10-10): a pro pairing that is not already a saved default or alternative becomes an alternative
// automatically. Derived at load time from each record's observedProPairings, so new pro evidence flows in without a
// hand edit. Defaults never change from pro usage, earlier-2026 history never counts, and every derived alternative
// is listed in `proAlternatives` with a note, so it stays distinguishable from alan's hand-saved picks. The Pro
// Evidence itself (observedProPairings, sources) is untouched.
import type { ObservedPairing } from "./schema";

export const PRO_ALT_NOTE = "from pro games, not hand-saved";

interface Pairing {
  clashDefault: string[];
  alternatives: string[];
  alternativeNotes: Record<string, string>;
  observedProPairings: ObservedPairing[];
  proAlternatives?: string[];
}

/** alan's hand-saved alternatives only, without the pro-derived ones. */
export const handAlts = (r: { alternatives: string[]; proAlternatives?: string[] }) => r.alternatives.filter((a) => !r.proAlternatives?.includes(a));

export function withProAlternatives<T extends Pairing>(r: T): T {
  const listed = new Set([...r.clashDefault, ...r.alternatives]);
  const add = [...new Set(r.observedProPairings.filter((o) => o.era !== "earlier-2026" && !listed.has(o.champion)).map((o) => o.champion))];
  if (!add.length) return r;
  return {
    ...r,
    alternatives: [...r.alternatives, ...add],
    proAlternatives: add,
    alternativeNotes: { ...r.alternativeNotes, ...Object.fromEntries(add.map((id) => [id, PRO_ALT_NOTE])) },
  };
}
