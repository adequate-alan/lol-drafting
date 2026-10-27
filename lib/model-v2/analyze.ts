// Comp analysis (proposal; NOT wired into the site). Reads a draft like a drafter would: what the comp is trying to
// do, how it wins, how it fails, and what each open role should add. Deterministic: every insight is one named rule
// over champion facts (v1 attributes + v2 fightStart / damageByRole + the v2 kit), and every sentence is a template
// filled with champion names. Pro evidence and counters never enter here.
import { ROLES, type Role } from "../schema";
import type { ChampionKit } from "./schema";
import { ANALYSIS as T, THRESHOLDS } from "./thresholds";

export type Draft = Partial<Record<Role, string>>;
export interface Slot { role: Role; c: ChampionKit; threat: number; physical: number; magic: number; true: number }

export type IdentityId = "front-to-back" | "dive" | "pick" | "poke" | "protect" | "skirmish" | "wombo" | "split" | "tempo" | "scaling";
export const IDENTITY_LABEL: Record<IdentityId, string> = {
  "front-to-back": "Front-to-back", dive: "Dive", pick: "Pick", poke: "Poke / siege", protect: "Protect the carry",
  skirmish: "Skirmish", wombo: "Wombo", split: "Split-push", tempo: "Early tempo", scaling: "Scaling",
};
export interface IdentityScore { id: IdentityId; score: number; because: string }

export type Severity = "major" | "moderate" | "minor";
export type InsightKind = "weakness" | "tension" | "threat" | "opportunity";
export interface Insight {
  id: string; kind: InsightKind; severity: Severity; label: string; text: string;
  short?: string;        // the "but …" in the headline
  fixes: NeedId[];       // what a pick would need to provide to address it
  weight: number;        // ranking inside a severity
  covers?: string[];     // rule ids this insight stands for when two warnings with one cause are shown as one
}

export type NeedId = "engage" | "fight-start" | "frontline" | "second-frontline" | "peel" | "disengage" | "second-threat"
  | "magic" | "physical" | "sustained" | "tank-damage" | "range" | "waveclear" | "access" | "follow-up" | "early" | "late" | "low-economy";
export interface NeedDef { label: string; test: (c: ChampionKit, role: Role) => boolean }

const pokeWeight = (s: { threat: number }) => (s.threat >= 2 ? 1 : s.threat === 1 ? 0.5 : 0.25);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
const r1 = (n: number) => Math.round(n * 10) / 10;
export const names = (ss: { c: ChampionKit }[]) => ss.map((s) => s.c.name).join(", ").replace(/, ([^,]*)$/, " and $1");
const verb = (ss: unknown[], one: string, many: string) => (ss.length === 1 ? one : many);
const threatOf = (c: ChampionKit, role: Role) => (c.damageByRole[role] ?? c.damageByRole[c.roles[0]]!);
const contribution = (c: ChampionKit, role: Role, k: "physical" | "magic" | "true") => { const d = threatOf(c, role); return d.damageThreat * d.damageSplit[k]; };

export const NEEDS: Record<NeedId, NeedDef> = {
  engage: { label: "Primary engage", test: (c) => c.fightStart === "primary" },
  "fight-start": { label: "Fight starter", test: (c) => c.fightStart === "primary" || c.fightStart === "catch" },
  frontline: { label: "Frontline", test: (c) => c.attrs.frontline >= 2 },
  "second-frontline": { label: "Second frontline", test: (c) => c.attrs.frontline >= 2 },
  peel: { label: "Peel", test: (c) => c.attrs.peel >= 2 || c.kit.disengage >= 2 },
  disengage: { label: "Disengage", test: (c) => c.kit.disengage >= 2 || c.kit.counterEngage >= 3 },
  "second-threat": { label: "Second damage threat", test: (c, r) => threatOf(c, r).damageThreat >= 2 },
  magic: { label: "Magic damage", test: (c, r) => contribution(c, r, "magic") >= THRESHOLDS.fixes.damageContribution },
  physical: { label: "Physical damage", test: (c, r) => contribution(c, r, "physical") >= THRESHOLDS.fixes.damageContribution },
  sustained: { label: "Sustained damage", test: (c, r) => threatOf(c, r).damageThreat >= 2 && c.attrs.sustainedDps >= 2 },
  "tank-damage": { label: "Tank damage", test: (c, r) => threatOf(c, r).damageThreat >= 2 && c.kit.tankDamage >= 2 },
  range: { label: "Range", test: (c, r) => threatOf(c, r).damageThreat >= 2 && c.kit.range >= 2 },
  waveclear: { label: "Waveclear", test: (c) => c.kit.waveclear >= 2 },
  access: { label: "Backline access", test: (c) => c.kit.backlineAccess >= 2 },
  "follow-up": { label: "Follow-up", test: (c) => c.kit.followUp >= 2 },
  early: { label: "Early pressure", test: (c) => c.kit.curve.early >= 3 || c.attrs.lanePressure >= 3 },
  late: { label: "Late-game scaling", test: (c) => c.kit.curve.late >= 3 },
  "low-economy": { label: "Low-economy pick", test: (c) => c.kit.resourceDemand <= 1 },
};

// ---------- slots and team facts ----------

export function slotsOf(draft: Draft, champions: ChampionKit[]): Slot[] {
  const byId = new Map(champions.map((c) => [c.id, c]));
  return ROLES.flatMap((role) => {
    const c = draft[role] ? byId.get(draft[role]!) : undefined;
    if (!c) return [];
    const d = threatOf(c, role);
    return [{ role, c, threat: d.damageThreat, physical: d.damageThreat * d.damageSplit.physical, magic: d.damageThreat * d.damageSplit.magic, true: d.damageThreat * d.damageSplit.true }];
  });
}

/**
 * Siege, 0–3: how well the comp pressures towers and holds the space in front of them once it has priority. Not a
 * copy of Poke: structure pressure (artillery, traps, turrets, long-range tower damage) leads, then holding forward
 * space (range), waveclear, poke on the defenders (a support's utility poke counts more here than in damage) and
 * disengage / anti-engage so the siege survives a dive. Weights in ANALYSIS.siege.
 */
export function siegeOf(slots: Slot[]) {
  const W = T.siege;
  if (!slots.length) return { score: 0, pressure: 0, reach: 0, clear: 0, poke: 0, safety: 0, sources: [] as Slot[] };
  const top = slots.map((s) => s.c.kit.structurePressure as number).sort((a, b) => b - a);
  // Best source in full, then diminishing: one artillery carry is not a whole siege comp. Scaled back to 0–3.
  const pressure = ((top[0] ?? 0) + 0.5 * (top[1] ?? 0) + 0.25 * (top[2] ?? 0)) / 1.75;
  const reach = mean(slots.map((s) => s.c.kit.range));
  const clear = mean(slots.map((s) => s.c.kit.waveclear));
  const poke = mean(slots.map((s) => s.c.attrs.poke * Math.max(pokeWeight(s), 0.75)));
  const safety = Math.min(3, sum(slots.map((s) => Math.max(s.c.kit.disengage, s.c.kit.counterEngage))) / Math.max(2, slots.length - 1));
  const score = W.pressure * pressure + W.reach * reach + W.clear * clear + W.poke * poke + W.safety * safety;
  return { score: r1(score), pressure: r1(pressure), reach: r1(reach), clear: r1(clear), poke: r1(poke), safety: r1(safety),
    sources: slots.filter((s) => s.c.kit.structurePressure >= 2) };
}
export const SIEGE_LABEL = (score: number) => (score >= T.siege.high ? "High" : score >= T.siege.mid ? "Mid" : "Low");

