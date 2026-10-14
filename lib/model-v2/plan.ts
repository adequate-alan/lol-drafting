// Plan-aware comp read (alan, 2026-10-14; PREVIEW, not yet the live Comp Check and never used by recommendation
// scoring). The question it answers: is this composition missing something it needs to execute its own win condition?
//
// It reads the same champion facts as lib/model-v2/analyze.ts (unreviewed kits) and the same identities, then:
//   1. checks the jobs the primary plan needs (front-to-back needs a frontline and protection, a dive needs reach and
//      coordinated follow-up, a siege needs range, waveclear and a way to stop the engage that answers it, ...);
//   2. re-reads every existing warning against that plan: kept as a weakness, merged into a plan job, or listed as an
//      accepted tradeoff with the reason the plan can live with it. Nothing is silently dropped;
//   3. adds compound reads where two gaps make each other worse, and the bot-lane pair reads the recorded pro lineups
//      support (Mid/Jungle and Top/Jungle pair facts showed no signal on these kits, so there are none).
// Pro evidence, saved pairings and counters never enter here.
import { ROLES, type Role } from "../schema";
import {
  facts, identities, pickIdentity, weaknesses, winCondition, timing, roleNeeds, names, slotsOf, SEV, IDENTITY_LABEL,
  needsPeel, peeler, NEEDS, savedEligible, type SavedBotRecord, type Draft, type Facts, type IdentityId, type IdentityScore, type Insight, type NeedId,
  type RoleNeed, type Severity, type Slot, type Confidence, enemyDraft,
} from "./analyze";
import type { ChampionKit } from "./schema";
import { ANALYSIS as T } from "./thresholds";

// Every threshold the plan read uses, in one place for review. Heuristics on the 0–3 kit scales.
export const PLAN = {
  hold: { frontToBack: 1.5, any: 1 },  // frontline: a tank (frontline 2+) counts 1, a melee bruiser carry counts 0.5
  protectors: 2,                        // peel or disengage 2+, not the team's engage
  rangedCarries: 2,                     // damage threats at range 2+ for front-to-back
  counterEngage: 5,                     // team counter-engage that can stand in for an on-demand engage
  reach: 2,                             // damage threats with backline access 2+ for a dive
  diveBodies: 3,                        // champions with backline access 2+ arriving together
  catches: 2,                           // catch threats for a pick comp (one plus a reaching engage also works)
  burst: 2,                             // damage threats that convert a catch
  siegeThreats: 2,                      // structure pressure 2+ or long-range poke threats
  siegeHold: 6,                         // team max(disengage, counter-engage) a siege needs to survive the answer
  waveclear: 8,                         // team waveclear a siege or split needs
  aoe: 3,                               // AoE crowd-control picks for wombo
  splitStall: { waveclear: 7, hold: 4 },
} as const;

// needed: with four picks, a critical gap an available champion in the open role closes; the last pick must bring it.
export type Tier = "critical" | "needed" | "weakness" | "accepted";
// What the revealed enemy does to a finding. The plan read itself is structural: it reads only our picks.
// exploited: an enemy pick targets this gap · less-relevant: four or more enemy picks and none of the tools that would.
export type Exposure = "structural" | "exploited" | "less-relevant";
export interface PlanFinding {
  id: string;
  tier: Tier;               // critical: blocks the plan · weakness: real cost · accepted: the plan can live with it
  severity: Severity;       // ranking inside a tier
  label: string;
  why: string;              // the reason, in champion names: what fails, and what follows from it
  fixes: NeedId[];
  replaces?: string[];      // ids of the current Comp Check rules this finding stands for
  source: "plan" | "general" | "interaction" | "duo";
  exposure: Exposure;
  against?: string;         // the enemy picks that exploit it, or why the matchup makes it matter less
  fixers?: string[];        // needed: available champions in the open role whose pick closes it (saved-bot rule applied)
  theoretical?: string[];   // needed: supports that close it but sit outside the locked bot's saved supports
}
// essential: without it the plan cannot be executed (critical); otherwise a missing job is a real weakness.
export interface Job { id: string; label: string; met: boolean; by: string; missing: string; fixes: NeedId[]; essential: boolean }
export interface PlanCheck { identity: IdentityId; label: string; jobs: Job[]; met: number }

