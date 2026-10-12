// Weekly Comp Library discovery (alan, 2026-10-12). Reads the five-champion lineups recorded in the daily pro dataset
// (data/pro-games.json, tracked tournaments only), compares each with the Comp Library and decides, by fixed rules,
// whether it is an existing composition, a variation of one, or a new composition. Deterministic and idempotent: no
// model calls, no network, no clock (the run date is passed in), and the same inputs plus the previous output give
// the same output. scripts/discover-comps.ts runs it from .github/workflows/discover-comps.yml.
//
// Layers: the lineups and their games are Observed Pro Evidence. Everything said about them (identity, win condition,
// jobs, strengths, weak points, difficulty) is the comp-analysis engine's read (lib/model-v2/analyze.ts), i.e. General
// Draft Logic, and is labelled that way on the page. Saved synergy, pool tiers and proposed synergy are never read or
// written here. Win/loss is shown, never used to decide anything.
import { analyze, IDENTITY_LABEL, names, slotsOf, type IdentityId, type Slot } from "./model-v2/analyze";
import type { ChampionKit } from "./model-v2/schema";
import { ROLES, type CompShell, type ProDraft, type ProGame, type Role } from "./schema";

export type Picks = Record<Role, string>;
export type Side = "blue" | "red";
export interface LineupRef { game: number; side: Side }

/** One team's lineup in one recorded game, with the evidence the library shows for it. */
export interface Observation extends LineupRef {
  event: string; tournament: string; patch: string; date: string; stage?: string;
  team: string; opponent: string; won: boolean; url: string; series: string; gameNo: number;
  picks: Picks;
}

// Every threshold the discovery uses, in one place for review.
export const DISCOVERY = {
  // Same composition: same primary identity and at least this many champions in the same roles, or the same
  // primary + secondary identity and at least this many roles doing the same job with a few champions in common
  // (sameJobsShared: one engage jungler for another is a variation; five new champions are a different comp).
  variation: { sharedChampions: 3, sameJobs: 4, sameJobsShared: 2 },
  // A lineup the engine cannot read (a champion without a kit) can still sit under a comp it matches this closely.
  unreadShared: 4,
  // Repeated, independent evidence: at least this many games from at least this many different teams. A single game
  // still qualifies when no library comp has its primary identity at all (a distinct strategy).
  repeated: { games: 2, teams: 2 },
  // Team totals that add the descriptive tags "Counter-engage" and "Objective control" (engine facts, 0–3 scales).
  counterEngage: 8,
  objective: 11,
} as const;

// Identity pairs whose win conditions pull against each other: the read is ambiguous, so they go to the report.
const CLASHING: [IdentityId, IdentityId][] = [["poke", "dive"], ["protect", "split"], ["tempo", "scaling"]];
const clashes = (a: IdentityId, b: IdentityId | null) => !!b && CLASHING.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

const SHORT: Record<IdentityId, string> = {
  "front-to-back": "Front-to-back", dive: "Dive", pick: "Pick", poke: "Poke / siege", protect: "Protect", skirmish: "Skirmish",
  wombo: "Wombo", split: "Split", tempo: "Early tempo", scaling: "Scaling",
};

const TAG: Record<IdentityId, string> = {
  "front-to-back": "front-to-back", dive: "dive", pick: "pick-catch", poke: "poke-siege", protect: "protect-the-carry", skirmish: "skirmish",
  wombo: "wombo", split: "split-pressure", tempo: "early-tempo", scaling: "scaling",
};

