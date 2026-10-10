// v2 Draft Room evaluation (proposal; not wired into the site). Damage and fight-start rules use the v2 fields;
// frontline, peel, scaling, sustained DPS and hard-engage vulnerability reuse the v1 rules unchanged.
import { RULES as V1_RULES, type Profile as V1Profile } from "../evaluate";
import { ATTRS, ROLES, type Champion, type Role } from "../schema";
import { ENGAGE_METER, type ChampionV2 } from "./schema";
import { THRESHOLDS } from "./thresholds";

export type DraftV2 = Partial<Record<Role, string>>;
export interface Pick { role: Role; champion: ChampionV2; physical: number; magic: number; true: number }
export interface WarningV2 { id: string; severity: "warning" | "caution"; label: string; rule: string; why: string }

const T = THRESHOLDS;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const round = (n: number) => Math.round(n * 100) / 100;

export function picksV2(draft: DraftV2, champions: ChampionV2[]): Pick[] {
  const byId = new Map(champions.map((c) => [c.id, c]));
  return ROLES.flatMap((role) => {
    const c = draft[role] ? byId.get(draft[role]!) : undefined;
    if (!c) return [];
    // A champion off its listed roles uses its first listed role's values.
    const d = c.damageByRole[role] ?? c.damageByRole[c.roles[0]]!;
    return [{ role, champion: c, physical: d.damageThreat * d.damageSplit.physical, magic: d.damageThreat * d.damageSplit.magic, true: d.damageThreat * d.damageSplit.true }];
  });
}

export function damageProfile(picks: Pick[]) {
  const physical = sum(picks.map((p) => p.physical)), magic = sum(picks.map((p) => p.magic)), trueDmg = sum(picks.map((p) => p.true));
  const total = physical + magic + trueDmg;
  const best = (k: "physical" | "magic") => picks.reduce<Pick | null>((b, p) => (!b || p[k] > b[k] ? p : b), null);
  return {
    physical, magic, true: trueDmg, total,
    physicalShare: total ? physical / total : null,
    magicShare: total ? magic / total : null,
    bestMagic: best("magic"), bestPhysical: best("physical"),
  };
}

const insufficient = (individualBest: number, combined: number) =>
  individualBest < T.damage.strongIndividual && combined < T.damage.meaningfulCombined;

const list = (ps: Pick[], k: "magic" | "physical") =>
  ps.filter((p) => p[k] > 0).map((p) => `${p.champion.name} ${round(p[k])}`).join(", ") || "none";

// v1 rules that don't involve engage or damage type run on a v1-shaped champion with the derived engage meter.
const KEPT_V1 = ["no-frontline", "insufficient-peel", "too-many-scaling", "no-sustained-dps", "vulnerable-hard-engage"];
function v1Profile(picks: Pick[]): V1Profile {
  const asV1: Champion[] = picks.map(({ champion: c }) => ({
    id: c.id, name: c.name, aliases: c.aliases, roles: c.roles, flags: c.flags, reviewed: c.reviewed,
    damage: "mixed", attrs: { ...c.attrs, engage: ENGAGE_METER[c.fightStart] },
  }));
  const meters = ATTRS.map((attr) => {
    let best = 0, bestBy: string | null = null, total = 0;
    for (const c of asV1) { total += c.attrs[attr]; if (c.attrs[attr] > best) { best = c.attrs[attr]; bestBy = c.name; } }
    return { attr, best, bestBy, total };
  });
  return { picks: asV1, meters, damage: { physical: 0, magic: 0, physicalShare: null } };
}