/** Team-level facts every rule reads. Exposed as the "supporting detail" under the diagnosis. */
export function facts(slots: Slot[]) {
  const carries = slots.filter((s) => s.threat >= T.carryThreat);
  const threatTotal = sum(slots.map((s) => s.threat));
  const main = [...slots].sort((a, b) => b.threat - a.threat || b.c.kit.resourceDemand - a.c.kit.resourceDemand || b.c.attrs.sustainedDps - a.c.attrs.sustainedDps)[0];
  const physical = sum(slots.map((s) => s.physical)), magic = sum(slots.map((s) => s.magic)), trueDmg = sum(slots.map((s) => s.true));
  const k = (f: (s: Slot) => number) => sum(slots.map(f));
  return {
    n: slots.length,
    primary: slots.filter((s) => s.c.fightStart === "primary"),
    catchers: slots.filter((s) => s.c.fightStart === "catch"),
    frontliners: slots.filter((s) => s.c.attrs.frontline >= 2),
    carries,
    main,
    mainShare: threatTotal && main ? main.threat / threatTotal : 0,
    threatTotal,
    physical, magic, true: trueDmg,
    physicalShare: physical + magic + trueDmg ? physical / (physical + magic + trueDmg) : null,
    magicShare: physical + magic + trueDmg ? magic / (physical + magic + trueDmg) : null,
    sustained: carries.filter((s) => s.c.attrs.sustainedDps >= 2),
    burst: carries.filter((s) => s.c.attrs.burst >= 2),
    tankBest: Math.max(0, ...carries.map((s) => s.c.kit.tankDamage)),
    tankTotal: k((s) => (s.threat >= 1 ? s.c.kit.tankDamage : 0)),
    carryRange: mean(carries.map((s) => s.c.kit.range)),
    shortRange: carries.filter((s) => s.c.kit.range <= 1),
    // Poke counts by role-aware damage threat: a carry's poke in full, a support's utility poke at half.
    poke: k((s) => s.c.attrs.poke * pokeWeight(s)),
    pokers: slots.filter((s) => s.c.attrs.poke >= 2 && s.threat >= 2),
    utilityPokers: slots.filter((s) => s.c.attrs.poke >= 2 && s.threat < 2),
    peel: k((s) => s.c.attrs.peel),
    disengage: k((s) => s.c.kit.disengage),
    counterEngage: k((s) => s.c.kit.counterEngage),
    followUp: k((s) => s.c.kit.followUp),
    aoe: k((s) => s.c.kit.aoeCc),
    waveclear: k((s) => s.c.kit.waveclear),
    lanePressure: mean(slots.map((s) => s.c.attrs.lanePressure)),
    side: slots.filter((s) => s.c.attrs.sidePressure >= 3 && s.threat >= 2),
    objective: k((s) => s.c.attrs.objectiveControl),
    access: slots.filter((s) => s.c.kit.backlineAccess >= 2),
    hungry: slots.filter((s) => s.c.kit.resourceDemand >= 3),
    ultHeavy: slots.filter((s) => s.c.kit.ultDependency >= 3),
    setup: slots.filter((s) => s.c.kit.setupDependency >= 2 || s.c.flags.includes("needs-setup")),
    curve: { early: mean(slots.map((s) => s.c.kit.curve.early)), mid: mean(slots.map((s) => s.c.kit.curve.mid)), late: mean(slots.map((s) => s.c.kit.curve.late)) },
    siege: siegeOf(slots),
  };
}
export type Facts = ReturnType<typeof facts>;

// Competing income demand, one rule for every comp. A hungry laner (resourceDemand 3) counts 1. A support counts its
// demand above 1 (a truly hungry support 2), since the role earns least. Laners plus support are the base load; a
// hungry jungler adds 1 but only matters once the base load is already at the threshold, so a carry jungler beside
// one or two hungry laners is fine. Warns at ANALYSIS.economy.warn total, major at .major.
export function economyBurden(slots: Slot[]) {
  const E = T.economy;
  const laners = slots.filter((s) => s.role !== "JUNGLE" && s.role !== "SUPPORT" && s.c.kit.resourceDemand >= 3);
  const jungler = slots.find((s) => s.role === "JUNGLE" && s.c.kit.resourceDemand >= 3);
  const sup = slots.find((s) => s.role === "SUPPORT" && s.c.kit.resourceDemand >= 2);
  const supportLoad = sup ? sup.c.kit.resourceDemand - 1 : 0;
  const base = laners.length + supportLoad;
  const total = base + (jungler ? 1 : 0);
  const warn = base >= E.base && total >= E.warn;
  return {
    base, total, warn,
    severity: (total >= E.major ? "major" : "moderate") as Severity,
    support: sup,
    demanding: [...laners, ...(jungler ? [jungler] : []), ...(sup ? [sup] : [])],
  };
}

// A carry who needs protecting: flagged needs-peel, or an immobile gold-hungry late-game ranged carry.
export const needsPeel = (s: Slot) => s.c.flags.includes("needs-peel") || (s.threat >= 3 && s.c.kit.resourceDemand >= 3 && s.c.kit.range >= 2 && s.c.kit.backlineAccess === 0 && s.c.kit.curve.late >= 3);
// The carry the comp has to protect; a carry who dives with a dive comp is not waiting for peel.
export const exposedCarries = (slots: Slot[], dive: boolean) => slots.filter((s) => needsPeel(s) && !(dive && s.c.kit.backlineAccess >= 2));
export const peeler = (s: Slot) => s.c.attrs.peel >= 2 || s.c.kit.disengage >= 2;
export const diver = (s: Slot) => s.c.kit.backlineAccess >= 2 && (s.threat >= 2 || s.c.fightStart === "primary");

// ---------- fight roles ----------

/**
 * Who starts and who follows a fight (alan, 2026-10-27): primary initiation is an on-demand team engage (kit
 * `fightStart: "primary"`); secondary initiation is a champion who can open a fight on their own terms by catching or
 * diving one target (`"catch"`: Qiyana, Nocturne, Pantheon, Lee Sin), never promoted to primary; follow-up is everyone
 * else whose crowd control or burst lands once a fight has started. Kit values only, nothing here is read by a score.
 */
