// Blind-pick safety read for a laner (alan, 2026-10-13; Top first, then Mid, Bot and Support): General Draft Logic from the champion's kit, never pro
// evidence and never a score. It is kept apart from observed blind usage (lib/top-draft.ts): being blinded often in pro
// play is not proof that a champion is safe to blind, and this read is not proof either. Kit values are unreviewed.
import { convertKits } from "./model-v2/kits";
import type { ChampionKit } from "./model-v2/schema";
import type { Champion, Role } from "./schema";

export type Tone = "plus" | "minus" | "note";
export interface BlindLine { tone: Tone; text: string }

const ROLE_NAME: Record<Role, string> = { TOP: "top", JUNGLE: "jungle", MID: "mid", BOT: "bot", SUPPORT: "support" };

export function blindRead(c: ChampionKit, identities: string[] = [], role: Role = "TOP"): BlindLine[] {
  const out: BlindLine[] = [];
  const k = c.kit, a = c.attrs;
  const flex = c.roles.filter((r) => r !== role).map((r) => ROLE_NAME[r]);
  if (flex.length) out.push({ tone: "plus", text: `Also plays ${flex.join(" and ")}: an early pick does not reveal the lane` });
  if (k.curve.early >= 3 || a.lanePressure >= 3) out.push({ tone: "plus", text: "Strong early lane" });
  else if (k.curve.early <= 1) out.push({ tone: "minus", text: "Weak early: wants jungle cover when the matchup is unknown" });
  if (k.resourceDemand >= 3) out.push({ tone: "minus", text: "Needs gold and time to matter" });
  else if (k.resourceDemand <= 1) out.push({ tone: "plus", text: "Works on low resources" });
  if (a.frontline >= 2) out.push({ tone: "plus", text: "Gives the team frontline" });
  else if (a.frontline === 0 && (role === "TOP" || role === "SUPPORT")) out.push({ tone: "minus", text: "No frontline: it has to come from elsewhere" });
  if (c.fightStart === "primary") out.push({ tone: "plus", text: "Can start fights" });
  else if (c.fightStart === "catch") out.push({ tone: "note", text: "Catches one target; not a 5v5 start" });
  if (k.ultDependency >= 3) out.push({ tone: "note", text: "Most of its fight value is the ultimate" });
  const split = c.damageByRole[role]?.damageSplit;
  if (split) out.push({ tone: "note", text: split.physical >= 0.7 ? "Physical damage: watch an all-AD comp" : split.magic >= 0.7 ? "Magic damage" : "Mixed damage" });
  if (identities.length >= 3) out.push({ tone: "plus", text: `Fits several team identities (${identities.join(", ").replace(/-/g, " ")})` });
  return out;
}

/** The read for every champion who plays the lane (or appears in it in `extra`) and has a kit; `identities` from saved records. */
export function blindReads(champions: Champion[], identities: Map<string, string[]>, extra: Set<string> = new Set(), role: Role = "TOP"): Record<string, BlindLine[]> {
  return Object.fromEntries(convertKits(champions).filter((c) => c.roles.includes(role) || extra.has(c.id)).map((c) => [c.id, blindRead(c, identities.get(c.id), role)]));
}
