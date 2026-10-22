// Counters: a fourth signal, kept apart from Synergy (saved pairings), Pro Pairings and General Draft Logic.
//
//   Synergy      works with my locked picks          lib/recommend.ts
//   Pro Pairings actually played together           lib/suggest.ts
//   Logic        fixes composition needs            lib/recommend.ts, lib/evaluate.ts
//   Counters     favourable into an enemy pick      here
//
// Source priority (alan, 2026-10-10): DPM.LOL role matchup data is the counter signal. Recorded pro games are
// corroboration only: a pro win/loss record never makes a counter on its own, because a team can win a game for reasons
// that have nothing to do with the lane. A pro sample counts only when the same lane roles met on opposite sides, at
// least three times, with a recorded winner, and a consistent result; newer patches weigh more. When DPM and pro agree
// the counter is marked stronger; when they disagree DPM stays the signal and the pro sample is shown beside it, never
// averaged in. Nothing here changes the draft-fit score: a counter is shown beside the overall ranking, never above it.
import type { Draft } from "./evaluate";
import { comparePatchDesc } from "./evidence";
import { comparePatch, patchLabel } from "./patch";
import { TIERS, type Tier } from "./pool-stats";
import { savedSupports, type Recommendation, type Recommendations } from "./recommend";
import { ROLES, type BotPairing, type Champion, type Counters, type PoolEntry, type ProDraft, type Role } from "./schema";

export type EnemyDraft = Partial<Record<Role, string>>;
/** favorable < strong < confirmed (strong DPM matchup that pro games also support). */
export type Strength = "favorable" | "strong" | "confirmed";
export type ProVerdict = "agrees" | "disagrees" | "mixed";

// ---------- thresholds ----------

export const DPM_MIN_GAMES = 300;
export const DPM_MIN_DUO_GAMES = 150;
export const DPM_MIN_WIN_RATE = 0.52;
export const DPM_STRONG_WIN_RATE = 0.54;
export const PRO_MIN_GAMES = 3; // the matchup has to repeat; one or two games is an anecdote
export const PRO_AGREE_SHARE = 0.6; // patch-weighted share of those games the counter side won
export const PRO_DISAGREE_SHARE = 0.4;
export const PATCH_DECAY = 0.7; // weight of a game one patch older than the newest recorded patch

// ---------- enemy roles ----------

const ROLE_KEYS = Object.fromEntries(ROLES.map((r) => [r.toLowerCase(), r])) as Record<string, Role>;

/**
 * Enemy slots from `?vs=`. `top:aatrox,mid:ahri` keeps the given roles; bare ids (older links, `vs=ornn,jarvan-iv`)
 * are placed by detectEnemyRoles. Unknown ids, duplicates and champions locked on my side are dropped.
 */