export function fightRoles(slots: Slot[]) {
  const primary = slots.filter((s) => s.c.fightStart === "primary");
  const secondary = slots.filter((s) => s.c.fightStart === "catch");
  const followUp = slots.filter((s) => !primary.includes(s) && !secondary.includes(s) && (s.c.fightStart === "follow-up" || s.c.kit.followUp >= 2));
  return { primary, secondary, followUp };
}

// ---------- identity ----------

/**
 * `strategy` (alan, 2026-10-27; the Comp Check text, Comp Library and discovery, never the ranking): dive is reaching
 * and collapsing on priority targets, wombo is overlapping AoE that wins a grouped fight, and several AoE abilities alone
 * never make a comp wombo. When the comp is a dive, a catch diver's crowd control (Qiyana, Nocturne, Pantheon) is spent
 * reaching and locking its target, so it counts toward the dive and not as a wombo layer; primary AoE engagers who also
 * dive (Kennen, Jarvan IV, Rakan) count toward both. Without a dive nothing changes. The ranking keeps the default read.
 */
export interface ReadOpts { strategy?: boolean }

export function identities(slots: Slot[], f: Facts = facts(slots), opts: ReadOpts = {}): IdentityScore[] {
  const out: IdentityScore[] = [];
  const small = f.n <= 3;
  const ranged = f.carries.filter((s) => s.c.kit.range >= 2);
  if (f.frontliners.length && ranged.length && (f.primary.length || f.counterEngage >= 4))
    out.push({ id: "front-to-back", score: 2 * Math.min(f.frontliners.length, 2) + 1.5 * Math.min(ranged.length, 2) + (f.primary.length ? 1.5 : 0) + slots.filter((s) => s.c.attrs.frontline >= 3).length - (f.access.length >= 3 ? 2 : 0),
      because: `${names(f.frontliners)} in front, ${names(ranged)} dealing damage from range` });
  const divers = slots.filter(diver);
  const dives = divers.length >= (small ? 2 : 3) && divers.some((s) => s.c.fightStart === "primary" || s.c.fightStart === "catch");
  if (dives)
    out.push({ id: "dive", score: sum(divers.map((s) => s.c.kit.backlineAccess)) + 0.5 * sum(divers.map((s) => s.c.kit.followUp)) - (f.carryRange >= 2.5 ? 2 : 0),
      because: `${names(divers)} can all reach the backline` });
  const bursty = f.burst.filter((s) => s.c.fightStart !== "catch");
  if (f.catchers.length >= 2 || (f.catchers.length >= 1 && bursty.length >= 2))
    out.push({ id: "pick", score: 2 * f.catchers.length + bursty.length + (f.primary.length ? 0 : 1),
      because: `catch from ${names(f.catchers)}${bursty.length ? `, burst from ${names(bursty)}` : ""}` });
  // Poke / siege: enough poke, or a real siege (structure pressure, range, waveclear) with at least one poke threat.
  const siege = f.siege;
  if ((f.pokers.length >= 2 && f.poke >= 6) || (f.pokers.length >= 1 && siege.score >= T.siege.identity))
    out.push({ id: "poke", score: f.poke + slots.filter((s) => s.c.kit.range >= 3 && s.threat >= 2).length + 3 * Math.max(0, siege.score - T.siege.high),
      because: `poke from ${names(f.pokers)}${f.utilityPokers.length ? `; ${names(f.utilityPokers)} ${verb(f.utilityPokers, "adds", "add")} utility poke` : ""}${siege.score >= T.siege.high && siege.sources.length ? `; siege ${SIEGE_LABEL(siege.score).toLowerCase()} through ${names(siege.sources)}` : ""}` });
  const carry = slots.find(needsPeel);
  const peelers = carry ? slots.filter((s) => s !== carry && peeler(s)) : [];
  if (carry && peelers.length >= 2)
    out.push({ id: "protect", score: 3 + sum(peelers.map((s) => (s.c.attrs.peel + s.c.kit.disengage) * (s.c.attrs.frontline >= 2 ? 0.5 : 1))) / 2
      + (peelers.some((s) => s.c.attrs.peel >= 3 && s.threat <= 1 && s.c.attrs.frontline < 2) ? 3 : 0)
      + (carry === f.main && f.mainShare >= 0.4 ? 2.5 : 0), because: `${names(peelers)} protect ${carry.c.name}` });
  const skirmishers = slots.filter((s) => s.threat >= 2 && s.c.kit.range <= 1 && s.c.kit.curve.early + s.c.kit.curve.mid >= 5 && (s.c.attrs.sustainedDps >= 2 || s.c.attrs.burst >= 2));
  if (skirmishers.length >= 2 && skirmishers.some((s) => s.role === "JUNGLE" || s.role === "MID"))
    out.push({ id: "skirmish", score: 2 * skirmishers.length + f.lanePressure, because: `${names(skirmishers)} win short fights before items` });
  const diveLock = (s: Slot) => !!opts.strategy && dives && divers.includes(s) && s.c.fightStart === "catch";
  const aoe = slots.filter((s) => s.c.kit.aoeCc >= 2 && !diveLock(s));
  const aoeSum = sum(slots.map((s) => s.c.kit.aoeCc));
  if (aoe.length >= 3 && f.primary.length && aoeSum >= 8)
    out.push({ id: "wombo", score: 0.8 * aoeSum, because: `${names(aoe)} stack AoE crowd control` });
  if (f.side.length)
    {
    const globals = slots.filter((s) => s.c.kit.global);
    out.push({ id: "split", score: 4 + 2 * (f.side.length - 1) + 2 * Math.min(globals.length, 2) + (f.waveclear - sum(f.side.map((s) => s.c.kit.waveclear)) >= 7 ? 1 : 0),
      because: `${names(f.side)} can hold a side lane alone${globals.length ? `; ${names(globals)} can join a fight from anywhere` : ""}` });
  }
  if (f.n >= 3 && f.curve.early >= 2.4) out.push({ id: "tempo", score: (f.curve.early - 1.6) * 6, because: `early-game average ${r1(f.curve.early)}/3` });
  if (f.n >= 3 && f.curve.late >= 2.4 && f.curve.early <= 2) out.push({ id: "scaling", score: (f.curve.late - 1.6) * 6, because: `late-game average ${r1(f.curve.late)}/3` });
  return out.map((i) => ({ ...i, score: r1(i.score) })).sort((a, b) => b.score - a.score);
}

export function pickIdentity(scores: IdentityScore[]) {
  const [first, second] = scores;
  const primary = first && first.score >= T.identity.minScore ? first : null;
  const secondary = primary && second && second.score >= T.identity.minScore && second.score >= T.identity.secondaryShare * primary.score ? second : null;
  return { primary, secondary };
}

// ---------- weaknesses and tensions ----------

const W = (id: string, kind: InsightKind, severity: Severity, label: string, text: string, fixes: NeedId[], weight = 0, short?: string): Insight => ({ id, kind, severity, label, text, fixes, weight, short });

