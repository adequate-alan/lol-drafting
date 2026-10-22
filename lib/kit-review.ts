// Kit review queue (alan, 2026-10-22): when Riot's patch notes change a champion's crowd control, mobility, range,
// damage profile or mechanics, that champion's stored attributes and kit values are flagged for a person to recheck.
// Pure numbers on damage, cooldowns or costs are routine tuning and are not flagged unless the change reworks the
// champion. The queue proposes what to look at and why; it never edits a kit, an attribute, a General Draft Logic
// coefficient or any ranking. A flag leaves the queue only through `data/kit-review.json` (alan's recorded decision).
import { comparePatch } from "./patch";
import type { Champion, KitReview, PatchNotes } from "./schema";
import { convertKits } from "./model-v2/kits";
import type { ChampionKit } from "./model-v2/schema";

export type Area = "crowd control" | "mobility" | "range" | "damage profile" | "durability" | "mechanics";

export interface KitFlag { areas: Area[]; ability?: string; text: string }
export interface KitValue { key: string; label: string; value: number | string; source: "attribute" | "kit" }
export interface KitReviewItem {
  champion: string;
  patch: string; // Riot's label
  entryId: string; // Patch Notes anchor
  category?: string; // Riot's buff / nerf / adjustment / rework
  flags: KitFlag[];
  values: KitValue[]; // the stored values the flagged areas touch, as they stand
  suggestion: string; // what to recheck and why; never a new value
}
export type { KitReview } from "./schema";
export type KitDecision = KitReview["decisions"][number];

const CC = /\b(stun|root|snare|knock(?:s|ed)?[ -]?(?:up|back|aside)|airborne|slow|charm|fear|flee|taunt|suppress|silence|sleep|ground(?:ed|s)?|polymorph|pull(?:s|ed)?|immobiliz)/i;
const MOBILITY = /\b(dash|blink|leap|jump|movement speed|move speed|teleport|unstoppable|untargetable)/i;
const RANGE = /\brange\b/i;
const DURABILITY = /\b(shield|heal(?:ing)?|damage reduction|armor|magic resist|tenacity|revive)/i;
const BEHAVIOUR = /\b(now|no longer|instead|new effect|removed)\b/i;
const TYPES = ["physical damage", "magic damage", "true damage", "AP)", "AD)"];

const typesOf = (s?: string) => TYPES.filter((t) => s?.includes(t));
const typeShift = (before?: string, after?: string) => !!before && !!after && typesOf(before).join() !== typesOf(after).join();

/** The significant lines of one champion entry. Routine number tuning returns nothing unless Riot calls it a rework. */
export function kitFlags(entry: PatchNotes["patches"][number]["entries"][number]): KitFlag[] {
  const rework = entry.category === "rework";
  const out: KitFlag[] = [];
  for (const g of entry.groups) {
    const ability = g.title;
    const base = /^base stats$/i.test(ability ?? "");
    for (const c of g.changes) {
      const text = c.text;
      if (/indicator|visual|vfx|sfx|tooltip|animation/i.test(c.label ?? "")) continue; // presentation, not the kit
      const label = `${c.label ?? ""} ${text}`;
      const areas = new Set<Area>();
      if (c.tag === "new" || c.tag === "removed" || BEHAVIOUR.test(text)) areas.add("mechanics");
      if (!base && CC.test(label)) areas.add("crowd control");
      if (MOBILITY.test(label) && !/^movement speed$/i.test(c.label ?? "")) areas.add("mobility");
      if (RANGE.test(c.label ?? "") || (base && /attack range/i.test(label))) areas.add("range");
      if (typeShift(c.before, c.after)) areas.add("damage profile");
      if (DURABILITY.test(label) && (rework || areas.has("mechanics"))) areas.add("durability");
      if (rework && !areas.size) areas.add("mechanics");
      if (areas.size) out.push({ areas: [...areas], ability, text });
    }
  }
  return out;
}