export interface PlanRead {
  confidence: Confidence;
  headline: string;
  identity: { primary: IdentityScore | null; secondary: IdentityScore | null };
  plan: PlanCheck | null;
  winCondition: string | null;
  critical: PlanFinding[];
  weaknesses: PlanFinding[];  // top meaningful weaknesses (critical first), at most PLAN_SHOWN
  more: PlanFinding[];
  accepted: PlanFinding[];    // tradeoffs the plan does not need fixed, each with its reason
  needs: RoleNeed[];
  roleNeeds: Partial<Record<Role, RoleNeed[]>>;
  timing: ReturnType<typeof timing> | null;
  open: Role | null;          // the one role left with four picks
  needed: PlanFinding[];      // four picks: what the last pick must bring
  merged: { rule: string; job: string }[]; // current rules reported by a missing plan job instead of on their own
  enemyRead: "none" | "partial" | "full"; // how much of the enemy the exposure tags could see
}
const SHOWN = 3;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const nm = (ss: Slot[]) => (ss.length ? names(ss) : "nobody");
const tank = (s: Slot) => s.c.attrs.frontline >= 2;
const bruiser = (s: Slot) => !tank(s) && s.c.attrs.frontline === 1 && s.c.kit.range <= 1 && s.threat >= 2;
const holdOf = (slots: Slot[]) => slots.filter(tank).length + 0.5 * slots.filter(bruiser).length;
// Damage from behind a frontline: any ranged threat (kit range 1 is short range, still ranged).
const ranged = (s: Slot) => s.threat >= 2 && s.c.kit.range >= 1;
const reaches = (s: Slot) => s.threat >= 2 && s.c.kit.backlineAccess >= 2;
// Damage that has to walk into the enemy with no way past their frontline.
const stuck = (s: Slot) => s.threat >= 2 && s.c.kit.range === 0 && s.c.kit.backlineAccess < 2;
const starter = (s: Slot) => s.c.fightStart === "primary";
const catcher = (s: Slot) => s.c.fightStart === "catch";
/** How a carry follows an ally's engage, from the unreviewed kit fields (no value is changed for this read). */
export const followOf = (s: Slot) => ({
  allIn: s.c.kit.followUp >= 2,                                  // crowd control or burst of their own on the locked target
  ranged: s.threat >= 2 && s.c.kit.range >= 2,                    // hits the locked target from standard range or further
  joins: s.c.kit.backlineAccess >= 2 || (s.threat >= 2 && s.c.kit.range <= 1), // reaches it, or is already standing there
  extended: s.c.attrs.sustainedDps >= 2,                          // keeps dealing damage in the longer trade that follows
});

// ---------- plan jobs ----------

