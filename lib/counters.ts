// Counters: a fourth signal, kept apart from Synergy (saved pairings), Pro Pairings and General Draft Logic.
//
//   Synergy      works with my locked picks          lib/recommend.ts
//   Pro Pairings actually played together           lib/suggest.ts
//   Logic        fixes composition needs            lib/recommend.ts, lib/evaluate.ts
//   Counters     favourable into an enemy pick      here
//
// Source priority: recorded pro games first, DPM.LOL only when the pro sample for that pair is too thin. A pro game
// counts only when both champions played the same lane role on opposite sides AND the game's winner is recorded;
// appearing on opposite teams proves nothing. Newer patches weigh more. Nothing here changes the draft-fit score: a
// counter is shown beside the overall ranking, never above it, and a counter that hurts the comp says so.
import type { Draft } from "./evaluate";
import { comparePatchDesc } from "./evidence";
import { TIERS, type Tier } from "./pool-stats";
import type { Recommendation, Recommendations } from "./recommend";
import { ROLES, type Champion, type Counters, type PoolEntry, type ProDraft, type Role } from "./schema";

export type EnemyDraft = Partial<Record<Role, string>>;
export type CounterSource = "pro" | "dpm";
export type Strength = "strong" | "favorable";

// ---------- thresholds ----------

export const PRO_MIN_GAMES = 3; // one or two games is an anecdote
export const PRO_MIN_WIN_SHARE = 0.6; // patch-weighted share of those games the counter side won
export const PRO_STRONG_SHARE = 0.75;
export const PATCH_DECAY = 0.7; // weight of a game one patch older than the newest recorded patch
export const DPM_MIN_GAMES = 300;
export const DPM_MIN_DUO_GAMES = 150;
export const DPM_MIN_WIN_RATE = 0.52;
export const DPM_STRONG_WIN_RATE = 0.54;

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

export interface CounterEvidence {
  source: CounterSource;
  scope: "lane" | "duo";
  vs: string[]; // the enemy champion, or the enemy bot + support
  with?: string; // the counter duo's other half, for duo evidence
  strength: Strength;
  games: number;
  wins?: number; // pro: games the counter side won
  winRate: number; // pro: patch-weighted win share; DPM: matchup win rate
  delta?: number;
  patch?: string; // latest patch in the sample
  updated?: string;
  rank?: string;
  url?: string;
  gameIds?: string[]; // pro: Gol.gg game source ids
  note?: string; // why the claim is held back (jungle head-to-head, one bot-lane champion)
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

interface Tally { games: number; wins: number; wGames: number; wWins: number; patch?: string; gameIds: string[]; with?: string }

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
      const won = g.winner === mine.team;
      t.games++; t.wGames += w;
      if (won) { t.wins++; t.wWins += w; }
      if (g.patch && (!t.patch || comparePatchDesc(g.patch, t.patch) < 0)) t.patch = g.patch;
      t.gameIds.push(mine.game);
      out.set(k, t);
    }
  }
  return out;
}

function proEvidence(t: Tally, base: Pick<CounterEvidence, "scope" | "vs" | "with">): CounterEvidence | null {
  const share = t.wWins / t.wGames;
  if (t.games < PRO_MIN_GAMES || share < PRO_MIN_WIN_SHARE) return null;
  return { ...base, source: "pro", strength: share >= PRO_STRONG_SHARE ? "strong" : "favorable", games: t.games, wins: t.wins,
    winRate: Math.round(share * 1000) / 1000, patch: t.patch, gameIds: t.gameIds };
}

function dpmEvidence(row: { winRate: number; delta?: number; games: number; patch: string; updated: string; rank?: string; url: string },
  base: Pick<CounterEvidence, "scope" | "vs" | "with">, minGames: number): CounterEvidence | null {
  if (row.games < minGames || row.winRate < DPM_MIN_WIN_RATE) return null;
  return { ...base, source: "dpm", strength: row.winRate >= DPM_STRONG_WIN_RATE ? "strong" : "favorable", games: row.games,
    winRate: row.winRate, delta: row.delta, patch: row.patch, updated: row.updated, rank: row.rank, url: row.url };
}

