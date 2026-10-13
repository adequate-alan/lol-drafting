// Kit facts for the jungle board read (lib/jungle-context.ts), from the v2 kits (General Draft Logic, unreviewed by alan).
// Server side only: the browser gets the small fact book, never the kit model.
import { convertKits } from "./model-v2/kits";
import type { ChampionKit } from "./model-v2/schema";
import type { BoardFacts, FactBook } from "./jungle-context";
import type { Champion, Role } from "./schema";

function factsOf(k: ChampionKit, role: Role): BoardFacts {
  const d = k.damageByRole[role] ?? k.damageByRole[k.roles[0]];
  const threat = d?.damageThreat ?? 0;
  return {
    dive: k.kit.backlineAccess >= 2, carry: threat >= 3, immobile: k.kit.selfPeel <= 1,
    poke: k.attrs.poke >= 2 || k.kit.structurePressure >= 2, frontline: k.attrs.frontline >= 2,
    hyper: k.kit.resourceDemand >= 3 && k.kit.curve.late >= 3, peel: k.attrs.peel >= 3, split: k.attrs.sidePressure >= 3 && threat >= 2,
    early: k.kit.curve.early >= 3, late: k.kit.curve.late >= 3, engage: k.fightStart === "primary", disengage: k.kit.disengage,
    threat, physical: d?.damageSplit.physical ?? 0, magic: d?.damageSplit.magic ?? 0,
  };
}

/** Every champion with a kit, one fact set per role it plays. */
export function factBook(champions: Champion[]): FactBook {
  return Object.fromEntries(convertKits(champions).map((k) => [k.id, Object.fromEntries(k.roles.map((r) => [r, factsOf(k, r)]))]));
}