// `asTeam` reads a smaller draft with the team-wide rules on. A candidate's read uses it for the draft before the pick
// that reaches ANALYSIS.teamRules, so a weakness the earlier picks already had counts as inherited, not created.
export function weaknesses(slots: Slot[], f: Facts = facts(slots), ids: IdentityScore[] = identities(slots, f), asTeam = false): Insight[] {
  const out: Insight[] = [];
  const team = f.n >= T.teamRules || (asTeam && f.n > 0);
  const has = (id: IdentityId) => { const p = pickIdentity(ids); return p.primary?.id === id || p.secondary?.id === id; };

  // Fight structure
  const followers = slots.filter((s) => s.c.fightStart === "follow-up" || s.c.kit.followUp >= 2).filter((s) => s.c.fightStart !== "primary" && s.c.fightStart !== "catch");
  if (team && !f.primary.length && !f.catchers.length) {
    if (f.followUp >= T.followUpRich && followers.length >= 2)
      out.push(W("follow-up-no-engage", "tension", "major", "Follow-up without engage", `${names(followers)} punish a fight once it starts, but nobody can reliably start one.`, ["engage", "fight-start"], 3, "no fight starter"));
    else out.push(W("no-fight-start", "weakness", "major", "No reliable fight start", `Nobody can begin a 5v5 on demand or catch a target${followers.length ? `; ${names(followers)} only follow up` : ""}.`, ["engage", "fight-start"], 3, "no fight starter"));
  } else if (team && !f.primary.length && !has("pick"))
    out.push(W("no-engage", "weakness", "moderate", "No on-demand engage", `Only ${names(f.catchers)} can start a fight, and only by landing a catch. Forced objective fights are hard to begin.`, ["engage"], 1));
  const setupNoStarter = f.setup.filter((s) => s.c.flags.includes("needs-setup") || s.c.kit.setupDependency >= 2);
  const startersForSetup = slots.filter((s) => !setupNoStarter.includes(s) && (s.c.fightStart === "primary" || s.c.fightStart === "catch"));
  const setupCarries = setupNoStarter.filter((s) => s.threat >= 2);
  if (f.n >= 2 && setupCarries.length && !startersForSetup.length && !out.some((w) => w.fixes.includes("fight-start")))
    out.push(W("needs-setup", "weakness", team ? "major" : "moderate", "Needs a fight starter", `${names(setupCarries)} needs reliable engage or catch from someone else.`, ["fight-start", "engage"], 2, "no setup"));
  if (team && f.primary.length) {
    const others = f.followUp - Math.max(...f.primary.map((s) => s.c.kit.followUp));
    if (others < T.followUpNeeded)
      out.push(W("engage-no-follow-up", "tension", others <= 3 ? "major" : "moderate", "Engage without follow-up", `${names(f.primary)} can start fights, but the rest of the comp cannot reach the target quickly enough to finish it.`, ["follow-up", "access"], 2, "engage lands alone"));
  }

  // Durability
  if (team && !f.frontliners.length)
    out.push(W("no-frontline", "weakness", "major", "No frontline", "Nobody can absorb the first rotation or face-check fog; every fight starts with a carry exposed.", ["frontline"], 2, "no frontline"));
  else if (team && f.frontliners.length === 1 && f.frontliners[0].c.attrs.frontline < 3 && f.carries.length >= 3)
    out.push(W("thin-frontline", "weakness", "minor", "Thin frontline", `${f.frontliners[0].c.name} is the only frontliner and is not a full tank; long fights expose the carries.`, ["second-frontline"], 0, "fragile"));
  if (team && f.frontliners.length >= T.frontlineHeavy.frontliners && f.threatTotal < T.frontlineHeavy.maxDamage)
    out.push(W("frontline-no-damage", "tension", "major", "Frontline without damage", `${names(f.frontliners)} survive fights, but the comp has too little damage to finish them.`, ["second-threat", "sustained"], 2, "low damage"));

  // Carry protection
  for (const carry of exposedCarries(slots, has("dive"))) {
    const protect = sum(slots.filter((s) => s !== carry).map((s) => s.c.attrs.peel + s.c.kit.disengage));
    if (team && protect < 4) { out.push(W("carry-unprotected", "weakness", "major", `${carry.c.name} is unprotected`, `${carry.c.name} needs peel, and teammates' peel and disengage total ${protect}.`, ["peel", "disengage"], 2, "exposed carry")); break; }
  }

  // Damage
  if (team) {
    // 50% / 60% of the damage threat; 42% is enough when the main carry is the only sustained damage source.
    const onlySustained = f.sustained.length === 1 && f.sustained[0] === f.main;
    if (f.main && f.carries.length <= 2 && (f.mainShare >= T.concentration.moderate || (onlySustained && f.mainShare >= T.concentration.onlySource))) {
      const sev: Severity = f.mainShare >= T.concentration.major ? "major" : "moderate";
      const second = f.carries.filter((s) => s !== f.main);
      out.push(W("single-threat", "tension", sev, "Single-threat damage profile", `Most meaningful damage comes from ${f.main.c.name}${second.length ? ` (${second.map((s) => s.c.name).join(", ")} is a secondary threat)` : ""}. If ${f.main.c.name} cannot play, the comp has very little damage.`, ["second-threat"], 2 + f.mainShare, "one-threat"));
    }
    const lowMagic = f.magic < THRESHOLDS.damage.meaningfulCombined && !slots.some((s) => s.magic >= THRESHOLDS.damage.strongIndividual);
    const lowPhys = f.physical < THRESHOLDS.damage.meaningfulCombined && !slots.some((s) => s.physical >= THRESHOLDS.damage.strongIndividual);
    if (lowMagic && (f.physicalShare ?? 0) >= THRESHOLDS.damage.dominantShare)
      out.push(W("all-ad", "weakness", "major", "Almost all physical damage", `${Math.round((f.physicalShare ?? 0) * 100)}% of the damage threat is physical; one armor item on each enemy frontliner blunts the whole comp.`, ["magic"], 2.5, "all AD"));
    else if (lowPhys && (f.magicShare ?? 0) >= THRESHOLDS.damage.dominantShare)
      out.push(W("all-ap", "weakness", "major", "Almost all magic damage", `${Math.round((f.magicShare ?? 0) * 100)}% of the damage threat is magic; magic resist stacking blunts the whole comp.`, ["physical"], 2.5, "all AP"));
    if (!f.sustained.length)
      out.push(W("no-sustained", "weakness", "moderate", "No sustained damage", "Every damage source is burst or poke; long fights and objective trades go badly once cooldowns are spent.", ["sustained"], 1));
    if (f.tankBest < T.tankDamage.best && f.tankTotal < T.tankDamage.total)
      out.push(W("low-tank-damage", "weakness", "moderate", "Little tank damage", "No damage source shreds a frontline; a tank enemy can stand in front of your carries for the whole fight.", ["tank-damage"], 0.5));
    if (f.shortRange.length >= T.shortRangeCarries)
      out.push(W("short-range", "weakness", "moderate", "Short range", `${names(f.shortRange)} all have to enter the enemy's threat range to deal damage.`, ["range"], 0.5));
    if (f.waveclear <= T.waveclearTotal)
      out.push(W("low-waveclear", "weakness", "minor", "Weak waveclear", `Team waveclear totals ${f.waveclear}; sieges and side waves are hard to answer.`, ["waveclear"], 0));
  }

  // Timing
  if (team && f.curve.early <= T.weakEarly) {
    const soft = slots.filter((s) => s.c.kit.curve.early <= 1);
    out.push(W("weak-early", "weakness", "moderate", "Weak early map", `${names(soft)} concede early pressure, so early dragons and Herald are hard to contest.`, ["early"], 0.5, "slow start"));
  }
  if (team && f.curve.late <= T.weakLate)
    out.push(W("falls-off", "weakness", "moderate", "Falls off late", "The comp is strongest before three items; a long game favours the enemy.", ["late"], 0.5, "falls off"));

  // Tensions
  // Income demand is weighed across the whole team (economyBurden). Three hungry TOP/MID/BOT carries is normal; a
  // hungry jungler adds to the burden but warns only on top of an already heavy team; a hungry support weighs double.
  const econ = economyBurden(slots);
  if (econ.warn)
    out.push(W("resource-conflict", "tension", econ.severity, "Too many resource-hungry picks", `${names(econ.demanding)} all want gold and farm priority${econ.support ? `, and ${econ.support.c.name} wants it from the support role` : ""}; the map cannot feed every one of them.`, ["low-economy"], 1));
  if (team && has("poke") && f.disengage + f.counterEngage < 4)
    out.push(W("poke-no-disengage", "tension", "moderate", "Poke without disengage", "The comp wants to siege slowly but has poor tools to stop an engage before the poke has worked.", ["disengage", "peel"], 1));
  if (team && has("dive") && f.carries.filter((s) => s.c.kit.backlineAccess >= 2).length < 2)
    out.push(W("dive-no-access", "tension", "moderate", "Dive without backline access", "The comp is built to go in but only one damage source can reach the enemy carries.", ["access"], 1));
  const pokePlan = slots.filter((s) => s.c.attrs.poke >= 2 && s.c.kit.range >= 3 && s.threat >= 2);
  const divePlan = slots.filter((s) => s.c.kit.range === 0 && s.c.kit.backlineAccess >= 2 && s.threat >= 2);
  if (team && pokePlan.length >= 2 && divePlan.length >= 2)
    out.push(W("conflicting-plans", "tension", "moderate", "Conflicting game plans", `${names(pokePlan)} want to poke slowly while ${names(divePlan)} want to dive immediately; each plan wastes the other half.`, [], 1));
  if (team && f.ultHeavy.length + f.setup.length >= 3)
    out.push(W("execution", "weakness", "minor", "High execution", `${names([...f.ultHeavy, ...f.setup.filter((s) => !f.ultHeavy.includes(s))])} depend on ultimates or setup; fights fall apart when one is down or mistimed.`, [], 0));

  return rank(collapse(out));
}

