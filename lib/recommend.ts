// Draft-fit recommendations: every champion who plays an open role is scored against the whole draft.
//
//   saved     - alan's saved pairings (clashDefault / alternatives / surrounding on the pairing records). A strong
//               synergy bonus, not a filter, with one exception: with a bot locked, only that bot's saved supports
//               (default or alternative) are recommended for SUPPORT (savedSupports). Others are theoretical only.
//   proposed  - Claude's kit-based partners (data/proposed-synergy.json, lib/proposed.ts): a small bonus, always below
//               the matching saved link, never a filter and never part of savedSupports. Labelled "Proposed".
//   synergy   - pairwise interactions with the locked allies (lane duos, engage + follow-up, poke stacking).
//   need      - what the composition lacks, from the comp-analysis engine (lib/model-v2/analyze.ts): the open role's
//               needs, each "Fixes …" part weighted by the need's priority and by how late in the draft it is. A
//               champion without a kit (Locke) falls back to the v1 team needs below.
//   matchup   - how the champion plays into the enemy picks, from champion attributes (no lane-matchup data).
//   risk      - penalties: triggering a new warning, or leaving more holes than there are picks left.
//
// Observed pro evidence is never scored here. It is shown next to a recommendation, never as a reason to rank it.
import { RULES, warnings, type Draft } from "./evaluate";
import { analyze, readCandidate, type RoleNeed } from "./model-v2/analyze";
import { convertKits } from "./model-v2/kits";
import type { ChampionKit } from "./model-v2/schema";
import { proposedLink } from "./proposed";
import { ROLES, type BotPairing, type Champion, type MidJunglePairing, type ProDraft, type ProposedRecord, type Role, type TopPick } from "./schema";

export interface RecommendData {
  champions: Champion[];
  botPairings: BotPairing[];
  midJungle: MidJunglePairing[];
  topPicks: TopPick[];
  proDrafts: ProDraft[];
  proposed?: ProposedRecord[];
}

export type FitKind = "saved" | "proposed" | "synergy" | "need" | "matchup" | "risk";
export interface FitPart { kind: FitKind; points: number; text: string }
export interface Recommendation {
  champion: string;
  role: Role;
  score: number;
  parts: FitPart[];
  saved: "default" | "alt" | "fits" | null;
  proposed: "preferred" | "alt" | null; // Claude's kit-based proposal with a locked ally, when nothing is saved for that pair
  proGames: number; // recorded pro drafts that pair this champion with a locked ally in the same roles (not scored)
  fixes: string[]; // the open role's needs this pick covers (comp-analysis engine)
  also: string[]; // lower-priority team needs it covers as well
  tradeoffs: string[]; // what it costs the comp
  bestFix: boolean; // covers the most of the role's needs among the eligible candidates (shown apart from best overall)
}
export type Recommendations = Partial<Record<Role, Recommendation[]>>;

const damageWeight = (c: Champion) => Math.max(c.attrs.sustainedDps, c.attrs.burst, c.attrs.poke);
const list = (cs: Champion[]) => cs.map((c) => c.name).join(", ").replace(/, ([^,]*)$/, " and $1");
const round = (n: number) => Math.round(n * 100) / 100;

// ---------- team needs ----------

export type NeedId = "engage" | "setup" | "frontline" | "peel" | "dps" | "magic" | "physical";
// personal: the need comes from one locked champion (Ziggs needs setup, Jinx needs peel), so it matters from the first pick.
export interface Need { id: NeedId; label: string; text: string; fills: (c: Champion) => boolean; weight: number; personal?: boolean }

function physicalShare(picks: Champion[]): number | null {
  let physical = 0, magic = 0;
  for (const c of picks) {
    const w = damageWeight(c);
    if (c.damage === "AD") physical += w; else if (c.damage === "AP") magic += w; else { physical += w / 2; magic += w / 2; }
  }
  return physical + magic ? physical / (physical + magic) : null;
}

