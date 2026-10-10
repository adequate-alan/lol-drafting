import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { z } from "zod";
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
export const getBotPairings = () => load("bot-pairings.json");
export const getMidJungle = () => load("mid-jungle.json");
export const getTopPicks = () => load("top.json");
export const getProDrafts = () => load("pro-drafts.json");
export const getCompShells = () => load("comp-shells.json");
export const getPool = () => load("pool.json");
export const getMeta = () => load("meta.json");
export const getGenG = () => load("geng.json");
export const getRules = () => load("rules.json");

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
  };
}
export type DraftData = ReturnType<typeof getDraftData>;
