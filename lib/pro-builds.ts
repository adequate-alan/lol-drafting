// Pro Builds (alan, 2026-10-12): how professionals built and levelled a champion in recorded games. Observed Pro
// Evidence only: nothing here scores, ranks or touches saved pairings, pool tiers or Comp Check.
//
// Two kinds of answer, never mixed:
//   observed game  - exactly what one player used in one game (data/pro-builds.json, from Gol.gg)
//   common build   - counts across the games in an explicit scope (champion, role, tournament, patch): how many games
//                    showed each keystone, item, max order and spell pair. Never presented as one player's build, never
//                    called optimal.
// Summaries below (starting items, boots, core, max order) are read from one game's purchase log and skill order; they
// are labelled as derived, and say so when the log is incomplete.
import { comparePatch, samePatch } from "./patch";
import type { PatchAssets, ProBuild, ProGame, Role } from "./schema";

export type Skill = "Q" | "W" | "E" | "R";
export const BASIC: Skill[] = ["Q", "W", "E"];
export const DDRAGON = "https://ddragon.leagueoflegends.com";

/** One build with the game it came from: tournament, patch, date, teams, result and the lane opponent. */
export interface BuildRow {
  key: string;
  build: ProBuild;
  game: Pick<ProGame, "id" | "event" | "tournament" | "series" | "game" | "stage" | "date" | "patch" | "url">;
  side: "blue" | "red"; // the side this player's team had in this game (Gol.gg game page)
  team: string;
  opponentTeam: string;
  won: boolean;
  opponent?: { champion: string; player?: string }; // same role on the other side
  assets?: PatchAssets; // this game's patch
}

export function buildRows(builds: ProBuild[], games: ProGame[], assets: Record<string, PatchAssets>): BuildRow[] {
  const byGame = new Map(games.map((g) => [g.id, g]));
  const byPlayer = new Map(builds.map((b) => [`${b.game}-${b.side}-${b.role}`, b]));
  const rows: BuildRow[] = [];
  for (const b of builds) {
    const g = byGame.get(b.game);
    if (!g) continue;
    const other = b.side === "blue" ? "red" : "blue";
    const opp = g[other].picks[b.role];
    rows.push({
      key: `${b.game}-${b.side}-${b.role}`, build: b,
      game: { id: g.id, event: g.event, tournament: g.tournament, series: g.series, game: g.game, stage: g.stage, date: g.date, patch: g.patch, url: g.url },
      side: b.side, team: g[b.side].team, opponentTeam: g[other].team, won: g.winner === b.side,
      opponent: opp ? { champion: opp, player: byPlayer.get(`${b.game}-${other}-${b.role}`)?.player } : undefined,
      assets: assets[g.patch],
    });
  }
  // Newest first: date, then game id.
  return rows.sort((a, b) => b.game.date.localeCompare(a.game.date) || b.game.id - a.game.id);
}

export const rowsFor = (rows: BuildRow[], champion: string, role: Role) => rows.filter((r) => r.build.champion === champion && r.build.role === role);

/** Link to the Pro Builds page with a champion and role preselected, optionally one recorded game. */
export const buildsHref = (champion: string, role: Role, game?: number) =>
  `/pro-builds/?champion=${champion}&role=${role}${game ? `&game=${game}` : ""}`;

/** The filters of the Pro Builds page. Patches compare in either notation (26.18 = 16.18). Empty means any. */
export interface BuildScope { champion?: string; role?: Role; event?: string; patch?: string; team?: string; player?: string }
export const inScope = (r: BuildRow, s: BuildScope) =>
  (!s.champion || r.build.champion === s.champion) && (!s.role || r.build.role === s.role) && (!s.event || r.game.event === s.event)
  && (!s.patch || samePatch(r.game.patch, s.patch)) && (!s.team || r.team === s.team) && (!s.player || r.build.player === s.player);
export const scoped = (rows: BuildRow[], s: BuildScope) => rows.filter((r) => inScope(r, s));

/** One entry per champion and role with recorded builds: game count, players and the newest patch. */
export interface ChampionBuilds { champion: string; role: Role; games: number; players: number; names: string[]; latest: string; lastPlayed: string }
export function championIndex(builds: Pick<ProBuild, "champion" | "role" | "player" | "game">[], games: Pick<ProGame, "id" | "patch" | "date">[]): ChampionBuilds[] {
  const byGame = new Map(games.map((g) => [g.id, g]));
  const m = new Map<string, { champion: string; role: Role; games: number; players: Set<string>; latest: string; lastPlayed: string }>();
  for (const b of builds) {
    const g = byGame.get(b.game);
    if (!g) continue;
    const k = `${b.champion}|${b.role}`;
    const e = m.get(k) ?? { champion: b.champion, role: b.role, games: 0, players: new Set<string>(), latest: g.patch, lastPlayed: g.date };
    e.games += 1; e.players.add(b.player);
    if (comparePatch(g.patch, e.latest) > 0) e.latest = g.patch;
    if (g.date > e.lastPlayed) e.lastPlayed = g.date;
    m.set(k, e);
  }
  return [...m.values()].map((e) => ({ ...e, players: e.players.size, names: [...e.players].sort() })).sort((a, b) => b.games - a.games || a.champion.localeCompare(b.champion));
}

