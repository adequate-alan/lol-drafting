// Pick-order statistics for Pro Drafts (alan, 2026-10-24): how often each champion was taken in each draft rotation and at
// each exact pick position, first-pick priority, blue / red differences, and how that moves across teams, patches and
// tournament stages. Grouped by rotation by default, with the exact turns as a drill-down (alan's choice, 2026-10-24).
//
// Only verified chronological records count: a game enters only with Gol.gg's First Pick mark and both teams' `pickOrder`
// (the order the game page draws the turns). Order is never inferred from a final composition, a role order or a side;
// a game without those facts is counted as excluded and named in the coverage line. Turns follow lib/top-draft.ts:
// F1 S1 S2 F2 F3 S3 | bans | S4 F4 F5 S5. Two picks in one turn share a position ("Picks 2–3"), never ordered.
//
// Priority and success are different things: every count here is about when a champion was taken, and the win-loss
// record is shown beside it as context only. It never sorts, filters or labels a champion as a priority pick. Observed Pro
// Evidence only: nothing here scores, orders or changes the Draft Room, saved pairings or pool tiers. Every count names
// its sample, and a champion with fewer than 5 ordered picks is a small sample.
import { comparePatchDesc } from "./evidence";
import { patchKey } from "./patch";
import { stageLabel } from "./pro-games";
import { ROLES, type Role } from "./schema";
import { scopeKey } from "./tournament-scope";
import { FIRST_TURNS, rotationOf, type Rotation } from "./top-draft";

export const SMALL_SAMPLE = 5;

type Side = "blue" | "red";

/** The compact game record the page passes to the browser: only what pick-order statistics read. */
export interface OrderGame {
  id: number; event: string; tournament: string; stage?: string; patch: string; date: string;
  seriesId: number; series: string; winner: Side; firstPick?: Side;
  blue: { team: string; order?: string[]; picks: Partial<Record<Role, string>> };
  red: { team: string; order?: string[]; picks: Partial<Record<Role, string>> };
}

type RecordSide = { team: string; pickOrder?: string[]; picks: Partial<Record<Role, string>> };
export const orderGame = (g: {
  id: number; event: string; tournament: string; stage?: string; patch: string; date: string; seriesId: number; series: string;
  winner: Side; firstPick?: Side; blue: RecordSide; red: RecordSide;
}): OrderGame => {
  const side = (s: RecordSide) => ({ team: s.team, ...(s.pickOrder ? { order: s.pickOrder } : {}), picks: s.picks });
  return { id: g.id, event: g.event, tournament: g.tournament, ...(g.stage ? { stage: g.stage } : {}), patch: g.patch, date: g.date,
    seriesId: g.seriesId, series: g.series, winner: g.winner, ...(g.firstPick ? { firstPick: g.firstPick } : {}), blue: side(g.blue), red: side(g.red) };
};

/** A game's draft order is verified when Gol.gg marks the first-picking team and draws both teams' turns. */
export const isOrdered = (g: OrderGame) => !!g.firstPick && !!g.blue.order && !!g.red.order;

// Exact positions: the global turns 1-10 grouped as the draft draws them (a paired turn is one position).
export const SLOTS = ["1", "2-3", "4-5", "6", "7", "8-9", "10"] as const;
export type Slot = (typeof SLOTS)[number];
export const slotOf = (turn: number): Slot => SLOTS.find((s) => s.split("-").map(Number).includes(turn))!;
/** Who picks at a position: the first-picking team at 1, 4-5, 8-9; the other team at 2-3, 6, 7, 10. */
export const slotTeam = (s: Slot): "first" | "second" => ((FIRST_TURNS as readonly number[]).includes(Number(s.split("-")[0])) ? "first" : "second");
export const SLOT_LABEL: Record<Slot, string> = {
  "1": "Pick 1 · first pick", "2-3": "Picks 2–3", "4-5": "Picks 4–5", "6": "Pick 6", "7": "Pick 7", "8-9": "Picks 8–9", "10": "Pick 10 · last pick",
};

export interface OrderedPick {
  game: number; seriesId: number; champion: string; role?: Role; side: Side; team: string; opponent: string;
  firstPicker: boolean; turn: number; slot: Slot; rotation: Rotation; won: boolean;
  patch: string; tournament: string; stage: string; scope: string; date: string; series: string;
}

/** Every pick of every verified game, with its turn; games without verified order are left out (see `coverage`). */
export function orderedPicks(games: OrderGame[]): OrderedPick[] {
  return games.filter(isOrdered).flatMap((g) => (["blue", "red"] as const).flatMap((side) => {
    const me = g[side], them = g[side === "blue" ? "red" : "blue"], first = g.firstPick === side;
    const turns = first ? FIRST_TURNS : [2, 3, 6, 7, 10];
    return me.order!.map((champion, i): OrderedPick => ({
      game: g.id, seriesId: g.seriesId, champion, role: ROLES.find((r) => me.picks[r] === champion), side, team: me.team, opponent: them.team,
      firstPicker: first, turn: turns[i], slot: slotOf(turns[i]), rotation: rotationOf(turns[i]), won: g.winner === side,
      patch: g.patch, tournament: g.tournament, stage: stageLabel(g.stage), scope: scopeKey(g.event, g.stage), date: g.date, series: g.series,
    }));
  }));
}