// Two warnings with one cause read as one: almost all physical damage plus no tank damage is "poor into armor".
function collapse(out: Insight[]): Insight[] {
  const ad = out.find((w) => w.id === "all-ad"), tank = out.find((w) => w.id === "low-tank-damage");
  if (!ad || !tank) return out;
  const merged = W("armor-frontline", "weakness", "major", "Poor into armor and frontline", `${ad.text.split(";")[0]}, and no damage source shreds a frontline. One armor item on each enemy tank blunts the whole comp.`, ["magic", "tank-damage"], ad.weight, "poor into armor");
  merged.covers = ["all-ad", "low-tank-damage"];
  return [merged, ...out.filter((w) => w !== ad && w !== tank)];
}

export const SEV: Record<Severity, number> = { major: 3, moderate: 2, minor: 1 };
const rank = (xs: Insight[]) => xs.sort((a, b) => SEV[b.severity] - SEV[a.severity] || b.weight - a.weight);

// ---------- enemy-aware ----------

export function versus(ours: Slot[], theirs: Slot[]): Insight[] {
  if (theirs.length < 2 || !ours.length) return [];
  const a = facts(ours), b = facts(theirs);
  const out: Insight[] = [];
  const ea = pickIdentity(identities(ours, a)), eb = pickIdentity(identities(theirs, b));
  if (b.carries.length && a.carries.length && b.carryRange - a.carryRange >= T.enemy.rangeGap)
    out.push(W("outranged", "threat", "moderate", "They outrange us", `Their damage comes from further away (${names(b.carries.filter((s) => s.c.kit.range >= 2))}); waiting in front of an objective loses health.`, ["engage", "range"], 1));
  if (b.n >= 3 && b.curve.late - a.curve.late >= T.enemy.curveGap)
    out.push(W("outscaled", "threat", "moderate", "They outscale us", `${names(theirs.filter((s) => s.c.kit.curve.late >= 3))} get stronger late; take the early objectives and force fights before their items.`, ["early"], 1));
  if (eb.primary?.id === "front-to-back" && (identities(theirs, b).find((i) => i.id === "front-to-back")?.score ?? 0) > (identities(ours, a).find((i) => i.id === "front-to-back")?.score ?? 0) + 1)
    out.push(W("their-front-to-back", "threat", "minor", "Stronger front-to-back", "Their front-to-back is cleaner; avoid straight 5v5s in open areas and look for flanks or picks.", ["access", "fight-start"], 0));
  if (b.frontliners.length >= 2 && a.tankBest < T.tankDamage.best)
    out.push(W("no-tank-damage-vs", "threat", "major", "No tank damage into their frontline", `They have ${names(b.frontliners)} in front and none of your damage sources shreds a tank.`, ["tank-damage"], 2));
  const divers = theirs.filter((s) => s.c.kit.backlineAccess >= 2 || s.c.fightStart === "primary");
  const main = a.main;
  if (main && main.threat >= 2 && main.c.kit.backlineAccess === 0 && divers.length >= 2) {
    // Dive pressure (their reach onto the backline) against what already protects the carry: allies' peel,
    // disengage and counter-engage, the frontline standing in the way, and the carry's own self-peel.
    const pressure = sum(divers.map((s) => Math.max(s.c.kit.backlineAccess, s.c.fightStart === "primary" ? 2 : 0)));
    const others = ours.filter((s) => s !== main);
    const protect = sum(others.map((s) => s.c.attrs.peel + s.c.kit.disengage + s.c.kit.counterEngage))
      + 0.5 * sum(others.filter((s) => s.c.attrs.frontline >= 2).map((s) => s.c.attrs.frontline)) + 2 * main.c.kit.selfPeel;
    const sev: Severity | null = protect < pressure ? "major" : protect < 1.25 * pressure ? "moderate" : protect < 1.75 * pressure ? "minor" : null;
    if (sev)
      out.push(W("vulnerable-to-dive", "threat", sev, "Vulnerable to dive", `${main.c.name} is your main damage source and the enemy has ${names(divers)}. ${sev === "minor" ? `Your frontline and peel already cover most of it; keep ${main.c.name} protected with the last picks.` : "Your remaining picks should add peel or a second threat."}`, ["peel", "disengage", "second-threat"], 2.5, "fragile"));
  }
  if (a.side.length && Math.max(0, ...theirs.map((s) => s.c.attrs.sidePressure)) <= 1)
    out.push(W("side-unanswered", "opportunity", "moderate", "No answer to our side lane", `Nobody on their side can match ${names(a.side)} in a side lane; send them away from the group and make them answer.`, [], 1));
  const exposed = theirs.filter(needsPeel);
  const reach = ours.filter((s) => s.c.kit.backlineAccess >= 2);
  if (exposed.length && reach.length >= 2)
    out.push(W("their-backline-exposed", "opportunity", "moderate", "Their backline is exposed", `${names(exposed)} cannot escape ${names(reach)}; play to reach them, not their frontline.`, [], 1));
  if (ea.primary?.id === "dive" && b.disengage + b.counterEngage >= 6)
    out.push(W("dive-disengaged", "threat", "moderate", "They can disengage our dive", `${names(theirs.filter((s) => s.c.kit.disengage >= 2 || s.c.kit.counterEngage >= 2))} can stop or turn the dive; go in together or bait their tools first.`, ["fight-start"], 1));
  if (b.n >= 4 && b.mainShare >= T.concentration.major && b.main)
    out.push(W("their-one-carry", "opportunity", "moderate", "Their comp depends on one carry", `${b.main.c.name} is most of their damage; draft and play to deny or kill them first.`, ["access"], 1));
  if (b.n >= 3 && b.objective - a.objective >= T.enemy.objectiveGap)
    out.push(W("their-objectives", "threat", "minor", "Better objective setup", "They control objectives better; set up vision early and trade across the map when you cannot contest.", ["waveclear", "early"], 0));
  return rank(out);
}

