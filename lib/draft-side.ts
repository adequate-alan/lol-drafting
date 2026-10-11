// Draft side for Pro Drafts rows. The side is the one recorded for that game (Gol.gg game page, `side` on the draft),
// never inferred from team, listing order or which team is named first. A draft without a recorded side is neutral.
import type { ProDraft } from "./schema";

export type DraftSide = "blue" | "red" | "none";

export const sideOf = (d: Pick<ProDraft, "side">): DraftSide => d.side ?? "none";

export const SIDE_LABEL: Record<DraftSide, string> = { blue: "Blue side", red: "Red side", none: "Side not recorded" };

/** One game's identity: tournament, series game and both teams, so the two sides of a game share it. */
export const gameKey = (d: Pick<ProDraft, "tournament" | "seriesGame" | "team" | "opponent">) =>
  `${d.tournament}|${d.seriesGame}|${[d.team, d.opponent].sort().join("|")}`;

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