function jobsFor(id: IdentityId, slots: Slot[], f: Facts): Job[] {
  const J = (jid: string, label: string, met: boolean, by: Slot[] | string, missing: string, fixes: NeedId[], essential = true): Job =>
    ({ id: jid, label, met, by: typeof by === "string" ? by : nm(by), missing, fixes, essential });
  const hold = holdOf(slots);
  const fronts = slots.filter((s) => tank(s) || bruiser(s));
  const carry = slots.find(needsPeel) ?? (f.main && f.main.c.kit.range >= 2 && f.main.c.kit.backlineAccess === 0 ? f.main : undefined);
  const protectors = slots.filter((s) => s !== carry && peeler(s) && !starter(s));
  const start = f.primary.length ? f.primary : [];
  switch (id) {
    case "front-to-back": {
      const r = slots.filter(ranged);
      return [
        J("frontline", "Frontline that holds the first rotation", hold >= PLAN.hold.frontToBack, fronts, `${hold ? `only ${nm(fronts)} in front` : "nobody in front"}; the enemy reaches the carries first`, ["frontline", "second-frontline"]),
        J("backline-damage", "Damage from behind the frontline", r.length >= PLAN.rangedCarries, r, `only ${nm(r)} deals damage from behind the frontline; the rest has to walk past it`, ["range"], false),
        J("start", "A way to start or accept the 5v5", start.length > 0 || f.counterEngage >= PLAN.counterEngage, start.length ? start : `counter-engage ${f.counterEngage}`, "nobody starts the fight and the comp cannot turn one either", ["engage"]),
        J("protect", "Protection for the main carry", !carry || slots.filter((s) => s !== carry && peeler(s)).length >= 1 || hold >= 2, carry ? slots.filter((s) => s !== carry && peeler(s)) : "no carry that needs it", `${carry?.c.name} has nobody to peel once the frontline is busy`, ["peel"], false),
      ];
    }
    case "dive": {
      const reach = slots.filter(reaches);
      const reachStart = slots.filter((s) => (starter(s) || catcher(s)) && s.c.kit.backlineAccess >= 2);
      const bodies = slots.filter((s) => s.c.kit.backlineAccess >= 2);
      return [
        J("reach-start", "A start that reaches the backline", reachStart.length > 0, reachStart, "nobody begins the dive on the enemy carry; the divers arrive one at a time", ["engage", "access"]),
        J("reach-damage", "Damage that reaches the backline", reach.length >= PLAN.reach, reach, `only ${nm(reach)} can get to the enemy carries`, ["access"]),
        J("together", "Follow-up that arrives together", bodies.length >= PLAN.diveBodies && f.followUp >= T.followUpNeeded, bodies, `only ${nm(bodies)} can follow the dive in; the first diver is alone`, ["access", "follow-up"], false),
      ];
    }
    case "poke": {
      const threats = slots.filter((s) => s.c.kit.structurePressure >= 2 || (s.c.kit.range >= 3 && s.c.attrs.poke >= 2 && s.threat >= 2));
      const hold2 = sum(slots.map((s) => Math.max(s.c.kit.disengage, s.c.kit.counterEngage)));
      const holders = slots.filter((s) => s.c.kit.disengage >= 2 || s.c.kit.counterEngage >= 2);
      return [
        J("range", "Two siege or poke threats", threats.length >= PLAN.siegeThreats, threats, `only ${nm(threats)} can hit from outside the enemy's reach`, ["range"]),
        J("waveclear", "Waveclear to hold the wave in front", f.waveclear >= PLAN.waveclear, `team waveclear ${f.waveclear}`, `team waveclear ${f.waveclear}; the siege cannot keep waves pushed`, ["waveclear"], false),
        J("anti-engage", "Anti-engage to protect the siege", hold2 >= PLAN.siegeHold, holders, `disengage and counter-engage total ${hold2}; one engage onto the pokers ends the siege`, ["disengage", "peel"]),
      ];
    }
    case "protect": {
      const turners = slots.filter((s) => s !== carry && s.c.kit.counterEngage >= 2);
      return [
        J("protectors", "Two protectors who stay with the carry", protectors.length >= PLAN.protectors, protectors, `only ${nm(protectors)} stays back with ${carry?.c.name ?? "the carry"}`, ["peel", "disengage"]),
        J("punish", "A punish for the enemy dive", turners.length >= 1, turners, `nobody turns the enemy's dive into a kill; fights stall`, ["disengage"], false),
        J("front", "Something between the enemy and the carry", hold >= PLAN.hold.any, fronts, "nothing stands in front of the carry", ["frontline"], false),
      ];
    }
    case "pick": {
      const catches = slots.filter((s) => catcher(s) && (s.c.kit.range >= 1 || s.c.kit.backlineAccess >= 2 || !!s.c.kit.global));
      const reachEngage = slots.filter((s) => starter(s) && s.c.kit.backlineAccess >= 2);
      // One catch is enough when burst is ready to convert it (the identity's own test).
      const burst = slots.filter((s) => s.threat >= 2 && (s.c.attrs.burst >= 2 || s.c.kit.followUp >= 2));
      return [
        J("catch", "Catch threats", catches.length >= PLAN.catches || (catches.length >= 1 && (reachEngage.length >= 1 || burst.length >= PLAN.burst)), [...catches, ...reachEngage], `only ${nm(catches)} can catch a target`, ["fight-start"]),
        J("convert", "Burst that converts a catch", burst.length >= PLAN.burst, burst, `only ${nm(burst)} can kill a caught target quickly`, ["second-threat"], false),
      ];
    }
    case "skirmish": {
      const jg = slots.find((s) => s.role === "JUNGLE");
      const partners = slots.filter((s) => s.role !== "JUNGLE" && s.role !== "SUPPORT" && s.c.kit.curve.early >= 3 && s.threat >= 2);
      return [
        J("jungle", "A jungler who wins early fights", !!jg && jg.c.kit.curve.early >= 3, jg ? [jg] : [], `${jg ? `${jg.c.name} is not an early skirmisher` : "no jungler yet"}`, ["early"], false),
        J("partner", "A laner who joins and wins the 2v2", partners.length >= 1, partners, "no laner can follow the jungler into an early fight", ["early"], false),
        J("durable", "Someone who survives the first rotation", hold >= PLAN.hold.any, fronts, "nobody can take the first rotation in a short fight", ["frontline"]),
      ];
    }
    case "wombo": {
      const aoe = slots.filter((s) => s.c.kit.aoeCc >= 2);
      return [
        J("start", "An AoE start", f.primary.some((s) => s.c.kit.aoeCc >= 2), f.primary.filter((s) => s.c.kit.aoeCc >= 2), "nobody lands the first AoE", ["engage"]),
        J("layers", "AoE crowd control to layer on it", aoe.length >= PLAN.aoe, aoe, `only ${nm(aoe)} adds AoE crowd control`, ["follow-up"], false),
      ];
    }
    case "split": {
      const four = slots.filter((s) => !f.side.includes(s));
      const wc = sum(four.map((s) => s.c.kit.waveclear)), stall = sum(four.map((s) => Math.max(s.c.kit.disengage, s.c.kit.counterEngage)));
      const punish = four.filter((s) => s.c.kit.global || catcher(s) || starter(s));
      return [
        J("side", "A side laner who wins alone", f.side.length > 0, f.side, "nobody holds a side lane alone", []),
        J("stall", "Four who can stall the map", wc >= PLAN.splitStall.waveclear && stall >= PLAN.splitStall.hold, four, `the other four have waveclear ${wc} and disengage ${stall}; they lose the 4v5`, ["waveclear", "disengage"]),
        J("punish", "A punish for enemy rotations", punish.length > 0, punish, "nothing punishes the enemy for sending one to the side lane", ["fight-start"], false),
      ];
    }
    case "tempo":
      return [
        J("lanes", "Lane priority to start the early game", f.lanePressure >= 2, `lane pressure ${f.lanePressure.toFixed(1)}`, "the lanes cannot push first to start early objectives", ["early"], false),
        J("fight", "A way to force early fights", f.primary.length + f.catchers.length > 0, [...f.primary, ...f.catchers], "nobody forces the early fights the comp needs", ["fight-start"], false),
      ];
    case "scaling":
      return [
        J("survive", "Early-game safety", f.waveclear >= PLAN.waveclear || f.disengage + f.counterEngage >= PLAN.siegeHold, `waveclear ${f.waveclear}, disengage ${f.disengage + f.counterEngage}`, "nothing clears waves or stops early dives while the carries scale", ["waveclear", "disengage"]),
      ];
  }
}