const AREA_VALUES: Record<Area, { attrs: (keyof Champion["attrs"])[]; kit: string[] }> = {
  "crowd control": { attrs: ["engage", "peel"], kit: ["aoeCc", "followUp", "counterEngage", "disengage"] },
  mobility: { attrs: ["engage"], kit: ["backlineAccess", "selfPeel"] },
  range: { attrs: ["poke"], kit: ["range", "structurePressure"] },
  "damage profile": { attrs: ["burst", "sustainedDps"], kit: ["tankDamage"] },
  durability: { attrs: ["frontline", "peel"], kit: ["selfPeel"] },
  mechanics: { attrs: [], kit: ["fightStart"] },
};
const LABEL: Record<string, string> = {
  engage: "Engage", peel: "Peel", poke: "Poke", burst: "Burst", sustainedDps: "Sustained damage", frontline: "Frontline",
  aoeCc: "AoE crowd control", followUp: "Follow-up", counterEngage: "Counter-engage", disengage: "Disengage",
  backlineAccess: "Backline access", selfPeel: "Self-peel", range: "Range", structurePressure: "Structure pressure",
  tankDamage: "Tank damage", fightStart: "Fight start",
};

function valuesFor(areas: Area[], champ: Champion | undefined, kit: ChampionKit | undefined): KitValue[] {
  const out: KitValue[] = [];
  const seen = new Set<string>();
  for (const a of areas) {
    for (const k of AREA_VALUES[a].attrs) if (champ && !seen.has(k)) { seen.add(k); out.push({ key: k, label: LABEL[k], value: champ.attrs[k], source: "attribute" }); }
    for (const k of AREA_VALUES[a].kit) {
      if (seen.has(k) || !kit) continue;
      const v = k === "fightStart" ? kit.fightStart : (kit.kit as unknown as Record<string, number>)[k];
      if (v == null) continue;
      seen.add(k);
      out.push({ key: k, label: LABEL[k], value: v, source: "kit" });
    }
  }
  return out;
}

const DIRECTION: Record<string, string> = { buff: "a buff", nerf: "a nerf", adjustment: "an adjustment", rework: "a rework" };

/** Every flagged champion change from `since` (exclusive) on, newest patch first, minus those alan already decided. */
export function kitReviewQueue(notes: PatchNotes, champions: Champion[], kits: ChampionKit[], decisions: KitDecision[] = [], since?: string): KitReviewItem[] {
  const byId = new Map(champions.map((c) => [c.id, c]));
  const kitBy = new Map(kits.map((k) => [k.id, k]));
  const done = new Set(decisions.map((d) => `${d.champion}|${d.patch}`));
  const out: KitReviewItem[] = [];
  for (const p of [...notes.patches].sort((a, b) => comparePatch(b.patch, a.patch))) {
    if (since && comparePatch(p.patch, since) <= 0) continue;
    for (const e of p.entries) {
      if (e.kind !== "champion" || !e.ref || done.has(`${e.ref}|${p.patch}`)) continue;
      const flags = kitFlags(e);
      if (!flags.length) continue;
      const areas = [...new Set(flags.flatMap((f) => f.areas))];
      const values = valuesFor(areas, byId.get(e.ref), kitBy.get(e.ref));
      const what = values.length ? values.map((v) => `${v.label} ${v.value}`).join(", ") : "the kit summary and fight start";
      const why = DIRECTION[e.category ?? ""] ?? "a change";
      out.push({ champion: e.ref, patch: p.patch, entryId: e.id, category: e.category, flags, values,
        suggestion: `Riot's ${p.patch} ${why} touches ${areas.join(", ")}: recheck ${what} against the changed lines. No value changes until reviewed.` });
    }
  }
  return out;
}

/** The queue over the stored kits (the kit conversions in the comp-analysis engine). */
export const storedKitQueue = (notes: PatchNotes, champions: Champion[], decisions: KitDecision[]) =>
  kitReviewQueue(notes, champions, convertKits(champions), decisions);
