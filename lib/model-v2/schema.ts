// Proposed champion model (v2). Approved in direction by alan on 2026-10-10; NOT yet used by the Draft Room.
// Replaces the numeric `engage` rating with `fightStart`, and the single `damage` type with a role-specific
// damage threat plus a damage split. Every other attribute stays as it is.
import { z } from "zod";
import { ATTRS, Champion, Role, ROLES, type Attr } from "../schema";

// How a champion can begin a fight. Follow-up never satisfies a fight-start requirement.
export const FightStart = z.enum([
  "primary",   // can start a five-player fight on demand
  "catch",     // can start a fight by picking one target when a skillshot or setup lands
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