// ---------- icons (Riot Data Dragon, the game patch's version) ----------
export const itemIcon = (a: PatchAssets, id: number) => `${DDRAGON}/cdn/${a.ddragon}/img/item/${id}.png`;
export const spellIcon = (a: PatchAssets, id: number) => (a.spells[id] ? `${DDRAGON}/cdn/${a.ddragon}/img/spell/${a.spells[id].icon}` : undefined);
export const abilityIcon = (a: PatchAssets, champion: string, k: Skill) => (a.abilities[champion] ? `${DDRAGON}/cdn/${a.ddragon}/img/spell/${a.abilities[champion][k].icon}` : undefined);
// Rune and tree artwork is not versioned on Data Dragon (cdn/img/perk-images/...).
export const runeIcon = (icon: string) => `${DDRAGON}/cdn/img/${icon}`;

export const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

/** Item hover text: name, cost, stats. Plain text for the shared tip layer. */
export function itemTip(a: PatchAssets | undefined, id: number, extra?: string): string {
  const it = a?.items[id];
  if (!it) return [`Item ${id}`, extra].filter(Boolean).join("\n");
  return [`${it.name} · ${it.gold} gold`, ...(it.stats ?? []), it.stats?.length ? undefined : it.text, extra].filter(Boolean).join("\n");
}

// ---------- skills ----------
export interface SkillSummary {
  order: Skill[]; // basic abilities by the level they were maxed, then the rest by points
  maxed: Skill[]; // which of `order` reached max rank in the recorded levels
  levels: number; // recorded ability points (one per champion level for most champions)
  points: Record<Skill, number>;
  first: Skill[]; // first three levels
}

/** Max order from the recorded level-ups. Max ranks come from Data Dragon (they differ for some champions). */
export function skillSummary(skills: string, maxrank?: Partial<Record<Skill, number>>): SkillSummary {
  const seq = [...skills] as Skill[];
  const points: Record<Skill, number> = { Q: 0, W: 0, E: 0, R: 0 };
  const maxedAt = new Map<Skill, number>(), firstAt = new Map<Skill, number>();
  seq.forEach((k, i) => {
    points[k] += 1;
    if (!firstAt.has(k)) firstAt.set(k, i);
    if (points[k] === (maxrank?.[k] ?? (k === "R" ? 3 : 5)) && !maxedAt.has(k)) maxedAt.set(k, i);
  });
  const basics = BASIC.filter((k) => points[k] > 0);
  const order = [
    ...basics.filter((k) => maxedAt.has(k)).sort((a, b) => maxedAt.get(a)! - maxedAt.get(b)!),
    ...basics.filter((k) => !maxedAt.has(k)).sort((a, b) => points[b] - points[a] || firstAt.get(a)! - firstAt.get(b)!),
  ];
  return { order, maxed: order.filter((k) => maxedAt.has(k)), levels: seq.length, points, first: seq.slice(0, 3) };
}

// ---------- items ----------
export interface Overview {
  starting: number[];
  boots?: number;
  first?: number; // first completed item
  core: number[]; // first three completed items, in purchase order
  later: number[]; // completed items after those (shown as situational: what this game called for after the core)
  sold: Set<number>;
  complete: boolean; // false when the purchase log is missing
}

/** Starting items, boots, core and later completed items, read in order from one game's purchase log. */
export function overview(b: ProBuild, a: PatchAssets | undefined): Overview {
  const log = b.purchases ?? [];
  const kind = (id: number) => a?.items[id]?.kind;
  const t0 = log[0]?.[0] ?? 0;
  // Starting items: what was bought before leaving base (the first minute and a half).
  const starting = log.filter(([t, , e]) => e === "buy" && t <= Math.max(90, t0)).map(([, id]) => id);
  const bought = log.filter(([, , e]) => e === "buy").map(([, id]) => id);
  const boots = [...bought].reverse().find((id) => kind(id) === "boots" && (a?.items[id]?.gold ?? 0) > 300) ?? bought.find((id) => kind(id) === "boots");
  const completed = [...new Set(bought.filter((id) => kind(id) === "completed"))];
  return { starting, boots, first: completed[0], core: completed.slice(0, 3), later: completed.slice(3), sold: new Set(log.filter(([, , e]) => e === "sell").map(([, id]) => id)), complete: log.length > 0 };
}

export type ItemKind = PatchAssets["items"][string]["kind"];
export interface ShopVisit { at: number; steps: { item: number; sold: boolean; at: number; kind?: ItemKind }[] }

/** The purchase log grouped into shop visits: steps less than 40 seconds apart belong to one visit, in game order. */
export function shopVisits(b: ProBuild, a?: PatchAssets): ShopVisit[] {
  const out: ShopVisit[] = [];
  let last = -Infinity;
  for (const [t, item, e] of b.purchases ?? []) {
    if (t - last > 40 || !out.length) out.push({ at: t, steps: [] });
    out[out.length - 1].steps.push({ item, sold: e === "sell", at: t, kind: a?.items[item]?.kind });
    last = t;
  }
  return out;
}