// ---------- timing ----------

export function timing(f: Facts) {
  const score = (x: number) => Math.max(1, Math.min(5, Math.round(1 + (x * 4) / 3)));
  const s = { early: score(f.curve.early), mid: score(f.curve.mid), late: score(f.curve.late) };
  const peak = (["early", "mid", "late"] as const).reduce((p, k) => (s[k] > s[p] ? k : p), "early");
  const low = (["early", "mid", "late"] as const).reduce((p, k) => (s[k] < s[p] ? k : p), "early");
  const when = { early: "before first items", mid: "around two to three items", late: "from four items on" };
  const weak = { early: "Weak before first items. ", mid: "Soft in the midgame. ", late: "Falls off late. " };
  const text = s[peak] === s[low] ? "Even across the game; no clear power spike."
    : `${s[low] <= 3 ? weak[low] : ""}Strongest ${when[peak]}.`;
  return { ...s, text };
}

// ---------- win condition ----------

export function winCondition(id: IdentityId, slots: Slot[], f: Facts, secondary: IdentityId | null): string {
  const starters = f.primary.length ? f.primary : f.catchers;
  const carries = f.carries.length ? f.carries : slots;
  const ranged = carries.filter((s) => s.c.kit.range >= 2);
  const divers = slots.filter(diver);
  const carry = slots.find(needsPeel) ?? f.main;
  const peelers = slots.filter((s) => s !== carry && peeler(s));
  const nm = (ss: Slot[]) => names(ss.slice(0, 3));
  const main: Record<IdentityId, string> = {
    "front-to-back": `Set up first around objectives, let ${nm(starters)} start fights, and play front-to-back through ${nm(ranged.length ? ranged : carries)}.`,
    dive: `Go in together: ${nm(divers)} reach the enemy carries at the same time instead of one by one.`,
    pick: `Win through vision and fog: catch a target with ${nm(f.catchers)} before each objective, then fight with the numbers advantage.`,
    poke: `Avoid forced 5v5 engages. Chip with ${nm(f.pokers)} first and fight only after creating a health advantage.`,
    protect: `Play around ${carry?.c.name}: ${nm(peelers)} stay with ${carry?.c.name} and let the enemy dive into you.`,
    skirmish: "Fight short 2v2s and 3v3s around the jungle before items stack up, and snowball the leads into objectives.",
    wombo: `Fight in choke points and around objectives where ${nm(slots.filter((s) => s.c.kit.aoeCc >= 2))} can land their crowd control on the same targets.`,
    split: `Create side-lane pressure with ${nm(f.side)}, then use ${nm(slots.filter((s) => !f.side.includes(s) && (s.c.fightStart !== "none" || s.threat >= 2)))} to punish rotations.`,
    tempo: "Win lanes, take the first dragons and Herald, and end before the enemy's items come online.",
    scaling: `Trade objectives instead of contesting early, and fight once ${nm(slots.filter((s) => s.c.kit.curve.late >= 3))} have items.`,
  };
  const extra: Partial<Record<IdentityId, string>> = {
    pick: f.catchers.length ? `Between objectives, look for catches with ${nm(f.catchers)}.` : undefined,
    split: f.side.length ? `Between fights, ${nm(f.side)} ${verb(f.side, "pressures", "pressure")} a side lane.` : undefined,
    poke: f.pokers.length ? `Before committing, chip with ${nm(f.pokers)}.` : undefined,
    protect: carry && peelers.length ? `Once a fight starts, ${nm(peelers)} turn back to protect ${carry.c.name}.` : undefined,
    scaling: "If the early game goes even, the late game favours you.",
    tempo: "Use the early lanes to set up the first objectives.",
  };
  return [main[id], secondary && secondary !== id ? extra[secondary] : undefined].filter(Boolean).join(" ");
}

// ---------- needs per open role ----------

export interface RoleNeed { id: NeedId; label: string; because: string; priority: number }

/** Jobs the remaining picks should do, most important first. Each comes from a weakness, or from a job every comp needs. */
export function jobs(slots: Slot[], f: Facts, insights: Insight[], dive = false): RoleNeed[] {
  const need = new Map<NeedId, RoleNeed>();
  const add = (id: NeedId, priority: number, because: string) => {
    const cur = need.get(id);
    if (!cur || cur.priority < priority) need.set(id, { id, label: NEEDS[id].label, because, priority });
  };
  for (const w of insights) w.fixes.forEach((id, i) => add(id, SEV[w.severity] * 2 + w.weight / 4 - i * 0.3, w.label));
  // Baseline jobs, so an early draft still gets direction before team-wide rules fire.
  if (!f.primary.length) add(f.catchers.length ? "engage" : "fight-start", 3, "no primary engage yet");
  if (!f.frontliners.length) add("frontline", 3, "no frontline yet");
  const carry = exposedCarries(slots, dive)[0];
  if (carry && sum(slots.filter((s) => s !== carry).map((s) => s.c.attrs.peel + s.c.kit.disengage)) < 4) add("peel", 3, `${carry.c.name} needs protection`);
  if (f.carries.length < 2) add("second-threat", f.carries.length ? 2.5 : 3, f.carries.length ? `only ${names(f.carries)} deals real damage so far` : "no damage source yet");
  if (f.n >= 2 && !f.sustained.length) add("sustained", 1.5, "no sustained damage yet");
  if (f.n >= 2 && (f.physicalShare ?? 0.5) >= 0.75) add("magic", 2, "mostly physical so far");
  if (f.n >= 2 && (f.magicShare ?? 0.5) >= 0.75) add("physical", 2, "mostly magic so far");
  if (f.primary.length && f.followUp - Math.max(...f.primary.map((s) => s.c.kit.followUp)) < T.followUpNeeded) add("follow-up", 1.5, "the engage needs follow-up");
  // Jobs already done are dropped.
  if (f.primary.length) need.delete("engage"), need.delete("fight-start");
  if (f.catchers.length) need.delete("fight-start");
  if (f.frontliners.length >= 2) need.delete("second-frontline");
  if (f.frontliners.length) need.delete("frontline");
  // "Fight starter" (catch or engage) and "Primary engage" ask for the same slot: keep the more urgent one.
  if (need.has("engage") && need.has("fight-start")) need.delete(need.get("engage")!.priority > need.get("fight-start")!.priority ? "fight-start" : "engage");
  return [...need.values()].sort((a, b) => b.priority - a.priority);
}

