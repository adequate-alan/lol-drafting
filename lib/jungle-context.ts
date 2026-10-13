// Jungle composition context (alan, 2026-10-13): what the enemy board already showed when a jungler was picked. This is
// General Draft Logic over the visible enemy champions' kit values (the v2 kits, unreviewed by alan), kept apart
// from observed pro usage. A trait on the board at the pick is a "potential composition response": the games show what
// was visible, never why the team picked. Only champions already picked count; nothing is inferred from later picks.
// This file is pure (no kit import), so the Draft Room can read the live enemy board; lib/jungle-kits.ts builds the facts.
import type { Role } from "./schema";

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
  // A jungler's composition response (Draft Room label): the trait was visible in at least `responseMin` of its ordered
  // picks (the small-sample line), in at least `responseShare` of them, and at `responseLift` times the rate across every
  // jungle pick or more.
  responseMin: 5,
  responseShare: 0.5,
  responseLift: 1.5,
} as const;

/** One champion's kit facts in one role, the only inputs the traits read. */
export interface BoardFacts {
  dive: boolean; carry: boolean; immobile: boolean; poke: boolean; frontline: boolean; hyper: boolean; peel: boolean;
  split: boolean; early: boolean; late: boolean; engage: boolean; disengage: number; threat: number; physical: number; magic: number;
}
export type FactBook = Record<string, Partial<Record<Role, BoardFacts>>>;
export interface Visible { champion: string; role?: Role }
export interface TraitHit { trait: CompTrait; champions: string[] }

const factOf = (book: FactBook, v: Visible) => {
  const byRole = book[v.champion];
  if (!byRole) return undefined;
  return (v.role && byRole[v.role]) || Object.values(byRole)[0];
};

/** The traits the visible enemy champions show, each with the champions behind it. Champions without a kit are skipped. */
export function boardTraits(visible: Visible[], book: FactBook): TraitHit[] {
  const known = visible.map((v) => ({ id: v.champion, f: factOf(book, v) })).filter((v): v is { id: string; f: BoardFacts } => !!v.f);
  const out: TraitHit[] = [];
  const add = (trait: CompTrait, list: typeof known, min = 1) => { if (list.length >= min) out.push({ trait, champions: list.map((x) => x.id) }); };
  const carries = known.filter((v) => v.f.carry);
  add("dive", known.filter((v) => v.f.dive), CONTEXT.dive);
  add("immobile-carry", carries.filter((v) => v.f.immobile));
  add("poke-siege", known.filter((v) => v.f.poke), CONTEXT.poke);
  add("frontline", known.filter((v) => v.f.frontline), CONTEXT.frontline);
  const hyper = carries.filter((v) => v.f.hyper), peel = known.filter((v) => v.f.peel);
  if (hyper.length && peel.length) out.push({ trait: "protect-carry", champions: [...hyper, ...peel].map((x) => x.id) });
  add("split", known.filter((v) => v.f.split));
  add("early", known.filter((v) => v.f.early), CONTEXT.early);
  add("scaling", known.filter((v) => v.f.late), CONTEXT.scaling);
  if (known.length >= CONTEXT.absentFrom && !known.some((v) => v.f.engage)) out.push({ trait: "no-engage", champions: known.map((v) => v.id) });
  if (known.length >= CONTEXT.absentFrom && known.reduce((n, v) => n + v.f.disengage, 0) <= 1) out.push({ trait: "no-disengage", champions: known.map((v) => v.id) });
  if (known.length >= CONTEXT.damageFrom) {
    let phys = 0, mag = 0, all = 0;
    for (const v of known) { phys += v.f.threat * v.f.physical; mag += v.f.threat * v.f.magic; all += v.f.threat; }
    if (all && phys / all >= CONTEXT.damageShare) out.push({ trait: "physical", champions: known.map((v) => v.id) });
    if (all && mag / all >= CONTEXT.damageShare) out.push({ trait: "magic", champions: known.map((v) => v.id) });
  }
  return out;
}

/** A jungler's observed composition responses: traits visible at its picks well above the all-jungle rate. */
export interface CompResponse { trait: CompTrait; with: number; picks: number; base: number; baseOf: number }
export function compResponses(mine: { game: number; side: string }[], all: { game: number; side: string }[], ctx: Record<string, { trait: string }[]>): CompResponse[] {
  const has = (s: { game: number; side: string }, t: CompTrait) => (ctx[`${s.game}:${s.side}`] ?? []).some((h) => h.trait === t);
  return (Object.keys(TRAIT_LABEL) as CompTrait[]).map((t) => ({
    trait: t, with: mine.filter((s) => has(s, t)).length, picks: mine.length, base: all.filter((s) => has(s, t)).length, baseOf: all.length,
  })).filter((r) => r.with >= CONTEXT.responseMin && r.with / r.picks >= CONTEXT.responseShare && r.base > 0 && r.with / r.picks >= CONTEXT.responseLift * (r.base / r.baseOf))
    .sort((a, b) => b.with / b.picks - a.with / a.picks);
}
