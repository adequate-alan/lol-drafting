// PROTOTYPE five-role cohesion model (diagnostic only, 2026-10-14). Not imported by the site, never scores anything.
// It reads the SAME champion facts as lib/model-v2/analyze.ts (v1 attributes + v2 kit, all unreviewed by alan) so the
// comparison isolates the reasoning, not the kit values. Three ideas the current Comp Check does not have:
//   1. Plan first: each win condition is a list of jobs; a weakness only counts against the plan the comp is playing.
//   2. Jobs belong to slots: one champion cannot engage forward and peel the carry in the same fight.
//   3. Weaknesses interact: a compound read when two gaps make each other worse.
import { slotsOf, type Draft, type Slot } from "../../lib/model-v2/analyze";
import type { ChampionKit } from "../../lib/model-v2/schema";
import type { Role } from "../../lib/schema";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
const nm = (ss: Slot[]) => ss.map((s) => s.c.name).join(", ").replace(/, ([^,]*)$/, " and $1") || "nobody";

// ---------- slot functions ----------
export const fn = {
  starter: (s: Slot) => s.c.fightStart === "primary",
  catcher: (s: Slot) => s.c.fightStart === "catch",
  tank: (s: Slot) => s.c.attrs.frontline >= 2,
  // A bruiser absorbs part of a rotation: melee, some frontline, a real threat. Counts half a frontliner.
  bruiser: (s: Slot) => s.c.attrs.frontline === 1 && s.c.kit.range <= 1 && s.threat >= 2,
  peeler: (s: Slot) => s.c.attrs.peel >= 2 || s.c.kit.disengage >= 2,
  carry: (s: Slot) => s.threat >= 2,
  ranged: (s: Slot) => s.threat >= 2 && s.c.kit.range >= 2,
  diver: (s: Slot) => s.threat >= 2 && s.c.kit.backlineAccess >= 2,
  // Damage that must walk in with no way past a frontline: melee or short range, no access.
  stuck: (s: Slot) => s.threat >= 2 && s.c.kit.range <= 1 && s.c.kit.backlineAccess < 2,
  follow: (s: Slot) => s.c.kit.followUp >= 2,
  turner: (s: Slot) => s.c.kit.counterEngage >= 2,
  siege: (s: Slot) => s.c.kit.structurePressure >= 2 || (s.c.kit.range >= 3 && s.c.attrs.poke >= 2 && s.threat >= 2),
  side: (s: Slot) => s.c.attrs.sidePressure >= 3 && s.threat >= 2,
  hyper: (s: Slot) => s.threat >= 3 && s.c.kit.range >= 2 && (s.c.flags.includes("needs-peel") || (s.c.kit.curve.late >= 3 && s.c.kit.backlineAccess === 0 && s.c.kit.resourceDemand >= 2)),
  early: (s: Slot) => s.c.kit.curve.early >= 3,
  lateOnly: (s: Slot) => s.c.kit.curve.late >= 3 && s.c.kit.curve.early <= 1,
  earlyOnly: (s: Slot) => s.c.kit.curve.early >= 3 && s.c.kit.curve.late <= 1,
};

export interface Req { id: string; label: string; met: boolean; detail: string }
export interface Plan { id: PlanId; label: string; reqs: Req[]; met: number; total: number; fit: number }
export type PlanId = "teamfight" | "dive" | "pick" | "protect" | "siege" | "skirmish" | "split";
const LABEL: Record<PlanId, string> = { teamfight: "Front-to-back", dive: "Dive", pick: "Pick", protect: "Protect the carry", siege: "Siege / poke", skirmish: "Skirmish / tempo", split: "Split (1-3-1 / 1-4)" };

const lane = (slots: Slot[], role: Role) => slots.find((s) => s.role === role);
const prio = (s?: Slot) => (s ? s.c.attrs.lanePressure : 0);

