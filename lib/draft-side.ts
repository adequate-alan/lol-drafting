// Draft side for Pro Drafts rows. The side is the one recorded for that game (Gol.gg game page, `side` on the draft),
// never inferred from team, listing order or which team is named first. A draft without a recorded side is neutral.
import type { ProDraft, Source } from "./schema";

export type DraftSide = "blue" | "red" | "none";

export const sideOf = (d: Pick<ProDraft, "side">): DraftSide => d.side ?? "none";

export const SIDE_LABEL: Record<DraftSide, string> = { blue: "Blue side", red: "Red side", none: "Side not recorded" };

/** One game's identity: tournament, series game and both teams, so the two sides of a game share it. */
/** One key per game: the Gol.gg game id when the draft cites one, since the same teams can meet twice in a tournament
 *  with the same series label and game number (a group-stage game and a bracket rematch); otherwise tournament, series
 *  game and both teams. */
export const gameKey = (d: Pick<ProDraft, "tournament" | "seriesGame" | "team" | "opponent" | "sources">) => {
  const id = golggGameId(d);
  return id ? `golgg-${id}` : `${d.tournament}|${d.seriesGame}|${[d.team, d.opponent].sort().join("|")}`;
};

/** The Gol.gg game id a draft cites (`golgg-game-<id>`); Gol.gg numbers games in the order it records them. */
export const golggGameId = (d: Pick<ProDraft, "sources">) =>
  Math.max(0, ...d.sources.map((s) => Number(/^golgg-game-(\d+)$/.exec(s)?.[1] ?? 0)));

/** Newest game first (alan, 2026-10-12): by date, then by Gol.gg game id, so undated games (the LCK archive) follow by
 *  id and later games of one day or series come first. Both sides of a game share date and id and stay together. */
export const newestGameFirst = (a: ProDraft, b: ProDraft) =>
  (b.date ?? "").localeCompare(a.date ?? "") || golggGameId(b) - golggGameId(a);

export type PairedRow = { d: ProDraft; pair: "" | "pair-a" | "pair-b"; side: DraftSide };

/** Groups the visible rows by game. Both sides of a game form a pair (blue first when sides are recorded); a game with
 *  one visible side stays a single row. Each row keeps its own recorded side, whatever the filter. */
export function pairRows(rows: ProDraft[]): PairedRow[] {
  const games = new Map<string, ProDraft[]>();
  for (const d of rows) games.set(gameKey(d), [...(games.get(gameKey(d)) ?? []), d]);
  return [...games.values()].flatMap((g): PairedRow[] => {
    if (g.length === 2 && g[0].team === g[1].opponent) {
      const [a, b] = sideOf(g[1]) === "blue" ? [g[1], g[0]] : g;
      return [{ d: a, pair: "pair-a", side: sideOf(a) }, { d: b, pair: "pair-b", side: sideOf(b) }];
    }
    return g.map((d) => ({ d, pair: "", side: sideOf(d) }));
  });
}

/** Stored drafts (data/pro-drafts.json) take side, result and date from the game record they cite (`Source.sides`,
 *  read from its Gol.gg page), so both team rows of a game share one record. A draft whose team and opponent are not
 *  that game's two sides gets nothing; a side a draft already carries is kept. */
export function withGameSides(drafts: ProDraft[], sources: Record<string, Source>): ProDraft[] {
  return drafts.map((d) => {
    if (d.side) return d;
    const game = d.sources.map((id) => sources[id]).find((s) => s?.type === "golgg-game" && s.sides);
    const g = game?.sides;
    if (!g) return d;
    const side = d.team === g.blue && d.opponent === g.red ? "blue" : d.team === g.red && d.opponent === g.blue ? "red" : undefined;
    if (!side) return d;
    return { ...d, side, won: g.winner === side, date: d.date ?? game?.date };
  });
}

export type GameGroup = { key: string; rows: PairedRow[]; paired: boolean };

/** The visible rows as games (alan, 2026-10-13: a game is one visual unit holding two opposing drafts). A paired game
 *  holds its blue row then its red row; a game with one visible side (a team or champion filter) is a one-row group that
 *  keeps its game identity and its recorded side. Order follows the rows (newest game first). */
export function groupGames(rows: ProDraft[]): GameGroup[] {
  const groups: GameGroup[] = [];
  for (const r of pairRows(rows)) {
    const last = groups.at(-1);
    if (r.pair === "pair-b" && last?.rows[0].pair === "pair-a" && last.rows.length === 1) { last.rows.push(r); last.paired = true; continue; }
    groups.push({ key: gameKey(r.d), rows: [r], paired: false });
  }
  return groups;
}