/** What the composition is still missing. Needs that depend on a pick (peel, a fight starter) appear once it is locked. */
export function teamNeeds(picks: Champion[]): Need[] {
  const needs: Need[] = [];
  const best = (f: (c: Champion) => number) => Math.max(0, ...picks.map(f));
  const setup = picks.filter((c) => c.flags.includes("needs-setup"));
  const starters = picks.filter((c) => !c.flags.includes("needs-setup") && c.attrs.engage >= 2);
  if (setup.length && !starters.length) {
    needs.push({ id: "setup", label: "fight starter", weight: 2.5, personal: true, text: `${list(setup)} needs someone else to start fights`,
      fills: (c) => c.attrs.engage >= 2 && !c.flags.includes("needs-setup") });
  } else if (best((c) => c.attrs.engage) < 2) {
    needs.push({ id: "engage", label: "engage", weight: 2, text: "no reliable engage yet", fills: (c) => c.attrs.engage >= 2 });
  }
  if (best((c) => c.attrs.frontline) < 2) needs.push({ id: "frontline", label: "frontline", weight: 2, text: "no frontline yet", fills: (c) => c.attrs.frontline >= 2 });
  for (const carry of picks.filter((c) => c.flags.includes("needs-peel"))) {
    const peel = picks.filter((c) => c !== carry).reduce((s, c) => s + c.attrs.peel, 0);
    if (peel < 3) {
      needs.push({ id: "peel", label: "peel", weight: 2, personal: true, text: `${carry.name} needs protection (team peel ${peel})`,
        fills: (c) => c.attrs.peel >= 2 || c.flags.includes("disengage") });
      break;
    }
  }
  if (best((c) => c.attrs.sustainedDps) < 2) needs.push({ id: "dps", label: "sustained damage", weight: 1.5, text: "nobody deals sustained damage yet", fills: (c) => c.attrs.sustainedDps >= 2 });
  const share = picks.length >= 2 ? physicalShare(picks) : null;
  if (share !== null && share >= 0.75) needs.push({ id: "magic", label: "magic damage", weight: 1.5, text: `${Math.round(share * 100)}% of the damage is physical`, fills: (c) => c.damage !== "AD" && damageWeight(c) >= 2 });
  if (share !== null && share <= 0.25) needs.push({ id: "physical", label: "physical damage", weight: 1.5, text: `${Math.round((1 - share) * 100)}% of the damage is magic`, fills: (c) => c.damage !== "AP" && damageWeight(c) >= 2 });
  return needs;
}

// Warnings the need list does not already cover; adding or clearing one moves the score.
const NEED_WARNINGS = new Set(["no-engage", "needs-fight-starter", "no-frontline", "insufficient-peel", "no-sustained-dps", "too-much-ad", "too-much-ap"]);
const OTHER_WARNINGS = RULES.filter((r) => !NEED_WARNINGS.has(r.id)).map((r) => r.id);

// ---------- saved pairings (alan's records) ----------

/**
 * The supports a locked bot may be recommended with: its saved default and alternatives. null when no bot is locked
 * or the bot has no saved supports (then every support is a candidate). Every actionable support surface uses this;
 * anything outside it is a theoretical fix, never a recommendation (alan, 2026-10-10: Ziggs → Nautilus / Leona only).
 */
export function savedSupports(draft: Draft, botPairings: BotPairing[]): string[] | null {
  const rec = draft.BOT ? botPairings.find((b) => b.champion === draft.BOT) : undefined;
  const ids = rec ? [...rec.clashDefault, ...rec.alternatives] : [];
  return ids.length ? ids : null;
}