/** Each plan's jobs, checked against the comp. Every check names who does the job. */
export function plans(slots: Slot[]): Plan[] {
  const f = (p: (s: Slot) => boolean) => slots.filter(p);
  const tanks = f(fn.tank), bruisers = f((s) => fn.bruiser(s) && !fn.tank(s));
  const hold = tanks.length + 0.5 * bruisers.length;
  const ranged = f(fn.ranged), divers = f(fn.diver), starters = f(fn.starter), catchers = f(fn.catcher);
  const turnCE = sum(slots.map((s) => s.c.kit.counterEngage));
  const disengage = sum(slots.map((s) => Math.max(s.c.kit.disengage, s.c.kit.counterEngage)));
  const mid = lane(slots, "MID"), jg = lane(slots, "JUNGLE"), bot = lane(slots, "BOT"), sup = lane(slots, "SUPPORT"), top = lane(slots, "TOP");
  const R = (id: string, label: string, met: boolean, detail: string): Req => ({ id, label, met, detail });
  const out: Omit<Plan, "met" | "total" | "fit">[] = [];

  // Front-to-back: someone holds the front, damage comes from behind it, the fight can be begun or accepted, and the
  // follow-up lands from where the carries stand.
  const rangedFollow = f((s) => fn.follow(s) && s.c.kit.range >= 2);
  out.push({ id: "teamfight", label: LABEL.teamfight, reqs: [
    R("hold", "Holds the front", hold >= 1.5, `${nm([...tanks, ...bruisers])} (${hold} frontline)`),
    R("backline-damage", "Damage from behind the front", ranged.length >= 2, `${nm(ranged)} deal damage from range`),
    R("begin", "Can begin or accept a 5v5", starters.length >= 1 || turnCE >= 5, starters.length ? `${nm(starters)} start` : `counter-engage ${turnCE}`),
    R("follow-range", "Follow-up from the backline", rangedFollow.length >= 1 || sum(slots.map((s) => s.c.kit.aoeCc)) >= 9, `${nm(rangedFollow)} follow up from range`),
  ] });

  // Dive: a starter who reaches the backline, two damage sources that also reach it, all arriving in the same window.
  const reachStart = f((s) => (fn.starter(s) || fn.catcher(s)) && s.c.kit.backlineAccess >= 2);
  const diveWindow = mean(divers.map((s) => s.c.kit.curve.early + s.c.kit.curve.mid)) >= 5;
  out.push({ id: "dive", label: LABEL.dive, reqs: [
    R("reach-start", "A start that reaches the backline", reachStart.length >= 1, nm(reachStart)),
    R("reach-damage", "Two damage sources that reach it", divers.filter((s) => !reachStart.includes(s) || divers.length >= 3).length >= 2, nm(divers)),
    R("together", "Three bodies arrive together", f((s) => s.c.kit.backlineAccess >= 2).length >= 3, nm(f((s) => s.c.kit.backlineAccess >= 2))),
    R("survive", "Divers survive the first rotation", hold >= 1 || f((s) => s.c.kit.selfPeel >= 2 && fn.diver(s)).length >= 2, `${hold} frontline`),
    R("window", "Divers peak at the same time", divers.length >= 2 && diveWindow, "early + mid curve of the divers"),
  ] });

  // Pick: a catch tool, burst that converts it, and someone who moves first (mid or jungle priority).
  const rangedCatch = f((s) => fn.catcher(s) && (s.c.kit.range >= 1 || s.c.kit.backlineAccess >= 2 || !!s.c.kit.global));
  const burst = f((s) => s.threat >= 2 && (s.c.attrs.burst >= 2 || s.c.kit.followUp >= 2));
  out.push({ id: "pick", label: LABEL.pick, reqs: [
    R("catch", "Two catch threats", rangedCatch.length >= 2 || (rangedCatch.length >= 1 && starters.some((s) => s.c.kit.backlineAccess >= 2)), nm(rangedCatch)),
    R("convert", "Burst that converts a catch", burst.length >= 2, nm(burst)),
    R("move-first", "Moves first (mid or jungle priority)", prio(mid) >= 2 || (jg?.c.kit.curve.early ?? 0) >= 3, `mid priority ${prio(mid)}, jungle early ${jg?.c.kit.curve.early ?? 0}`),
  ] });

  // Protect: a carry worth protecting, two protectors who are not also the engage, and a way to punish the dive.
  const hyper = f(fn.hyper)[0] ?? [...slots].filter((s) => s.threat >= 3 && s.c.kit.range >= 2).sort((a, b) => b.c.kit.curve.late - a.c.kit.curve.late)[0];
  const protectors = f((s) => s !== hyper && fn.peeler(s) && !fn.starter(s));
  out.push({ id: "protect", label: hyper ? `Protect ${hyper.c.name}` : LABEL.protect, reqs: [
    R("carry", "A carry worth protecting", !!hyper && (fn.hyper(hyper) || hyper.c.kit.curve.late >= 3), hyper?.c.name ?? "none"),
    R("protectors", "Two protectors who stay back", protectors.length >= 2, nm(protectors)),
    R("punish", "Punishes the dive (counter-engage)", f(fn.turner).filter((s) => s !== hyper).length >= 2, nm(f(fn.turner).filter((s) => s !== hyper))),
    R("front", "Something in front of the carry", hold >= 1, `${hold} frontline`),
  ] });

  // Siege: long-range structure pressure, mid waveclear, tools to stop the engage that answers a siege, priority to start.
  const sieges = f(fn.siege);
  out.push({ id: "siege", label: LABEL.siege, reqs: [
    R("pressure", "Two siege threats", sieges.length >= 2, nm(sieges)),
    R("clear", "Mid clears from range", !!mid && mid.c.kit.waveclear >= 3 && mid.c.kit.range >= 2, mid ? `${mid.c.name}: waveclear ${mid.c.kit.waveclear}, range ${mid.c.kit.range}` : "no mid"),
    R("hold-siege", "Stops the engage that answers a siege", disengage >= 6, `disengage / counter-engage ${disengage}`),
    R("priority", "Priority to start (mid or bot lane)", prio(mid) >= 2 || prio(bot) + prio(sup) >= 4, `mid ${prio(mid)}, bot lane ${prio(bot) + prio(sup)}`),
  ] });

  // Skirmish: jungle and a laner win 2v2s early, lanes give the jungle room, and the lead converts before the curve drops.
  const early2v2 = f((s) => (s.role === "JUNGLE" || s.role === "MID" || s.role === "TOP") && fn.early(s) && s.threat >= 2);
  const lanesWithPrio = [top, mid, bot].filter((s) => prio(s) >= 2).length;
  out.push({ id: "skirmish", label: LABEL.skirmish, reqs: [
    R("jungle", "Jungler wins early fights", !!jg && fn.early(jg) && jg.threat >= 2, jg ? `${jg.c.name} early ${jg.c.kit.curve.early}` : "no jungler"),
    R("partner", "A laner who joins and wins the 2v2", early2v2.filter((s) => s.role !== "JUNGLE").length >= 1, nm(early2v2.filter((s) => s.role !== "JUNGLE"))),
    R("lanes", "Two lanes with priority", lanesWithPrio >= 2, `${lanesWithPrio} of top / mid / bot`),
    R("convert", "Converts before falling off", mean(slots.map((s) => s.c.kit.curve.early + s.c.kit.curve.mid)) >= 5, "team early + mid curve"),
  ] });

  // Split: a side laner who wins alone, a four-man that can stall without them, and a way to punish rotations.
  const siders = f(fn.side);
  const four = slots.filter((s) => !siders.includes(s));
  out.push({ id: "split", label: LABEL.split, reqs: [
    R("side", "A side laner who wins alone", siders.length >= 1, nm(siders)),
    R("stall", "The other four can stall (waveclear + disengage)", sum(four.map((s) => s.c.kit.waveclear)) >= 7 && sum(four.map((s) => Math.max(s.c.kit.disengage, s.c.kit.counterEngage))) >= 4, `${nm(four)}`),
    R("punish", "Punishes rotations (global or catch)", four.some((s) => s.c.kit.global || fn.catcher(s) || fn.starter(s)), nm(four.filter((s) => s.c.kit.global || fn.catcher(s) || fn.starter(s)))),
  ] });

  return out.map((p) => {
    const met = p.reqs.filter((r) => r.met).length;
    return { ...p, met, total: p.reqs.length, fit: met / p.reqs.length };
  }).sort((a, b) => b.fit - a.fit || b.total - a.total);
}

