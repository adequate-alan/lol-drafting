import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { z } from "zod";
import { buildLibrary, type Library } from "./comp-library";
import { withProAlternatives } from "./pro-alternatives";
import { withGameSides } from "./draft-side";
import { draftsFromGames, freshness, resultsFromGames, sourcesFromGames } from "./pro-games";
import { priorityData, priorityMarks, type PriorityData } from "./pro-priority";
import { withoutConfirmed } from "./proposed";
import { Files } from "./schema";

// Data lives in /data and is read at build time; the static export embeds what each page renders.
type FileName = keyof typeof Files;
type Parsed<F extends FileName> = z.infer<(typeof Files)[F]>;

const cache = new Map<FileName, unknown>();
function load<F extends FileName>(file: F): Parsed<F> {
  if (!cache.has(file)) {
    const raw = JSON.parse(readFileSync(join(process.cwd(), "data", file), "utf8"));
    cache.set(file, Files[file].parse(raw));
  }
  return cache.get(file) as Parsed<F>;
}

export const getChampions = () => load("champions.json");
// Imported pro games (data/pro-games.json, refreshed daily from Gol.gg) join the hand-recorded drafts, sources and
// results here, so every page reads one list. Each game is stored once; its two drafts and its source are derived.
export const getProGames = () => load("pro-games.json");
let sources: Parsed<"sources.json"> | undefined, drafts: Parsed<"pro-drafts.json"> | undefined, counters: Parsed<"counters.json"> | undefined;
export const getSources = () => (sources ??= [...load("sources.json"), ...sourcesFromGames(getProGames().games, load("sources.json"))]);
export const getProFreshness = () => freshness(getProGames());
// Pro pairings not already saved join the alternatives, marked as pro-derived (alan, 2026-10-10).
let bots: Parsed<"bot-pairings.json"> | undefined, midJungle: Parsed<"mid-jungle.json"> | undefined;
export const getBotPairings = () => (bots ??= load("bot-pairings.json").map(withProAlternatives));
export const getMidJungle = () => (midJungle ??= load("mid-jungle.json").map(withProAlternatives));
export const getTopPicks = () => load("top.json");
export const getProDrafts = () => (drafts ??= [
  ...withGameSides(load("pro-drafts.json"), Object.fromEntries(getSources().map((s) => [s.id, s]))),
  ...draftsFromGames(getProGames().games),
]);
export const getCompShells = () => load("comp-shells.json");
// Comp Library: the hand-written shells plus the weekly discovery's Observed Pro Comps and observed variations.
let library: Library | undefined;
export const getLibrary = () => (library ??= buildLibrary(getCompShells(), load("discovered-comps.json"), getProGames().games));
export const getPool = () => load("pool.json");
export const getMeta = () => load("meta.json");
export const getGenG = () => load("geng.json");
export const getRules = () => load("rules.json");
// Pro Priority: per-patch pick/ban presence from complete game records or single-patch tournament tables (lib/pro-priority.ts).
let priority: PriorityData | undefined;
export const getPriority = () => (priority ??= priorityData(getMeta(), getProGames(), load("pro-drafts.json")));
export const getCounters = () => (counters ??= ((c) => ({ ...c, proResults: [...c.proResults, ...resultsFromGames(getProGames().games, c.proResults)] }))(load("counters.json")));
// Synergy · Proposed: Claude's kit-based partners, minus every pairing alan already confirmed (lib/proposed.ts).
let proposed: Parsed<"proposed-synergy.json"> | undefined;
export const getProposed = () => (proposed ??= withoutConfirmed(load("proposed-synergy.json"), { botPairings: getBotPairings(), midJungle: getMidJungle(), topPicks: getTopPicks() }));

// Everything the interactive Draft Room needs in the browser.
export function getDraftData() {
  return {
    champions: getChampions(),
    botPairings: getBotPairings(),
    midJungle: getMidJungle(),
    topPicks: getTopPicks(),
    proDrafts: getProDrafts(),
    shells: getLibrary().shells,
    pool: getPool(),
    events: getMeta().events,
    counters: getCounters(),
    proposed: getProposed().records,
    priority: priorityMarks(getPriority()), // a label on rows, never read by the ranking
  };
}
export type DraftData = ReturnType<typeof getDraftData>;

// Everything the champion drawer (Comp Library, Meta) needs in the browser.
export function getDrawerData() {
  return {
    champions: getChampions(),
    botPairings: getBotPairings(),
    midJungle: getMidJungle(),
    topPicks: getTopPicks(),
    proDrafts: getProDrafts(),
    pool: getPool(),
    meta: getMeta(),
    sources: Object.fromEntries(getSources().map((s) => [s.id, s])),
    proposed: getProposed().records,
    priority: getPriority(),
  };
}
export type DrawerData = ReturnType<typeof getDrawerData>;

// Champions whose only mid/jungle profile is a jungle one: where an old combined Mid / Jungle link without a role goes.
export const jungleOnlyIds = () => {
  const mj = getMidJungle();
  const plays = (id: string, role: "MID" | "JUNGLE") => mj.some((r) => r.anchor === id && r.role === role)
    || getChampions().some((c) => c.id === id && !c.rosterOnly && c.roles.includes(role));
  const ids = new Set([...mj.map((r) => r.anchor), ...getChampions().filter((c) => c.roles.includes("JUNGLE")).map((c) => c.id)]);
  return [...ids].filter((id) => plays(id, "JUNGLE") && !plays(id, "MID")).sort();
};
