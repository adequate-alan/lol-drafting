// Gen.G's Worlds 2026 run and the Grand Final against Bilibili Gaming (alan, 2026-11-14). Observed Pro Evidence only:
// every number here is counted from the recorded games (data/pro-games.json, keyed by Gol.gg game id) and named with its
// denominator. Nothing here scores, ranks or touches saved pairings, kits, counters or the Comp Library.
//
// The page follows the records: no final game recorded = the scheduled matchup; some = "games recorded so far" (never
// "live", there is no live source); three wins for one team = the result. The comparison of the two teams is always
// counted over the games before the final, so it stays the pre-final read once the final is in.
import { newestGamesFirst, recordStamp } from "./chronology";
import type { GamePlayers } from "./pro-drafts-game";
import { stageLabel } from "./pro-games";
import { ROLES, type ProGame, type Role } from "./schema";
import type { LaneSelection } from "./top-draft";

export const GENG = "Gen.G";
export const BLG = "Bilibili Gaming";
export type Side = "blue" | "red";
type Picks = Record<Role, string>;

/** What alan supplied on 2026-11-14 (schedule, venue, where to watch). Not from Gol.gg: shown as supplied, never as verified. */
export const FINAL_INFO = {
  title: "Worlds 2026 Grand Final",
  date: "2026-11-14",
  when: "Saturday, November 14, 2026 · 2:00 PM ET",
  format: "Best of five",
  winsNeeded: 3,
  venue: "Barclays Center · Brooklyn, New York",
  watch: { label: "Watch on LoL Esports", url: "https://lolesports.com" },
  providedOn: "2026-11-14",
} as const;

const other = (s: Side): Side => (s === "blue" ? "red" : "blue");
const sideOf = (g: ProGame, team: string): Side | undefined => (g.blue.team === team ? "blue" : g.red.team === team ? "red" : undefined);
const newest = <T extends ProGame>(games: T[]) => newestGamesFirst(games, recordStamp);

/** The Worlds 2026 main event (Swiss and Knockouts, and a later stage Gol.gg lists apart); never the Play-In. */
export const isMainEvent = (g: Pick<ProGame, "event">) => g.event === "worlds-2026" || (g.event.startsWith("worlds-2026-") && g.event !== "worlds-2026-play-in");

const FINAL_STAGE = /final/i, EARLIER_ROUND = /semi|quarter/i;
/** A game of the Grand Final: Gen.G against Bilibili Gaming at the main event, in a final stage or on / after the final's date. */
export const isFinalGame = (g: ProGame) => isMainEvent(g) && !!sideOf(g, GENG) && !!sideOf(g, BLG)
  && ((!!g.stage && FINAL_STAGE.test(g.stage) && !EARLIER_ROUND.test(g.stage)) || g.date >= FINAL_INFO.date);

export interface GameLine {
  id: number; no: number; date: string; patch: string; side: Side; won: boolean;
  /** Whether this team carried Gol.gg's First Pick mark; undefined when the page marks neither side. */
  firstPick?: boolean;
  picks: Picks; bans: string[]; order?: string[];
  opponent: string; oppPicks: Picks; oppBans: string[]; oppOrder?: string[];
  /** Pro Drafts id of this team's draft in the game. */
  draft: string;
}
export function gameLine(g: ProGame, team: string): GameLine {
  const side = sideOf(g, team)!, me = g[side], them = g[other(side)];
  return {
    id: g.id, no: g.game, date: g.date, patch: g.patch, side, won: g.winner === side,
    ...(g.firstPick ? { firstPick: g.firstPick === side } : {}),
    picks: me.picks, bans: me.bans, ...(me.pickOrder ? { order: me.pickOrder } : {}),
    opponent: them.team, oppPicks: them.picks, oppBans: them.bans, ...(them.pickOrder ? { oppOrder: them.pickOrder } : {}),
    draft: `golgg-${g.id}-${side}`,
  };
}

export interface SeriesLine { id: number; stage: string; opponent: string; date: string; wins: number; losses: number; won: boolean; final: boolean; games: GameLine[] }
const SWISS = /^round ?(\d+)$/i;
/** "ROUND3" -> "Swiss Round 3", "QUARTERFINALS" -> "Quarterfinals". */
export const roundLabel = (stage?: string) => (stage && SWISS.test(stage) ? `Swiss Round ${stage.match(SWISS)![1]}` : stageLabel(stage) || "Stage not recorded");

