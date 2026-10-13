// Jungle composition context (alan, 2026-10-13): what the enemy board already showed when a jungler was picked. This is
// General Draft Logic over the visible enemy champions' kit values (lib/model-v2/kits.ts, unreviewed by alan), kept apart
// from observed pro usage. A trait on the board at the pick is a "potential composition response": the games show what
// was visible, never why the team picked. Only champions already picked count; nothing is inferred from later picks.
import { convertKits } from "./model-v2/kits";
import type { ChampionKit } from "./model-v2/schema";
import type { Champion, Role } from "./schema";

/** The v2 kits by champion id (General Draft Logic, unreviewed by alan). */
export const kitMap = (champions: Champion[]) => new Map(convertKits(champions).map((k) => [k.id, k]));

export type CompTrait =
  | "dive" | "immobile-carry" | "poke-siege" | "frontline" | "protect-carry" | "split" | "early" | "scaling"
  | "no-engage" | "no-disengage" | "physical" | "magic";

export const TRAIT_LABEL: Record<CompTrait, string> = {
  dive: "Mobility and dive", "immobile-carry": "Immobile carry", "poke-siege": "Poke and siege", frontline: "Heavy frontline",
  "protect-carry": "Protect the carry", split: "Split pressure", early: "Early skirmish", scaling: "Scaling",
  "no-engage": "Limited engage", "no-disengage": "Limited disengage", physical: "Heavy physical damage", magic: "Heavy magic damage",
};

/** Every threshold in one place. A trait needs this many visible champions showing it (or the stated board size). */
export const CONTEXT = {
  dive: 2, // champions with backline access 2+
  poke: 2, // champions with poke 2+ or structure pressure 2+
  frontline: 2, // champions with frontline 2+
  early: 2, // champions with early curve 3
  scaling: 2, // champions with late curve 3
  absentFrom: 3, // "limited engage / disengage" needs at least this many visible champions
  damageShare: 0.75, // physical or magic share of the visible damage threat
  damageFrom: 3,
} as const;

export interface Visible { champion: string; role?: Role }
export interface TraitHit { trait: CompTrait; champions: string[] }

/** The traits the visible enemy champions show, each with the champions behind it. Unknown kits are skipped. */
export function boardTraits(visible: Visible[], kits: Map<string, ChampionKit>): TraitHit[] {
  const known = visible.map((v) => ({ ...v, k: kits.get(v.champion) })).filter((v): v is Visible & { k: ChampionKit } => !!v.k);
  const out: TraitHit[] = [];
  const add = (trait: CompTrait, list: typeof known, min = 1) => { if (list.length >= min) out.push({ trait, champions: list.map((x) => x.champion) }); };
  const role = (v: Visible & { k: ChampionKit }) => v.role ?? v.k.roles[0];
  const threat = (v: Visible & { k: ChampionKit }) => v.k.damageByRole[role(v)]?.damageThreat ?? 0;
  const carries = known.filter((v) => threat(v) >= 3);
  add("dive", known.filter((v) => v.k.kit.backlineAccess >= 2), CONTEXT.dive);
  add("immobile-carry", carries.filter((v) => v.k.kit.selfPeel <= 1));
  add("poke-siege", known.filter((v) => v.k.attrs.poke >= 2 || v.k.kit.structurePressure >= 2), CONTEXT.poke);
  add("frontline", known.filter((v) => v.k.attrs.frontline >= 2), CONTEXT.frontline);
  const hyper = carries.filter((v) => v.k.kit.resourceDemand >= 3 && v.k.kit.curve.late >= 3), peel = known.filter((v) => v.k.attrs.peel >= 3);
  if (hyper.length && peel.length) out.push({ trait: "protect-carry", champions: [...hyper, ...peel].map((x) => x.champion) });
  add("split", known.filter((v) => v.k.attrs.sidePressure >= 3 && threat(v) >= 2));
  add("early", known.filter((v) => v.k.kit.curve.early >= 3), CONTEXT.early);
  add("scaling", known.filter((v) => v.k.kit.curve.late >= 3), CONTEXT.scaling);
  if (known.length >= CONTEXT.absentFrom && !known.some((v) => v.k.fightStart === "primary")) out.push({ trait: "no-engage", champions: known.map((v) => v.champion) });
  if (known.length >= CONTEXT.absentFrom && known.reduce((n, v) => n + v.k.kit.disengage, 0) <= 1) out.push({ trait: "no-disengage", champions: known.map((v) => v.champion) });
  if (known.length >= CONTEXT.damageFrom) {
    let phys = 0, mag = 0, all = 0;
    for (const v of known) {
      const d = v.k.damageByRole[role(v)];
      if (!d) continue;
      phys += d.damageThreat * d.damageSplit.physical; mag += d.damageThreat * d.damageSplit.magic; all += d.damageThreat;
    }
    if (all && phys / all >= CONTEXT.damageShare) out.push({ trait: "physical", champions: known.map((v) => v.champion) });
    if (all && mag / all >= CONTEXT.damageShare) out.push({ trait: "magic", champions: known.map((v) => v.champion) });
  }
  return out;
}