function savedParts(c: Champion, role: Role, draft: Draft, data: RecommendData, name: (id: string) => string): { parts: FitPart[]; tier: Recommendation["saved"] } {
  const parts: FitPart[] = [];
  let tier: Recommendation["saved"] = null;
  const better = (t: NonNullable<Recommendation["saved"]>) => {
    const rank = { default: 0, alt: 1, fits: 2 } as const;
    if (!tier || rank[t] < rank[tier]) tier = t;
  };
  const botRecord = (id: string) => data.botPairings.find((b) => b.champion === id);
  for (const r of ROLES) {
    const ally = draft[r];
    if (!ally) continue;
    if (r === "BOT" && role === "SUPPORT") {
      const rec = botRecord(ally);
      if (rec?.clashDefault.includes(c.id)) { parts.push({ kind: "saved", points: 5, text: `Saved pairing: preferred support for ${name(ally)}` }); better("default"); }
      else if (rec?.alternatives.includes(c.id)) { parts.push({ kind: "saved", points: 2.5, text: `Saved pairing: alternative support for ${name(ally)}${rec.alternativeNotes[c.id] ? ` (${rec.alternativeNotes[c.id]})` : ""}` }); better("alt"); }
    }
    if (r === "SUPPORT" && role === "BOT") {
      const rec = botRecord(c.id);
      if (rec?.clashDefault.includes(ally)) { parts.push({ kind: "saved", points: 5, text: `Saved pairing: ${name(ally)} is its preferred support` }); better("default"); }
      else if (rec?.alternatives.includes(ally)) { parts.push({ kind: "saved", points: 2.5, text: `Saved pairing: ${name(ally)} is an alternative support for it${rec.alternativeNotes[ally] ? ` (${rec.alternativeNotes[ally]})` : ""}` }); better("alt"); }
    }
    if (r === "BOT" && (role === "JUNGLE" || role === "MID")) {
      const rec = botRecord(ally);
      if (rec?.surrounding[role === "JUNGLE" ? "jungle" : "mid"].includes(c.id)) { parts.push({ kind: "saved", points: 1.5, text: `Saved comp: fits around ${name(ally)}` }); better("fits"); }
    }
    if ((r === "MID" && role === "JUNGLE") || (r === "JUNGLE" && role === "MID")) {
      const rec = data.midJungle.find((m) => m.anchor === ally && m.role === r);
      if (rec?.clashDefault.includes(c.id)) { parts.push({ kind: "saved", points: 4, text: `Saved pairing: primary ${role.toLowerCase()} for ${name(ally)}` }); better("default"); }
      else if (rec?.alternatives.includes(c.id)) { parts.push({ kind: "saved", points: 1.5, text: `Saved pairing: secondary ${role.toLowerCase()} for ${name(ally)}${rec.alternativeNotes[c.id] ? ` (${rec.alternativeNotes[c.id]})` : ""}` }); better("alt"); }
    }
    if (r === "TOP" && (role === "JUNGLE" || role === "MID")) {
      const rec = data.topPicks.find((t) => t.champion === ally);
      if (rec?.surrounding[role === "JUNGLE" ? "jungle" : "mid"].includes(c.id)) { parts.push({ kind: "saved", points: 1.5, text: `Saved comp: fits around ${name(ally)}` }); better("fits"); }
    }
    // Bot-lane shapes on mid / jungle / top records, only for pairs the bot's own record lists.
    if ((role === "BOT" || role === "SUPPORT") && (r === "MID" || r === "JUNGLE" || r === "TOP")) {
      const shapes = r === "TOP" ? data.topPicks.find((t) => t.champion === ally)?.surrounding.botShapes : data.midJungle.find((m) => m.anchor === ally && m.role === r)?.botShapes;
      for (const d of shapes ?? []) {
        const rec = botRecord(d.bot);
        if (!rec || ![...rec.clashDefault, ...rec.alternatives].includes(d.support)) continue;
        if (role === "BOT" ? d.bot !== c.id || (draft.SUPPORT && draft.SUPPORT !== d.support) : d.support !== c.id || (draft.BOT && draft.BOT !== d.bot)) continue;
        parts.push({ kind: "saved", points: 1, text: `Saved comp: ${name(d.bot)} + ${name(d.support)} bot lane for ${name(ally)}` });
        better("fits");
        break;
      }
    }
  }
  return { parts, tier };
}

// ---------- proposed synergy (Claude's kit-based partners, not saved by alan) ----------

// Always below the matching saved link (saved preferred 4–5, saved alternative 1.5–2.5).
const PROPOSED_POINTS = { preferred: 1.25, alt: 0.5 } as const;
const PROVISIONAL = 0.6;