/** One team's main-event series from the recorded games, newest first, each with its games newest first. */
export function seriesOf(team: string, games: ProGame[]): SeriesLine[] {
  const mine = newest(games.filter((g) => isMainEvent(g) && sideOf(g, team)));
  const by = new Map<number, ProGame[]>();
  for (const g of mine) by.set(g.seriesId, [...(by.get(g.seriesId) ?? []), g]);
  return [...by.entries()].map(([id, gs]) => {
    const lines = gs.map((g) => gameLine(g, team)), wins = lines.filter((l) => l.won).length;
    const final = gs.some(isFinalGame);
    return { id, stage: final ? "Grand Final" : roundLabel(gs[0].stage), opponent: lines[0].opponent, date: gs[0].date, wins, losses: lines.length - wins, won: wins > lines.length - wins, final, games: lines };
  });
}

export type FinalStatus = "scheduled" | "underway" | "complete";
export interface FinalRead { status: FinalStatus; games: GameLine[]; geng: number; blg: number; winner?: string; loser?: string }
/** The final as the records have it. "underway" only means some games are recorded and neither team has three wins. */
export function finalRead(games: ProGame[]): FinalRead {
  const lines = newest(games.filter(isFinalGame)).map((g) => gameLine(g, GENG));
  const geng = lines.filter((l) => l.won).length, blg = lines.length - geng;
  const winner = geng >= FINAL_INFO.winsNeeded ? GENG : blg >= FINAL_INFO.winsNeeded ? BLG : undefined;
  return { status: winner ? "complete" : lines.length ? "underway" : "scheduled", games: lines, geng, blg, ...(winner ? { winner, loser: winner === GENG ? BLG : GENG } : {}) };
}

/** The games both teams' pre-final comparison is counted over: the main event without the final. */
export const preFinal = (games: ProGame[]) => games.filter((g) => isMainEvent(g) && !isFinalGame(g));

export interface Count { champion: string; n: number; wins?: number }
const tally = (ids: string[], wins?: boolean[]): Count[] => {
  const m = new Map<string, Count>();
  ids.forEach((id, i) => {
    const c = m.get(id) ?? { champion: id, n: 0, ...(wins ? { wins: 0 } : {}) };
    c.n++;
    if (wins?.[i]) c.wins!++;
    m.set(id, c);
  });
  // Most first; ties keep the order of first appearance, which is newest game first.
  return [...m.values()].sort((a, b) => b.n - a.n);
};

export interface PairCount { a: string; b: string; n: number; wins: number }
export interface UsageCount { blind: number; response: number; uncertain: number }
export interface Tendencies {
  team: string; games: number; wins: number; series: number;
  blue: number; red: number;
  /** Games whose page marks a first-picking team, and how many of them this team picked first. */
  marked: number; firstPick: number;
  /** Games with this team's pick order recorded: the denominator of every first-rotation count. */
  ordered: number;
  unique: number;
  byRole: Record<Role, Count[]>;
  bans: Count[]; // by this team
  bansAgainst: Count[]; // by its opponents
  /** Picks inside the team's first three (first rotation), with how often the champion was picked at all in ordered games. */
  firstRotation: (Count & { picks: number })[];
  flex: { champion: string; roles: { role: Role; n: number }[] }[];
  midJungle: PairCount[]; botSupport: PairCount[];
  usage: Record<Role, UsageCount>;
  /** Champions picked before their lane opponent was on the board (bot lane: before either enemy bot laner), with the champion's picks in that role. */
  blind: (Count & { role: Role; picks: number })[];
  /** Picks made after the lane opponent was certainly on the board: an observed response, never a counter. */
  responses: { champion: string; into: string; role: Role; game: number; won: boolean }[];
}