// ---------- counter picks ----------

export interface Counter {
  champion: string;
  role: Role;
  evidence: CounterEvidence;
  tier: Tier | null; // my pool tier in this role; null = out of pool, reference only
  fit: Recommendation | null; // the same champion on the overall draft-fit list
  fitRank: number | null; // 1 = best overall pick for the role
  cautions: string[]; // why it is not simply the pick: out of pool, triggers a warning, ranks lower on fit
}

export interface RoleCounters {
  role: Role;
  vs: string[]; // enemy champions the counters are read against
  scope: "lane" | "duo";
  counters: Counter[];
  note?: string; // how the read is qualified (role matchup instead of duo, jungle head-to-head)
}

export interface CounterInput {
  champions: Champion[];
  proDrafts: ProDraft[];
  pool: PoolEntry[];
  counters: Counters;
}

const TIER_RANK: Record<Tier, number> = { core: 0, depth: 1, flex: 2 };
const TIER_LABEL = Object.fromEntries(TIERS) as Record<Tier, string>;
export const tierLabel = (t: Tier | null) => (t ? TIER_LABEL[t] : "Not in pool");

export function poolTier(pool: PoolEntry[], champion: string, role: Role): Tier | null {
  const p = pool.find((x) => x.role === role);
  return p ? (TIERS.map(([t]) => t).find((t) => p[t].includes(champion)) ?? null) : null;
}

/**
 * Counters for every open role whose lane opponent is known. `fits` is the full (unlimited) draft-fit list from
 * recommend(); it is read, never changed. Order: in-pool first by tier (Core, Depth, Prepared / flex), then strength,
 * pro before DPM, then sample. Out-of-pool counters come last as reference only.
 */
