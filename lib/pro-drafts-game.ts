// Pro Drafts game inspection (alan, 2026-10-12): a selected row opens the whole game, both teams with their ten picks and
// bans, and each champion in it opens that player's exact recorded build for that game (the same rows Pro Builds and
// Pinned Players read, components/GameBuild.tsx). Everything is named by what the data records: the game by its Gol.gg
// game id, the build by that game's side and role, never by a row's position. Observed Pro Evidence only: nothing here
// scores or touches saved pairings, and a build that was not recorded is said to be missing, never filled in.
import { gameKey, golggGameId, sideOf, type DraftSide } from "./draft-side";
import type { BuildRow } from "./pro-builds";
import { ROLES, type ProDraft, type Role } from "./schema";
import { FIRST_TURNS, rotationOf, turnOf, type Rotation } from "./top-draft";

/** The Gol.gg game id behind a draft: an imported draft carries it in its id (`golgg-<id>-<side>`); a stored draft
 *  names it through the one Gol.gg game page it cites. 0 when neither does. */
export const gameIdOf = (d: Pick<ProDraft, "id" | "sources">): number =>
  Number(/^golgg-(\d+)-(blue|red)$/.exec(d.id)?.[1] ?? 0) || golggGameId(d);

export interface GameView {
  gameId: number; // 0 when no Gol.gg game is named
  /** Both teams' drafts, blue first when sides are recorded; one entry when the other side is not stored. */
  teams: { d: ProDraft; side: DraftSide }[];
}

/** The game a selected draft belongs to: its own row and the opponent's row of the same game, blue side first. */
export function gameView(selected: ProDraft, all: ProDraft[]): GameView {
  const key = gameKey(selected);
  const other = all.find((d) => d !== selected && d.id !== selected.id && gameKey(d) === key && d.team === selected.opponent && d.opponent === selected.team);
  const teams = other ? [selected, other] : [selected];
  teams.sort((a, b) => (sideOf(a) === "blue" ? -1 : sideOf(b) === "blue" ? 1 : 0));
  return { gameId: gameIdOf(selected), teams: teams.map((d) => ({ d, side: sideOf(d) })) };
}

/** `?build=<draft id>:<ROLE>` names the champion whose build is open: the team row (a draft id, unique per team-game)
 *  and the role. Never a row position. */
export const buildParam = (d: Pick<ProDraft, "id">, role: Role) => `${d.id}:${role}`;
export function parseBuildParam(value: string | undefined, view: GameView): { d: ProDraft; side: DraftSide; role: Role } | undefined {
  if (!value) return undefined;
  const at = value.lastIndexOf(":");
  if (at < 0) return undefined;
  const id = value.slice(0, at), role = value.slice(at + 1) as Role;
  if (!ROLES.includes(role)) return undefined;
  const team = view.teams.find((t) => t.d.id === id);
  return team && { ...team, role };
}

/** The recorded build of the champion a team picked in a role, in this game: the build row with that game id, that
 *  team's recorded side and the role. Undefined when the game, the side or the build is not recorded. */
export function buildFor(rows: BuildRow[] | undefined, gameId: number, side: DraftSide, role: Role): BuildRow | undefined {
  if (!rows || !gameId || side === "none") return undefined;
  return rows.find((r) => r.game.id === gameId && r.side === side && r.build.role === role);
}

/** When another game row is clicked while a build is open, the same role opens on that row's team, so the panel
 *  updates in step with the selection rather than closing. */
export const carryBuild = (current: string | undefined, next: Pick<ProDraft, "id">): string | undefined => {
  const role = current?.slice(current.lastIndexOf(":") + 1) as Role | undefined;
  return role && ROLES.includes(role) ? buildParam(next, role) : undefined;
};

// Gol.gg-style match rows (alan, 2026-10-16): each team shows its five bans as small portraits and, when Gol.gg marks it,
// a 1st Pick tag. Both come from the game record (data/pro-games.json, or the LCK archive records in pro-builds.json
// `games`), named by Gol.gg game id and the draft's recorded side, and only when that side's team is the draft's team.
// First pick is Gol.gg's "First Pick" mark, never inferred from side, winner or pick order; a game without it is unknown.
// `order` is the side's five picks in the order the Gol.gg game page draws them (`pickOrder`), stored only when the page
// draws the turns; `picks` names each champion's role. Both feed the Draft order view below.
interface FactSide { team: string; bans: string[]; order?: string[]; picks?: Partial<Record<Role, string>> }
export interface GameFacts { firstPick?: "blue" | "red"; blue: FactSide; red: FactSide; /** Day the refresh imported it. */ added?: string }
export type GameFactBook = Record<number, GameFacts>;

type RecordSide = { team: string; bans: string[]; pickOrder?: string[]; picks?: Partial<Record<Role, string>> };
const factSide = (s: RecordSide): FactSide => ({ team: s.team, bans: s.bans, ...(s.pickOrder ? { order: s.pickOrder, picks: s.picks } : {}) });
export const gameFacts = (records: { id: number; firstPick?: "blue" | "red"; blue: RecordSide; red: RecordSide; checkedOn?: string }[]): GameFactBook =>
  Object.fromEntries(records.map((g) => [g.id, { firstPick: g.firstPick, blue: factSide(g.blue), red: factSide(g.red), ...(g.checkedOn ? { added: g.checkedOn } : {}) }]));

const factsFor = (d: Pick<ProDraft, "id" | "sources" | "side" | "team">, book: GameFactBook) => {
  const g = book[gameIdOf(d)], side = sideOf(d);
  return g && side !== "none" && g[side].team === d.team ? { g, side } : undefined;
};