export function tendencies(team: string, games: ProGame[], selections: LaneSelection[] = []): Tendencies {
  const lines = newest(games.filter((g) => sideOf(g, team))).map((g) => gameLine(g, team));
  const won = lines.map((l) => l.won);
  const byRole = Object.fromEntries(ROLES.map((r) => [r, tally(lines.map((l) => l.picks[r]), won)])) as Record<Role, Count[]>;
  const ordered = lines.filter((l) => l.order);
  const early = tally(ordered.flatMap((l) => l.order!.slice(0, 3)));
  const pickedOrdered = tally(ordered.flatMap((l) => l.order!));
  const roles = new Map<string, Map<Role, number>>();
  for (const l of lines) for (const r of ROLES) roles.set(l.picks[r], new Map(roles.get(l.picks[r]) ?? [])).get(l.picks[r])!.set(r, (roles.get(l.picks[r])!.get(r) ?? 0) + 1);
  const pairs = (x: Role, y: Role): PairCount[] => {
    const m = new Map<string, PairCount>();
    for (const l of lines) {
      const k = `${l.picks[x]}+${l.picks[y]}`, p = m.get(k) ?? { a: l.picks[x], b: l.picks[y], n: 0, wins: 0 };
      p.n++;
      if (l.won) p.wins++;
      m.set(k, p);
    }
    return [...m.values()].sort((p, q) => q.n - p.n);
  };
  const ids = new Set(lines.map((l) => l.id));
  const usage = Object.fromEntries(ROLES.map((r) => {
    const mine = selections.filter((s) => s.team === team && s.role === r && ids.has(s.game));
    return [r, { blind: mine.filter((s) => s.usage === "blind").length, response: mine.filter((s) => s.usage === "response").length, uncertain: mine.filter((s) => s.usage === "uncertain").length }];
  })) as Record<Role, UsageCount>;
  const mine = selections.filter((x) => x.team === team && ids.has(x.game));
  const blindBy = new Map<string, Count & { role: Role; picks: number }>();
  for (const x of mine.filter((y) => y.usage === "blind")) {
    const k = `${x.role}:${x.champion}`;
    blindBy.set(k, { champion: x.champion, role: x.role, n: (blindBy.get(k)?.n ?? 0) + 1, picks: byRole[x.role].find((c) => c.champion === x.champion)?.n ?? 0 });
  }
  return {
    blind: [...blindBy.values()].sort((a, b) => b.n - a.n),
    responses: mine.filter((x) => x.usage === "response" && x.laneSeen).map((x) => ({ champion: x.champion, into: x.laneOpponent, role: x.role, game: x.game, won: x.won })),
    team, games: lines.length, wins: won.filter(Boolean).length, series: new Set(games.filter((g) => sideOf(g, team)).map((g) => g.seriesId)).size,
    blue: lines.filter((l) => l.side === "blue").length, red: lines.filter((l) => l.side === "red").length,
    marked: lines.filter((l) => l.firstPick != null).length, firstPick: lines.filter((l) => l.firstPick).length,
    ordered: ordered.length, unique: roles.size, byRole,
    bans: tally(lines.flatMap((l) => l.bans)), bansAgainst: tally(lines.flatMap((l) => l.oppBans)),
    firstRotation: early.map((c) => ({ ...c, picks: pickedOrdered.find((p) => p.champion === c.champion)!.n })),
    flex: [...roles.entries()].filter(([, m]) => m.size > 1).map(([champion, m]) => ({ champion, roles: [...m.entries()].map(([role, n]) => ({ role, n })).sort((a, b) => b.n - a.n) })),
    midJungle: pairs("MID", "JUNGLE"), botSupport: pairs("BOT", "SUPPORT"), usage,
  };
}

export interface Presence { picks: number; bans: number }
/** Picks and bans of every champion over `games`; presence = (picks + bans) / games, counted by the caller with its sample. */
export function presence(games: ProGame[]): { games: number; rows: Record<string, Presence> } {
  const rows: Record<string, Presence> = {};
  const at = (id: string) => (rows[id] ??= { picks: 0, bans: 0 });
  for (const g of games) for (const s of ["blue", "red"] as const) {
    for (const r of ROLES) at(g[s].picks[r]).picks++;
    for (const b of g[s].bans) at(b).bans++;
  }
  return { games: games.length, rows };
}

