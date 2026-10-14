// Draft Room evaluation: plain arithmetic over champion attributes (General Draft Logic).
// Every warning is one readable rule; `rule` states the threshold, `why` names the picks behind it.
import { ATTRS, ROLES, type Attr, type Champion, type Role } from "./schema";

export type Draft = Partial<Record<Role, string>>;

export interface Meter { attr: Attr; best: number; bestBy: string | null; total: number }
export interface Profile {
  picks: Champion[];
  // Team-wide rules apply: 4+ picks, or a smaller draft read as a team (the draft before a 4th pick, so a candidate is
  // not charged for a warning the first three picks already had).
  team: boolean;
  meters: Meter[];
  damage: { physical: number; magic: number; physicalShare: number | null };
}
export interface DraftWarning { id: string; label: string; rule: string; why: string }

const damageWeight = (c: Champion) => Math.max(c.attrs.sustainedDps, c.attrs.burst, c.attrs.poke);

export function picksOf(draft: Draft, champions: Champion[]): Champion[] {
  const byId = new Map(champions.map((c) => [c.id, c]));
  return ROLES.map((r) => draft[r]).filter((id): id is string => !!id && byId.has(id)).map((id) => byId.get(id)!);
}

export function profile(draft: Draft, champions: Champion[], asTeam = false): Profile {
  const picks = picksOf(draft, champions);
  const meters = ATTRS.map((attr) => {
    let best = 0, bestBy: string | null = null, total = 0;
    for (const c of picks) {
      total += c.attrs[attr];
      if (c.attrs[attr] > best) { best = c.attrs[attr]; bestBy = c.name; }
    }
    return { attr, best, bestBy, total };
  });
  let physical = 0, magic = 0;
  for (const c of picks) {
    const w = damageWeight(c);
    if (c.damage === "AD") physical += w;
    else if (c.damage === "AP") magic += w;
    else { physical += w / 2; magic += w / 2; }
  }
  const sum = physical + magic;
  return { picks, team: picks.length >= 4 || (asTeam && picks.length > 0), meters, damage: { physical, magic, physicalShare: sum ? physical / sum : null } };
}

const names = (cs: Champion[]) => cs.map((c) => c.name).join(", ");
const meter = (p: Profile, a: Attr) => p.meters.find((m) => m.attr === a)!;

interface RuleDef { id: string; label: string; rule: string; check: (p: Profile) => string | null }

export const RULES: RuleDef[] = [
  {
    id: "no-engage", label: "No reliable engage", rule: "4+ picks and no pick has engage 2 or more",
    check: (p) => p.team && meter(p, "engage").best < 2
      ? `Best engage is ${meter(p, "engage").best}${meter(p, "engage").bestBy ? ` (${meter(p, "engage").bestBy})` : ""}.` : null,
  },
  {
    id: "needs-fight-starter", label: "Needs a fight starter", rule: "A needs-setup pick (Jhin, MF, Ziggs) is locked and nobody else has engage 2 or more; checks from 2 picks",
    check: (p) => {
      const setup = p.picks.filter((c) => c.flags.includes("needs-setup"));
      if (p.picks.length < 2 || !setup.length) return null;
      const starters = p.picks.filter((c) => !setup.includes(c) && c.attrs.engage >= 2);
      return starters.length ? null : `${names(setup)} needs someone else to start fights; no teammate has engage 2+.`;
    },
  },
  {
    id: "too-much-ad", label: "Too much AD", rule: "4+ picks and 80% or more of the damage is physical",
    check: (p) => p.team && p.damage.physicalShare !== null && p.damage.physicalShare >= 0.8
      ? `${Math.round(p.damage.physicalShare * 100)}% physical damage; armor stacking shuts it down.` : null,
  },
  {
    id: "too-much-ap", label: "Too much AP", rule: "4+ picks and 80% or more of the damage is magic",
    check: (p) => p.team && p.damage.physicalShare !== null && 1 - p.damage.physicalShare >= 0.8
      ? `${Math.round((1 - p.damage.physicalShare) * 100)}% magic damage; magic resist stacking shuts it down.` : null,
  },
  {
    id: "no-frontline", label: "No frontline", rule: "4+ picks and no pick has frontline 2 or more",
    check: (p) => p.team && meter(p, "frontline").best < 2 ? `Best frontline is ${meter(p, "frontline").best}.` : null,
  },
  {
    id: "insufficient-peel", label: "Insufficient peel for the carry", rule: "A needs-peel carry is locked and teammates' peel totals under 3; checks from 4 picks",
    check: (p) => {
      if (!p.team) return null;
      const carries = p.picks.filter((c) => c.flags.includes("needs-peel"));
      for (const carry of carries) {
        const peel = p.picks.filter((c) => c !== carry).reduce((s, c) => s + c.attrs.peel, 0);
        if (peel < 3) return `${carry.name} needs protection; teammates' peel totals ${peel}.`;
      }
      return null;
    },
  },
  {
    id: "too-many-scaling", label: "Too many scaling lanes", rule: "3+ picks with scaling 3 and lane pressure 1 or less",
    check: (p) => {
      const slow = p.picks.filter((c) => c.attrs.scaling === 3 && c.attrs.lanePressure <= 1);
      return slow.length >= 3 ? `${names(slow)} all want to scale and give up lane pressure.` : null;
    },
  },
  {
    id: "no-sustained-dps", label: "No sustained DPS", rule: "4+ picks and no pick has sustained DPS 2 or more",
    check: (p) => p.team && meter(p, "sustainedDps").best < 2 ? "Nobody can keep dealing damage in a long fight or burn a tank." : null,
  },
  {
    id: "vulnerable-hard-engage", label: "Vulnerable to hard engage", rule: "4+ picks, team peel under 3, no frontline 2+, and no disengage pick",
    check: (p) => {
      if (!p.team) return null;
      const peel = meter(p, "peel").total;
      const disengage = p.picks.some((c) => c.flags.includes("disengage"));
      return peel < 3 && meter(p, "frontline").best < 2 && !disengage ? `Team peel totals ${peel}, no frontline and no disengage.` : null;
    },
  },
];

export function warnings(draft: Draft, champions: Champion[], asTeam = false): DraftWarning[] {
  const p = profile(draft, champions, asTeam);
  return RULES.flatMap((r) => {
    const why = r.check(p);
    return why ? [{ id: r.id, label: r.label, rule: r.rule, why }] : [];
  });
}

// What each warning asks of an open slot, used for General Draft Logic suggestions.
export const FIXES: Record<string, { label: string; test: (c: Champion) => boolean }> = {
  "no-engage": { label: "adds engage", test: (c) => c.attrs.engage >= 2 },
  "needs-fight-starter": { label: "starts fights", test: (c) => c.attrs.engage >= 2 },
  "too-much-ad": { label: "adds magic damage", test: (c) => c.damage !== "AD" && damageWeight(c) >= 2 },
  "too-much-ap": { label: "adds physical damage", test: (c) => c.damage !== "AP" && damageWeight(c) >= 2 },
  "no-frontline": { label: "adds frontline", test: (c) => c.attrs.frontline >= 2 },
  "insufficient-peel": { label: "adds peel", test: (c) => c.attrs.peel >= 2 },
  "no-sustained-dps": { label: "adds sustained DPS", test: (c) => c.attrs.sustainedDps >= 2 },
  "vulnerable-hard-engage": { label: "adds peel or disengage", test: (c) => c.attrs.peel >= 2 || c.flags.includes("disengage") },
  "too-many-scaling": { label: "adds lane pressure", test: (c) => c.attrs.lanePressure >= 2 },
};