export function warningsV2(draft: DraftV2, champions: ChampionV2[]): WarningV2[] {
  const picks = picksV2(draft, champions);
  const out: WarningV2[] = [];
  const n = picks.length;
  const starters = (ps: Pick[], kinds: string[]) => ps.filter((p) => kinds.includes(p.champion.fightStart));

  // Fight start
  if (n >= T.engage.minPicks && !starters(picks, ["primary"]).length) {
    const catchers = starters(picks, ["catch"]);
    if (catchers.length) out.push({ id: "no-hard-engage", severity: "caution", label: "No hard engage — relies on picks/catch",
      rule: `${T.engage.minPicks}+ picks, no primary fight starter, at least one catch`, why: `Catch from ${catchers.map((p) => p.champion.name).join(", ")}; nobody can start a 5v5 on demand.` });
    else out.push({ id: "no-fight-starter", severity: "warning", label: "No reliable fight starter",
      rule: `${T.engage.minPicks}+ picks and no primary or catch pick (follow-up does not count)`, why: "Nobody can start a fight; the CC on this team only follows up." });
  }
  const setup = picks.filter((p) => p.champion.flags.includes("needs-setup"));
  if (n >= T.engage.setupMinPicks && setup.length && !starters(picks.filter((p) => !setup.includes(p)), ["primary", "catch"]).length) {
    out.push({ id: "needs-fight-starter", severity: "warning", label: "Needs a fight starter",
      rule: `A needs-setup pick is locked and no other pick is primary or catch; checks from ${T.engage.setupMinPicks} picks`,
      why: `${setup.map((p) => p.champion.name).join(", ")} needs reliable engage or catch from someone else.` });
  }

  // Damage balance
  if (n >= T.damage.minPicks) {
    const d = damageProfile(picks);
    const magicLow = insufficient(d.bestMagic?.magic ?? 0, d.magic);
    const physLow = insufficient(d.bestPhysical?.physical ?? 0, d.physical);
    const pct = (x: number | null) => `${Math.round((x ?? 0) * 100)}%`;
    const tooAD = d.physicalShare !== null && d.physicalShare >= T.damage.dominantShare && magicLow;
    const tooAP = d.magicShare !== null && d.magicShare >= T.damage.dominantShare && physLow;
    if (tooAD) out.push({ id: "too-much-ad", severity: "warning", label: "Too much AD",
      rule: `${pct(T.damage.dominantShare)}+ physical, no pick with ${T.damage.strongIndividual}+ magic, combined magic under ${T.damage.meaningfulCombined}`,
      why: `${pct(d.physicalShare)} physical. Magic: ${list(picks, "magic")} (total ${round(d.magic)}).` });
    if (tooAP) out.push({ id: "too-much-ap", severity: "warning", label: "Too much AP",
      rule: `${pct(T.damage.dominantShare)}+ magic, no pick with ${T.damage.strongIndividual}+ physical, combined physical under ${T.damage.meaningfulCombined}`,
      why: `${pct(d.magicShare)} magic. Physical: ${list(picks, "physical")} (total ${round(d.physical)}).` });
    if (magicLow && !tooAD) out.push({ id: "no-meaningful-magic", severity: "warning", label: "No meaningful magic threat",
      rule: `No pick with ${T.damage.strongIndividual}+ magic and combined magic under ${T.damage.meaningfulCombined}`,
      why: `Magic: ${list(picks, "magic")} (total ${round(d.magic)}).` });
  }

  // Unchanged v1 rules
  const p1 = v1Profile(picks);
  for (const r of V1_RULES.filter((r) => KEPT_V1.includes(r.id))) {
    const why = r.check(p1);
    if (why) out.push({ id: r.id, severity: "warning", label: r.label, rule: r.rule, why });
  }
  return out;
}

// What each v2 warning asks of an open slot (for the Logic list, once switched on).
export const FIXES_V2: Record<string, { label: string; test: (c: ChampionV2, role: Role) => boolean }> = {
  "no-fight-starter": { label: "starts fights", test: (c) => c.fightStart === "primary" || c.fightStart === "catch" },
  "no-hard-engage": { label: "adds hard engage", test: (c) => c.fightStart === "primary" },
  "needs-fight-starter": { label: "starts fights", test: (c) => c.fightStart === "primary" || c.fightStart === "catch" },
  "too-much-ad": { label: "adds magic damage", test: (c, r) => contribution(c, r, "magic") >= T.fixes.damageContribution },
  "no-meaningful-magic": { label: "adds magic damage", test: (c, r) => contribution(c, r, "magic") >= T.fixes.damageContribution },
  "too-much-ap": { label: "adds physical damage", test: (c, r) => contribution(c, r, "physical") >= T.fixes.damageContribution },
};
export function contribution(c: ChampionV2, role: Role, k: "physical" | "magic" | "true") {
  const d = c.damageByRole[role];
  return d ? d.damageThreat * d.damageSplit[k] : 0;
}