/** The team's bans in the order Gol.gg lists them (the draft's own, else its game record's); empty when not recorded. */
export function bansOf(d: Pick<ProDraft, "id" | "sources" | "side" | "team" | "bans">, book: GameFactBook): string[] {
  if (d.bans?.length) return d.bans;
  const f = factsFor(d, book);
  return f ? f.g[f.side].bans : [];
}

/** true: this team carries Gol.gg's First Pick mark; false: the other team does; undefined: not marked or no record. */
export function pickedFirst(d: Pick<ProDraft, "id" | "sources" | "side" | "team">, book: GameFactBook): boolean | undefined {
  const f = factsFor(d, book);
  return f?.g.firstPick ? f.g.firstPick === f.side : undefined;
}

/** Gol.gg draws a team's five bans as 3 | 2, the two ban phases, in stored order. Fewer bans have no known split. */
export const banPhases = (bans: string[]): string[][] => (bans.length === 5 ? [bans.slice(0, 3), bans.slice(3)] : [bans]);

// New Worlds games since the last visit (alan, 2026-10-16). This browser keeps the Gol.gg ids of the Worlds games it has
// seen (localStorage); a visit flags the ids it had not seen, and keeps that list for the rest of the visit (session), so
// the next visit starts clean. Nothing leaves the browser. The first visit sets the baseline and flags nothing.
export const SEEN_KEY = "pro-drafts:seen-worlds";
export const VISIT_KEY = "pro-drafts:new-worlds";

/** The ids to flag: current ids missing from the stored ones; none when nothing was stored yet. */
export function newSince(seen: number[] | null, current: number[]): number[] {
  if (!seen) return [];
  const have = new Set(seen);
  return current.filter((id) => !have.has(id));
}

// Latest refresh (alan, 2026-10-31: "represent the new ones as the ones you just updated"): the Worlds games the most
// recent refresh added are flagged too, on every browser and every visit, beside the ones new since the last visit. A
// game record's `checkedOn` (`GameFacts.added`) is the day the refresh imported it (a later build re-read never moves
// it), so the batch is the games carrying the newest such day.
export function latestBatch(games: { id: number; added: string | null }[]): { ids: number[]; day: string | null } {
  const day = games.reduce<string | null>((d, g) => (g.added && (!d || g.added > d) ? g.added : d), null);
  return { ids: day ? [...new Set(games.filter((g) => g.added === day).map((g) => g.id))] : [], day };
}

// Draft order view (alan, 2026-10-24): the open game's ten picks in the order they were made, beside the default
// Composition view. The order is rebuilt from two facts the Gol.gg game page gives, never from side, role order, the
// final lineup or a source's pick list: each team's `pickOrder` and the First Pick mark. The marked team picks turns
// 1, 4-5, 8-9; the other 2-3, 6, 7, 10 (lib/top-draft.ts `turnOf`). Two picks in one turn are drawn together, never
// ordered between themselves ("B2 · B3"). A game without the mark, without either team's order, or whose record names
// other teams, has no draft order: the view says it is unavailable and why. Observed Pro Evidence only: a pick made
// after an opponent's is an observed response, never a counter, and nothing here scores or orders anything.
export type PickSide = "blue" | "red";
export interface OrderPick { champion: string; role?: Role }
export interface OrderStep {
  turns: number[]; // global turns 1-10 (one, or a paired turn of two)
  side: PickSide;
  label: string; // "B1", "R2 · R3": the side's own pick numbers
  rotation: Rotation;
  picks: OrderPick[];
}
export type DraftOrder =
  | { ok: true; firstPick: PickSide; steps: OrderStep[]; bans: Record<PickSide, string[][]> }
  | { ok: false; reason: string };

const STEPS: number[][] = [[1], [2, 3], [4, 5], [6], [7], [8, 9], [10]];

/** The open game's draft order from its game record, or why it is unavailable. `teams` (the drafts shown, with their
 *  recorded sides) must be the record's teams on those sides, so a record never lends its order to another game. */
export function draftOrder(gameId: number, book: GameFactBook, teams: { team: string; side: DraftSide }[] = []): DraftOrder {
  const g = gameId ? book[gameId] : undefined;
  if (!g || teams.some((t) => t.side === "none" || g[t.side].team !== t.team)) return { ok: false, reason: "This game has no Gol.gg game record, so its pick order is not recorded." };
  if (!g.firstPick) return { ok: false, reason: "Gol.gg does not mark which team picked first in this game, so the order of the two teams' picks is unknown." };
  if (!g.blue.order || !g.red.order) return { ok: false, reason: "Gol.gg's page for this game lists the picks in role order, not in the order they were made." };
  const first = g.firstPick, other: PickSide = first === "blue" ? "red" : "blue";
  const roleOf = (s: FactSide, id: string) => ROLES.find((r) => s.picks?.[r] === id);
  const steps = STEPS.map((turns): OrderStep => {
    const side = (FIRST_TURNS as readonly number[]).includes(turns[0]) ? first : other;
    const s = g[side];
    const idx = turns.map((t) => [0, 1, 2, 3, 4].find((i) => turnOf(i, side === first) === t)!);
    const letter = side === "blue" ? "B" : "R";
    return { turns, side, label: idx.map((i) => `${letter}${i + 1}`).join(" · "), rotation: rotationOf(turns[0]), picks: idx.map((i) => ({ champion: s.order![i], role: roleOf(s, s.order![i]) })) };
  });
  return { ok: true, firstPick: first, steps, bans: { blue: banPhases(g.blue.bans), red: banPhases(g.red.bans) } };
}