// A position filter: a rotation (the default grouping) or an exact position (the drill-down).
export type Position = Rotation | `slot:${Slot}`;
export const atPosition = (p: OrderedPick, pos?: Position) =>
  !pos || (pos.startsWith("slot:") ? p.slot === pos.slice(5) : p.rotation === pos);

export interface PickFilter {
  team?: string; champion?: string; role?: string; tournament?: string; stage?: string; patch?: string;
  side?: "blue" | "red" | "first" | "second";
}
/** The picks a filter keeps. Team and side read the picking team; champion and role the pick itself; stage is the game
 *  record's Gol.gg stage ("Round 4"). */
export function filterPicks(all: OrderedPick[], f: PickFilter): OrderedPick[] {
  return all.filter((p) => (!f.team || p.team === f.team) && (!f.tournament || p.tournament === f.tournament) && (!f.stage || p.stage === f.stage)
    && (!f.patch || patchKey(p.patch) === patchKey(f.patch)) && (!f.role || p.role === f.role) && (!f.champion || p.champion === f.champion)
    && (!f.side || (f.side === "first" ? p.firstPicker : f.side === "second" ? !p.firstPicker : p.side === f.side)));
}

export interface Tally { picks: number; first: number; second: number; last: number; firstOverall: number; wins: number }
const tally = (ps: OrderedPick[]): Tally => ({
  picks: ps.length,
  first: ps.filter((p) => p.rotation === "first").length,
  second: ps.filter((p) => p.rotation === "second").length,
  last: ps.filter((p) => p.rotation === "last").length,
  firstOverall: ps.filter((p) => p.turn === 1).length,
  wins: ps.filter((p) => p.won).length,
});

export interface PickRow extends Tally {
  champion: string;
  roles: Role[]; // roles played in these picks, most picks first
  at: number; // picks at the chosen position (equals picks with no position)
  blue: Tally; red: Tally;
  slots: Record<Slot, number>;
  series: number; // distinct series
  small: boolean; // fewer than SMALL_SAMPLE ordered picks
}

export type PickSort = "at" | "picks" | "first" | "firstOverall" | "last";

/** One row per champion picked in the filtered sample. With a position, only champions taken there, by that count.
 *  Never sorted by wins: a champion's win-loss record is context, not priority. */
export function pickRows(picks: OrderedPick[], pos?: Position, sort: PickSort = "at"): PickRow[] {
  const by = new Map<string, OrderedPick[]>();
  for (const p of picks) by.set(p.champion, [...(by.get(p.champion) ?? []), p]);
  const rows = [...by].map(([champion, ps]): PickRow => {
    const roleCount = new Map<Role, number>();
    for (const p of ps) if (p.role) roleCount.set(p.role, (roleCount.get(p.role) ?? 0) + 1);
    return {
      champion, ...tally(ps),
      roles: [...roleCount].sort((a, b) => b[1] - a[1]).map(([r]) => r),
      at: ps.filter((p) => atPosition(p, pos)).length,
      blue: tally(ps.filter((p) => p.side === "blue")), red: tally(ps.filter((p) => p.side === "red")),
      slots: Object.fromEntries(SLOTS.map((s) => [s, ps.filter((p) => p.slot === s).length])) as Record<Slot, number>,
      series: new Set(ps.map((p) => p.seriesId)).size,
      small: ps.length < SMALL_SAMPLE,
    };
  }).filter((r) => r.at > 0);
  const key = (r: PickRow) => r[sort === "at" ? "at" : sort];
  return rows.sort((a, b) => key(b) - key(a) || b.at - a.at || b.picks - a.picks || a.champion.localeCompare(b.champion));
}

/** How a champion's picks split across one dimension, each line with its own sample: newest patch first, stages and
 *  teams by picks. */
export type Dimension = "patch" | "scope" | "team";
export interface BreakdownLine extends Tally { key: string; at: number; small: boolean }
export function breakdown(picks: OrderedPick[], champion: string, dim: Dimension, pos?: Position): BreakdownLine[] {
  const by = new Map<string, OrderedPick[]>();
  for (const p of picks) if (p.champion === champion) {
    const k = dim === "patch" ? patchKey(p.patch) : p[dim];
    by.set(k, [...(by.get(k) ?? []), p]);
  }
  const lines = [...by].map(([key, ps]) => ({ key, ...tally(ps), at: ps.filter((p) => atPosition(p, pos)).length, small: ps.length < SMALL_SAMPLE }));
  return dim === "patch" ? lines.sort((a, b) => comparePatchDesc(a.key, b.key)) : lines.sort((a, b) => b.picks - a.picks || a.key.localeCompare(b.key));
}

/** The games behind the statistics: verified games in the filter's tournament, stage, patch and team, and the games
 *  there left out for lack of a verified order (named, never silently dropped). */
export function coverage(games: OrderGame[], f: PickFilter): { ordered: number; excluded: number } {
  const keep = (g: OrderGame) => (!f.tournament || g.tournament === f.tournament) && (!f.stage || stageLabel(g.stage) === f.stage)
    && (!f.patch || patchKey(g.patch) === patchKey(f.patch)) && (!f.team || g.blue.team === f.team || g.red.team === f.team);
  const inScope = games.filter(keep);
  return { ordered: inScope.filter(isOrdered).length, excluded: inScope.filter((g) => !isOrdered(g)).length };
}

/** "8/10 (80%)": a count with its sample, never a bare percentage. */
export const share = (n: number, of: number) => (of ? `${n}/${of} (${Math.round((n / of) * 100)}%)` : "—");