export function proposedParts(c: Champion, role: Role, draft: Draft, records: ProposedRecord[] | undefined, name: (id: string) => string): { parts: FitPart[]; tier: Recommendation["proposed"] } {
  const parts: FitPart[] = [];
  let tier: Recommendation["proposed"] = null;
  if (!records?.length) return { parts, tier };
  for (const r of ROLES) {
    const ally = draft[r];
    if (!ally || r === role) continue;
    const l = proposedLink(records, c.id, role, ally, r);
    if (!l) continue;
    const points = round(PROPOSED_POINTS[l.tier] * (l.confidence === "provisional" ? PROVISIONAL : 1));
    parts.push({ kind: "proposed", points, text: `Proposed ${l.tier === "preferred" ? "partner" : "alternative"} for ${name(ally)} (kit-based, not saved): ${l.reason}` });
    if (!tier || l.tier === "preferred") tier = l.tier;
  }
  return { parts, tier };
}

// ---------- pairwise synergy with allies ----------

const DUOS: [Role, Role, string][] = [
  ["BOT", "SUPPORT", "Strong 2v2 lane pressure"],
  ["JUNGLE", "MID", "Early skirmish pressure"],
  ["TOP", "JUNGLE", "Early pressure in the top half"],
];

export function synergyParts(c: Champion, role: Role, allies: { role: Role; champ: Champion }[]): FitPart[] {
  const parts: FitPart[] = [];
  for (const [a, b, what] of DUOS) {
    const partnerRole = role === a ? b : role === b ? a : null;
    const p = partnerRole && allies.find((x) => x.role === partnerRole)?.champ;
    if (!p) continue;
    if (c.attrs.lanePressure >= 2 && p.attrs.lanePressure >= 2) parts.push({ kind: "synergy", points: 1, text: `${what} with ${p.name}` });
    if (a === "BOT") {
      const [carry, sup] = role === "BOT" ? [c, p] : [p, c];
      if (carry.attrs.scaling >= 3 && sup.attrs.peel >= 2) parts.push({ kind: "synergy", points: 0.75, text: `${sup.name} keeps ${carry.name} safe until ${carry.name} scales` });
    }
  }
  // Engage + follow-up: the strongest single interaction only.
  const engager = c.attrs.engage >= 3 ? c : null;
  if (engager) {
    const follow = allies.map((x) => x.champ).filter((x) => x.attrs.burst >= 3 || x.attrs.sustainedDps >= 3);
    if (follow.length) parts.push({ kind: "synergy", points: 1, text: `${c.name}'s engage gives ${list(follow.slice(0, 2))} a target to follow up on` });
  } else if (c.attrs.burst >= 3 || c.attrs.sustainedDps >= 3) {
    const eng = allies.map((x) => x.champ).filter((x) => x.attrs.engage >= 3);
    if (eng.length) parts.push({ kind: "synergy", points: 1, text: `Follows up on ${list(eng.slice(0, 2))}'s engage` });
  }
  const pokers = allies.map((x) => x.champ).filter((x) => x.attrs.poke >= 2);
  if (c.attrs.poke >= 2 && pokers.length >= 2) parts.push({ kind: "synergy", points: 1, text: `Joins the poke plan with ${list(pokers)}` });
  return parts;
}

// ---------- matchup against the enemy picks ----------

