// Comp Library entries: the hand-written shells (data/comp-shells.json) plus the Observed Pro Comps the weekly discovery
// added (data/discovered-comps.json), in the one CompShell shape the cards, the drawer and the Draft Room already read,
// with each comp's observed variations and replays resolved from data/pro-games.json. Derived at load, never written.
import { lineupKey, shellPicks, type LineupRef, type Picks } from "./comp-discovery";
import { gameSourceId } from "./pro-games";
import { ROLES, type CompShell, type DiscoveredComp, type DiscoveredComps, type ProGame } from "./schema";

/** One recorded game for a lineup, as a variation row shows it. */
export interface ObservedGame {
  game: number; side: "blue" | "red"; team: string; opponent: string; won: boolean;
  date: string; patch: string; tournament: string; url: string;
}
export interface ObservedLineup { picks: Picks; games: ObservedGame[] }
export interface LibraryExtra {
  discovered?: Omit<DiscoveredComp, "slots" | "games" | "winCondition" | "why">; // the comp check's read, for Details
  games: ObservedGame[]; // games with the comp's own lineup (a curated shell's own source game left out)
  variations: ObservedLineup[]; // other observed lineups filed under this comp, most games first
}

export function gameView(g: ProGame, side: "blue" | "red"): ObservedGame {
  const them = side === "blue" ? "red" : "blue";
  return { game: g.id, side, team: g[side].team, opponent: g[them].team, won: g.winner === side, date: g.date, patch: g.patch, tournament: g.tournament, url: g.url };
}

const DIFFICULTY: Record<DiscoveredComp["difficulty"], CompShell["difficulty"]> = { easy: "easy", medium: "medium", hard: "hard" };

/** A discovered comp in the shell shape. No swaps: swaps are general draft logic and nobody wrote any for it. */
export function discoveredShell(c: DiscoveredComp, games: Map<number, ProGame>): CompShell {
  const first = c.games[0];
  const g = games.get(first.game);
  return {
    id: c.id, name: c.name, kind: "observed", observedBy: g?.[first.side].team, proDraftId: `golgg-${first.game}-${first.side}`,
    slots: Object.fromEntries(ROLES.map((r) => [r, { champion: c.slots[r].champion, job: c.slots[r].job, swaps: [] as string[] }])) as unknown as CompShell["slots"],
    identities: c.tags, winCondition: c.winCondition, why: c.why, difficulty: DIFFICULTY[c.difficulty],
    sources: c.games.map((x) => gameSourceId({ id: x.game })),
  };
}

export function buildLibrary(shells: CompShell[], file: DiscoveredComps, proGames: ProGame[]) {
  const games = new Map(proGames.map((g) => [g.id, g]));
  const view = (refs: LineupRef[]) => refs.flatMap((r) => { const g = games.get(r.game); return g ? [gameView(g, r.side)] : []; })
    .sort((a, b) => b.date.localeCompare(a.date) || b.game - a.game);
  const all = [...shells, ...file.comps.map((c) => discoveredShell(c, games))];
  const extras: Record<string, LibraryExtra> = {};
  for (const s of all) {
    const own = lineupKey(shellPicks(s));
    const ownSources = new Set(s.sources);
    const vs = file.variations.filter((v) => v.of === s.id);
    const d = file.comps.find((c) => c.id === s.id);
    // Same lineup, other games: a discovered comp's games after its first; a curated shell's replays minus its own source.
    const replays = d ? view(d.games.slice(1))
      : view(vs.filter((v) => lineupKey(v.picks) === own).flatMap((v) => v.games)).filter((g) => !ownSources.has(gameSourceId({ id: g.game })));
    const variations = vs.filter((v) => lineupKey(v.picks) !== own).map((v) => ({ picks: v.picks, games: view(v.games) }))
      .sort((a, b) => b.games.length - a.games.length || b.games[0].date.localeCompare(a.games[0].date));
    if (!d && !replays.length && !variations.length) continue;
    const { slots: _s, games: _g, winCondition: _w, why: _y, ...read } = d ?? ({} as DiscoveredComp);
    extras[s.id] = { ...(d ? { discovered: read } : {}), games: replays, variations };
  }
  return { shells: all, extras, lastAddition: file.lastAddition };
}
export type Library = ReturnType<typeof buildLibrary>;