export function checkPlan(id: IdentityId, slots: Slot[], f: Facts = facts(slots)): PlanCheck {
  const jobs = jobsFor(id, slots, f);
  return { identity: id, label: IDENTITY_LABEL[id], jobs, met: jobs.filter((j) => j.met).length };
}

// ---------- the current rules, read against the plan ----------

const COVERED: Partial<Record<IdentityId, Record<string, string>>> = {
  // rule id → plan job that already reports it, so the same gap is not said twice
  "front-to-back": { "no-frontline": "frontline", "thin-frontline": "frontline", "carry-unprotected": "protect", "no-engage": "start", "no-fight-start": "start" },
  dive: { "dive-no-access": "reach-damage", "no-engage": "reach-start" },
  poke: { "poke-no-disengage": "anti-engage", "low-waveclear": "waveclear" },
  protect: { "carry-unprotected": "protectors", "no-frontline": "front" },
  wombo: { "no-engage": "start", "no-fight-start": "start" },
  split: { "low-waveclear": "stall" },
  skirmish: { "no-frontline": "durable" },
};

// Current rules that block any plan when major: nobody can start a fight, an exposed main carry, damage one item
// blunts, a frontline with no damage, a carry nobody sets up. Every other rule is a weakness at most.
const CRITICAL_RULES = ["no-fight-start", "carry-unprotected", "all-ad", "all-ap", "armor-frontline", "frontline-no-damage", "needs-setup"];

