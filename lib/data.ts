import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { z } from "zod";
import { withProAlternatives } from "./pro-alternatives";
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
export const getSources = () => load("sources.json");
// Pro pairings not already saved join the alternatives, marked as pro-derived (alan, 2026-10-10).
let bots: Parsed<"bot-pairings.json"> | undefined, midJungle: Parsed<"mid-jungle.json"> | undefined;
export const getBotPairings = () => (bots ??= load("bot-pairings.json").map(withProAlternatives));
export const getMidJungle = () => (midJungle ??= load("mid-jungle.json").map(withProAlternatives));
export const getTopPicks = () => load("top.json");
export const getProDrafts = () => load("pro-drafts.json");
export const getCompShells = () => load("comp-shells.json");
export const getPool = () => load("pool.json");
export const getMeta = () => load("meta.json");
export const getGenG = () => load("geng.json");
export const getRules = () => load("rules.json");
export const getCounters = () => load("counters.json");
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
    shells: getCompShells(),
    pool: getPool(),
    events: getMeta().events,
    counters: getCounters(),
    proposed: getProposed().records,
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
  };
}
export type DrawerData = ReturnType<typeof getDrawerData>;
