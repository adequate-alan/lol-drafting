// Comp Library entries: the hand-written shells (data/comp-shells.json) plus the Observed Pro Comps the weekly discovery
// added (data/discovered-comps.json), in the one CompShell shape the cards, the drawer and the Draft Room already read,
// with each comp's observed variations and replays resolved from data/pro-games.json. Derived at load, never written.
// alan's reviewed decisions (data/comp-review.json) add three things, all Observed Pro Evidence: pro swaps (a champion
// pro teams played in one slot of the comp, with every game, its series, teams and patches; kept apart from the slot's
// `swaps`, which are General Draft Logic), supporting lineups (filed with the comp's variations, LCK archive included)
// a historical mark (the last patch pros picked a slot's champion in that role, shown only once it is not the newest) and
// named variants (a comp shown inside its parent's card; every shell stays in `shells`, so Draft Room links still work).
import { newestGamesFirst, recordStamp } from "./chronology";
import { lineupKey, shellPicks, type LineupRef, type Picks } from "./comp-discovery";
import { comparePatch } from "./patch";
import { gameSourceId } from "./pro-games";
import { ROLES, type CompReview, type CompShell, type DiscoveredComp, type DiscoveredComps, type ProGame, type Role } from "./schema";

/** One recorded game for a lineup, as a variation row shows it. */
export interface ObservedGame {
  game: number; side: "blue" | "red"; team: string; opponent: string; won: boolean;
  date: string; patch: string; tournament: string; url: string;
}
export interface ObservedLineup { picks: Picks; games: ObservedGame[] }
/** A champion pro teams played in one slot of a comp, approved by alan as a supported alternative. Never "the" meta pick:
 *  the series, team and patch counts travel with it so a two-series swap reads as two series. */
export interface ProSwap { champion: string; games: ObservedGame[]; series: number; teams: number; patches: string[] }
/** Under 3 independent series a pro swap is a small sample. */
export const PRO_SWAP_SAMPLE = 3;
export interface LibraryExtra {
  discovered?: Omit<DiscoveredComp, "slots" | "games" | "winCondition" | "why">; // the comp check's read, for Details
  games: ObservedGame[]; // games with the comp's own lineup (a curated shell's own source game left out)
  variations: ObservedLineup[]; // other observed lineups filed under this comp, most games first
  proSwaps?: Partial<Record<Role, ProSwap[]>>;
  historical?: Partial<Record<Role, string>>; // role → last patch pros picked the slot's champion there, when older than the newest
  variantOf?: { parent: string; name: string }; // shown inside the parent's card, never as its own card
  variants?: { id: string; name: string }[];    // a parent's named variants, in review order
}
const NO_REVIEW: CompReview = { proSwaps: [], supporting: [], historical: [], variants: [] };

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