/** One current rule against the plan: keep, accept (with the reason), or merge into a plan job. */
function reread(w: Insight, plan: IdentityId, slots: Slot[], f: Facts, reported: Set<string>): PlanFinding | null {
  const keep = (tier: Tier = w.severity === "major" && CRITICAL_RULES.includes(w.id) ? "critical" : "weakness", why = w.text): PlanFinding =>
    ({ id: w.id, tier, severity: w.severity, label: w.label, why, fixes: w.fixes, replaces: [w.id, ...(w.covers ?? [])], source: "general", exposure: "structural" });
  const accept = (why: string): PlanFinding => ({ id: w.id, tier: "accepted", severity: w.severity, label: w.label, why, fixes: w.fixes, replaces: [w.id], source: "general", exposure: "structural" });
  // Merged only when that job is reported as missing; otherwise the rule stands on its own, so nothing is dropped.
  const job = COVERED[plan]?.[w.id];
  if (job && reported.has(job)) return null;
  const P = IDENTITY_LABEL[plan].toLowerCase();
  const fronts = slots.filter((s) => tank(s) || bruiser(s));
  const stuckCarries = slots.filter(stuck);
  switch (w.id) {
    case "no-frontline":
      if (["dive", "skirmish", "pick", "split", "tempo"].includes(plan)) {
        if (holdOf(slots) >= PLAN.hold.any) return accept(`No traditional tank. A ${P} comp fights in short windows, and ${nm(fronts)} can take the first hits.`);
        return keep("weakness", `Nobody can take the first hits. A ${P} comp can avoid long fights, but forced objective fights start with a carry exposed.`);
      }
      if (plan === "poke") return keep("weakness", "Nobody can absorb the first hits. A siege comp avoids forced fights, but anything that reaches the pokers starts with a carry exposed.");
      return keep("critical", "Nobody can absorb the first rotation; every fight starts with a carry exposed.");
    case "thin-frontline":
      return plan === "front-to-back" || plan === "protect" ? keep("weakness") : accept(`One frontliner is enough for a ${P} comp that does not stand and trade.`);
    case "short-range":
      if (plan === "dive" || plan === "skirmish") {
        if (stuckCarries.length < T.shortRangeCarries) return accept(`Short range is how a ${P} comp fights; ${nm(slots.filter(reaches))} can reach their targets.`);
        return keep("weakness", `${nm(stuckCarries)} have to walk through the enemy frontline with no way past it.`);
      }
      if (stuckCarries.length < 2) return accept(`${nm(f.shortRange)} fight up close, but ${nm(f.shortRange.filter((s) => !stuck(s)))} can reach past the frontline.`);
      return keep("weakness", `${nm(stuckCarries)} have to walk into the enemy to deal damage, which a ${P} comp does not want.`);
    case "no-engage":
      if (plan === "protect") return accept(`A protect comp fights by answering the enemy's engage, not starting its own${f.counterEngage >= 4 ? ` (counter-engage ${f.counterEngage})` : ""}.`);
      if (plan === "poke" || plan === "pick" || plan === "split") return accept(`A ${P} comp wins before or without a forced 5v5; catches come from ${nm(f.catchers)}.`);
      return keep("weakness");
    case "no-fight-start":
    case "follow-up-no-engage":
      if (plan === "protect" && f.counterEngage >= PLAN.counterEngage) return accept(`The comp waits for the enemy to engage and turns it (counter-engage ${f.counterEngage}).`);
      if (plan === "poke" && f.disengage + f.counterEngage >= PLAN.siegeHold) return accept("A siege comp avoids forced fights; it needs to stop engages, not start them.");
      return keep();
    case "single-threat":
      if (plan === "protect") return accept(`The plan is to win through ${f.main?.c.name}; how well ${f.main?.c.name} is protected decides it.`);
      return keep();
    case "no-sustained":
      if ((plan === "pick" || plan === "dive") && f.burst.length >= 2) return accept(`A ${P} comp kills with burst from ${nm(f.burst)}; long fights are what it avoids.`);
      return keep();
    case "weak-early":
      if (plan === "scaling" || plan === "protect") return accept(`A ${P} comp gives up early pressure on purpose; the late game is the payoff.`);
      return keep();
    case "falls-off":
      if (plan === "tempo" || plan === "skirmish") return accept(`A ${P} comp should end before its curve drops.`);
      return keep();
    case "low-waveclear":
      return keep("weakness");
    default:
      return keep();
  }
}

// ---------- compound reads ----------