export interface Finding { id: string; severity: "major" | "moderate" | "minor"; label: string; text: string; kind: "plan-gap" | "interaction" | "overlap" | "timing" | "damage" }

/** Compound findings: gaps that make each other worse, jobs held by one slot, plans that pull apart. */
export function interactions(slots: Slot[], plan: Plan, all: Plan[]): Finding[] {
  const out: Finding[] = [];
  const F = (id: string, severity: Finding["severity"], kind: Finding["kind"], label: string, text: string) => out.push({ id, severity, kind, label, text });
  const tanks = slots.filter(fn.tank), bruisers = slots.filter((s) => fn.bruiser(s) && !fn.tank(s));
  const hold = tanks.length + 0.5 * bruisers.length;
  const starters = slots.filter(fn.starter), peelers = slots.filter(fn.peeler), carries = slots.filter(fn.carry);
  const hyper = slots.find(fn.hyper);
  const p = plan.id;

  // 1. Missing jobs of the plan the comp is actually playing (only that plan).
  for (const r of plan.reqs.filter((x) => !x.met))
    F(`gap:${p}:${r.id}`, plan.fit >= 0.75 ? "moderate" : "major", "plan-gap", `${plan.label} without: ${r.label.toLowerCase()}`, r.detail);

  // 2. Job overlap: the only starter is also the only protector, or the only frontliner.
  if (starters.length === 1 && hyper) {
    const s = starters[0];
    const others = peelers.filter((x) => x !== s && x !== hyper);
    if (fn.peeler(s) && others.length === 0)
      F("overlap:start-peel", "major", "overlap", "Engage and peel on one champion", `${s.c.name} is the only engage and the only protection for ${hyper.c.name}; once ${s.c.name} goes in, ${hyper.c.name} is alone.`);
  }
  if (starters.length === 1 && tanks.length === 1 && starters[0] === tanks[0] && bruisers.length === 0 && (p === "teamfight" || p === "protect" || p === "siege"))
    F("overlap:start-front", "moderate", "overlap", "Engage and frontline on one champion", `${tanks[0].c.name} starts the fight and is the only frontline; after the engage nobody holds the front.`);

  // 3. Interacting gaps.
  const stuck = slots.filter(fn.stuck);
  if (hold < 1 && stuck.length >= 2 && p !== "dive")
    F("x:no-front-short", "major", "interaction", "No frontline and short range together", `${nm(stuck)} must walk into the enemy with nobody absorbing the first rotation in front of them.`);
  if (starters.length && carries.length && slots.filter((s) => s !== starters[0] && (fn.diver(s) || (fn.follow(s) && s.c.kit.range >= 1))).length === 0)
    F("x:engage-alone", "major", "interaction", "Engage the damage cannot reach", `${nm(starters)} start fights, but no damage source can reach the target in time or follow up from range.`);
  if (p === "protect" && hyper && slots.filter((s) => s !== hyper && fn.turner(s)).length < 1 && peelers.length >= 2)
    F("x:peel-no-punish", "moderate", "interaction", "Peel without punish", `${nm(peelers.filter((s) => s !== hyper))} keep ${hyper.c.name} alive but nobody turns the dive into a kill; fights stall instead of being won.`);
  if (p === "siege" && slots.reduce((m, s) => Math.max(m, s.c.attrs.lanePressure), 0) < 2)
    F("x:siege-no-prio", "moderate", "interaction", "Siege without lane priority", "The comp wants to start sieges but no lane can push first to start one.");
  if (hyper && hold < 1 && peelers.filter((s) => s !== hyper).length < 2)
    F("x:exposed-carry", "major", "interaction", `${hyper.c.name} exposed`, `${hyper.c.name} needs protection, nobody stands in front and fewer than two teammates peel.`);

  // 4. Timing: picks that peak in different windows.
  const eo = slots.filter(fn.earlyOnly), lo = slots.filter((s) => fn.lateOnly(s) && s.threat >= 3);
  if (eo.length >= 2 && lo.length >= 1)
    F("t:split-windows", "minor", "timing", "Power windows do not overlap", `${nm(eo)} want to end early; ${nm(lo)} need a long game. The comp's best fight is never at one time.`);

  // 5. Damage the plan can deliver: in front-to-back / protect / siege, melee damage with no access does not reach the backline.
  if (p === "teamfight" || p === "protect" || p === "siege") {
    const deliverable = carries.filter((s) => !fn.stuck(s) || fn.tank(s));
    const share = sum(deliverable.map((s) => s.threat)) / Math.max(1, sum(carries.map((s) => s.threat)));
    if (share < 0.5)
      F("d:undeliverable", "moderate", "damage", "Damage does not fit the plan", `Under ${plan.label.toLowerCase()}, ${nm(carries.filter((s) => fn.stuck(s) && !fn.tank(s)))} hit only what walks into them; ${Math.round(share * 100)}% of the damage reaches the enemy backline.`);
  }
  // 6. Bot-lane duo: the support's job has to match what the carry can do with it (pair rules, kit facts only).
  const bot = slots.find((s) => s.role === "BOT"), sup = slots.find((s) => s.role === "SUPPORT");
  if (bot && sup) {
    if (fn.starter(sup) && bot.c.kit.followUp < 2 && bot.c.kit.backlineAccess < 2)
      F("duo:engage-no-follow", "moderate", "interaction", "Support engages, carry cannot follow", `${sup.c.name} starts fights in lane and around dragon, but ${bot.c.name} has no way to join an engage quickly.`);
    if (bot.c.kit.range <= 1 && bot.threat >= 2 && !fn.peeler(sup))
      F("duo:short-no-peel", "moderate", "interaction", "Short-range carry without a protector", `${bot.c.name} has to stand close to fight and ${sup.c.name} does not peel for that.`);
    if (bot.c.attrs.lanePressure + sup.c.attrs.lanePressure <= 2)
      F("duo:no-prio", p === "siege" || p === "skirmish" ? "moderate" : "minor", "interaction", "Bot lane concedes priority", `${bot.c.name} and ${sup.c.name} cannot push first, so dragon setups start late.`);
  }
  // 7. Two plans pulling apart: a strong dive and a strong siege with different champions doing each.
  const dive = all.find((x) => x.id === "dive"), siege = all.find((x) => x.id === "siege");
  if (dive && siege && dive.fit >= 0.6 && siege.fit >= 0.75 && (p === "dive" || p === "siege"))
    F("t:dive-vs-siege", "minor", "timing", "Two plans pull apart", "The comp can both dive and siege; the two want different fights, so the call has to be made before each objective.");
  return out;
}