function matchupParts(c: Champion, enemy: Champion[]): FitPart[] {
  if (!enemy.length) return [];
  const parts: FitPart[] = [];
  const engagers = enemy.filter((e) => e.attrs.engage >= 3);
  if (engagers.length && (c.attrs.peel >= 2 || c.flags.includes("disengage"))) parts.push({ kind: "matchup", points: 1.25, text: `Peel or disengage against ${list(engagers)}'s engage` });
  const carries = enemy.filter((e) => e.flags.includes("needs-peel"));
  if (carries.length && c.attrs.engage >= 2 && (c.attrs.burst >= 2 || c.attrs.engage >= 3)) parts.push({ kind: "matchup", points: 1.25, text: `Can dive ${list(carries)}, who needs peel` });
  const pokers = enemy.filter((e) => e.attrs.poke >= 2);
  if (pokers.reduce((s, e) => s + e.attrs.poke, 0) >= 5 && c.attrs.engage >= 3) parts.push({ kind: "matchup", points: 1, text: `Hard engage punishes the ${list(pokers)} poke` });
  const tanks = enemy.filter((e) => e.attrs.frontline >= 2);
  if (enemy.reduce((s, e) => s + e.attrs.frontline, 0) >= 5 && c.attrs.sustainedDps >= 3) parts.push({ kind: "matchup", points: 1, text: `Sustained damage to burn through ${list(tanks)}` });
  if (enemy.length >= 3 && Math.max(...enemy.map((e) => e.attrs.frontline)) <= 1 && c.attrs.burst >= 3) parts.push({ kind: "matchup", points: 1, text: "Burst into an enemy team with no frontline" });
  const scalers = enemy.filter((e) => e.attrs.scaling >= 3);
  if (scalers.length >= 2 && c.attrs.lanePressure >= 3) parts.push({ kind: "matchup", points: 0.75, text: `Early pressure before ${list(scalers)} scale` });
  const setup = enemy.filter((e) => e.flags.includes("needs-setup"));
  if (setup.length && c.flags.includes("disengage")) parts.push({ kind: "matchup", points: 0.75, text: `Disengage blunts ${list(setup)}'s setup` });
  return parts;
}

// ---------- scoring ----------

// Kits are rebuilt only when the champion list changes (once per page in practice).
const kitCache = new WeakMap<Champion[], ChampionKit[]>();
const kitsFor = (champions: Champion[]) => {
  let k = kitCache.get(champions);
  if (!k) kitCache.set(champions, (k = convertKits(champions)));
  return k;
};
// Engine need priority (about 3 for a baseline job, 6–7 for a major weakness) to points on the v1 scale.
const NEED_POINTS = 0.5;