function interactions(slots: Slot[], f: Facts, plan: IdentityId | null): PlanFinding[] {
  const out: PlanFinding[] = [];
  const add = (id: string, tier: Tier, severity: Severity, label: string, why: string, fixes: NeedId[], source: PlanFinding["source"] = "interaction") =>
    out.push({ id, tier, severity, label, why, fixes, source, exposure: "structural" });
  const hold = holdOf(slots);
  const stuckCarries = slots.filter(stuck);
  if (hold < PLAN.hold.any && stuckCarries.length >= 2 && plan !== "dive")
    add("x-no-front-short", "critical", "major", "No frontline and short range together", `${nm(stuckCarries)} must walk into the enemy, and nobody absorbs the first rotation in front of them. Each gap makes the other worse.`, ["frontline", "range"]);
  const carry = slots.find(needsPeel);
  if (carry && f.primary.length === 1) {
    const s = f.primary[0];
    const others = slots.filter((x) => x !== s && x !== carry && peeler(x));
    if (peeler(s) && !others.length)
      add("x-engage-is-peel", "weakness", "moderate", "Engage and peel on one champion", `${s.c.name} is the only engage and the only protection for ${carry.c.name}; once ${s.c.name} goes in, ${carry.c.name} is alone.`, ["peel"]);
  }
  if (plan === "protect" && carry && slots.filter((x) => x !== carry && peeler(x)).length >= 2 && !slots.some((x) => x !== carry && x.c.kit.counterEngage >= 2))
    add("x-peel-no-punish", "weakness", "moderate", "Peel without punish", `${nm(slots.filter((x) => x !== carry && peeler(x)))} keep ${carry.c.name} alive, but nobody turns the dive into a kill, so fights stall.`, ["disengage"]);
  if (plan === "poke" && Math.max(0, ...slots.map((s) => s.c.attrs.lanePressure)) < 2)
    add("x-siege-no-priority", "weakness", "moderate", "Siege without lane priority", "The comp wants to start sieges, but no lane can push first to start one.", ["early"]);
  // Bot lane pair reads (supported by recorded pro lineups against shuffled ones, 2026-10-14).
  const bot = slots.find((s) => s.role === "BOT"), sup = slots.find((s) => s.role === "SUPPORT");
  if (bot && sup) {
    if (starter(sup)) {
      // Following an engage is four different things (alan's review, 2026-10-14), read from the kit fields as they are:
      // an all-in (crowd control or burst of their own on the locked target, followUp 2+), damage from range onto it,
      // physically joining (reach, or a short-range carry who is already there) and staying in the extended trade.
      const f2 = followOf(bot);
      if (!f2.allIn && !f2.ranged && !f2.joins)
        add("duo-engage-no-follow", "weakness", "moderate", "Support engages, carry cannot follow", `${sup.c.name} starts fights in lane and at dragon, but ${bot.c.name} can neither reach the target nor hit it from range in time.`, ["follow-up"], "duo");
      else if (!f2.allIn)
        add("duo-engage-ranged-follow", "weakness", "minor", "Engage gets ranged follow-up, not an all-in", `${bot.c.name} adds damage from range once ${sup.c.name} lands, but brings no crowd control or burst of their own to finish the all-in${f2.extended ? `; ${bot.c.name} is at home in the longer trade that follows` : ""}. Lane all-ins and dragon engages lean on the jungler or mid to finish the target.`, ["follow-up"], "duo");
    }
    // A diving carry (Kai'Sa into Nautilus) goes in with the engage on purpose; only a carry who must stand close
    // without a way in needs the support to protect them there.
    if (bot.threat >= 2 && bot.c.kit.range <= 1 && bot.c.kit.backlineAccess < 2 && !peeler(sup))
      add("duo-short-no-peel", "weakness", "moderate", "Short-range carry without a protector", `${bot.c.name} has to stand close to fight, and ${sup.c.name} does not peel for that.`, ["peel"], "duo");
  }
  return out;
}

// ---------- the whole read ----------

const TIER: Record<Tier, number> = { critical: 4, needed: 3, weakness: 2, accepted: 1 };
const order = (xs: PlanFinding[]) => xs.sort((a, b) => TIER[b.tier] - TIER[a.tier] || SEV[b.severity] - SEV[a.severity]);

function core(draft: Draft, champions: ChampionKit[]) {
  const slots = slotsOf(draft, champions);
  const f = facts(slots);
  const n = slots.length;
  const all = identities(slots, f);
  const { primary, secondary } = n >= T.earlyRead ? pickIdentity(all) : { primary: null, secondary: null };
  const plan = primary ? checkPlan(primary.id, slots, f) : null;
  const team = n >= T.teamRules;

  const findings: PlanFinding[] = [];
  const merged: { rule: string; job: string }[] = [];
  // Plan jobs: a missing job is critical on a team read, and a "still needs" line on an early read.
  if (plan && team) for (const j of plan.jobs.filter((x) => !x.met))
    findings.push({ id: `plan:${j.id}`, tier: j.essential ? "critical" : "weakness", severity: j.essential ? "major" : "moderate", label: `${plan.label}: missing ${j.label.toLowerCase()}`, why: `${cap(j.missing)}.`, fixes: j.fixes, source: "plan", exposure: "structural" });
  const reported = new Set(plan && team ? plan.jobs.filter((j) => !j.met).map((j) => j.id) : []);
  if (n >= T.earlyRead) {
    for (const w of weaknesses(slots, f, all)) {
      const job = primary ? COVERED[primary.id]?.[w.id] : undefined;
      if (job && reported.has(job)) { merged.push({ rule: w.id, job: `plan:${job}` }); continue; }
      const r = primary ? reread(w, primary.id, slots, f, reported) : { id: w.id, tier: (w.severity === "major" ? "critical" : "weakness") as Tier, severity: w.severity, label: w.label, why: w.text, fixes: w.fixes, source: "general" as const, exposure: "structural" as const };
      if (r) findings.push(r);
    }
    if (team) findings.push(...interactions(slots, f, primary?.id ?? null));
  }
  // Minor general rules are weaknesses at most; a critical rule needs a team read.
  for (const x of findings) {
    if (x.tier === "critical" && x.severity === "minor") x.tier = "weakness";
    if (x.tier === "critical" && !team) x.tier = "weakness";
  }
  return { slots, f, n, all, primary, secondary, plan, team, findings, merged };
}