export interface PlayerLine { id: number; name: string; games: number; wins: number; champions: Count[] }
export interface Matchup { role: Role; geng?: PlayerLine; blg?: PlayerLine; shared: string[] }
/** Who played `role` for a team in `games`, from the recorded builds; the player with the most recorded games first. */
export function rolePlayers(team: string, role: Role, games: ProGame[], players: GamePlayers): { lines: PlayerLine[]; unnamed: number } {
  const m = new Map<number, { name: string; picks: string[]; wins: boolean[] }>();
  let unnamed = 0;
  for (const g of newest(games.filter((x) => sideOf(x, team)))) {
    const side = sideOf(g, team)!, p = players[g.id]?.[side]?.[role];
    if (!p || p.champion !== g[side].picks[role]) { unnamed++; continue; }
    const cur = m.get(p.id) ?? { name: p.name, picks: [], wins: [] };
    cur.picks.push(p.champion);
    cur.wins.push(g.winner === side);
    m.set(p.id, cur);
  }
  const lines = [...m.entries()].map(([id, v]) => ({ id, name: v.name, games: v.picks.length, wins: v.wins.filter(Boolean).length, champions: tally(v.picks, v.wins) }));
  return { lines: lines.sort((a, b) => b.games - a.games), unnamed };
}
export function matchups(games: ProGame[], players: GamePlayers): Matchup[] {
  return ROLES.map((role) => {
    const geng = rolePlayers(GENG, role, games, players).lines[0], blg = rolePlayers(BLG, role, games, players).lines[0];
    const theirs = new Set(blg?.champions.map((c) => c.champion));
    return { role, ...(geng ? { geng } : {}), ...(blg ? { blg } : {}), shared: (geng?.champions ?? []).map((c) => c.champion).filter((c) => theirs.has(c)) };
  });
}

/** Champions one team picked (2+ games) that the other never picked, most picked first: where the pools differ. */
export const onlyPicked = (a: Tendencies, b: Tendencies, min = 2): Count[] => {
  const theirs = new Set(ROLES.flatMap((r) => b.byRole[r].map((c) => c.champion)));
  const all = new Map<string, number>();
  for (const r of ROLES) for (const c of a.byRole[r]) all.set(c.champion, (all.get(c.champion) ?? 0) + c.n);
  return [...all.entries()].filter(([id, n]) => n >= min && !theirs.has(id)).map(([champion, n]) => ({ champion, n })).sort((x, y) => y.n - x.n);
};

/** What changed in the final against a team's earlier Worlds games: picks and bans it had not made before. */
export function finalChanges(team: string, final: ProGame[], before: Tendencies) {
  const lines = newest(final.filter((g) => sideOf(g, team))).map((g) => gameLine(g, team));
  const picked = new Set(ROLES.flatMap((r) => before.byRole[r].map((c) => c.champion))), banned = new Set(before.bans.map((c) => c.champion));
  const picks = tally(lines.flatMap((l) => ROLES.map((r) => l.picks[r]))), bans = tally(lines.flatMap((l) => l.bans));
  return {
    games: lines.length, picks, bans,
    newPicks: picks.filter((c) => !picked.has(c.champion)), newBans: bans.filter((c) => !banned.has(c.champion)),
    everyGameBans: bans.filter((c) => lines.length > 1 && c.n === lines.length),
  };
}

/** Champions `picker` played (2+ games) that `banner` has banned (2+ games) against anyone: what was banned before, never a forecast. */
export function pickedAndBanned(picker: Tendencies, banner: Tendencies, min = 2): { champion: string; picks: number; bans: number }[] {
  const picks = new Map<string, number>();
  for (const r of ROLES) for (const c of picker.byRole[r]) picks.set(c.champion, (picks.get(c.champion) ?? 0) + c.n);
  return banner.bans.filter((b) => b.n >= min && (picks.get(b.champion) ?? 0) >= min).map((b) => ({ champion: b.champion, picks: picks.get(b.champion)!, bans: b.n }))
    .sort((x, y) => y.picks + y.bans - (x.picks + x.bans));
}

/** Multi-game main-event series, and how many of them saw a champion picked in two of their games (Fearless shows as none). */
export function repeatsInSeries(games: ProGame[]): { series: number; repeated: number } {
  const by = new Map<number, ProGame[]>();
  for (const g of games.filter(isMainEvent)) by.set(g.seriesId, [...(by.get(g.seriesId) ?? []), g]);
  const multi = [...by.values()].filter((gs) => gs.length > 1);
  const repeated = multi.filter((gs) => {
    const all = gs.flatMap((g) => [...ROLES.map((r) => g.blue.picks[r]), ...ROLES.map((r) => g.red.picks[r])]);
    return new Set(all).size < all.length;
  }).length;
  return { series: multi.length, repeated };
}
