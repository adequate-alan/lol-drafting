// Pro meta starting picks (alan, 2026-10-13): what the Draft Room shows for a role before anything is locked, and the
// pro-meta signal it keeps on every row after that. Observed Pro Evidence only, from verified data:
//
//   - Pro priority: champion-wide pick / ban presence on one patch (lib/pro-priority.ts bucket, same denominators).
//   - Role picks: picks recorded in the role on that patch.
//   - First rotation: role picks made within the team's first three picks (B1–B3 / R1–R3), read from the team's
//     recorded pick order (`pickOrder`). Never the final lineup, and never the same thing as first overall pick.
//   - First overall pick and observed blind / response: need the draft's interleaved order (who picked first), which
//     the pick-order engine reads. Without a verified read a pick is "unclassified", never guessed.
//
// Nothing here is a score. Starting picks are ordered by the real counts they show (see `startingOrder`), and once a
// pick is locked the Draft Room's own order (saved pairing, then comp fit) takes over; these stay labels.
import { tierLabel, poolTier } from "./counters";
import type { Tier } from "./pool-stats";
import { bucket, DRAFT_LABEL_MIN, forRole, patchesOf, rolePicksOf, type Bucket, type PriorityData } from "./pro-priority";
import { ROLES, type PoolEntry, type ProGame, type Role } from "./schema";
import { LANE_ROLES, laneSelections, roleBook, turnOf, type LaneSelection } from "./top-draft";

export const FIRST_ROTATION = 3; // a team's first three picks
export { tierLabel };

/** What the pick-order engine can say about one recorded pick. Undefined fields are unverified, never assumed. */
export interface PickRead {
  firstOverall?: boolean; // the draft's first pick (needs the first-pick side)
  situation: "blind" | "response" | "uncertain"; // enemy pick in the same role still hidden / already revealed
  revealed?: string[]; // enemy champions visible when this pick was made
  laneOpponent?: string;
}
/** The pick-order engine (owned by the Top lane analysis), plugged in here; without it nothing is classified. */
export type PickReader = (game: ProGame, side: "blue" | "red", role: Role) => PickRead | undefined;

export interface StartGame {
  game: number; event: string; patch: string; date: string; stage?: string; series: string; gameNo: number;
  side: "blue" | "red"; team: string; opponent: string; won: boolean;
  teamPick?: number; // 1-5 in the team's recorded order
  read?: PickRead;
  draftId: string; // pro-drafts id (golgg-<game>-<side>) for links
  url: string; // the Gol.gg game page
}

export interface StartingPick {
  champion: string;
  role: Role;
  patch: string;
  tier: Tier | null; // alan's pool tier in this role
  rolePicks: number | undefined; // undefined: picks are champion-wide only (a table without verified roles)
  picks: number; bans: number; present: number; presence: number | null; banGames: number; patchGames: number; low: boolean;
  priority: boolean; // presence at or above the Draft Room line, with picks in this role
  ordered: number; // role picks with the team's pick order recorded
  firstRotation: number; // of those, within the team's first three picks
  later: number; // of those, after the team's first three
  classified: number; // role picks the engine read as blind or response
  firstOverall: number | null; blind: number | null; response: number | null; // null: no verified read at all
  games: StartGame[]; // recorded games behind the role picks, newest first
}

export interface StartingScope { patch: string; tournaments?: string[]; games: number; recorded: number; orderGames: number; tableGames: number; events: string[] }

/** The newest patch with usable pro evidence (any picks recorded), optionally restricted to tournaments. */
export function defaultPatch(d: PriorityData, tournaments?: string[]): string | undefined {
  return patchesOf(d, tournaments).find((p) => bucket(d, { patch: p, tournaments }).rows.some((r) => r.picks > 0));
}

const recordsOf = (b: Bucket) => b.contributions.flatMap((c) => (c.kind === "games" ? c.records : []));

/**
 * Every champion with picks in the role on the patch (or a table naming the role), with the counts above.
 * `reader` is the pick-order engine; without it blind / response / first overall stay unclassified.
 */
export function startingPicks(d: PriorityData, pool: PoolEntry[], role: Role, patch: string, opts: { tournaments?: string[]; reader?: PickReader } = {}): { scope: StartingScope; rows: StartingPick[] } {
  const b = bucket(d, { patch, tournaments: opts.tournaments });
  const records = recordsOf(b);
  const rows = forRole(b.rows, role).map((r): StartingPick => {
    const games: StartGame[] = [];
    for (const g of records) for (const side of ["blue", "red"] as const) {
      if (g[side].picks[role] !== r.id) continue;
      const other = side === "blue" ? "red" : "blue";
      const order = g[side].pickOrder?.indexOf(r.id);
      games.push({
        game: g.id, event: g.event, patch: g.patch, date: g.date, stage: g.stage, series: g.series, gameNo: g.game,
        side, team: g[side].team, opponent: g[other].team, won: g.winner === side,
        teamPick: order != null && order >= 0 ? order + 1 : undefined, read: opts.reader?.(g, side, role), draftId: `golgg-${g.id}-${side}`, url: g.url,
      });
    }
    games.sort((a, x) => x.date.localeCompare(a.date) || x.game - a.game);
    const ordered = games.filter((g) => g.teamPick);
    const reads = games.filter((g) => g.read);
    const classified = reads.filter((g) => g.read!.situation !== "uncertain");
    const firstKnown = reads.filter((g) => g.read!.firstOverall !== undefined);
    const rolePicks = rolePicksOf(r, role);
    return {
      champion: r.id, role, patch, tier: poolTier(pool, r.id, role), rolePicks,
      picks: r.picks, bans: r.bans, present: r.present, presence: r.presence, banGames: b.banGames, patchGames: b.games, low: r.low,
      priority: (r.presence ?? 0) >= DRAFT_LABEL_MIN && (r.rolePicks[role] ?? 0) > 0,
      ordered: ordered.length,
      firstRotation: ordered.filter((g) => g.teamPick! <= FIRST_ROTATION).length,
      later: ordered.filter((g) => g.teamPick! > FIRST_ROTATION).length,
      classified: classified.length,
      firstOverall: firstKnown.length ? firstKnown.filter((g) => g.read!.firstOverall).length : null,
      blind: classified.length ? classified.filter((g) => g.read!.situation === "blind").length : null,
      response: classified.length ? classified.filter((g) => g.read!.situation === "response").length : null,
      games,
    };
  });
  const events = [...new Set(b.contributions.map((c) => c.event))];
  return { scope: { patch, tournaments: opts.tournaments, games: b.games, recorded: b.recorded, orderGames: b.orderGames, tableGames: b.tableGames, events }, rows: startingOrder(rows) };
}