export function recommend(draft: Draft, enemyIds: string[], data: RecommendData, limit = 5): Recommendations {
  const byId = new Map(data.champions.map((c) => [c.id, c]));
  const name = (id: string) => byId.get(id)?.name ?? id;
  const allies = ROLES.flatMap((r) => (draft[r] && byId.has(draft[r]!) ? [{ role: r, champ: byId.get(draft[r]!)! }] : []));
  const enemy = enemyIds.map((id) => byId.get(id)).filter((c): c is Champion => !!c);
  const open = ROLES.filter((r) => !draft[r]);
  if (!allies.length && !enemy.length) return Object.fromEntries(open.map((r) => [r, []]));
  const taken = new Set([...allies.map((a) => a.champ.id), ...enemy.map((e) => e.id)]);
  const picks = allies.map((a) => a.champ);
  const needs = teamNeeds(picks);
  // A missing job matters more the fewer picks are left: nothing with one pick locked, full weight by the fourth.
  // Needs tied to a locked champion (setup, peel) count from the first pick.
  const urgency = (n: Need) => Math.max(0.5 * (picks.length - 1), n.personal ? 1 : 0);
  const before = new Set(warnings(draft, data.champions).map((w) => w.id));
  const eligibleSupports = savedSupports(draft, data.botPairings);
  const kits = kitsFor(data.champions);
  const kitById = new Map(kits.map((k) => [k.id, k]));
  const analysis = analyze(draft, kits, enemyIds);
  // Engine needs tied to a locked champion count from the first pick, like v1's personal needs: protecting a carry, or a
  // fight starter for a champion who cannot start fights.
  const setupLocked = allies.some((a) => (kitById.get(a.champ.id)?.kit.setupDependency ?? 0) >= 2);
  const engineUrgency = (n: RoleNeed) => Math.max(0.5 * (picks.length - 1), n.id === "peel" || (setupLocked && (n.id === "engage" || n.id === "fight-start")) ? 1 : 0);

  const out: Recommendations = {};
  for (const role of open) {
    const recs: Recommendation[] = [];
    const fixScore = new Map<string, number>();
    for (const c of data.champions) {
      // Roster-only champions have no attributes to score, so they are never suggested (they can still be locked).
      if (c.rosterOnly || !c.roles.includes(role) || taken.has(c.id)) continue;
      if (role === "SUPPORT" && eligibleSupports && !eligibleSupports.includes(c.id)) continue;
      const { parts, tier } = savedParts(c, role, draft, data, name);
      const prop = proposedParts(c, role, draft, data.proposed, name);
      parts.push(...prop.parts);
      parts.push(...synergyParts(c, role, allies));
      const kit = kitById.get(c.id);
      let read = { fixes: [] as string[], also: [] as string[], tradeoffs: [] as string[], fixScore: 0 };
      if (kit) {
        const roleNeeds = analysis.roleNeeds[role] ?? [];
        const r = readCandidate(kit, role, draft, kits, roleNeeds, enemyIds);
        const shown = new Set(roleNeeds.map((n) => n.id));
        const extra = readCandidate(kit, role, draft, kits, analysis.needs.filter((n) => !shown.has(n.id)), enemyIds).fixes;
        // One weakness scores once, even when the pick covers two of the jobs it asks for (frontline and engage for
        // "No frontline" count separately; "follow-up" and "backline access" for one tension do not).
        const byCause = new Map<string, RoleNeed[]>();
        for (const n of r.fixes) if (engineUrgency(n) > 0) byCause.set(n.because, [...(byCause.get(n.because) ?? []), n]);
        for (const [because, ns] of byCause) {
          const top = ns.reduce((a, b) => (b.priority > a.priority ? b : a));
          parts.push({ kind: "need", points: round(top.priority * NEED_POINTS * engineUrgency(top)), text: `Fixes ${ns.map((n) => n.label.toLowerCase()).join(" and ")}: ${because}` });
        }
        for (const t of r.tradeoffs) if (picks.length >= 2) parts.push({ kind: "risk", points: -1, text: `Tradeoff: ${t}` });
        read = { fixes: r.fixes.map((n) => n.label), also: extra.map((n) => n.label), tradeoffs: r.tradeoffs, fixScore: r.fixScore };
      } else {
        for (const n of needs) if (n.fills(c) && urgency(n) > 0) parts.push({ kind: "need", points: round(n.weight * urgency(n)), text: `Adds ${n.label}: ${n.text}` });
      }
      parts.push(...matchupParts(c, enemy));

      const next = { ...draft, [role]: c.id };
      const after = warnings(next, data.champions);
      for (const w of after) if (!before.has(w.id) && OTHER_WARNINGS.includes(w.id)) parts.push({ kind: "risk", points: -1.5, text: `Triggers "${w.label}": ${w.why}` });
      for (const id of before) if (OTHER_WARNINGS.includes(id) && !after.some((w) => w.id === id)) parts.push({ kind: "need", points: 1.5, text: `Clears "${RULES.find((r) => r.id === id)!.label}"` });
      // A strong champion can still be a bad late pick: count the holes left against the picks left to fill them.
      const left = open.length - 1;
      const holes = teamNeeds([...picks, c]).filter((n) => n.id !== "dps" || picks.length >= 2);
      if (picks.length + 1 >= 3 && holes.length > left) {
        parts.push({ kind: "risk", points: -2.5 * (holes.length - left), text: `Leaves ${holes.map((h) => h.label).join(", ")} unsolved with ${left === 0 ? "no picks" : left === 1 ? "one pick" : `${left} picks`} left` });
      }
      const score = round(parts.reduce((s, p) => s + p.points, 0));
      if (!parts.length) continue;
      recs.push({ champion: c.id, role, score, parts: parts.sort((a, b) => b.points - a.points), saved: tier, proposed: prop.tier, proGames: proGames(c.id, role, draft, data.proDrafts),
        fixes: read.fixes, also: read.also, tradeoffs: read.tradeoffs, bestFix: false });
      fixScore.set(c.id, read.fixScore);
    }
    // Best fix: most of the role's needs covered (fewest tradeoffs on a tie), among the same eligible candidates.
    const fs = (r: Recommendation) => fixScore.get(r.champion) ?? 0;
    const fix = recs.filter((r) => fs(r) > 0).sort((a, b) => fs(b) - fs(a) || a.tradeoffs.length - b.tradeoffs.length || b.score - a.score)[0];
    if (fix) fix.bestFix = true;
    // On a tied score, alan's saved tier decides (preferred before alternative before fits), then a proposed partner,
    // then the name.
    const tierRank = (r: Recommendation) => (r.saved ? { default: 0, alt: 1, fits: 2 }[r.saved] : r.proposed ? { preferred: 3, alt: 4 }[r.proposed] : 5);
    out[role] = recs.sort((a, b) => b.score - a.score || tierRank(a) - tierRank(b) || a.champion.localeCompare(b.champion)).slice(0, limit);
  }
  return out;
}

