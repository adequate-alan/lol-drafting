// Top lane draft usage (alan, 2026-10-13): when professionals actually picked each top laner. Observed Pro Evidence only:
// it never scores a Draft Room row, never edits a saved blind grade, pairing or pool tier, and one game proves nothing.
//
// The draft order is rebuilt per game from two stored facts read from the Gol.gg game page:
//   - `pickOrder` per side: that team's five picks in the order the page lists them (the team's own draft order);
//   - `firstPick`: the side carrying Gol.gg's "First Pick" mark. Since 2026 it is not always blue, so it is never assumed.
// Tournament draft (both events here): first team F, second team S, picks F1 S1 S2 F2 F3 S3 | bans | S4 F4 F5 S5.
// A game without either fact is "uncertain", never classified from its side, its lineup or its result.
//
// Each recorded top selection is
//   - blind: the opposing top champion was not yet on the board;
//   - response: the opposing top champion was already picked and could only have been their top (every other role it
//     plays was visibly filled by a one-role champion);
//   - uncertain: no order, no first-pick mark, or the opposing top was on the board but could still have gone elsewhere.
// A response is not a counter. "Repeated" needs the same response in two different series; "supported counter" needs a
// DPM.LOL matchup row that clears the counter thresholds (lib/counters.ts). Win / loss never decides either.
import { DPM_MIN_GAMES, DPM_MIN_WIN_RATE, DPM_STRONG_WIN_RATE } from "./counters";
import { comparePatchDesc } from "./evidence";
import { patchKey } from "./patch";
import { ROLES, type ProGame, type Role } from "./schema";
import type { BlindLine } from "./top-blind";

export type Side = "blue" | "red";
export type Usage = "blind" | "response" | "uncertain";
export type Rotation = "first" | "second" | "last";

// Global turns (1-10) of each team's picks: the first-picking team and the other.
export const FIRST_TURNS = [1, 4, 5, 8, 9] as const;
export const SECOND_TURNS = [2, 3, 6, 7, 10] as const;
export const turnOf = (pickIndex: number, first: boolean) => (first ? FIRST_TURNS : SECOND_TURNS)[pickIndex];
// First rotation = each team's first three picks, before the second ban phase (turns 1-6; alan, 2026-10-13, site-wide).
// Second rotation = turns 7-10, with the last pick (turn 10) kept apart.
export const rotationOf = (turn: number): Rotation => (turn <= 6 ? "first" : turn === 10 ? "last" : "second");
export const ROTATION_LABEL: Record<Rotation, string> = { first: "First rotation", second: "Second rotation", last: "Last pick" };

export interface TopSelection {
  game: number; // Gol.gg game id
  event: string;
  tournament: string;
  patch: string; // Gol.gg spelling; shown with patchLabel
  date: string;
  series: string;
  seriesId: number;
  gameNo: number;
  stage?: string;
  champion: string;
  team: string;
  opponent: string;
  side: Side;
  won: boolean;
  opponentTop: string;
  usage: Usage;
  why: string; // one line: why this classification (or why it is uncertain)
  turn?: number; // 1-10 in the rebuilt draft
  opponentTurn?: number;
  rotation?: Rotation;
  firstPicker?: boolean; // this team had first pick
  enemySeen: string[]; // enemy champions on the board when this was picked (empty when the order is unknown)
  ownSeen: string[];
  flex: string[]; // other roles this champion plays that its team had not visibly filled when it was picked
  unavailable: string[] | null; // Fearless: champions picked earlier in the series (null when an earlier game is missing)
}

export interface RoleBook { rolesOf: (id: string) => Role[] }

/** Roles a champion can be read as: its roster roles plus every role recorded games show it in. */
export function roleBook(champions: { id: string; roles: Role[] }[], games: Pick<ProGame, "blue" | "red">[]): RoleBook {
  const map = new Map<string, Set<Role>>();
  const add = (id: string, r: Role) => { if (!map.has(id)) map.set(id, new Set()); map.get(id)!.add(r); };
  for (const c of champions) for (const r of c.roles) add(c.id, r);
  for (const g of games) for (const s of [g.blue, g.red]) for (const r of ROLES) add(s.picks[r], r);
  return { rolesOf: (id) => ROLES.filter((r) => map.get(id)?.has(r)) };
}

/** Roles in `roles` (other than `own`) that no other champion in `board` visibly fills (a one-role champion of that role). */
function openRoles(id: string, own: Role, board: string[], book: RoleBook): Role[] {
  const filled = new Set(board.filter((x) => x !== id).map((x) => book.rolesOf(x)).filter((rs) => rs.length === 1).map((rs) => rs[0]));
  return book.rolesOf(id).filter((r) => r !== own && !filled.has(r));
}