/**
 * The reader built on the pick-order engine (lib/top-draft.ts, Gol.gg's First Pick mark; never the side): first overall
 * for every role from the rebuilt turns, blind / response for Top, Mid, Bot and Support from their classification (alan,
 * 2026-10-13). Jungle stays unclassified.
 */
export function engineReader(games: ProGame[], champions: { id: string; roles: Role[] }[]): PickReader {
  const book = roleBook(champions, games);
  const lanes = new Map<string, LaneSelection>(LANE_ROLES.flatMap((r) => laneSelections(games, book, r).map((s) => [`${s.game}:${s.side}:${r}`, s] as const)));
  return (g, side, role) => {
    const idx = g[side].pickOrder?.indexOf(g[side].picks[role]);
    const firstOverall = g.firstPick && idx != null && idx >= 0 ? turnOf(idx, g.firstPick === side) === 1 : undefined;
    const t = lanes.get(`${g.id}:${side}:${role}`);
    if (t) return { situation: t.usage, firstOverall, revealed: t.enemySeen, laneOpponent: t.laneOpponent };
    return firstOverall === undefined ? undefined : { situation: "uncertain", firstOverall };
  };
}

// ---------- order and filters (zero locked picks only) ----------

export type StartView = "all" | "rotation" | "blind" | "priority";

/**
 * Recommended order, from real counts only: champions in alan's pool for the role first (Core, Depth, Prepared / flex
 * alike), then everyone else, each group by first-rotation picks, then role picks, then presence. No weighting.
 */
export function startingOrder(rows: StartingPick[]): StartingPick[] {
  return [...rows].sort((a, b) => Number(!a.tier) - Number(!b.tier)
    || b.firstRotation - a.firstRotation || (b.rolePicks ?? 0) - (a.rolePicks ?? 0) || (b.presence ?? 0) - (a.presence ?? 0) || a.champion.localeCompare(b.champion));
}

export const hasStart = (s: StartingPick | null | undefined, v: StartView) =>
  !!s && (v === "all" || (v === "rotation" ? s.firstRotation > 0 : v === "blind" ? (s.blind ?? 0) > 0 : s.priority));

/** A filter's own order: its count first, so "First rotation" lists the most first-rotation picks first. */
export function sortForView(rows: StartingPick[], v: StartView): StartingPick[] {
  if (v === "all") return rows;
  const key = (s: StartingPick) => (v === "rotation" ? s.firstRotation : v === "blind" ? s.blind ?? 0 : s.presence ?? 0);
  return [...rows].filter((s) => hasStart(s, v)).sort((a, b) => key(b) - key(a) || (b.rolePicks ?? 0) - (a.rolePicks ?? 0) || a.champion.localeCompare(b.champion));
}

// ---------- copy ----------

const pct = (n: number) => `${Math.round(n * 100)}%`;
export const ratio = (n: number, of: number) => `${n} of ${of}`;

/** One line with the counts behind the row, in the role and on the patch. */
export function startLine(s: StartingPick, roleName: string, rotation = true): string {
  const parts: string[] = [];
  parts.push(s.rolePicks != null ? `${s.rolePicks} ${roleName.toLowerCase()} pick${s.rolePicks === 1 ? "" : "s"}` : `${s.picks} picks, all roles`);
  if (rotation && s.ordered) parts.push(`${ratio(s.firstRotation, s.ordered)} in the team's first three`);
  if (s.presence != null) parts.push(`${pct(s.presence)} presence (${s.picks} picks, ${s.bans} bans)`);
  if (s.low) parts.push("small sample");
  return parts.join(" · ");
}

export const blindLabel = (s: StartingPick) => (s.blind == null ? undefined : `Blind · ${ratio(s.blind, s.classified)}`);
// Always the actual fraction (alan, 2026-10-13): "First rotation · 8/10 (80%)". A count, never a claim of blind safety.
export const rotationLabel = (s: StartingPick) => (s.ordered ? `First rotation · ${s.firstRotation}/${s.ordered} (${pct(s.firstRotation / s.ordered)})` : undefined);
export const ROLE_NAMES = Object.fromEntries(ROLES.map((r) => [r, r[0] + r.slice(1).toLowerCase()])) as Record<Role, string>;