/** Which jobs a role can realistically provide: at least one converted champion for that role does it. */
// A team-wide "early pressure" need, asked of one role, is that role's lane priority.
const LANE_LABEL: Record<Role, string> = { TOP: "Top lane priority", JUNGLE: "Early jungle pressure", MID: "Mid priority", BOT: "Bot lane priority", SUPPORT: "Bot lane priority" };

export function roleNeeds(open: Role[], all: RoleNeed[], champions: ChampionKit[], taken: Set<string>): Partial<Record<Role, RoleNeed[]>> {
  return Object.fromEntries(open.map((role) => {
    const pool = champions.filter((c) => c.roles.includes(role) && !taken.has(c.id));
    const jobsHere = all.filter((j) => pool.some((c) => NEEDS[j.id].test(c, role)))
      // Lane priority is a real job for any role, but it ranks below protection and engage jobs from the same weakness list.
      .map((j) => (j.id === "early" ? { ...j, label: LANE_LABEL[role], priority: j.priority - 2 } : j))
      .sort((a, b) => b.priority - a.priority);
    return [role, jobsHere.slice(0, T.needsShown)];
  }));
}

// ---------- candidates: fixes, tradeoffs, best fix ----------

export interface CandidateRead { champion: string; role: Role; fixes: RoleNeed[]; fixScore: number; tradeoffs: string[]; also: string[]; changes: WeaknessChanges }

export function readCandidate(c: ChampionKit, role: Role, draft: Draft, champions: ChampionKit[], needs: RoleNeed[], enemy: string[] = []): CandidateRead {
  const before = slotsOf(draft, champions);
  const after = slotsOf({ ...draft, [role]: c.id }, champions);
  const fa = facts(before), fb = facts(after);
  const fixes = needs.filter((n) => NEEDS[n.id].test(c, role));
  const tradeoffs: string[] = [];
  const carry = after.find((s) => s.c.id !== c.id && needsPeel(s)) ?? (fa.main && fa.main.c.kit.backlineAccess === 0 && fa.main.threat >= 3 ? fa.main : undefined);
  if (carry && c.attrs.peel + c.kit.disengage <= 1 && (role === "SUPPORT" || needs.some((n) => n.id === "peel")))
    tradeoffs.push(`Less peel for ${carry.c.name}`);
  if (c.kit.resourceDemand >= 3 && fa.hungry.length >= 2) tradeoffs.push(`Another gold-hungry pick (${names(fa.hungry)})`);
  if (c.kit.disengage === 0 && c.kit.counterEngage <= 1 && (fa.n >= 3 && fa.disengage + fa.counterEngage < 4)) tradeoffs.push("Low disengage");
  if (threatOf(c, role).damageThreat >= 2 && c.kit.range <= 1 && fa.shortRange.length >= 2) tradeoffs.push("Another short-range carry");
  if (c.kit.curve.early <= 1 && fa.curve.early <= 2) tradeoffs.push("Adds to a slow early game");
  if (c.kit.curve.late <= 1 && fa.curve.late <= 2) tradeoffs.push("Falls off late");
  if (c.fightStart === "none" && threatOf(c, role).damageThreat <= 1 && !fa.primary.length) tradeoffs.push("Does not start fights");
  const changes = weaknessChanges(before, after, fa, fb);
  for (const w of changes.creates) if (w.severity !== "minor" && !UNFIXED.includes(w.id)) tradeoffs.push(`Creates: ${w.label}`);
  if (enemy.length) {
    const vb = new Set(versus(before, slotsOf(enemyDraft(enemy, champions), champions)).map((w) => w.id));
    for (const w of versus(after, slotsOf(enemyDraft(enemy, champions), champions))) if (!vb.has(w.id) && w.kind === "threat") tradeoffs.push(`Into their draft: ${w.label}`);
  }
  const fixScore = r1(sum(fixes.map((n) => n.priority)));
  return { champion: c.id, role, fixes, fixScore, tradeoffs: [...new Set(tradeoffs)].slice(0, 3), also: [], changes };
}

// Weaknesses that describe a job nobody has done yet. A pick that does not do the job leaves them unresolved; it never
// creates them, so they are never a tradeoff.
const UNFIXED = ["no-fight-start", "no-frontline", "no-sustained", "low-tank-damage", "low-waveclear", "follow-up-no-engage", "no-engage"];

export interface WeaknessChanges {
  creates: Insight[];    // new with this pick: the pick introduces it
  worsens: Insight[];    // already there, more severe after the pick (shown, not scored)
  unresolved: Insight[]; // already there at the same severity: inherited, not the pick's fault
  improves: Insight[];   // already there, less severe after the pick (the "after" insight)
  fixes: Insight[];      // gone after the pick (the "before" insight)
}

/**
 * How one pick changes the comp's weaknesses. The draft before the pick is read with the team-wide rules on whenever
 * the pick reaches ANALYSIS.teamRules (alan, 2026-10-14): a weakness the first three picks already had becomes visible
 * at four picks, and the fourth pick is not charged for it.
 */
export function weaknessChanges(before: Slot[], after: Slot[], fa: Facts = facts(before), fb: Facts = facts(after)): WeaknessChanges {
  const asTeam = fb.n >= T.teamRules;
  const was = new Map(weaknesses(before, fa, identities(before, fa), asTeam).flatMap((w) => [w, ...(w.covers ?? []).map((id) => ({ ...w, id }))]).map((w) => [w.id, w]));
  const now = weaknesses(after, fb);
  const nowIds = new Set(now.flatMap((w) => [w.id, ...(w.covers ?? [])]));
  const out: WeaknessChanges = { creates: [], worsens: [], unresolved: [], improves: [], fixes: [] };
  for (const w of now) {
    const prev = was.get(w.id) ?? (w.covers ?? []).map((id) => was.get(id)).find(Boolean);
    if (!prev) out.creates.push(w);
    else if (SEV[w.severity] > SEV[prev.severity]) out.worsens.push(w);
    else if (SEV[w.severity] < SEV[prev.severity]) out.improves.push(w);
    else out.unresolved.push(w);
  }
  const seen = new Set<string>();
  for (const w of was.values()) if (!nowIds.has(w.id) && !(w.covers ?? []).some((id) => nowIds.has(id)) && !seen.has(w.label)) { seen.add(w.label); out.fixes.push(w); }
  return out;
}

