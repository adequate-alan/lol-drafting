// The facts the counter kit read compares (lib/matchup-read.ts), from the v2 kits and champion attributes (General Draft
// Logic, unreviewed by alan). Server side only: the browser gets the small fact book, never the kit model.
import { convertKits } from "./model-v2/kits";
import type { ChampionKit } from "./model-v2/schema";
import type { MatchupBook, MatchupFacts } from "./matchup-read";
import type { Champion, Role } from "./schema";

type N = MatchupFacts["range"];
const n = (v: number) => v as N; // every kit value and attribute is already a 0–3 integer (zod Scale)

function factsOf(k: ChampionKit, role: Role): MatchupFacts {
  const threat = k.damageByRole[role]?.damageThreat ?? 0;
  // selfPeel was written for carries and defaults to 0 for everyone else: carried only where it was set or the champion
  // is a carry threat in this role, so a tank's or an enchanter's 0 is never read as "immobile".
  const mobility = k.kit.selfPeel > 0 || threat >= 3 ? { mobility: n(k.kit.selfPeel) } : {};
  return {
    range: n(k.kit.range), poke: n(k.attrs.poke), waveclear: n(k.kit.waveclear), lanePressure: n(k.attrs.lanePressure),
    early: n(k.kit.curve.early), late: n(k.kit.curve.late), reach: n(k.kit.backlineAccess), ...mobility,
    disengage: n(k.kit.disengage), counterEngage: n(k.kit.counterEngage), start: k.fightStart,
    frontline: n(k.attrs.frontline), tankDamage: n(k.kit.tankDamage), burst: n(k.attrs.burst),
  };
}

/** Every champion with a kit, one fact set per role it plays. */
export function matchupBook(champions: Champion[]): MatchupBook {
  return Object.fromEntries(convertKits(champions).map((k) => [k.id, Object.fromEntries(k.roles.map((r) => [r, factsOf(k, r)]))]));
}