/** Four picks: a critical gap that an available champion in the open role closes is something the last pick must
 *  bring, not a failure of a finished comp. Each candidate is checked by reading the five-pick draft it would make. */
function lastPick(draft: Draft, open: Role, critical: PlanFinding[], champions: ChampionKit[], taken: Set<string>) {
  // champion ids per finding; names are applied by the caller
  const pool = champions.filter((c) => c.roles.includes(open) && !taken.has(c.id));
  const closes = new Map<string, string[]>(critical.map((x) => [x.id, []]));
  for (const c of pool) {
    const after = core({ ...draft, [open]: c.id }, champions);
    const still = new Set(after.findings.filter((x) => x.tier === "critical").map((x) => x.id));
    for (const x of critical) if (!still.has(x.id)) closes.get(x.id)!.push(c.id);
  }
  return closes;
}

/** Tags each finding with what the revealed enemy does to it. Never changes a tier: the plan read stays structural. */
function expose(findings: PlanFinding[], theirs: Slot[]) {
  if (!theirs.length) return;
  const b = facts(theirs);
  const reach = theirs.filter((s) => s.c.kit.backlineAccess >= 2);
  const engagers = theirs.filter((s) => s.c.fightStart === "primary");
  const ep = pickIdentity(identities(theirs, b)).primary?.id;
  const many = theirs.length >= 4;
  // Gaps around the carry: exploited by two or more champions who reach the backline.
  const CARRY = ["carry-unprotected", "x-engage-is-peel", "duo-short-no-peel", "plan:protectors", "plan:protect"];
  // Gaps in front of the team: exploited by a hard engage that lands on several (AoE) or by a dive comp.
  const FRONT = ["no-frontline", "thin-frontline", "x-no-front-short", "poke-no-disengage", "plan:anti-engage", "plan:front", "plan:frontline", "plan:durable", "plan:stall"];
  const TANKS = ["low-tank-damage", "all-ad", "all-ap", "armor-frontline"];
  const PASSIVE = ["no-engage", "no-fight-start", "follow-up-no-engage", "plan:start", "plan:reach-start", "low-waveclear", "plan:waveclear"];
  const hardEngage = engagers.filter((s) => s.c.kit.aoeCc >= 2);
  for (const x of findings) {
    if (CARRY.includes(x.id)) {
      if (reach.length >= 2) { x.exposure = "exploited"; x.against = `${names(reach)} reach the backline`; }
      else if (many && !reach.length) { x.exposure = "less-relevant"; x.against = "none of their picks reaches the backline"; }
    } else if (FRONT.includes(x.id)) {
      if (hardEngage.length || ep === "dive") { x.exposure = "exploited"; x.against = hardEngage.length ? `${names(hardEngage)} can land an engage on several of you` : `their dive (${names(reach)}) goes through the front`; }
      else if (many && !engagers.length && reach.length <= 1) { x.exposure = "less-relevant"; x.against = "they have no hard engage and little dive"; }
    } else if (TANKS.includes(x.id)) {
      if (b.frontliners.length >= 2) { x.exposure = "exploited"; x.against = `${names(b.frontliners)} stand in front`; }
      else if (many && !b.frontliners.length) { x.exposure = "less-relevant"; x.against = "they have no frontline to shred"; }
    } else if (PASSIVE.includes(x.id)) {
      if (ep === "poke" || ep === "scaling") { x.exposure = "exploited"; x.against = `a ${IDENTITY_LABEL[ep].toLowerCase()} comp is happy not to fight on your terms`; }
    }
  }
}