export function counterPicks(draft: Draft, enemy: EnemyDraft, input: CounterInput, fits: Recommendations): Partial<Record<Role, RoleCounters>> {
  const byId = new Map(input.champions.map((c) => [c.id, c]));
  const taken = new Set([...Object.values(draft), ...Object.values(enemy)].filter(Boolean) as string[]);
  const games = resultGames(input.proDrafts, input.counters.proResults);
  const out: Partial<Record<Role, RoleCounters>> = {};

  for (const role of ROLES.filter((r) => !draft[r])) {
    const bot = role === "BOT" || role === "SUPPORT";
    const partner: Role | undefined = role === "BOT" ? "SUPPORT" : role === "SUPPORT" ? "BOT" : undefined;
    const fullEnemyDuo = bot && enemy.BOT && enemy.SUPPORT;
    const found = new Map<string, CounterEvidence>();
    const valid = (id: string) => !taken.has(id) && !!byId.get(id)?.roles.includes(role);
    let scope: RoleCounters["scope"] = "lane";
    let note: string | undefined;

    if (fullEnemyDuo) {
      // Duo vs duo: my bot + support against theirs. My locked partner must match the duo's other half.
      const vs = [enemy.BOT!, enemy.SUPPORT!];
      const mineOk = (d: { bot: string; support: string }) => !partner || !draft[partner] || d[partner === "BOT" ? "bot" : "support"] === draft[partner];
      const self = role === "BOT" ? "bot" : "support";
      const other = role === "BOT" ? "support" : "bot";
      const pro = proTallies(games, (e) => e.picks.BOT === vs[0] && e.picks.SUPPORT === vs[1],
        (m) => (mineOk({ bot: m.picks.BOT, support: m.picks.SUPPORT }) ? `${m.picks[role]}|${m.picks[partner!]}` : undefined));
      for (const [k, t] of pro) {
        const [id, mate] = k.split("|");
        const ev = valid(id) && proEvidence(t, { scope: "duo", vs, with: mate });
        if (ev && !found.has(id)) found.set(id, ev);
      }
      for (const row of input.counters.dpmDuos) {
        if (row.enemy.bot !== vs[0] || row.enemy.support !== vs[1] || !mineOk(row.duo)) continue;
        const id = row.duo[self];
        const ev = valid(id) && !found.has(id) && dpmEvidence(row, { scope: "duo", vs, with: row.duo[other] }, DPM_MIN_DUO_GAMES);
        if (ev) found.set(id, ev);
      }
      if (found.size) scope = "duo";
      else note = `No duo-vs-duo data for ${vs.map((v) => byId.get(v)?.name ?? v).join(" + ")}; role matchup against ${byId.get(enemy[role]!)?.name} only.`;
    }

    const opponent = enemy[role];
    if (!found.size && opponent) {
      // Bot lane read one champion at a time is cautious from either source; a SoloQ jungle head-to-head is matchup data.
      const botNote = !bot ? undefined : fullEnemyDuo ? "Role matchup only, not duo vs duo." : "Only one enemy bot-lane champion is known; read with caution.";
      const jungleNote = role === "JUNGLE" ? "SoloQ head-to-head only; tempo, invades and objective control are not measured." : undefined;
      const hold = (ev: CounterEvidence, why?: string) => { if (why) { ev.strength = "favorable"; ev.note = why; } return ev; };
      const pro = proTallies(games, (e) => e.picks[role] === opponent, (m) => m.picks[role]);
      for (const [id, t] of pro) {
        const ev = valid(id) && proEvidence(t, { scope: "lane", vs: [opponent] });
        if (ev) found.set(id, hold(ev, botNote));
      }
      for (const row of input.counters.dpm) {
        if (row.role !== role || row.enemy !== opponent || found.has(row.champion)) continue;
        const ev = valid(row.champion) && dpmEvidence(row, { scope: "lane", vs: [opponent] }, DPM_MIN_GAMES);
        if (ev) found.set(row.champion, hold(ev, botNote ?? jungleNote));
      }
      if (!note) note = botNote ?? ([...found.values()].some((e) => e.source === "dpm") ? jungleNote : undefined);
    }

    const vs = scope === "duo" ? [enemy.BOT!, enemy.SUPPORT!] : opponent ? [opponent] : [];
    if (!vs.length) continue;
    const fitList = fits[role] ?? [];
    const counters: Counter[] = [...found].map(([champion, evidence]) => {
      const tier = poolTier(input.pool, champion, role);
      const idx = fitList.findIndex((r) => r.champion === champion);
      const fit = idx >= 0 ? fitList[idx] : null;
      const cautions: string[] = [];
      if (!tier) cautions.push("Not in your pool: reference only");
      for (const p of fit?.parts ?? []) if (p.kind === "risk") cautions.push(p.text);
      if (idx > 0) cautions.push(`#${idx + 1} on overall draft fit; ${byId.get(fitList[0].champion)?.name ?? fitList[0].champion} fits the draft better`);
      return { champion, role, evidence, tier, fit, fitRank: idx >= 0 ? idx + 1 : null, cautions };
    });
    counters.sort((a, b) =>
      (a.tier ? TIER_RANK[a.tier] : 9) - (b.tier ? TIER_RANK[b.tier] : 9)
      || Number(b.evidence.strength === "strong") - Number(a.evidence.strength === "strong")
      || Number(b.evidence.source === "pro") - Number(a.evidence.source === "pro")
      || b.evidence.games - a.evidence.games
      || a.champion.localeCompare(b.champion));
    out[role] = { role, vs, scope, counters, note };
  }
  return out;
}

/** "Pro · 3 games · 2–1 · 16.18" or "DPM · 55.2% · +2.1 · 4,120 games · 16.18" */
export function describeEvidence(e: CounterEvidence): string {
  if (e.source === "pro") return ["Pro", `${e.games} game${e.games > 1 ? "s" : ""}`, `${e.wins}–${e.games - (e.wins ?? 0)}`, e.patch].filter(Boolean).join(" · ");
  return ["DPM", `${(e.winRate * 100).toFixed(1)}% matchup`, e.delta !== undefined ? `${e.delta > 0 ? "+" : ""}${e.delta.toFixed(1)}` : undefined,
    `${e.games.toLocaleString("en-US")} games`, e.patch].filter(Boolean).join(" · ");
}