export const lineupKey = (p: Picks) => ROLES.map((r) => p[r]).join("|");
export const refKey = (r: LineupRef) => `${r.game}-${r.side}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Every lineup in the given events, oldest first (date, then game id, blue before red), so earlier groups stay put. */
export function observationsFrom(games: ProGame[], events: Iterable<string>): Observation[] {
  const ok = new Set(events);
  return games.filter((g) => ok.has(g.event)).flatMap((g) => (["blue", "red"] as const).map((side): Observation => {
    const them = side === "blue" ? "red" : "blue";
    return {
      game: g.id, side, event: g.event, tournament: g.tournament, patch: g.patch, date: g.date, stage: g.stage,
      team: g[side].team, opponent: g[them].team, won: g.winner === side, url: g.url, series: g.series, gameNo: g.game, picks: g[side].picks,
    };
  })).sort((a, b) => a.date.localeCompare(b.date) || a.game - b.game || (a.side === b.side ? 0 : a.side === "blue" ? -1 : 1));
}

// ---------- the engine's read of one lineup ----------

export type JobClass = "engage" | "catch" | "diver" | "ranged-carry" | "melee-carry" | "peel" | "frontline" | "utility";
export interface Weak { label: string; severity: "major" | "moderate" | "minor" }
export type Difficulty = "easy" | "medium" | "hard";

export interface CompRead {
  primary: IdentityId; secondary: IdentityId | null; tags: string[];
  winCondition: string; why: string; timing: string;
  jobs: Picks; classes: Record<Role, JobClass>;
  strengths: string[]; weaknesses: Weak[]; difficulty: Difficulty; mainCarry: string;
}
export type ReadResult = { ok: true; read: CompRead } | { ok: false; reason: string };

function classOf(s: Slot): JobClass {
  const c = s.c, k = c.kit;
  if (c.fightStart === "primary") return "engage";
  if (c.fightStart === "catch") return "catch";
  if (s.threat >= 2) return k.backlineAccess >= 2 ? "diver" : k.range >= 2 ? "ranged-carry" : "melee-carry";
  if (c.attrs.peel >= 2 || k.disengage >= 2) return "peel";
  if (c.attrs.frontline >= 2) return "frontline";
  return "utility";
}

// Short job labels (16 characters or fewer, like the hand-written ones) from the champion's kit in that role.
function jobOf(s: Slot, main: Slot | undefined): string {
  const c = s.c, k = c.kit;
  if (c.fightStart === "primary") return s.threat >= 2 ? "Engage + damage" : c.attrs.frontline >= 2 ? "Hard engage" : "Engage";
  if (c.fightStart === "catch") return s.threat >= 2 ? "Catch + damage" : "Catch";
  if (s === main && s.threat >= 3) return k.range >= 2 ? "Main carry" : "Main threat";
  if (s.threat >= 2) {
    if (k.backlineAccess >= 2) return "Backline dive";
    if (c.attrs.sidePressure >= 3) return "Side-lane carry";
    if (k.aoeCc >= 2) return "AoE damage";
    if (c.attrs.poke >= 2 && k.range >= 2) return "Poke";
    if (k.range >= 2) return c.attrs.sustainedDps >= 2 ? "Ranged DPS" : "Ranged burst";
    return "Melee damage";
  }
  if (c.attrs.peel >= 2 || k.disengage >= 2) return c.attrs.frontline >= 2 ? "Frontline + peel" : "Peel";
  if (c.attrs.frontline >= 2) return "Frontline";
  if (k.followUp >= 2) return "Follow-up";
  return "Utility";
}

/** The engine's read of a full lineup, or why it cannot be read reliably. */
export function readLineup(picks: Picks, kits: ChampionKit[], nameOf: (id: string) => string): ReadResult {
  const have = new Set(kits.map((k) => k.id));
  const missing = ROLES.filter((r) => !have.has(picks[r]));
  if (missing.length) return { ok: false, reason: `${missing.map((r) => nameOf(picks[r])).join(", ")} ${missing.length > 1 ? "have" : "has"} no reviewed kit, so the comp check cannot read this lineup` };
  const a = analyze(picks, kits);
  const f = a.facts;
  const primary = a.identity.primary?.id;
  if (!primary || !a.winCondition) return { ok: false, reason: "no identity scores high enough for a clear read" };
  const secondary = a.identity.secondary?.id ?? null;
  const all = slotsOf(picks, kits);
  const byRole = new Map(all.map((s) => [s.role, s]));
  // Card tags, as slugs like the hand-written shells' ("front-to-back"); the page turns them into words.
  const tags: string[] = [primary, ...(secondary ? [secondary] : [])].map((i) => TAG[i]);
  if (secondary) tags.push("hybrid");
  if (f.counterEngage >= DISCOVERY.counterEngage) tags.push("counter-engage");
  if (f.objective >= DISCOVERY.objective) tags.push("objective-control");

  const peelers = all.filter((s) => s.c.attrs.peel >= 2 || s.c.kit.disengage >= 2);
  const strengths: string[] = [];
  if (f.primary.length) strengths.push(`Fight start: ${names(f.primary)}`);
  else if (f.catchers.length) strengths.push(`Catch: ${names(f.catchers)}`);
  if (f.frontliners.length >= 2) strengths.push(`Frontline: ${names(f.frontliners)}`);
  if (peelers.length >= 2) strengths.push(`Peel and disengage: ${names(peelers)}`);
  if (f.siege.score >= 1.9 && f.siege.sources.length) strengths.push(`Siege: ${names(f.siege.sources)}`);
  if (f.side.length) strengths.push(`Side lane: ${names(f.side)}`);
  if (f.tankBest >= 3) strengths.push(`Tank damage: ${names(f.carries.filter((s) => s.c.kit.tankDamage >= 3))}`);
  if (f.physicalShare !== null && f.physicalShare >= 0.35 && f.physicalShare <= 0.65) strengths.push(`Mixed damage (${Math.round(f.physicalShare * 100)}% physical)`);
  if (f.curve.early >= 2.4) strengths.push("Strong before first items");
  else if (f.curve.late >= 2.4) strengths.push("Scales into the late game");

  const weak = [...a.weakPoints, ...a.more].filter((w) => w.kind !== "threat").map((w): Weak => ({ label: w.label, severity: w.severity }));
  const hard = f.setup.length + f.ultHeavy.length + (["pick", "wombo", "dive", "split"].includes(primary) ? 1 : 0)
    + (weak.some((w) => w.label === "Too many resource-hungry picks") ? 1 : 0);
  const difficulty: Difficulty = hard <= 1 ? "easy" : hard <= 3 ? "medium" : "hard";
  const because = [a.identity.primary!.because, a.identity.secondary?.because].filter(Boolean).join("; ");
  return {
    ok: true,
    read: {
      primary, secondary, tags, winCondition: a.winCondition, why: `${cap(because)}.`, timing: a.timing?.text ?? "",
      jobs: Object.fromEntries(ROLES.map((r) => [r, jobOf(byRole.get(r)!, f.main)])) as Picks,
      classes: Object.fromEntries(ROLES.map((r) => [r, classOf(byRole.get(r)!)])) as Record<Role, JobClass>,
      strengths: strengths.slice(0, 5), weaknesses: weak, difficulty, mainCarry: f.main?.c.id ?? picks.BOT,
    },
  };
}

// ---------- grouping ----------

export type Match = "exact" | "variation";
interface Anchor { id: string; picks: Picks; read: CompRead | null }

const shared = (a: Picks, b: Picks) => ROLES.filter((r) => a[r] === b[r]).length;
const sameJobs = (a: CompRead, b: CompRead) => ROLES.filter((r) => a.classes[r] === b.classes[r]).length;

/** How a lineup relates to a library comp, or null when it is a different composition. */
export function relation(picks: Picks, read: CompRead | null, anchor: Anchor): Match | null {
  const n = shared(picks, anchor.picks);
  if (n === 5) return "exact";
  if (!read || !anchor.read) return n >= DISCOVERY.unreadShared ? "variation" : null;
  if (read.primary !== anchor.read.primary) return null;
  if (n >= DISCOVERY.variation.sharedChampions) return "variation";
  if (n >= DISCOVERY.variation.sameJobsShared && read.secondary === anchor.read.secondary && sameJobs(read, anchor.read) >= DISCOVERY.variation.sameJobs) return "variation";
  return null;
}

function bestAnchor(picks: Picks, read: CompRead | null, anchors: Anchor[]) {
  let best: { a: Anchor; m: Match; n: number; j: number } | undefined;
  for (const a of anchors) {
    const m = relation(picks, read, a);
    if (!m) continue;
    const n = shared(picks, a.picks), j = read && a.read ? sameJobs(read, a.read) : 0;
    if (!best || n > best.n || (n === best.n && j > best.j)) best = { a, m, n, j };
  }
  return best;
}

// ---------- stored output (data/discovered-comps.json) ----------

export interface DiscoveredComp {
  id: string; // "pro-<game>-<side>" of the first game that showed this lineup
  name: string;
  addedOn: string;
  primary: IdentityId; secondary: IdentityId | null; tags: string[];
  slots: Record<Role, { champion: string; job: string }>;
  winCondition: string; why: string; timing: string;
  strengths: string[]; weaknesses: Weak[]; difficulty: Difficulty;
  games: LineupRef[]; // games with exactly this lineup, first game first
}
export interface ObservedVariation {
  of: string; // a comp-shells.json id or a discovered comp id
  picks: Picks;
  addedOn: string;
  games: LineupRef[];
}
export interface DiscoveredFile {
  lastAddition: string | null; // last run that added a comp or a variation
  comps: DiscoveredComp[];
  variations: ObservedVariation[];
}

export interface Candidate {
  id: string; picks: Picks; read: CompRead | null; reason: string; games: Observation[];
}
export interface DiscoveryResult {
  file: DiscoveredFile;
  candidates: Candidate[]; // groups not added (the Proposed comps report)
  unread: { obs: Observation; reason: string }[]; // lineups the engine cannot read and no comp matches
  kept: { id: string; reason: string }[]; // comps added earlier that would not pass today; kept, never silently removed
  shellReads: Record<string, ReadResult>;
  observations: Observation[];
}

export interface DiscoveryInput {
  games: ProGame[];
  events: string[]; // tracked tournaments (data/pro-games.json `tracked`)
  shells: CompShell[];
  kits: ChampionKit[];
  nameOf: (id: string) => string;
  previous: DiscoveredFile;
  today: string; // YYYY-MM-DD, America/New_York
}

const conceptLabel = (r: Pick<CompRead, "primary" | "secondary">) => `${SHORT[r.primary]}${r.secondary ? ` + ${SHORT[r.secondary]}` : ""}`;
export const shellPicks = (s: CompShell): Picks => Object.fromEntries(ROLES.map((r) => [r, s.slots[r].champion])) as Picks;

export function discover(input: DiscoveryInput): DiscoveryResult {
  const { kits, nameOf, previous, today } = input;
  const observations = observationsFrom(input.games, input.events);
  const reads = new Map<string, ReadResult>();
  const readOf = (p: Picks) => { const k = lineupKey(p); if (!reads.has(k)) reads.set(k, readLineup(p, kits, nameOf)); return reads.get(k)!; };
  const okRead = (p: Picks) => { const r = readOf(p); return r.ok ? r.read : null; };

  const shellReads: Record<string, ReadResult> = {};
  // Templates are general draft logic: observed lineups are never filed under one (they form their own observed comps).
  const anchors: Anchor[] = input.shells.filter((s) => s.kind === "observed").map((s) => ({ id: s.id, picks: shellPicks(s), read: okRead(shellPicks(s)) }));
  for (const s of input.shells) shellReads[s.id] = readOf(shellPicks(s));
  const shellIds = new Set(anchors.map((a) => a.id));

  // Group: every lineup joins the closest library comp (curated first, then groups in the order they were opened),
  // or opens a new group. Lineups the engine cannot read never open a group.
  const groups = new Map<string, { anchor: Anchor; members: { obs: Observation; m: Match }[] }>();
  const unread: DiscoveryResult["unread"] = [];
  for (const obs of observations) {
    const read = okRead(obs.picks);
    const hit = bestAnchor(obs.picks, read, anchors);
    if (hit) {
      if (!groups.has(hit.a.id)) groups.set(hit.a.id, { anchor: hit.a, members: [] });
      groups.get(hit.a.id)!.members.push({ obs, m: hit.m });
      continue;
    }
    const r = readOf(obs.picks);
    if (!r.ok) { unread.push({ obs, reason: r.reason }); continue; }
    const anchor: Anchor = { id: `pro-${obs.game}-${obs.side}`, picks: obs.picks, read: r.read };
    anchors.push(anchor);
    groups.set(anchor.id, { anchor, members: [{ obs, m: "exact" }] });
  }

  // Decide which new groups become library comps, in the order they were opened.
  const prevComps = new Map(previous.comps.map((c) => [c.id, c]));
  const primaries = new Set(input.shells.filter((s) => s.kind === "observed").flatMap((s) => { const r = shellReads[s.id]; return r.ok ? [r.read.primary] : []; }));
  const usedNames = new Set(input.shells.map((s) => s.name.toLowerCase()));
  const comps: DiscoveredComp[] = [];
  const candidates: Candidate[] = [];
  const kept: DiscoveryResult["kept"] = [];
  for (const [id, g] of groups) {
    if (shellIds.has(id)) continue;
    const read = g.anchor.read!;
    const games = g.members.map((x) => x.obs);
    const teams = new Set(games.map((o) => o.team));
    const why: string[] = [];
    const major = read.weaknesses.filter((w) => w.severity === "major");
    if (major.length) why.push(`major weak point (${major.map((w) => w.label).join(", ")})`);
    if (clashes(read.primary, read.secondary)) why.push(`${conceptLabel(read).toLowerCase()} pull in different directions, so the win condition is ambiguous`);
    const repeated = games.length >= DISCOVERY.repeated.games && teams.size >= DISCOVERY.repeated.teams;
    const distinct = !primaries.has(read.primary);
    if (!repeated && !distinct) why.push(`${games.length} game${games.length > 1 ? "s" : ""} from ${[...teams].join(", ")}, and the library already has ${SHORT[read.primary].toLowerCase()} comps`);
    const before = prevComps.get(id);
    if (why.length && !before) { candidates.push({ id, picks: g.anchor.picks, read, reason: why.join("; "), games }); continue; }
    if (why.length && before) kept.push({ id, reason: why.join("; ") });
    primaries.add(read.primary);
    // Named by its read and its main threat ("Protect · Yunara"); the first team's name breaks a tie.
    let name = before?.name ?? `${conceptLabel(read)} · ${nameOf(read.mainCarry)}`;
    if (!before && usedNames.has(name.toLowerCase())) name = `${name} (${games[0].team})`;
    usedNames.add(name.toLowerCase());
    comps.push({
      id, name, addedOn: before?.addedOn ?? today,
      primary: read.primary, secondary: read.secondary, tags: read.tags,
      slots: Object.fromEntries(ROLES.map((r) => [r, { champion: g.anchor.picks[r], job: read.jobs[r] }])) as DiscoveredComp["slots"],
      winCondition: read.winCondition, why: read.why, timing: read.timing,
      strengths: read.strengths, weaknesses: read.weaknesses, difficulty: read.difficulty,
      games: g.members.filter((x) => x.m === "exact").map(({ obs }) => ({ game: obs.game, side: obs.side })),
    });
  }

  // Variations: every lineup under a curated shell (an exact replay included) or under an added comp (other lineups).
  const added = new Set(comps.map((c) => c.id));
  const prevVar = new Map(previous.variations.map((v) => [`${v.of}#${lineupKey(v.picks)}`, v]));
  const byKey = new Map<string, ObservedVariation>();
  for (const [id, g] of groups) {
    if (!shellIds.has(id) && !added.has(id)) continue;
    for (const { obs, m } of g.members) {
      if (added.has(id) && m === "exact") continue;
      const key = `${id}#${lineupKey(obs.picks)}`;
      if (!byKey.has(key)) byKey.set(key, { of: id, picks: obs.picks, addedOn: prevVar.get(key)?.addedOn ?? today, games: [] });
      byKey.get(key)!.games.push({ game: obs.game, side: obs.side });
    }
  }
  const variations = [...byKey.values()];

  const prevIds = new Set([...previous.comps.map((c) => c.id), ...previous.variations.map((v) => `${v.of}#${lineupKey(v.picks)}`)]);
  const nowIds = [...comps.map((c) => c.id), ...byKey.keys()];
  const grew = nowIds.some((x) => !prevIds.has(x));
  return {
    file: { lastAddition: grew ? today : previous.lastAddition, comps, variations },
    candidates, unread, kept, shellReads, observations,
  };
}