export function parseEnemy(param: string | null, champions: Champion[], mine: string[] = []): EnemyDraft {
  const ids = new Set(champions.map((c) => c.id));
  const explicit: EnemyDraft = {};
  const bare: string[] = [];
  const seen = new Set(mine);
  for (const part of (param ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    const [a, b] = part.includes(":") ? part.split(":") : [undefined, part];
    if (!ids.has(b) || seen.has(b)) continue;
    seen.add(b);
    const role = a ? ROLE_KEYS[a.toLowerCase()] : undefined;
    if (role && !explicit[role]) explicit[role] = b; else bare.push(b);
  }
  return detectEnemyRoles(bare, champions, explicit);
}

/** `top:aatrox,mid:ahri`, in role order. */
export const enemyParam = (enemy: EnemyDraft) => ROLES.filter((r) => enemy[r]).map((r) => `${r.toLowerCase()}:${enemy[r]}`).join(",");

/**
 * Places champions with no stated role into the free enemy roles, maximising fit with each champion's listed roles
 * (listed first = main role). A champion who plays none of the free roles is left out rather than guessed.
 */
export function detectEnemyRoles(ids: string[], champions: Champion[], fixed: EnemyDraft = {}): EnemyDraft {
  const byId = new Map(champions.map((c) => [c.id, c]));
  const free = ROLES.filter((r) => !fixed[r]);
  const list = ids.filter((id) => byId.has(id) && !Object.values(fixed).includes(id)).slice(0, free.length);
  let best: { score: number; roles: (Role | undefined)[] } = { score: -Infinity, roles: [] };
  const walk = (i: number, used: Set<Role>, roles: (Role | undefined)[], score: number) => {
    if (i === list.length) { if (score > best.score) best = { score, roles: [...roles] }; return; }
    const champ = byId.get(list[i])!;
    for (const r of free) {
      if (used.has(r)) continue;
      const k = champ.roles.indexOf(r);
      if (k < 0) continue;
      used.add(r); roles.push(r);
      walk(i + 1, used, roles, score + 10 - k);
      used.delete(r); roles.pop();
    }
    roles.push(undefined); // leave this one out
    walk(i + 1, used, roles, score);
    roles.pop();
  };
  walk(0, new Set(), [], 0);
  const out: EnemyDraft = { ...fixed };
  best.roles.forEach((r, i) => { if (r) out[r] = list[i]; });
  return out;
}

// ---------- evidence ----------

/** The counter signal: one DPM.LOL matchup row (lane) or duo-vs-duo row. */
export interface CounterEvidence {
  source: "dpm";
  scope: "lane" | "duo";
  vs: string[]; // the enemy champion, or the enemy bot + support
  with?: string; // the counter duo's other half, for duo rows
  strength: "favorable" | "strong"; // from DPM alone, after holding jungle / half-known bot lanes to favorable
  games: number;
  winRate: number; // the counter side's matchup win rate
  delta?: number;
  patch: string;
  updated: string;
  rank?: string;
  url: string;
  note?: string; // why the claim is held back (jungle head-to-head, one bot-lane champion, role instead of duo)
  stale?: boolean; // collected on a patch older than the newest recognised one: historical, shown as such, strength unchanged
}

/** Recorded pro games of the same matchup. Context beside the DPM signal; never a counter by itself, never averaged. */
export interface ProSample {
  scope: "lane" | "duo";
  vs: string[];
  with?: string;
  games: number;
  wins: number; // games the counter side won
  winShare: number; // patch-weighted
  patch?: string; // newest patch in the sample
  gameIds: string[]; // Gol.gg game source ids
  verdict: ProVerdict;
}

interface Side { team: string; picks: ProDraft["picks"]; patch?: string; game: string }
interface Game { a: Side; b: Side; winner: string; patch?: string }

/** Recorded games with both sides' picks and a recorded winner. */
export function resultGames(proDrafts: ProDraft[], results: Counters["proResults"]): Game[] {
  const winners = new Map(results.map((r) => [r.game, r.winner]));
  const byGame = new Map<string, Side[]>();
  for (const d of proDrafts) {
    const game = d.sources.find((s) => s.startsWith("golgg-game-"));
    if (!game) continue;
    byGame.set(game, [...(byGame.get(game) ?? []), { team: d.team, picks: d.picks, patch: d.patch, game }]);
  }
  const out: Game[] = [];
  for (const [game, sides] of byGame) {
    const winner = winners.get(game);
    if (sides.length !== 2 || !winner || !sides.some((s) => s.team === winner)) continue;
    out.push({ a: sides[0], b: sides[1], winner, patch: sides[0].patch ?? sides[1].patch });
  }
  return out;
}

const patchWeights = (games: Game[]) => {
  const patches = [...new Set(games.map((g) => g.patch).filter((p): p is string => !!p))].sort(comparePatchDesc);
  return (p?: string) => (p ? PATCH_DECAY ** Math.max(0, patches.indexOf(p)) : PATCH_DECAY ** patches.length);
};

interface Tally { games: number; wins: number; wGames: number; wWins: number; patch?: string; gameIds: string[] }

function proTallies(games: Game[], match: (enemy: Side) => boolean, key: (mine: Side) => string | undefined): Map<string, Tally> {
  const weight = patchWeights(games);
  const out = new Map<string, Tally>();
  for (const g of games) {
    for (const [enemy, mine] of [[g.a, g.b], [g.b, g.a]] as const) {
      if (!match(enemy)) continue;
      const k = key(mine);
      if (!k) continue;
      const t = out.get(k) ?? { games: 0, wins: 0, wGames: 0, wWins: 0, gameIds: [] };
      const w = weight(g.patch);
      t.games++; t.wGames += w;
      if (g.winner === mine.team) { t.wins++; t.wWins += w; }
      if (g.patch && (!t.patch || comparePatchDesc(g.patch, t.patch) < 0)) t.patch = g.patch;
      t.gameIds.push(mine.game);
      out.set(k, t);
    }
  }
  return out;
}

function proSample(t: Tally | undefined, base: Pick<ProSample, "scope" | "vs" | "with">): ProSample | null {
  if (!t || t.games < PRO_MIN_GAMES) return null;
  const share = t.wWins / t.wGames;
  const verdict: ProVerdict = share >= PRO_AGREE_SHARE ? "agrees" : share <= PRO_DISAGREE_SHARE ? "disagrees" : "mixed";
  return { ...base, games: t.games, wins: t.wins, winShare: Math.round(share * 1000) / 1000, patch: t.patch, gameIds: t.gameIds, verdict };
}

function dpmEvidence(row: { winRate: number; delta?: number; games: number; patch: string; updated: string; rank?: string; url: string },
  base: Pick<CounterEvidence, "scope" | "vs" | "with">, minGames: number): CounterEvidence | null {
  if (row.games < minGames || row.winRate < DPM_MIN_WIN_RATE) return null;
  return { ...base, source: "dpm", strength: row.winRate >= DPM_STRONG_WIN_RATE ? "strong" : "favorable", games: row.games,
    winRate: row.winRate, delta: row.delta, patch: row.patch, updated: row.updated, rank: row.rank, url: row.url };
}

/** Pro agreement lifts a counter one step; disagreement or a mixed record leaves the DPM strength as it is. */
function combined(e: CounterEvidence, pro: ProSample | null): Strength {
  if (pro?.verdict !== "agrees") return e.strength;
  return e.strength === "strong" ? "confirmed" : "strong";
}

// ---------- counter picks ----------

export interface Counter {
  champion: string;
  role: Role;
  strength: Strength; // the DPM signal, lifted one step when pro games agree
  evidence: CounterEvidence; // the DPM matchup (always present: no DPM row, no counter)
  pro: ProSample | null; // the same matchup in recorded pro games, when it repeats; shown separately
  tier: Tier | null; // my pool tier in this role; null = out of pool, reference only
  theoretical: boolean; // a support outside the locked bot's saved supports: shown for reference, never recommended
  fit: Recommendation | null; // the same champion on the overall draft-fit list
  fitRank: number | null; // 1 = best overall pick for the role
  cautions: string[]; // why it is not simply the pick: out of pool, triggers a warning, ranks lower on fit, pro disagrees
}

export interface RoleCounters {
  role: Role;
  vs: string[]; // enemy champions the counters are read against
  scope: "lane" | "duo";
  counters: Counter[];
  note?: string; // how the read is qualified (role matchup instead of duo, jungle head-to-head)
  coverage: CounterCoverage; // what the lane data holds against this opponent, so an empty list says why
}

/**
 * Why a Counters list is empty (alan, 2026-10-22): never "no counters exist", only what our data shows.
 *   no-data          no DPM row against this opponent in this role
 *   small-sample     rows exist, none with DPM_MIN_GAMES games
 *   below-threshold  rows with enough games exist, none at DPM_MIN_WIN_RATE
 *   unavailable      qualifying rows exist, but every one is a champion already taken or not playable here
 */
export type EmptyReason = "no-data" | "small-sample" | "below-threshold" | "unavailable";

/** A favourable row under the sample bar: preliminary evidence, shown as such, never a Counter label. */
export interface Preliminary { champion: string; winRate: number; games: number; patch: string; url: string }

export interface CounterCoverage {
  rows: number; // lane rows against the opponent in this role, any champion
  sampled: number; // of those, rows with DPM_MIN_GAMES+ games
  favorable: number; // sampled rows at DPM_MIN_WIN_RATE+
  preliminary: Preliminary[]; // up to PRELIMINARY_SHOWN favourable rows under the sample bar, most games first, playable here
  patch?: string; // newest patch among those rows
  stale: boolean; // that patch is older than the newest recognised patch
  reason?: EmptyReason; // set only when no counter is listed
}

export const PRELIMINARY_SHOWN = 3;

export interface CounterInput {
  champions: Champion[];
  proDrafts: ProDraft[];
  pool: PoolEntry[];
  counters: Counters;
  botPairings?: BotPairing[];
  /** The newest patch the site recognises (patch notes, pro games); DPM rows from an older patch are marked stale. */
  newestPatch?: string;
}

/** True when `patch` is older than `newest`. Unknown on either side: not stale. */
export const olderPatch = (patch: string | undefined, newest: string | undefined) => !!patch && !!newest && comparePatch(patch, newest) < 0;

/** What the lane rows hold against `opponent` in `role`; `playable` decides which champions could still be picked. */
export function laneCoverage(rows: Counters["dpm"], role: Role, opponent: string, playable: (id: string) => boolean, newest?: string): CounterCoverage {
  const mine = rows.filter((r) => r.role === role && r.enemy === opponent);
  const sampled = mine.filter((r) => r.games >= DPM_MIN_GAMES);
  const favorable = sampled.filter((r) => r.winRate >= DPM_MIN_WIN_RATE);
  const patch = mine.map((r) => r.patch).sort(comparePatchDesc)[0];
  const preliminary = mine.filter((r) => r.games < DPM_MIN_GAMES && r.winRate >= DPM_MIN_WIN_RATE && playable(r.champion))
    .sort((a, b) => b.games - a.games || b.winRate - a.winRate).slice(0, PRELIMINARY_SHOWN)
    .map((r) => ({ champion: r.champion, winRate: r.winRate, games: r.games, patch: r.patch, url: r.url }));
  return { rows: mine.length, sampled: sampled.length, favorable: favorable.length, preliminary, patch, stale: olderPatch(patch, newest) };
}

export const emptyReason = (c: CounterCoverage): EmptyReason =>
  !c.rows ? "no-data" : !c.sampled ? "small-sample" : !c.favorable ? "below-threshold" : "unavailable";

const TIER_RANK: Record<Tier, number> = { core: 0, depth: 1, flex: 2 };
const STRENGTH_RANK: Record<Strength, number> = { confirmed: 0, strong: 1, favorable: 2 };
const TIER_LABEL = Object.fromEntries(TIERS) as Record<Tier, string>;
export const tierLabel = (t: Tier | null) => (t ? TIER_LABEL[t] : "Not in pool");

export function poolTier(pool: PoolEntry[], champion: string, role: Role): Tier | null {
  const p = pool.find((x) => x.role === role);
  return p ? (TIERS.map(([t]) => t).find((t) => p[t].includes(champion)) ?? null) : null;
}

/**
 * Counters for every open role whose lane opponent is known. `fits` is the full (unlimited) draft-fit list from
 * recommend(); it is read, never changed. Order: in-pool first by tier (Core, Depth, Prepared / flex), then strength,
 * then DPM sample. Out-of-pool counters come last as reference only.
 */
export function counterPicks(draft: Draft, enemy: EnemyDraft, input: CounterInput, fits: Recommendations): Partial<Record<Role, RoleCounters>> {
  const byId = new Map(input.champions.map((c) => [c.id, c]));
  const name = (id: string) => byId.get(id)?.name ?? id;
  const taken = new Set([...Object.values(draft), ...Object.values(enemy)].filter(Boolean) as string[]);
  const games = resultGames(input.proDrafts, input.counters.proResults);
  const out: Partial<Record<Role, RoleCounters>> = {};
  const eligibleSupports = savedSupports(draft, input.botPairings ?? []);

  for (const role of ROLES.filter((r) => !draft[r])) {
    const bot = role === "BOT" || role === "SUPPORT";
    const partner: Role | undefined = role === "BOT" ? "SUPPORT" : role === "SUPPORT" ? "BOT" : undefined;
    const fullEnemyDuo = bot && !!enemy.BOT && !!enemy.SUPPORT;
    const found = new Map<string, { evidence: CounterEvidence; pro: ProSample | null }>();
    const valid = (id: string) => !taken.has(id) && !!byId.get(id)?.roles.includes(role);
    let scope: RoleCounters["scope"] = "lane";
    let note: string | undefined;

    if (fullEnemyDuo) {
      // Duo vs duo: my bot + support against theirs. My locked partner must match the duo's other half.
      const vs = [enemy.BOT!, enemy.SUPPORT!];
      const mineOk = (d: { bot: string; support: string }) => !partner || !draft[partner] || d[partner === "BOT" ? "bot" : "support"] === draft[partner];
      const self = role === "BOT" ? "bot" : "support";
      const other = role === "BOT" ? "support" : "bot";
      const pro = proTallies(games, (e) => e.picks.BOT === vs[0] && e.picks.SUPPORT === vs[1], (m) => `${m.picks.BOT}|${m.picks.SUPPORT}`);
      for (const row of input.counters.dpmDuos) {
        if (row.enemy.bot !== vs[0] || row.enemy.support !== vs[1] || !mineOk(row.duo)) continue;
        const id = row.duo[self];
        const evidence = valid(id) && !found.has(id) && dpmEvidence(row, { scope: "duo", vs, with: row.duo[other] }, DPM_MIN_DUO_GAMES);
        if (evidence) found.set(id, { evidence, pro: proSample(pro.get(`${row.duo.bot}|${row.duo.support}`), { scope: "duo", vs, with: row.duo[other] }) });
      }
      if (found.size) scope = "duo";
      else note = `No duo-vs-duo data for ${vs.map(name).join(" + ")}; role matchup against ${name(enemy[role]!)} only.`;
    }

    const opponent = enemy[role];
    if (!found.size && opponent) {
      // Bot lane read one champion at a time is cautious; a SoloQ jungle head-to-head is matchup data, not a strong claim.
      const botNote = !bot ? undefined : fullEnemyDuo ? "Role matchup only, not duo vs duo." : "Only one enemy bot-lane champion is known; read with caution.";
      const jungleNote = role === "JUNGLE" ? "SoloQ head-to-head only; tempo, invades and objective control are not measured." : undefined;
      const why = botNote ?? jungleNote;
      const pro = proTallies(games, (e) => e.picks[role] === opponent, (m) => m.picks[role]);
      for (const row of input.counters.dpm) {
        if (row.role !== role || row.enemy !== opponent || found.has(row.champion)) continue;
        const evidence = valid(row.champion) && dpmEvidence(row, { scope: "lane", vs: [opponent] }, DPM_MIN_GAMES);
        if (!evidence) continue;
        if (why) { evidence.strength = "favorable"; evidence.note = why; }
        found.set(row.champion, { evidence, pro: proSample(pro.get(row.champion), { scope: "lane", vs: [opponent] }) });
      }
      if (!note) note = botNote ?? (found.size ? jungleNote : undefined);
    }

    const vs = scope === "duo" ? [enemy.BOT!, enemy.SUPPORT!] : opponent ? [opponent] : [];
    if (!vs.length) continue;
    for (const { evidence } of found.values()) if (olderPatch(evidence.patch, input.newestPatch)) evidence.stale = true;
    const coverage: CounterCoverage = opponent
      ? laneCoverage(input.counters.dpm, role, opponent, valid, input.newestPatch)
      : { rows: 0, sampled: 0, favorable: 0, preliminary: [], stale: false };
    if (!found.size) coverage.reason = emptyReason(coverage);
    const fitList = fits[role] ?? [];
    const counters: Counter[] = [...found].map(([champion, { evidence, pro }]) => {
      const tier = poolTier(input.pool, champion, role);
      const idx = fitList.findIndex((r) => r.champion === champion);
      const fit = idx >= 0 ? fitList[idx] : null;
      const cautions: string[] = [];
      const theoretical = role === "SUPPORT" && !!eligibleSupports && !eligibleSupports.includes(champion);
      if (theoretical) cautions.push(`Not one of ${name(draft.BOT!)}'s saved supports: theoretical, not recommended`);
      if (!tier) cautions.push("Not in your pool: reference only");
      if (pro?.verdict === "disagrees") cautions.push(`Pro games disagree: ${pro.wins}–${pro.games - pro.wins} in this matchup`);
      for (const p of fit?.parts ?? []) if (p.kind === "risk") cautions.push(p.text);
      if (idx > 0) cautions.push(`#${idx + 1} on overall draft fit; ${name(fitList[0].champion)} fits the draft better`);
      return { champion, role, strength: combined(evidence, pro), evidence, pro, tier, theoretical, fit, fitRank: idx >= 0 ? idx + 1 : null, cautions };
    });
    counters.sort((a, b) =>
      Number(a.theoretical) - Number(b.theoretical)
      || (a.tier ? TIER_RANK[a.tier] : 9) - (b.tier ? TIER_RANK[b.tier] : 9)
      || STRENGTH_RANK[a.strength] - STRENGTH_RANK[b.strength]
      || b.evidence.games - a.evidence.games
      || a.champion.localeCompare(b.champion));
    out[role] = { role, vs, scope, counters, note, coverage };
  }
  return out;
}

/** "DPM · 55.2% matchup · +2.1 · 4,120 games · 26.18", and "· older patch" when the row is stale. */
export function describeEvidence(e: CounterEvidence): string {
  return ["DPM", `${(e.winRate * 100).toFixed(1)}% matchup`, e.delta !== undefined ? `${e.delta > 0 ? "+" : ""}${e.delta.toFixed(1)}` : undefined,
    `${e.games.toLocaleString("en-US")} games`, e.patch && patchLabel(e.patch), e.stale ? "older patch" : undefined].filter(Boolean).join(" · ");
}

/**
 * Why the Counters list for `vs` is empty, in words. Says what our data holds, never that no counter exists.
 * `newest` names the current patch when the rows are older.
 */
export function emptyText(c: CounterCoverage, vs: string, newest?: string): string {
  const base = {
    "no-data": `No DPM.LOL matchup data against ${vs} in this role yet.`,
    "small-sample": `DPM.LOL has ${c.rows} matchup${c.rows === 1 ? "" : "s"} against ${vs}, none with ${DPM_MIN_GAMES} games yet: too few to call a counter.`,
    "below-threshold": `${c.sampled} matchup${c.sampled === 1 ? "" : "s"} against ${vs} ${c.sampled === 1 ? "has" : "have"} ${DPM_MIN_GAMES}+ games, none at a ${Math.round(DPM_MIN_WIN_RATE * 100)}% win rate or better.`,
    unavailable: `The favourable matchups against ${vs} are champions already taken or not playable here.`,
  }[c.reason ?? "no-data"];
  const stale = c.stale && c.patch ? ` The data is from patch ${patchLabel(c.patch)}${newest ? `, older than ${patchLabel(newest)}` : ""}.` : "";
  return `${base}${stale} This is a gap in our data, not proof that ${vs} has no counters.`;
}

/** "Preliminary, under 300 games: Jayce 57.7% of 106 (26.20)". Never a Counter label. */
export const preliminaryText = (c: CounterCoverage, name: (id: string) => string) =>
  c.preliminary.length ? `Preliminary, under ${DPM_MIN_GAMES} games: ${c.preliminary.map((p) => `${name(p.champion)} ${(p.winRate * 100).toFixed(1)}% of ${p.games}`).join(", ")} (DPM.LOL ${patchLabel(c.preliminary[0].patch)}).` : "";

/** "Pro · 3 games · 3–0 · 26.18 · agrees" */
export function describePro(p: ProSample): string {
  return ["Pro", `${p.games} games`, `${p.wins}–${p.games - p.wins}`, p.patch && patchLabel(p.patch), p.verdict].filter(Boolean).join(" · ");
}

// ---------- lane matchups on the board ----------
//
// Both sides of a lane are locked: does the matchup data favour one of them? (alan, 2026-10-22). Read only from DPM rows
// (my champion's page against theirs); when only the enemy's page lists the pair, its row is read the other way round,
// the same sample, marked `inverted` and never counted as a second source. No row with DPM_MIN_GAMES games is
// "insufficient" (its numbers shown as preliminary); no row at all is "no-data". Never from popularity, pro results or
// kits, never scored, never the order of any list.

export type LaneVerdict = "us" | "them" | "even" | "insufficient" | "no-data";
export const LANE_EVEN_BAND = 0.02; // 48–52%: relatively even

export interface LaneMatchup {
  role: Role;
  mine: string;
  theirs: string;
  verdict: LaneVerdict;
  strong: boolean; // 54%+ either way, with the full sample
  winRate?: number; // my side's matchup win rate
  games?: number;
  patch?: string;
  rank?: string;
  url?: string;
  updated?: string;
  inverted: boolean; // read from the enemy champion's row: the same sample seen from the other side
  stale: boolean;
  note?: string; // what the read can't say (jungle head-to-head, bot lane without duo data)
}

export function laneMatchups(draft: Draft, enemy: EnemyDraft, rows: Counters["dpm"], newestPatch?: string): LaneMatchup[] {
  const out: LaneMatchup[] = [];
  for (const role of ROLES) {
    const mine = draft[role], theirs = enemy[role];
    if (!mine || !theirs) continue;
    const direct = rows.find((r) => r.role === role && r.champion === mine && r.enemy === theirs);
    const back = direct ? undefined : rows.find((r) => r.role === role && r.champion === theirs && r.enemy === mine);
    const row = direct ?? back;
    const note = role === "JUNGLE" ? "SoloQ head-to-head only; tempo, invades and objective control are not measured."
      : role === "BOT" || role === "SUPPORT" ? "One champion against one, not the whole bot lane: no duo-vs-duo data." : undefined;
    if (!row) { out.push({ role, mine, theirs, verdict: "no-data", strong: false, inverted: false, stale: false, note }); continue; }
    const winRate = Math.round((direct ? row.winRate : 1 - row.winRate) * 10000) / 10000;
    const full = row.games >= DPM_MIN_GAMES;
    const verdict: LaneVerdict = !full ? "insufficient" : winRate >= 0.5 + LANE_EVEN_BAND ? "us" : winRate <= 0.5 - LANE_EVEN_BAND ? "them" : "even";
    const strong = full && Math.abs(winRate - 0.5) >= DPM_STRONG_WIN_RATE - 0.5;
    out.push({ role, mine, theirs, verdict, strong, winRate, games: row.games, patch: row.patch, rank: row.rank, url: row.url, updated: row.updated,
      inverted: !direct, stale: olderPatch(row.patch, newestPatch), note });
  }
  return out;
}

export const LANE_VERDICT_LABEL: Record<LaneVerdict, string> = {
  us: "Favors us", them: "Favors them", even: "Relatively even", insufficient: "Insufficient evidence", "no-data": "No matchup data",
};
