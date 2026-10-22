// A DPM.LOL browser collection (alan, 2026-10-22): the export `scripts/dpm-collect/` writes, read, checked and compared
// here before `scripts/ingest-dpm.ts` stores it. Pure functions, no file access, so the checks are testable.
//
// Every number is DPM's own. A matchup's `winRate` is the page champion's win rate against that lane opponent, read
// from the Build page's data request, never computed; `delta` is the +/- the page shows beside the row in its Full List,
// which has DPM's own baseline and is never a win rate. Nothing here scores, ranks or touches saved pairings.
import { comparePatch, shortPatch } from "./patch";
import { DPM_MIN_GAMES, DPM_MIN_WIN_RATE, DPM_STRONG_WIN_RATE } from "./counters";
import { ROLES, type Champion, type DpmExport, type DpmExportPage, type DpmMatchup, type PoolEntry, type Role } from "./schema";

// ---------- names ----------

/** DPM spellings that neither a roster name, id nor alias covers. */
export const DPM_SPELLINGS: Record<string, string> = { monkeyking: "wukong", nunu: "nunu-willump" };
export const normName = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

/** Roster lookup by DPM's spelling (ids, names, aliases and DPM_SPELLINGS); undefined when nothing matches. */
export function championResolver(champions: Pick<Champion, "id" | "name" | "aliases">[]): (name: string) => string | undefined {
  const by = new Map<string, string>();
  for (const c of champions) {
    by.set(normName(c.id), c.id);
    by.set(normName(c.name), c.id);
    for (const a of c.aliases ?? []) if (!by.has(normName(a))) by.set(normName(a), c.id);
  }
  for (const [k, v] of Object.entries(DPM_SPELLINGS)) if (by.has(normName(v))) by.set(k, v);
  return (name) => by.get(normName(name));
}

export const ROLE_ALIAS: Record<string, Role> = { top: "TOP", jungle: "JUNGLE", mid: "MID", middle: "MID", bot: "BOT", adc: "BOT", bottom: "BOT", support: "SUPPORT", utility: "SUPPORT" };
export const roleOf = (s: string): Role | undefined => ROLE_ALIAS[s.toLowerCase()] ?? (ROLES.includes(s as Role) ? (s as Role) : undefined);

/** "+3.2%" → 3.2; "-0.0%" → 0; anything unreadable → undefined. */
export function parseDelta(d: string | number | undefined): number | undefined {
  if (d === undefined) return undefined;
  if (typeof d === "number") return Number.isFinite(d) ? d : undefined;
  const m = d.trim().match(/^([+-]?\d+(?:\.\d+)?)\s*%?$/);
  if (!m) return undefined;
  const n = Number(m[1]);
  return n === 0 ? 0 : n;
}

// ---------- export → rows ----------

export interface ExportRead { rows: DpmMatchup[]; problems: string[] }

/**
 * Turns the pages into stored rows: roster ids, roles, win rates as fractions, DPM's delta and whether DPM's Full List
 * showed the row. Problems are collected, never fixed: a duplicate, an unknown name or a bad number refuses the whole
 * collection in the ingest.
 */