/** `records`: every recorded game the review may cite (the tracked games plus the LCK archive records); defaults to `proGames`. */
export function buildLibrary(shells: CompShell[], file: DiscoveredComps, proGames: ProGame[], review: CompReview = NO_REVIEW, records: ProGame[] = proGames) {
  const games = new Map([...records, ...proGames].map((g) => [g.id, g]));
  const view = (refs: LineupRef[]) => newestGamesFirst(refs.flatMap((r) => { const g = games.get(r.game); return g ? [{ g, v: gameView(g, r.side) }] : []; }),
    (x) => recordStamp(x.g)).map((x) => x.v);
  const all = [...shells, ...file.comps.map((c) => discoveredShell(c, games))];
  // Last patch each champion was picked in each role across every record, and the newest recorded patch.
  const lastPicked = new Map<string, string>();
  let newest: string | undefined;
  for (const g of games.values()) {
    if (!newest || comparePatch(g.patch, newest) > 0) newest = g.patch;
    for (const side of ["blue", "red"] as const) for (const r of ROLES) {
      const k = `${r}:${g[side].picks[r]}`, cur = lastPicked.get(k);
      if (!cur || comparePatch(g.patch, cur) > 0) lastPicked.set(k, g.patch);
    }
  }
  const extras: Record<string, LibraryExtra> = {};
  for (const s of all) {
    const own = lineupKey(shellPicks(s));
    const ownSources = new Set(s.sources);
    const vs = file.variations.filter((v) => v.of === s.id);
    const d = file.comps.find((c) => c.id === s.id);
    // Same lineup, other games: a discovered comp's games after its first; a curated shell's replays minus its own source.
    const replays = d ? view(d.games.slice(1))
      : view(vs.filter((v) => lineupKey(v.picks) === own).flatMap((v) => v.games)).filter((g) => !ownSources.has(gameSourceId({ id: g.game })));
    // Supporting lineups alan approved join the variations (a lineup discovery already filed keeps one row).
    const lineups: { picks: Picks; games: LineupRef[] }[] = vs.filter((v) => lineupKey(v.picks) !== own);
    for (const ref of review.supporting.filter((x) => x.comp === s.id).flatMap((x) => x.games)) {
      const g = games.get(ref.game);
      if (!g || lineups.some((v) => v.games.some((x) => x.game === ref.game && x.side === ref.side))) continue;
      const picks = g[ref.side].picks as Picks;
      const row = lineups.find((v) => lineupKey(v.picks) === lineupKey(picks));
      if (row) lineups[lineups.indexOf(row)] = { ...row, games: [...row.games, ref] };
      else if (lineupKey(picks) !== own) lineups.push({ picks, games: [ref] });
    }
    const variations = lineups.map((v) => ({ picks: v.picks, games: view(v.games) })).filter((v) => v.games.length)
      .sort((a, b) => b.games.length - a.games.length || b.games[0].date.localeCompare(a.games[0].date));
    const proSwaps: Partial<Record<Role, ProSwap[]>> = {};
    for (const x of review.proSwaps.filter((p) => p.comp === s.id)) {
      const rows = x.games.flatMap((r) => { const g = games.get(r.game); return g ? [{ g, r }] : []; });
      (proSwaps[x.role] ??= []).push({
        champion: x.champion, games: view(x.games),
        series: new Set(rows.map(({ g }) => g.seriesId ?? g.id)).size,
        teams: new Set(rows.map(({ g, r }) => g[r.side].team)).size,
        patches: [...new Set(rows.map(({ g }) => g.patch))].sort((a, b) => comparePatch(b, a)),
      });
    }
    const historical: Partial<Record<Role, string>> = {};
    for (const role of review.historical.filter((h) => h.comp === s.id).flatMap((h) => h.roles)) {
      const last = lastPicked.get(`${role}:${s.slots[role].champion}`);
      if (last && newest && comparePatch(last, newest) < 0) historical[role] = last;
    }
    const hasSwaps = Object.keys(proSwaps).length > 0, hasHist = Object.keys(historical).length > 0;
    const parent = review.variants.find((v) => v.comp === s.id);
    const children = review.variants.filter((v) => v.parent === s.id && all.some((x) => x.id === v.comp)).map((v) => ({ id: v.comp, name: v.name }));
    if (!d && !replays.length && !variations.length && !hasSwaps && !hasHist && !parent && !children.length) continue;
    const { slots: _s, games: _g, winCondition: _w, why: _y, ...read } = d ?? ({} as DiscoveredComp);
    extras[s.id] = { ...(d ? { discovered: read } : {}), games: replays, variations, ...(hasSwaps ? { proSwaps } : {}), ...(hasHist ? { historical } : {}),
      ...(parent ? { variantOf: { parent: parent.parent, name: parent.name } } : {}), ...(children.length ? { variants: children } : {}) };
  }
  return { shells: all, extras, lastAddition: file.lastAddition };
}
export type Library = ReturnType<typeof buildLibrary>;