/** Enemy champion ids placed in their listed roles, for the enemy-aware rules. */
export function enemyDraft(ids: string[], champions: ChampionKit[]): Draft {
  const out: Draft = {};
  const byId = new Map(champions.map((c) => [c.id, c]));
  for (const id of ids) {
    const c = byId.get(id);
    if (!c) continue;
    const role = c.roles.find((r) => !out[r]) ?? ROLES.find((r) => !out[r]);
    if (role) out[role] = id;
  }
  return out;
}

// ---------- the whole read ----------

export type Confidence = "none" | "early" | "read" | "full";
export const CONFIDENCE_LABEL: Record<Confidence, string> = { none: "Not enough picks", early: "Early read", read: "Read", full: "Full draft" };

export interface Analysis {
  confidence: Confidence;
  headline: string;
  identity: { primary: IdentityScore | null; secondary: IdentityScore | null; all: IdentityScore[] };
  winCondition: string | null;
  weakPoints: Insight[];  // top ranked (weaknesses + tensions)
  more: Insight[];        // the rest, behind the expand control
  versus: Insight[];
  timing: ReturnType<typeof timing> | null;
  needs: RoleNeed[];
  roleNeeds: Partial<Record<Role, RoleNeed[]>>;
  facts: Facts;
}

export function analyze(draft: Draft, champions: ChampionKit[], enemyIds: string[] = [], opts: ReadOpts = {}): Analysis {
  const slots = slotsOf(draft, champions);
  const f = facts(slots);
  const n = slots.length;
  const confidence: Confidence = n < T.earlyRead ? "none" : n < T.teamRules ? "early" : n < 5 ? "read" : "full";
  const all = identities(slots, f, opts);
  const { primary, secondary } = n >= T.earlyRead ? pickIdentity(all) : { primary: null, secondary: null };
  const weak = n >= T.earlyRead ? weaknesses(slots, f, all) : [];
  const theirs = slotsOf(enemyDraft(enemyIds, champions), champions);
  const vs = versus(slots, theirs);
  const ranked = rank([...weak, ...vs.filter((v) => v.kind === "threat")]);
  const dive = primary?.id === "dive" || secondary?.id === "dive";
  const needs = n ? jobs(slots, f, ranked, dive) : [];
  const open = ROLES.filter((r) => !draft[r]);
  const taken = new Set([...slots.map((s) => s.c.id), ...theirs.map((s) => s.c.id)]);
  const protectedCarry = exposedCarries(slots, false)[0] ?? f.main;
  const label = (i: IdentityScore | null) => (!i ? null : i.id === "protect" && protectedCarry ? `Protect ${protectedCarry.c.name}` : IDENTITY_LABEL[i.id]);
  const top = ranked[0];
  const idText = [label(primary), label(secondary)].filter(Boolean).join(" · ") || "No clear identity yet";
  const headline = confidence === "early"
    ? `Early read: ${primary ? `trending toward ${[label(primary), label(secondary)].filter(Boolean).join(" / ").toLowerCase()}` : "no clear identity yet"}.${needs.length ? ` Still needs ${needs.slice(0, 2).map((x) => x.label.toLowerCase()).join(" and ")}.` : ""}`
    : `${idText}${top && top.severity !== "minor" && top.short ? `, but ${top.short}` : ""}`;
  return {
    confidence, headline,
    identity: { primary, secondary, all },
    winCondition: primary && n >= T.earlyRead ? winCondition(primary.id, slots, f, secondary?.id ?? null) : null,
    weakPoints: confidence === "early" ? ranked.filter((w) => w.severity !== "minor").slice(0, 2) : ranked.slice(0, T.weakShown),
    more: confidence === "early" ? ranked.filter((w) => w.severity !== "minor").slice(2) : ranked.slice(T.weakShown),
    versus: vs,
    timing: n >= T.earlyRead ? timing(f) : null,
    needs,
    roleNeeds: roleNeeds(open, needs, champions, taken),
    facts: f,
  };
}

/** Every converted champion for an open role, read against that role's needs. Best fix first. */
export function candidatesFor(role: Role, draft: Draft, champions: ChampionKit[], enemyIds: string[] = []): CandidateRead[] {
  const a = analyze(draft, champions, enemyIds);
  const needs = a.roleNeeds[role] ?? [];
  const taken = new Set([...Object.values(draft), ...enemyIds]);
  return champions.filter((c) => c.roles.includes(role) && !taken.has(c.id))
    .map((c) => readCandidate(c, role, draft, champions, needs, enemyIds))
    .sort((x, y) => y.fixScore - x.fixScore || x.tradeoffs.length - y.tradeoffs.length || x.champion.localeCompare(y.champion));
}

// ---------- best fix inside alan's saved pairings ----------

export interface SavedBotRecord { champion: string; clashDefault: string[]; alternatives: string[] }

/** Champions alan's saved bot-lane records allow in this slot, or null when no record applies. */
export function savedEligible(role: Role, draft: Draft, botPairings: SavedBotRecord[]): string[] | null {
  if (role === "SUPPORT" && draft.BOT) {
    const rec = botPairings.find((b) => b.champion === draft.BOT);
    return rec ? [...rec.clashDefault, ...rec.alternatives] : null;
  }
  if (role === "BOT" && draft.SUPPORT) {
    const bots = botPairings.filter((b) => [...b.clashDefault, ...b.alternatives].includes(draft.SUPPORT!)).map((b) => b.champion);
    return bots.length ? bots : null;
  }
  return null;
}

/**
 * Best fix for an open role. Actionable fixes respect the saved bot-lane pairings (with Ziggs locked, only Nautilus
 * or Leona); champions that would fix the comp but sit outside them are returned separately as theoretical fixes.
 * The overall draft-fit ranking (lib/recommend.ts) is unchanged: saved pairings stay a bonus there, not a filter.
 */
export function bestFix(role: Role, draft: Draft, champions: ChampionKit[], botPairings: SavedBotRecord[], enemyIds: string[] = []) {
  const all = candidatesFor(role, draft, champions, enemyIds);
  const allowed = savedEligible(role, draft, botPairings);
  if (!allowed) return { fixes: all, theoretical: [] as CandidateRead[], restricted: false };
  return {
    fixes: all.filter((c) => allowed.includes(c.champion)),
    theoretical: all.filter((c) => !allowed.includes(c.champion) && c.fixScore > 0),
    restricted: true,
  };
}
