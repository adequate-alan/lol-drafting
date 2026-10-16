// Newest professional games first, everywhere a list of games is shown (alan, 2026-10-16): Pro Drafts, the Gen.G page,
// Pro Builds, Pinned Players match histories, the champion drawer and every evidence list. Gol.gg records each game's
// date but no start time, so the order uses only what is recorded, never import order, tournament or game id as time:
//  1. the game's date, newest first; an undated game follows every dated one;
//  2. on a shared date, the newer game patch first (two tournaments on one day: Worlds 2026 Play-In on 26.20 above the
//     Demacia Cup on 26.18 on 2026-10-15);
//  3. a series stays together, its games in descending game number (G5, G4, … G1);
//  4. series that still tie (same date and patch) follow a fixed tie-break, the series' highest Gol.gg game id, so the
//     order never changes between builds. It is not a claim about which series was played first.
import { comparePatch } from "./patch";

export type GameStamp = {
  date?: string; // YYYY-MM-DD, when recorded
  patch?: string;
  series: string; // one key per series (tournament + series), shared by its games
  game?: number; // game number in the series
  id?: number; // Gol.gg game id: tie-break only
};

/** The items sorted newest game first (a new array). Items of one game (both sides, several players) stay together in
 *  their original order. */
export function newestGamesFirst<T>(items: readonly T[], stamp: (t: T) => GameStamp): T[] {
  const s = items.map((t, i) => ({ t, i, k: stamp(t) }));
  const seriesOf = (k: GameStamp) => `${k.date ?? ""}|${k.series}`;
  const top = new Map<string, number>();
  for (const { k } of s) top.set(seriesOf(k), Math.max(top.get(seriesOf(k)) ?? 0, k.id ?? 0));
  return s.sort((a, b) => {
    const date = (b.k.date ?? "").localeCompare(a.k.date ?? "");
    if (date) return date;
    const patch = a.k.patch && b.k.patch ? comparePatch(b.k.patch, a.k.patch) : 0;
    if (patch) return patch;
    const sa = seriesOf(a.k), sb = seriesOf(b.k);
    if (sa !== sb) return top.get(sb)! - top.get(sa)! || (sb < sa ? -1 : 1);
    return (b.k.game ?? 0) - (a.k.game ?? 0) || (b.k.id ?? 0) - (a.k.id ?? 0) || a.i - b.i;
  }).map((x) => x.t);
}

/** A game record (data/pro-games.json, the archive records in pro-builds.json) or anything carrying its fields. */
export const recordStamp = (g: { id: number; event?: string; seriesId?: number; series?: string; game?: number; date?: string; patch?: string }): GameStamp =>
  ({ date: g.date, patch: g.patch, series: `${g.event ?? ""}|${g.seriesId ?? g.series ?? g.id}`, game: g.game, id: g.id });

/** A pro draft row: its series is the tournament plus the series label without the game ("Finals G3" → "Finals"). */
export const draftStamp = (d: { tournament: string; seriesGame: string; date?: string; patch?: string }, id?: number): GameStamp => {
  const m = /^(.*?)\s*G(\d+)$/.exec(d.seriesGame);
  return { date: d.date, patch: d.patch, series: `${d.tournament}|${m ? m[1] : d.seriesGame}`, game: m ? Number(m[2]) : undefined, id };
};