export interface Cohesion { plan: Plan; second: Plan | null; plans: Plan[]; findings: Finding[]; jobs: Record<string, string[]> }

export function cohesion(draft: Draft, champions: ChampionKit[]): Cohesion {
  const slots = slotsOf(draft, champions);
  const ps = plans(slots);
  const plan = ps[0];
  const second = ps[1] && ps[1].fit >= 0.75 ? ps[1] : null;
  const jobs: Record<string, string[]> = {};
  for (const s of slots) jobs[s.role] = Object.entries(fn).filter(([k, t]) => ["starter", "catcher", "tank", "bruiser", "peeler", "ranged", "diver", "follow", "turner", "siege", "side"].includes(k) && t(s)).map(([k]) => k);
  return { plan, second, plans: ps, findings: interactions(slots, plan, ps), jobs };
}

/** What one pick changes: every plan's fit before / after, findings created and removed. Both directions, never netted. */
export function pickDelta(draft: Draft, role: Role, champion: string, champions: ChampionKit[]) {
  const before = cohesion(draft, champions), after = cohesion({ ...draft, [role]: champion }, champions);
  const fitOf = (c: Cohesion) => new Map(c.plans.map((p) => [p.id, p]));
  const b = fitOf(before), a = fitOf(after);
  const planChanges = [...a.values()].map((p) => ({ id: p.id, label: p.label, before: `${b.get(p.id)!.met}/${p.total}`, after: `${p.met}/${p.total}`, d: p.met - b.get(p.id)!.met,
    gained: p.reqs.filter((r) => r.met && !b.get(p.id)!.reqs.find((x) => x.id === r.id)!.met).map((r) => r.label),
    // A lost job counts only for a plan the comp was on track for (3 of 4 jobs or better before this pick).
    lost: b.get(p.id)!.fit >= 0.75 ? p.reqs.filter((r) => !r.met && b.get(p.id)!.reqs.find((x) => x.id === r.id)!.met).map((r) => r.label) : [] })).filter((x) => x.gained.length || x.lost.length);
  const bIds = new Set(before.findings.map((x) => x.id)), aIds = new Set(after.findings.map((x) => x.id));
  return {
    plan: { before: before.plan.label, after: after.plan.label },
    planChanges,
    creates: after.findings.filter((x) => !bIds.has(x.id) && !x.id.startsWith("gap:")),
    removes: before.findings.filter((x) => !aIds.has(x.id) && !x.id.startsWith("gap:")),
  };
}
