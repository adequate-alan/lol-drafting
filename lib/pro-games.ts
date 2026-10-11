// Imported pro games (data/pro-games.json, one record per game) in the shapes the rest of the site already reads:
// a draft per side (ProDraft), a game source (Source) and a recorded result (ProResult, for counter corroboration).
// Derived at load, never written back, so the game record stays the one copy. Observed Pro Evidence only: nothing here
// touches saved pairings, pool tiers or proposed synergy, and imported games add no pro-derived alternatives.
import type { ProDraft, ProGame, ProGames, ProResult, Source } from "./schema";

export const gameSourceId = (g: Pick<ProGame, "id">) => `golgg-game-${g.id}`;

/** "ROUND4" -> "Round 4", "QUARTERFINALS" -> "Quarterfinals". */
export function stageLabel(stage?: string): string {
  if (!stage) return "";
  const s = stage.replace(/([A-Za-z])(\d)/g, "$1 $2").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function draftsFromGames(games: ProGame[]): ProDraft[] {
  return games.flatMap((g) => (["blue", "red"] as const).map((side): ProDraft => {
    const me = g[side], them = g[side === "blue" ? "red" : "blue"];
    return {
      id: `golgg-${g.id}-${side}`, tournament: g.tournament, seriesGame: `${g.series} G${g.game}`, stage: stageLabel(g.stage),
      team: me.team, opponent: them.team, patch: g.patch, picks: me.picks, read: "", sources: [gameSourceId(g)],
      side, won: g.winner === side, date: g.date, bans: me.bans,
    };
  }));
}

/** A source per imported game; an id already in sources.json (a supplied link) keeps its own record. */
export function sourcesFromGames(games: ProGame[], existing: Source[]): Source[] {
  const have = new Set(existing.map((s) => s.id));
  return games.filter((g) => !have.has(gameSourceId(g))).map((g): Source => ({
    id: gameSourceId(g), url: g.url, type: "golgg-game", tournament: g.tournament, team: g.blue.team, opponent: g.red.team,
    seriesGame: `${g.series} G${g.game}`, patch: g.patch, date: g.date, lastChecked: g.checkedOn, refreshStatus: "verified", origin: "golgg-refresh",
  }));
}

export function resultsFromGames(games: ProGame[], existing: ProResult[]): ProResult[] {
  const have = new Set(existing.map((r) => r.game));
  return games.filter((g) => !have.has(gameSourceId(g))).map((g): ProResult => ({ game: gameSourceId(g), winner: g[g.winner].team, sources: [gameSourceId(g)] }));
}

export interface Freshness {
  event: string;
  label: string;
  listed: boolean; // Gol.gg lists the tournament (as of the last stored check)
  status?: "ongoing" | "complete";
  lastUpdate: string | null;
  lastCheck: string | null;
  games?: number; // tournament games played, from the match list
  recorded: number; // games stored here
}

/** One line per tracked tournament for the freshness note. */
export function freshness(file: ProGames): Freshness[] {
  return file.tracked.map((t) => {
    const s = file.tournaments.find((x) => x.event === t.event);
    return { event: t.event, label: t.label, listed: !!s, status: s?.status, lastUpdate: s?.lastUpdate ?? null, lastCheck: s?.lastCheck ?? null,
      games: s?.games, recorded: file.games.filter((g) => g.event === t.event).length };
  });
}