export function analyzePlan(draft: Draft, champions: ChampionKit[], enemyIds: string[] = [], botPairings: SavedBotRecord[] = []): PlanRead {
  const { slots, f, n, primary, secondary, plan, team, findings, merged } = core(draft, champions);
  const confidence: Confidence = n < T.earlyRead ? "none" : n < T.teamRules ? "early" : n < 5 ? "read" : "full";
  const theirs = slotsOf(enemyDraft(enemyIds, champions), champions);
  const taken = new Set([...Object.values(draft).filter(Boolean) as string[], ...theirs.map((s) => s.c.id)]);
  const openRoles = ROLES.filter((r) => !draft[r]);
  const open = openRoles.length === 1 && n === 4 ? openRoles[0] : null;
  if (open) {
    const closes = lastPick(draft, open, findings.filter((x) => x.tier === "critical"), champions, taken);
    // With a saved bot locked, only its saved supports are named as fixes (the Draft Room's support rule); the rest
    // are theoretical. Alphabetical: the read names who closes the gap, it does not rank them.
    const allowed = savedEligible(open, draft, botPairings);
    const nameOf = (id: string) => champions.find((c) => c.id === id)?.name ?? id;
    const abc = (ids: string[]) => ids.map(nameOf).sort((a, b) => a.localeCompare(b));
    for (const x of findings) {
      const by = closes.get(x.id);
      if (x.tier !== "critical" || !by) continue;
      if (by.length) {
        x.tier = "needed";
        x.fixers = abc(allowed ? by.filter((id) => allowed.includes(id)) : by);
        if (allowed) x.theoretical = abc(by.filter((id) => !allowed.includes(id)));
      } else x.why = `${x.why} No available ${open.toLowerCase()} closes it.`;
    }
  }
  expose(findings, theirs);
  const ranked = order(findings);
  const real = ranked.filter((x) => x.tier !== "accepted");
  const accepted = ranked.filter((x) => x.tier === "accepted");

  // What the open roles should bring: the plan's missing jobs first, then the real weaknesses. Accepted tradeoffs ask
  // for nothing.
  const need = new Map<NeedId, RoleNeed>();
  const add = (id: NeedId, priority: number, because: string) => { const cur = need.get(id); if (!cur || cur.priority < priority) need.set(id, { id, label: NEEDS[id].label, because, priority }); };
  if (plan) for (const j of plan.jobs.filter((x) => !x.met)) j.fixes.forEach((id, i) => add(id, 7 - i * 0.3, `${plan.label}: ${j.label.toLowerCase()}`));
  for (const w of real) w.fixes.forEach((id, i) => add(id, (w.tier === "weakness" ? 2 : 3) * 2 - i * 0.3 + (w.severity === "major" ? 0.5 : 0), w.label));
  if (!plan && n) {
    if (!f.primary.length && !f.catchers.length) add("fight-start", 3, "no fight starter yet");
    if (!f.frontliners.length) add("frontline", 3, "no frontline yet");
    if (f.carries.length < 2) add("second-threat", 2.5, f.carries.length ? `only ${names(f.carries)} deals real damage so far` : "no damage source yet");
  }
  const needs = [...need.values()].sort((a, b) => b.priority - a.priority);

  const id = [primary, secondary].filter(Boolean).map((i) => IDENTITY_LABEL[i!.id]).join(" · ");
  const short = (x: PlanFinding) => (x.source === "plan" && plan ? x.label.slice(plan.label.length + 2) : x.label.toLowerCase());
  const needed = real.filter((x) => x.tier === "needed");
  const top = real[0];
  const headline = confidence === "none" ? "Read starts at two picks"
    : confidence === "early" ? `Early read: ${primary ? `trending toward ${id.toLowerCase()}` : "no clear plan yet"}.${plan && plan.jobs.some((j) => !j.met) ? ` The plan still needs ${plan.jobs.filter((j) => !j.met).slice(0, 2).map((j) => j.label.toLowerCase()).join(" and ")}.` : ""}`
    : top && top.tier === "critical" ? `${id || "No clear plan"}, but ${short(top)}`
    : open && needed.length ? `${id || "No clear plan"}: the ${open.toLowerCase()} must bring ${needed.slice(0, 2).map((x) => short(x).replace(/^missing /, "")).join(" and ")}`
    : id || "No clear plan";
  return {
    confidence, headline,
    identity: { primary, secondary },
    plan,
    winCondition: primary && n >= T.earlyRead ? winCondition(primary.id, slots, f, secondary?.id ?? null) : null,
    critical: real.filter((x) => x.tier === "critical"),
    weaknesses: real.slice(0, SHOWN),
    more: real.slice(SHOWN),
    accepted,
    needs,
    roleNeeds: roleNeeds(openRoles, needs, champions, taken),
    timing: n >= T.earlyRead ? timing(f) : null,
    open, needed, merged,
    enemyRead: !theirs.length ? "none" : theirs.length >= 5 ? "full" : "partial",
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