export function readExport(exp: DpmExport, champions: Champion[]): ExportRead {
  const resolve = championResolver(champions);
  const byId = new Map(champions.map((c) => [c.id, c]));
  const patch = shortPatch(exp.patch);
  const rows: DpmMatchup[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const p of exp.pages) {
    const role = roleOf(p.role);
    const champion = resolve(p.champion);
    if (!role) { problems.push(`unknown role "${p.role}" on ${p.champion}`); continue; }
    if (!champion) { problems.push(`"${p.champion}" (page) is not in the roster`); continue; }
    if (!byId.get(champion)!.roles.includes(role)) problems.push(`${p.champion} does not play ${role} in the roster`);
    if (!/^https:\/\/dpm\.lol\/champions\//.test(p.url)) problems.push(`page URL ${p.url} is not a dpm.lol champion page`);
    for (const m of p.matchups) {
      const enemy = resolve(m.enemy);
      if (!enemy) { problems.push(`"${m.enemy}" (${p.champion} ${role}) is not in the roster`); continue; }
      if (enemy === champion) { problems.push(`${p.champion} listed against itself`); continue; }
      const winRate = m.winRate > 1 ? m.winRate / 100 : m.winRate;
      if (!(winRate > 0 && winRate < 1) || !Number.isInteger(m.games) || m.games <= 0) { problems.push(`bad numbers for ${p.champion} vs ${m.enemy}`); continue; }
      const key = `${role}|${champion}|${enemy}`;
      if (seen.has(key)) { problems.push(`duplicate matchup ${key}`); continue; }
      seen.add(key);
      const delta = parseDelta(m.delta);
      if (m.delta !== undefined && delta === undefined) problems.push(`unreadable delta "${m.delta}" for ${p.champion} vs ${m.enemy}`);
      rows.push({ role, enemy, champion, winRate: Math.round(winRate * 10000) / 10000, ...(delta !== undefined ? { delta } : {}), games: m.games,
        patch, rank: exp.rank, url: p.url, updated: exp.collectedOn, origin: "dpm-ingest", ...(m.inFullList !== undefined ? { shown: m.inFullList } : {}) });
    }
  }
  return { rows, problems };
}

// ---------- validation ----------

export const pageKey = (role: Role, champion: string) => `${role}|${champion}`;
export const poolPages = (pool: PoolEntry[]) => new Set(pool.flatMap((p) => [...p.core, ...p.depth, ...p.flex].map((c) => pageKey(p.role, c))));

export interface ReciprocalPair { role: Role; a: string; b: string; winRateA: number; winRateB: number; gamesA: number; gamesB: number; deviation: number }

/**
 * Pairs both of whose pages list each other in one role. From the same games, A's win rate and B's win rate against each
 * other should sum to 100%; DPM samples each page on its own, so a small difference is sampling, a large one is a
 * perspective or data error. `deviation` is (A + B − 1) in win-rate points.
 */
export function reciprocalPairs(rows: DpmMatchup[]): ReciprocalPair[] {
  const by = new Map(rows.map((r) => [`${r.role}|${r.champion}|${r.enemy}`, r]));
  const out: ReciprocalPair[] = [];
  for (const r of rows) {
    if (r.champion >= r.enemy) continue;
    const back = by.get(`${r.role}|${r.enemy}|${r.champion}`);
    if (!back) continue;
    out.push({ role: r.role, a: r.champion, b: r.enemy, winRateA: r.winRate, winRateB: back.winRate, gamesA: r.games, gamesB: back.games,
      deviation: Math.round((r.winRate + back.winRate - 1) * 10000) / 100 });
  }
  return out;
}

export const RECIPROCAL_MATERIAL_POINTS = 1; // beyond this (win-rate points) a pair is listed for a look, not sampling noise
export const RECIPROCAL_GAMES_MATERIAL = 0.1; // the two pages' samples differ by more than this share

export interface ValidationReport {
  ok: boolean;
  problems: string[]; // refuse the collection
  warnings: string[]; // look, but the data can be stored
  pages: number;
  rows: number;
  missingPages: string[]; // pool champion/roles the export has no page for
  extraPages: string[]; // pages for champion/roles outside the pool
  withDelta: number;
  shown: number; // rows DPM's Full List displayed
  fullListMismatch: { page: string; listed: number; shown: number }[];
  reciprocal: { pairs: number; meanAbsDeviation: number; maxAbsDeviation: number; material: ReciprocalPair[]; gamesMismatch: ReciprocalPair[] };
}

export function validateExport(exp: DpmExport, champions: Champion[], pool: PoolEntry[]): ValidationReport {
  const { rows, problems } = readExport(exp, champions);
  const warnings: string[] = [];
  const want = poolPages(pool);
  const resolve = championResolver(champions);
  const have = new Set(exp.pages.map((p) => pageKey(roleOf(p.role) ?? (p.role as Role), resolve(p.champion) ?? p.champion)));
  const missingPages = [...want].filter((k) => !have.has(k)).sort();
  const extraPages = [...have].filter((k) => !want.has(k)).sort();
  if (missingPages.length) problems.push(`${missingPages.length} pool champion/role page${missingPages.length === 1 ? "" : "s"} missing: ${missingPages.join(", ")}`);
  if (extraPages.length) warnings.push(`pages outside the pool: ${extraPages.join(", ")}`);
  const pageCount = new Map<string, number>();
  for (const p of exp.pages) { const k = `${p.role}|${p.champion}`; pageCount.set(k, (pageCount.get(k) ?? 0) + 1); }
  for (const [k, n] of pageCount) if (n > 1) problems.push(`page ${k} appears ${n} times`);

  const fullListMismatch: ValidationReport["fullListMismatch"] = [];
  for (const p of exp.pages) {
    if (p.fullListRows === undefined) continue;
    const shown = p.matchups.filter((m) => m.inFullList).length;
    if (shown !== p.fullListRows) fullListMismatch.push({ page: `${p.champion} ${p.role}`, listed: p.fullListRows, shown });
  }
  if (fullListMismatch.length) warnings.push(`${fullListMismatch.length} page${fullListMismatch.length === 1 ? "" : "s"} where the Full List count and the rows marked as shown differ`);
  for (const p of exp.pages) for (const m of p.matchups) if (m.delta !== undefined && !m.inFullList) warnings.push(`${p.champion} ${p.role} vs ${m.enemy}: a delta on a row the Full List did not show`);

  const pairs = reciprocalPairs(rows);
  const abs = pairs.map((p) => Math.abs(p.deviation));
  const material = pairs.filter((p) => Math.abs(p.deviation) > RECIPROCAL_MATERIAL_POINTS).sort((x, y) => Math.abs(y.deviation) - Math.abs(x.deviation));
  const gamesMismatch = pairs.filter((p) => Math.abs(p.gamesA - p.gamesB) / Math.max(p.gamesA, p.gamesB) > RECIPROCAL_GAMES_MATERIAL);
  if (material.length) warnings.push(`${material.length} reciprocal pair${material.length === 1 ? "" : "s"} deviate${material.length === 1 ? "s" : ""} by more than ${RECIPROCAL_MATERIAL_POINTS} point${RECIPROCAL_MATERIAL_POINTS === 1 ? "" : "s"} from summing to 100%`);
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return {
    ok: problems.length === 0, problems, warnings, pages: exp.pages.length, rows: rows.length, missingPages, extraPages,
    withDelta: rows.filter((r) => r.delta !== undefined).length, shown: rows.filter((r) => r.shown).length, fullListMismatch,
    reciprocal: { pairs: pairs.length, meanAbsDeviation: pairs.length ? r2(abs.reduce((a, b) => a + b, 0) / pairs.length) : 0, maxAbsDeviation: pairs.length ? r2(Math.max(...abs)) : 0, material, gamesMismatch },
  };
}

// ---------- comparison of two collections ----------

export const qualifies = (r: DpmMatchup) => r.games >= DPM_MIN_GAMES && r.winRate >= DPM_MIN_WIN_RATE;
export const strong = (r: DpmMatchup) => r.games >= DPM_MIN_GAMES && r.winRate >= DPM_STRONG_WIN_RATE;
const rowKey = (r: DpmMatchup) => `${r.role}|${r.champion}|${r.enemy}`;

export interface SnapshotStats {
  patch?: string; collected?: string; rows: number; sampled: number; qualifying: number; strong: number;
  championRolesWithCounter: number; championsWithCounter: number; enemyRolesAnswered: number; enemiesAnswered: number;
  byRole: Record<Role, { rows: number; qualifying: number }>;
}

export function snapshotStats(rows: DpmMatchup[]): SnapshotStats {
  const q = rows.filter(qualifies);
  const byRole = Object.fromEntries(ROLES.map((role) => [role, { rows: rows.filter((r) => r.role === role).length, qualifying: q.filter((r) => r.role === role).length }])) as SnapshotStats["byRole"];
  return {
    patch: rows.map((r) => r.patch).sort(comparePatch).at(-1), collected: rows.map((r) => r.updated).sort().at(-1),
    rows: rows.length, sampled: rows.filter((r) => r.games >= DPM_MIN_GAMES).length, qualifying: q.length, strong: rows.filter(strong).length,
    championRolesWithCounter: new Set(q.map((r) => pageKey(r.role, r.champion))).size, championsWithCounter: new Set(q.map((r) => r.champion)).size,
    enemyRolesAnswered: new Set(q.map((r) => pageKey(r.role, r.enemy))).size, enemiesAnswered: new Set(q.map((r) => r.enemy)).size, byRole,
  };
}

export interface RowChange { role: Role; champion: string; enemy: string; before?: DpmMatchup; after?: DpmMatchup; note: string }

export interface SnapshotComparison {
  before: SnapshotStats; after: SnapshotStats;
  newCounters: RowChange[]; // qualify now, did not before
  lostCounters: RowChange[]; // qualified before, not now
  weakened: RowChange[]; // strong before, favorable now
  strengthened: RowChange[]; // favorable before, strong now
  largestMoves: RowChange[]; // rows sampled in both, by win-rate change
  shared: number; onlyBefore: number; onlyAfter: number;
  gamesGrowth: { median: number; min: number; max: number }; // after / before games on shared rows
}

export function compareSnapshots(before: DpmMatchup[], after: DpmMatchup[], top = 15): SnapshotComparison {
  const b = new Map(before.map((r) => [rowKey(r), r]));
  const a = new Map(after.map((r) => [rowKey(r), r]));
  const pts = (x: number) => `${(x * 100).toFixed(1)}%`;
  const why = (r: DpmMatchup | undefined) => !r ? "not listed" : r.games < DPM_MIN_GAMES ? `${r.games} games` : r.winRate < DPM_MIN_WIN_RATE ? `${pts(r.winRate)} win rate` : "qualifying";
  const change = (role: Role, champion: string, enemy: string, x: DpmMatchup | undefined, y: DpmMatchup | undefined, note: string): RowChange => ({ role, champion, enemy, before: x, after: y, note });
  const newCounters: RowChange[] = [], lostCounters: RowChange[] = [], weakened: RowChange[] = [], strengthened: RowChange[] = [], moves: RowChange[] = [];
  const ratios: number[] = [];
  let shared = 0;
  for (const [k, y] of a) {
    const x = b.get(k);
    if (x) { shared++; ratios.push(y.games / x.games); }
    if (qualifies(y) && !(x && qualifies(x))) newCounters.push(change(y.role, y.champion, y.enemy, x, y, `before: ${why(x)}; now ${pts(y.winRate)} over ${y.games}`));
    if (x && qualifies(x) && qualifies(y)) {
      if (strong(x) && !strong(y)) weakened.push(change(y.role, y.champion, y.enemy, x, y, `${pts(x.winRate)} → ${pts(y.winRate)}`));
      if (!strong(x) && strong(y)) strengthened.push(change(y.role, y.champion, y.enemy, x, y, `${pts(x.winRate)} → ${pts(y.winRate)}`));
    }
    if (x && x.games >= DPM_MIN_GAMES && y.games >= DPM_MIN_GAMES) moves.push(change(y.role, y.champion, y.enemy, x, y, `${pts(x.winRate)} (${x.games}) → ${pts(y.winRate)} (${y.games})`));
  }
  for (const [k, x] of b) {
    const y = a.get(k);
    if (qualifies(x) && !(y && qualifies(y))) lostCounters.push(change(x.role, x.champion, x.enemy, x, y, `was ${pts(x.winRate)} over ${x.games}; now ${why(y)}`));
  }
  const delta = (c: RowChange) => Math.abs(c.after!.winRate - c.before!.winRate);
  moves.sort((p, q) => delta(q) - delta(p));
  const sorted = [...ratios].sort((p, q) => p - q);
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return {
    before: snapshotStats(before), after: snapshotStats(after), newCounters, lostCounters, weakened, strengthened, largestMoves: moves.slice(0, top),
    shared, onlyBefore: before.length - shared, onlyAfter: after.length - shared,
    gamesGrowth: sorted.length ? { median: r2(sorted[Math.floor(sorted.length / 2)]), min: r2(sorted[0]), max: r2(sorted.at(-1)!) } : { median: 0, min: 0, max: 0 },
  };
}

/** The export's pages as the ingest reads them, for reports. */
export const pageOf = (p: DpmExportPage) => `${p.champion} ${p.role}`;