/** Champions picked in earlier games of the same series (Fearless), or null when an earlier game is not recorded. */
function fearlessOut(g: ProGame, all: ProGame[]): string[] | null {
  const earlier = all.filter((x) => x.seriesId === g.seriesId && x.event === g.event && x.game < g.game);
  if (new Set(earlier.map((x) => x.game)).size !== g.game - 1) return null;
  return earlier.flatMap((x) => [...Object.values(x.blue.picks), ...Object.values(x.red.picks)]).sort();
}

/** Both top selections of every recorded game, classified. Games are deduplicated by Gol.gg id. */
export function topSelections(games: ProGame[], book: RoleBook): TopSelection[] {
  const byId = new Map<number, ProGame>();
  for (const g of games) if (!byId.has(g.id)) byId.set(g.id, g);
  const all = [...byId.values()];
  const out: TopSelection[] = [];
  for (const g of all) {
    const out_ = fearlessOut(g, all);
    for (const side of ["blue", "red"] as const) {
      const other: Side = side === "blue" ? "red" : "blue";
      const me = g[side], them = g[other];
      const champion = me.picks.TOP, opponentTop = them.picks.TOP;
      const base = {
        game: g.id, event: g.event, tournament: g.tournament, patch: g.patch, date: g.date, series: g.series, seriesId: g.seriesId,
        gameNo: g.game, stage: g.stage, champion, team: me.team, opponent: them.team, side, won: g.winner === side, opponentTop,
        unavailable: out_,
      };
      if (!me.pickOrder || !them.pickOrder || !g.firstPick) {
        out.push({ ...base, usage: "uncertain", why: !g.firstPick ? "The game page does not mark which team picked first." : "Pick order not recorded.", enemySeen: [], ownSeen: [], flex: [] });
        continue;
      }
      const first = g.firstPick === side;
      const myIdx = me.pickOrder.indexOf(champion), theirIdx = them.pickOrder.indexOf(opponentTop);
      const turn = turnOf(myIdx, first), opponentTurn = turnOf(theirIdx, !first);
      const enemySeen = them.pickOrder.filter((_, i) => turnOf(i, !first) < turn);
      const ownSeen = me.pickOrder.filter((_, i) => turnOf(i, first) < turn);
      const flex = openRoles(champion, "TOP", ownSeen, book);
      const common = { ...base, turn, opponentTurn, rotation: rotationOf(turn), firstPicker: first, enemySeen, ownSeen, flex };
      if (opponentTurn > turn) {
        out.push({ ...common, usage: "blind", why: `Picked at ${turn} of 10, before ${opponentTop} (${opponentTurn}).` });
        continue;
      }
      const elsewhere = openRoles(opponentTop, "TOP", enemySeen, book);
      out.push(elsewhere.length
        ? { ...common, usage: "uncertain", why: `${opponentTop} was on the board (${opponentTurn}) but could still have played ${elsewhere.map((r) => r.toLowerCase()).join(" or ")}.` }
        : { ...common, usage: "response", why: `Picked at ${turn} of 10, after ${opponentTop} (${opponentTurn}).` });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || b.game - a.game || a.side.localeCompare(b.side));
}

// ---------- scope ----------

export interface TopScope { patch?: string; events?: string[] } // no patch = every patch (explicit)

export const inTopScope = (s: TopSelection, scope: TopScope) =>
  (!scope.patch || patchKey(s.patch) === patchKey(scope.patch)) && (!scope.events?.length || scope.events.includes(s.event));

export const topPatches = (sel: TopSelection[]) => [...new Set(sel.map((s) => s.patch))].sort(comparePatchDesc);

export const ENOUGH_GAMES = 10; // a patch needs this many classifiable top selections to be the default

/** Newest patch with enough classifiable top selections (else the newest patch). */
export function defaultTopPatch(sel: TopSelection[]): string | undefined {
  const patches = topPatches(sel);
  return patches.find((p) => sel.filter((s) => s.patch === p && s.usage !== "uncertain").length >= ENOUGH_GAMES) ?? patches[0];
}

// ---------- per champion ----------

export const MIN_CLASSIFIED = 3; // below this, no usage label (neutral)
export const LOW_SAMPLE = 5; // below this, a label is marked as a small sample
export const LEAN = 2 / 3; // share of classifiable selections for "often blinded" / "usually a response"

export type UsageLabel = "blind" | "response" | "both" | "too-few";
export const USAGE_LABEL: Record<UsageLabel, string> = { blind: "Often blinded", response: "Usually a response", both: "Both ways", "too-few": "Too few games" };

export interface DPMRow { role: Role; champion: string; enemy: string; winRate: number; games: number; patch: string; url: string }
export type PairStatus = "observed" | "repeated" | "supported";
export const PAIR_LABEL: Record<PairStatus, string> = { observed: "Observed response", repeated: "Repeated response", supported: "Supported counter" };

export interface Pair {
  champion: string; // the later pick
  into: string; // the top it was picked into
  games: TopSelection[]; // the later pick's selections, newest first
  series: number; // independent series
  wins: number;
  status: PairStatus;
  dpm?: { winRate: number; games: number; patch: string; url: string; strong: boolean };
}

export interface TopRow {
  champion: string;
  games: number; // recorded top selections in scope
  blind: number;
  response: number;
  uncertain: number;
  classified: number;
  blindShare: number | null;
  usage: UsageLabel;
  low: boolean;
  rotation: Record<Rotation, number>;
  firstPicker: number; // selections made by the team with first pick (ordered games)
  blue: number; red: number;
  wins: number;
  latest: string;
  faced: { champion: string; games: number }[]; // opposing tops, most frequent first
  respondedInto: Pair[]; // this champion picked after a revealed opponent
  answeredBy: Pair[]; // opponents picked after this champion was revealed
  unavailableGames: number; // Fearless: games where an earlier game of the series had already used it (known eligibility only)
  selections: TopSelection[];
}

const count = <T,>(xs: T[], f: (x: T) => boolean) => xs.filter(f).length;

/** DPM row for `champion` into `enemy` in top lane, when it clears the counter thresholds. */
export function dpmCounter(rows: DPMRow[], champion: string, enemy: string): Pair["dpm"] {
  const r = rows.find((x) => x.role === "TOP" && x.champion === champion && x.enemy === enemy);
  if (!r || r.games < DPM_MIN_GAMES || r.winRate < DPM_MIN_WIN_RATE) return undefined;
  return { winRate: r.winRate, games: r.games, patch: r.patch, url: r.url, strong: r.winRate >= DPM_STRONG_WIN_RATE };
}

function pairs(responses: TopSelection[], dpm: DPMRow[]): Pair[] {
  const by = new Map<string, TopSelection[]>();
  for (const s of responses) {
    const k = `${s.champion}>${s.opponentTop}`;
    by.set(k, [...(by.get(k) ?? []), s]);
  }
  return [...by.values()].map((games) => {
    const { champion, opponentTop: into } = games[0];
    const series = new Set(games.map((g) => `${g.event}:${g.seriesId}`)).size;
    const d = dpmCounter(dpm, champion, into);
    const status: PairStatus = d ? "supported" : series >= 2 ? "repeated" : "observed";
    return { champion, into, games, series, wins: count(games, (g) => g.won), status, dpm: d };
  }).sort((a, b) => b.games.length - a.games.length || b.series - a.series || a.champion.localeCompare(b.champion));
}

export function topRows(all: TopSelection[], scope: TopScope, dpm: DPMRow[] = []): TopRow[] {
  const sel = all.filter((s) => inTopScope(s, scope));
  const ids = [...new Set(sel.map((s) => s.champion))];
  return ids.map((id) => {
    const mine = sel.filter((s) => s.champion === id);
    const blind = count(mine, (s) => s.usage === "blind"), response = count(mine, (s) => s.usage === "response");
    const classified = blind + response;
    const blindShare = classified ? blind / classified : null;
    const usage: UsageLabel = classified < MIN_CLASSIFIED ? "too-few" : blindShare! >= LEAN ? "blind" : blindShare! <= 1 - LEAN ? "response" : "both";
    const faced = new Map<string, number>();
    for (const s of mine) faced.set(s.opponentTop, (faced.get(s.opponentTop) ?? 0) + 1);
    // Games where Fearless had already taken it: eligibility known only for games whose earlier games are all recorded.
    const unavailableGames = new Set(sel.filter((s) => s.unavailable?.includes(id)).map((s) => s.game)).size;
    return {
      champion: id, games: mine.length, blind, response, uncertain: mine.length - classified, classified, blindShare, usage,
      low: classified < LOW_SAMPLE,
      rotation: { first: count(mine, (s) => s.rotation === "first"), second: count(mine, (s) => s.rotation === "second"), last: count(mine, (s) => s.rotation === "last") },
      firstPicker: count(mine, (s) => s.firstPicker === true),
      blue: count(mine, (s) => s.side === "blue"), red: count(mine, (s) => s.side === "red"),
      wins: count(mine, (s) => s.won),
      latest: mine.map((s) => s.date).sort().at(-1) ?? "",
      faced: [...faced].map(([champion, games]) => ({ champion, games })).sort((a, b) => b.games - a.games || a.champion.localeCompare(b.champion)),
      respondedInto: pairs(mine.filter((s) => s.usage === "response"), dpm),
      answeredBy: pairs(sel.filter((s) => s.usage === "response" && s.opponentTop === id), dpm),
      unavailableGames,
      selections: mine,
    };
  }).sort((a, b) => b.games - a.games || a.champion.localeCompare(b.champion));
}

/** Every response pair in scope (champion into opponent), repeated and supported first. */
export const responsePairs = (all: TopSelection[], scope: TopScope, dpm: DPMRow[] = []) =>
  pairs(all.filter((s) => inTopScope(s, scope) && s.usage === "response"), dpm)
    .sort((a, b) => (b.status !== "observed" ? 1 : 0) - (a.status !== "observed" ? 1 : 0) || b.games.length - a.games.length);

/** One-line read of a row's counts, e.g. "Blind 6/9 · Response 3/9". */
export const usageCounts = (r: Pick<TopRow, "blind" | "response" | "classified">) =>
  r.classified ? `Blind ${r.blind}/${r.classified} · Response ${r.response}/${r.classified}` : "No classifiable games";

// ---------- page bundle (built at build time by lib/data.ts getTopDraft) ----------

export interface GameBrief {
  id: number; event: string; tournament: string; patch: string; date: string; series: string; gameNo: number; stage?: string;
  firstPick?: Side; winner: Side; url: string;
  blue: { team: string; order?: string[]; picks: Record<Role, string>; bans: string[] };
  red: { team: string; order?: string[]; picks: Record<Role, string>; bans: string[] };
}
export interface PriorityBrief { presence: number | null; picks: number; bans: number; topPicks?: number; winRate: number | null; low: boolean }
export interface TopDraftBundle {
  selections: TopSelection[];
  games: Record<number, GameBrief>;
  players: Record<string, string>; // `${game}:${side}` -> the top laner's name, from the recorded builds
  drafts: Record<string, string>; // `${game}:${side}` -> Pro Drafts draft id, when the game is listed there
  priority: Record<string, { games: number; rows: Record<string, PriorityBrief> }>; // patch key ("all" for every patch)
  dpm: DPMRow[]; // only the top-lane rows for matchups that occur in the recorded games
  events: { id: string; short: string }[];
  blind: Record<string, BlindLine[]>; // General Draft Logic (lib/top-blind.ts), never pro evidence
}

export const brief = (g: ProGame): GameBrief => ({
  id: g.id, event: g.event, tournament: g.tournament, patch: g.patch, date: g.date, series: g.series, gameNo: g.game, stage: g.stage,
  firstPick: g.firstPick, winner: g.winner, url: g.url,
  blue: { team: g.blue.team, order: g.blue.pickOrder, picks: g.blue.picks, bans: g.blue.bans },
  red: { team: g.red.team, order: g.red.pickOrder, picks: g.red.picks, bans: g.red.bans },
});

/** The ten picks of a game in draft order (turn 1-10), or undefined when the order or the first-pick side is unknown. */
export function draftSequence(g: Pick<GameBrief, "firstPick" | "blue" | "red">): { turn: number; side: Side; champion: string; role?: Role }[] | undefined {
  if (!g.firstPick || !g.blue.order || !g.red.order) return undefined;
  const out = (["blue", "red"] as const).flatMap((side) => g[side].order!.map((champion, i) => ({
    turn: turnOf(i, g.firstPick === side), side, champion, role: ROLES.find((r) => g[side].picks[r] === champion),
  })));
  return out.sort((a, b) => a.turn - b.turn);
}

// ---------- Draft Room (alan, 2026-10-13): labels only, never read by the ranking ----------

export interface TopUsageMark {
  usage: UsageLabel; blind: number; response: number; classified: number; games: number; low: boolean;
  into: Record<string, { games: number; series: number; status: PairStatus }>; // responses into each enemy top
}
export interface TopUsageMarks { patch?: string; marks: Record<string, TopUsageMark>; blind: Record<string, BlindLine[]> }

/** Per-champion top usage on one patch (the default: newest with enough classified games), for Draft Room labels. */
export function topUsageMarks(sel: TopSelection[], dpm: DPMRow[], blind: Record<string, BlindLine[]>, patch = defaultTopPatch(sel)): TopUsageMarks {
  const marks: Record<string, TopUsageMark> = {};
  for (const r of topRows(sel, { patch }, dpm)) {
    marks[r.champion] = {
      usage: r.usage, blind: r.blind, response: r.response, classified: r.classified, games: r.games, low: r.low,
      into: Object.fromEntries(r.respondedInto.map((p) => [p.into, { games: p.games.length, series: p.series, status: p.status }])),
    };
  }
  return { patch, marks, blind };
}