// ---------- common build across games (aggregate) ----------
export interface Count<T> { value: T; games: number }
/** A full rune page: both trees, keystone, the three minor and two secondary runes, the shards when recorded. */
export type FullRunes = Required<Pick<NonNullable<ProBuild["runes"]>, "primary" | "keystone" | "primaryRunes" | "secondary" | "secondaryRunes">> & { shards?: number[] };
export const fullRunes = (r?: ProBuild["runes"]): FullRunes | undefined =>
  r && r.primaryRunes?.length === 3 && r.secondary != null && r.secondaryRunes?.length === 2 ? (r as FullRunes) : undefined;

/** Each field counts only the games that recorded it; `of` is that field's sample. */
export interface Tally<T> { of: number; counts: Count<T>[] }
export interface Common {
  games: number;
  players: string[];
  patches: string[];
  events: string[];
  keystones: Tally<number>; // every game with a keystone recorded
  runePages: Tally<FullRunes>; // only games with the complete page (trees, keystone, 3 + 2 runes, shards)
  primaryTrees: Tally<number>;
  secondaryTrees: Tally<number>; // complete pages only
  starting: Tally<number[]>;
  firstItems: Tally<number>;
  items: Tally<number>; // completed items: in how many games each was bought
  boots: Tally<number>;
  maxOrders: Tally<string>;
  spells: Tally<[number, number]>;
  assets?: PatchAssets; // newest patch in scope, for names and icons
}

const tally = <T,>(values: T[], key: (v: T) => string = String): Count<T>[] => {
  const m = new Map<string, Count<T>>();
  for (const v of values) { const k = key(v); const c = m.get(k); if (c) c.games += 1; else m.set(k, { value: v, games: 1 }); }
  return [...m.values()].sort((a, b) => b.games - a.games);
};
const over = <R, T>(rows: R[], value: (r: R) => T | undefined, key?: (v: T) => string): Tally<T> => {
  const vs = rows.map(value).filter((v): v is T => v !== undefined);
  return { of: vs.length, counts: tally(vs, key) };
};
export const pageKey = (p: FullRunes) => [p.primary, p.keystone, ...p.primaryRunes, p.secondary, ...p.secondaryRunes, ...(p.shards ?? [])].join(".");

/** Counts across the given games. Each count is "games that showed it", never a share of purchases. */
export function common(rows: BuildRow[]): Common {
  const kind = (r: BuildRow, id: number) => r.assets?.items[id]?.kind;
  const withLog = rows.filter((r) => r.build.purchases?.length);
  // Full rune aggregates only from games whose page is complete, shards included: a missing field is never assumed.
  const complete = rows.filter((r) => fullRunes(r.build.runes) && r.build.runes!.shards);
  const completed = (r: BuildRow) => [...new Set(r.build.purchases!.filter(([, id, e]) => e === "buy" && kind(r, id) === "completed").map(([, id]) => id))];
  const newest = [...rows].sort((a, b) => comparePatch(b.game.patch, a.game.patch))[0];
  return {
    games: rows.length,
    players: [...new Set(rows.map((r) => r.build.player))],
    patches: [...new Set(rows.map((r) => r.game.patch))],
    events: [...new Set(rows.map((r) => r.game.tournament))],
    keystones: over(rows, (r) => r.build.runes?.keystone),
    runePages: over(complete, (r) => fullRunes(r.build.runes), pageKey),
    primaryTrees: over(rows, (r) => r.build.runes?.primary),
    secondaryTrees: over(complete, (r) => r.build.runes?.secondary),
    starting: over(withLog, (r) => overview(r.build, r.assets).starting.slice().sort((a, b) => a - b), (v) => v.join("+")),
    firstItems: over(withLog, (r) => overview(r.build, r.assets).first),
    items: { of: withLog.length, counts: tally(withLog.flatMap(completed)) },
    boots: over(withLog, (r) => overview(r.build, r.assets).boots),
    maxOrders: over(rows, (r) => (r.build.skills ? skillSummary(r.build.skills, maxRanks(r)).order.join(" → ") : undefined)),
    spells: over(rows, (r) => (r.build.spells ? [...r.build.spells].sort((a, b) => a - b) as [number, number] : undefined), (v) => v.join("+")),
    assets: newest?.assets,
  };
}

export function maxRanks(r: BuildRow): Partial<Record<Skill, number>> | undefined {
  const ab = r.assets?.abilities[r.build.champion];
  return ab ? { Q: ab.Q.maxrank, W: ab.W.maxrank, E: ab.E.maxrank, R: ab.R.maxrank } : undefined;
}

/** Assets for an id from whichever patch in scope names it (common builds can span patches when the scope says so). */
export function anyAssets(rows: BuildRow[], has: (a: PatchAssets) => boolean): PatchAssets | undefined {
  return rows.map((r) => r.assets).find((a): a is PatchAssets => !!a && has(a));
}
