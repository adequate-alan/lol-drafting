// Proposed champion model (v2). Approved in direction by alan on 2026-10-10; NOT yet used by the Draft Room.
// Replaces the numeric `engage` rating with `fightStart`, and the single `damage` type with a role-specific
// damage threat plus a damage split. Every other attribute stays as it is.
import { z } from "zod";
import { ATTRS, Champion, Role, ROLES, type Attr } from "../schema";

// How a champion can begin a fight. Follow-up never satisfies a fight-start requirement.
export const FightStart = z.enum([
  "primary",   // can reasonably be relied on as the team's main fight starter (Sejuani, Vi, Ornn, Leona, Nautilus, Rell, Maokai, Alistar); a skillshot start still counts
  "catch",     // starts a fight by picking one target or cutting one off (Lee Sin, Syndra, Thresh, Trundle, Qiyana)
  "follow-up", // CC that adds to a fight someone else started
  "none",
]);
export type FightStart = z.infer<typeof FightStart>;

// Share of a champion's damage by type. Must total 1.
export const DamageSplit = z
  .object({ physical: z.number().min(0).max(1), magic: z.number().min(0).max(1), true: z.number().min(0).max(1) })
  .refine((s) => Math.abs(s.physical + s.magic + s.true - 1) < 1e-9, { message: "damageSplit must total 1" });
export type DamageSplit = z.infer<typeof DamageSplit>;

// How much of the team's fight damage this champion supplies when played in a given role, at that role's gold level.
//   3 primary carry threat · 2 secondary threat · 1 utility damage (most supports, tanks) · 0 negligible
export const RoleDamage = z.object({
  damageThreat: z.number().int().min(0).max(3),
  damageSplit: DamageSplit,
});
export type RoleDamage = z.infer<typeof RoleDamage>;

const V2_ATTRS = ATTRS.filter((a): a is Exclude<Attr, "engage"> => a !== "engage");
export type V2Attr = (typeof V2_ATTRS)[number];
const Scale = z.number().int().min(0).max(3);

export const ChampionV2 = Champion.omit({ damage: true, attrs: true })
  .extend({
    // Descriptive only: DPS, burst and poke describe how a champion deals damage. They do not feed the AD/AP balance.
    attrs: z.object(Object.fromEntries(V2_ATTRS.map((a) => [a, Scale])) as Record<V2Attr, typeof Scale>),
    fightStart: FightStart,
    damageByRole: z.record(Role, RoleDamage),
  })
  .refine((c) => c.roles.every((r) => c.damageByRole[r]) && Object.keys(c.damageByRole).every((r) => c.roles.includes(r as Role)), {
    message: "damageByRole must have exactly one entry per role the champion plays",
  });
export type ChampionV2 = z.infer<typeof ChampionV2>;

// The engage meter is derived from fightStart so there is one source of truth.
export const ENGAGE_METER: Record<FightStart, number> = { primary: 3, catch: 2, "follow-up": 1, none: 0 };

export { ROLES };

// ---------- v2 kit (comp analysis; proposal, NOT active) ----------
// Deterministic champion facts the comp-analysis engine (lib/model-v2/analyze.ts) needs beyond the v1 attributes.
// Every value is a 0–3 draft heuristic, not a measurement. The v1 attributes (frontline, peel, sustainedDps, burst,
// poke, scaling, lanePressure, sidePressure, objectiveControl), fightStart and damageByRole stay as they are.
export const KIT_FIELDS = [
  "waveclear",       // clears a wave from range quickly: 0 slow / melee single-target … 3 instant from range
  "range",           // effective teamfight range: 0 must stand on the target · 1 short · 2 standard ranged · 3 long / artillery
  "tankDamage",      // kills a frontline: %HP, true damage, sustained shred
  "backlineAccess",  // reaches a protected carry through or around a frontline
  "disengage",       // stops or undoes an enemy engage before it lands: knockbacks, zones, team speed, shields on the target
  "counterEngage",   // punishes an engage after it commits: turn-around CC
  "followUp",        // capitalises at once on an ally's engage: AoE CC, burst on a locked target, fast reach
  "aoeCc",           // multi-target crowd control in a fight (layered / wombo engage)
  "resourceDemand",  // 3 needs gold and farm priority · 0 is happy on a low-economy role
  "ultDependency",   // 3 most of the champion's fight value is its ultimate
  "setupDependency", // 3 needs someone else to create the angle (needs-setup champions are 2+)
] as const;
export type KitField = (typeof KIT_FIELDS)[number];
export const PowerCurve = z.object({ early: Scale, mid: Scale, late: Scale });
export type PowerCurve = z.infer<typeof PowerCurve>;
export const Kit = z.object({
  ...(Object.fromEntries(KIT_FIELDS.map((f) => [f, Scale])) as Record<KitField, typeof Scale>),
  // Relative strength at each stage: early = levels 1–6 / before first item, mid = 1–3 items, late = 4+ items.
  curve: PowerCurve,
  // Map-wide ultimate (Twisted Fate, Shen, Nocturne): turns a side lane into a fight elsewhere.
  global: z.literal(true).optional(),
  // A carry surviving a diver alone (spell shield, dashes). Only the enemy-dive read uses it.
  selfPeel: Scale,
});
export type Kit = z.infer<typeof Kit>;
export type ChampionKit = ChampionV2 & { kit: Kit };