function proGames(champion: string, role: Role, draft: Draft, proDrafts: ProDraft[]): number {
  const lockedRoles = ROLES.filter((r) => draft[r]);
  return proDrafts.filter((d) => d.picks[role] === champion && lockedRoles.some((r) => d.picks[r] === draft[r])).length;
}

// ---------- win conditions ----------

export interface WinCondition { id: string; title: string; text: string }

/** How the locked composition wants to play, read from champion attributes. Strongest plan first. */
export function winConditions(picks: Champion[]): WinCondition[] {
  if (picks.length < 2) return [];
  const out: (WinCondition & { weight: number })[] = [];
  const top = (f: (c: Champion) => number, min: number) => picks.filter((c) => f(c) >= min);
  const sum = (f: (c: Champion) => number) => picks.reduce((s, c) => s + f(c), 0);
  const engage = top((c) => c.attrs.engage, 3);
  const follow = picks.filter((c) => !engage.includes(c) && (c.attrs.burst >= 2 || c.attrs.sustainedDps >= 3));
  if (engage.length && follow.length) out.push({ id: "teamfight", weight: 3 + engage.length, title: "Engage teamfight",
    text: `${list(engage)} starts the fight and ${list(follow)} follow${follow.length === 1 ? "s" : ""} up. Group, take vision around dragon and Baron, and force 5v5s when the engage is up.` });
  const carries = top((c) => (c.flags.includes("needs-peel") ? 1 : 0), 1);
  const peelers = picks.filter((c) => !carries.includes(c) && (c.attrs.peel >= 2 || c.flags.includes("disengage")));
  if (carries.length && peelers.length) out.push({ id: "protect", weight: 2 + peelers.length, title: "Protect the carry",
    text: `Play front-to-back around ${list(carries)}; ${list(peelers)} stay${peelers.length === 1 ? "s" : ""} close and peel instead of diving.` });
  const pokers = top((c) => c.attrs.poke, 2);
  if (sum((c) => c.attrs.poke) >= 6 && pokers.length >= 2) out.push({ id: "poke", weight: 2 + pokers.length, title: "Poke and siege",
    text: `${list(pokers)} chip enemies down before objectives. Avoid long fights until they are low, and siege towers.` });
  const split = top((c) => c.attrs.sidePressure, 3);
  if (split.length) out.push({ id: "split", weight: 2, title: "Side-lane pressure",
    text: `${list(split)} hold${split.length === 1 ? "s" : ""} a side lane while the other four play around the next objective.` });
  if (sum((c) => c.attrs.lanePressure) / picks.length >= 2.4) out.push({ id: "tempo", weight: 2, title: "Early tempo",
    text: "Strong lanes: win early trades, take plates and the first dragons, and end before the enemy scales." });
  else if (sum((c) => c.attrs.scaling) / picks.length >= 2.6) out.push({ id: "scale", weight: 1.5, title: "Scale into late game",
    text: "Survive lane, trade objectives instead of contesting, and fight once items come online." });
  return out.sort((a, b) => b.weight - a.weight).map(({ weight: _w, ...w }) => w);
}