// ---------- weekly report ----------

const ROLE_SHORT: Record<Role, string> = { TOP: "Top", JUNGLE: "Jng", MID: "Mid", BOT: "Bot", SUPPORT: "Sup" };

export interface ReportInput {
  result: DiscoveryResult;
  previous: DiscoveredFile;
  shells: CompShell[];
  lck: ProDraft[]; // the frozen LCK playoff drafts, for comparison only
  nameOf: (id: string) => string;
  today: string;
  tournaments: { label: string; status?: string; recorded: number; games?: number; listed: boolean }[];
}

/** A short markdown report: what was added, what grew, what may be outdated and what still needs a person. */
export function weeklyReport({ result, previous, shells, lck, nameOf, today, tournaments }: ReportInput): string {
  const { file, candidates, unread, kept, observations } = result;
  const obs = new Map(observations.map((o) => [refKey(o), o]));
  const lineup = (p: Picks) => ROLES.map((r) => `${ROLE_SHORT[r]} ${nameOf(p[r])}`).join(" · ");
  const game = (o: Observation) => `[${o.team} vs ${o.opponent} G${o.gameNo}](${o.url}) (${o.tournament}, ${o.patch}, ${o.date}, ${o.won ? "win" : "loss"})`;
  const short = (o: Observation) => `[${o.team} G${o.gameNo} ${o.won ? "W" : "L"}](${o.url})`;
  const games = (refs: LineupRef[]) => refs.map((r) => obs.get(refKey(r))).filter((o): o is Observation => !!o).map((o) => `  - ${game(o)}`).join("\n");
  const nameOfComp = (id: string) => shells.find((s) => s.id === id)?.name ?? file.comps.find((c) => c.id === id)?.name ?? id;
  const prevComps = new Set(previous.comps.map((c) => c.id));
  const prevVars = new Map(previous.variations.map((v) => [`${v.of}#${lineupKey(v.picks)}`, new Set(v.games.map(refKey))]));
  const prevRefs = new Set([...previous.comps.flatMap((c) => c.games.map(refKey)), ...previous.variations.flatMap((v) => v.games.map(refKey))]);
  const lckSeen = (p: Picks) => lck.filter((d) => shared(d.picks, p) >= 4).map((d) => `${d.team} vs ${d.opponent} ${d.seriesGame} (${d.tournament})`);
  const out: string[] = [];
  const latest = observations.at(-1)?.date;
  const weekAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 7 * 864e5).toISOString().slice(0, 10);
  out.push(`# Comp Library review · ${today}`, "");
  out.push(`Read ${observations.length} lineups from ${new Set(observations.map((o) => o.game)).size} recorded games${latest ? ` (latest ${latest})` : ""}. ${tournaments.map((t) => `${t.label}: ${t.listed ? `${t.recorded}${t.games != null ? `/${t.games}` : ""} games recorded, ${t.status ?? "status unknown"}` : "not on Gol.gg yet"}`).join("; ")}. LCK 2026 playoff drafts are used for comparison only.`, "");

  const newComps = file.comps.filter((c) => !prevComps.has(c.id));
  out.push(`## New compositions (${newComps.length})`, "");
  if (!newComps.length) out.push("None this week.", "");
  for (const c of newComps) {
    const p = Object.fromEntries(ROLES.map((r) => [r, c.slots[r].champion])) as Picks;
    const firstOfKind = !shells.some((s) => { const r = result.shellReads[s.id]; return s.kind === "observed" && r.ok && r.read.primary === c.primary; })
      && !newComps.slice(0, newComps.indexOf(c)).some((x) => x.primary === c.primary);
    out.push(`- **${c.name}** · ${lineup(p)} · ${cap(c.difficulty)}`);
    out.push(`  - ${firstOfKind ? `First ${SHORT[c.primary].toLowerCase()} comp in the library. ` : ""}${c.why} ${c.winCondition}`);
    if (c.strengths.length) out.push(`  - Strengths: ${c.strengths.join("; ")}.`);
    if (c.weaknesses.length) out.push(`  - Weak points: ${c.weaknesses.map((w) => `${w.label} (${w.severity})`).join("; ")}.`);
    const seen = lckSeen(p);
    if (seen.length) out.push(`  - Close to LCK playoff drafts: ${seen.join("; ")}.`);
    out.push(games(c.games));
    const vs = file.variations.filter((v) => v.of === c.id);
    if (vs.length) out.push(`  - ${vs.length} observed variation${vs.length > 1 ? "s" : ""}: ${vs.map((v) => lineup(v.picks)).join(" / ")}`);
  }
  out.push("");

  const isShellReplay = (v: ObservedVariation) => { const s = shells.find((x) => x.id === v.of); return !!s && lineupKey(shellPicks(s)) === lineupKey(v.picks); };
  const newVars = file.variations.filter((v) => !prevVars.has(`${v.of}#${lineupKey(v.picks)}`) && !newComps.some((c) => c.id === v.of) && !isShellReplay(v));
  out.push(`## New variations of existing compositions (${newVars.length})`, "");
  if (!newVars.length) out.push("None this week.", "");
  for (const v of newVars) {
    const base = shells.find((s) => s.id === v.of);
    const basePicks = base ? shellPicks(base) : (Object.fromEntries(ROLES.map((r) => [r, file.comps.find((c) => c.id === v.of)!.slots[r].champion])) as Picks);
    const diff = ROLES.filter((r) => basePicks[r] !== v.picks[r]).map((r) => `${nameOf(v.picks[r])} for ${nameOf(basePicks[r])}`);
    out.push(`- **${nameOfComp(v.of)}**: ${diff.join(", ")}`, games(v.games));
  }
  out.push("");

  const renewed = [...new Set([...file.variations.filter((v) => v.games.some((g) => !prevRefs.has(refKey(g)))).map((v) => v.of),
    ...file.comps.filter((c) => prevComps.has(c.id) && c.games.some((g) => !prevRefs.has(refKey(g)))).map((c) => c.id)])]
    .filter((id) => !newComps.some((c) => c.id === id));
  out.push(`## Existing compositions seeing new professional play (${renewed.length})`, "");
  if (!renewed.length) out.push("None this week.", "");
  for (const id of renewed) {
    const refs = [...file.variations.filter((v) => v.of === id).flatMap((v) => v.games), ...(file.comps.find((c) => c.id === id)?.games ?? [])].filter((g) => !prevRefs.has(refKey(g)));
    out.push(`- **${nameOfComp(id)}**: ${refs.length} new game${refs.length > 1 ? "s" : ""}`, games(refs));
  }
  out.push("");

  const newestPatch = observations.map((o) => o.patch).sort((a, b) => patchNum(b) - patchNum(a))[0];
  const played = new Set(file.variations.map((v) => v.of));
  const stale = shells.filter((s) => s.kind === "observed" && !played.has(s.id));
  out.push(`## May be outdated (${stale.length})`, "");
  out.push(newestPatch ? `Observed library comps with no exact or variation game in the tracked tournaments (newest patch ${newestPatch}). Report only; nothing is removed.` : "No tracked games yet.", "");
  for (const s of stale) {
    const unplayed = ROLES.map((r) => s.slots[r].champion).filter((c) => !observations.some((o) => ROLES.some((r) => o.picks[r] === c)));
    out.push(`- **${s.name}** · ${lineup(shellPicks(s))}${unplayed.length ? ` · not picked in tracked games: ${unplayed.map(nameOf).join(", ")}` : ""}`);
  }
  out.push("");

  out.push(`## Proposed comps for review (${candidates.length + unread.length})`, "");
  out.push("Not added automatically: each needs more games or a person's call. One line per lineup group, newest games marked.", "");
  for (const c of candidates) {
    const fresh = c.games.some((o) => o.date >= weekAgo);
    out.push(`- ${fresh ? "**New** · " : ""}${c.read ? conceptLabel(c.read) : "Unread"} · ${lineup(c.picks)} · ${c.games.map(short).join(", ")} · ${c.reason}`);
  }
  for (const u of unread) out.push(`- ${u.obs.date >= weekAgo ? "**New** · " : ""}Cannot be read · ${lineup(u.obs.picks)} · ${short(u.obs)} · ${u.reason}`);
  out.push("");
  if (kept.length) {
    out.push("## Earlier additions that would not pass today", "", "Kept in the library; review by hand.", "");
    for (const k of kept) out.push(`- **${nameOfComp(k.id)}**: ${k.reason}.`);
    out.push("");
  }
  out.push("## Limits", "");
  out.push("- Identity, jobs, strengths, weak points and difficulty are the comp check's read from champion kits (general draft logic), not something the games show. Kit values are still unreviewed.");
  out.push("- Pick order is not recorded, so no lineup is read as a response to the other team's picks.");
  out.push("- Win/loss is listed for context and never decides an addition.");
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

const patchNum = (p: string) => { const [a, b] = p.split(".").map(Number); return a * 1000 + b; };
export { IDENTITY_LABEL };
