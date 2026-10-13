#!/usr/bin/env node
// One-time backfill (2026-10-13, Top draft analysis): which side picked first in every stored game. Since 2026 the
// first-picking team is not always blue (Gol.gg marks it with "First Pick" on the game page), so the interleaved draft
// order needs it. Reads each stored game's existing Gol.gg page-game URL with plain requests a few seconds apart, for
// data/pro-games.json games (Demacia Cup; the daily refresh does the same for new games) and the LCK 2026 Season
// Playoffs records in data/pro-builds.json `games` (frozen archive; this run is not part of the daily refresh).
//
//   node scripts/backfill-first-pick.mjs [--dry-run]
//
// A game is updated only when its page shows the stored teams, picks and bans, exactly one side carries the mark and
// the turns Gol.gg draws match the draft (pickOrderFor / firstPickOf). The page's per-team order must also equal the
// stored pickOrder. Anything else is reported and left unset. A refused request or a challenge stops the run.
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { parseGamePage } from "./golgg/parse.mjs";
import { championResolver, gameUrl, pickOrderFor } from "./golgg/normalize.mjs";
import { compactJson } from "./golgg/builds.mjs";

const dry = process.argv.includes("--dry-run");
const dataDir = join(process.cwd(), "data");
const read = (f) => JSON.parse(readFileSync(join(dataDir, f), "utf8"));
const UA = "lol-drafting-backfill/1.0 (+https://github.com/adequate-alan/lol-drafting; one-time, a few pages)";
const PAUSE_MS = Number(process.env.GOLGG_PAUSE_MS ?? 2500);
let last = 0;

async function get(url, tries = 3) {
  const wait = last + PAUSE_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  let res, body;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { "User-Agent": UA } });
    body = await res.text();
  } catch (e) {
    if (tries > 1) return get(url, tries - 1);
    throw e;
  }
  if (res.headers.get("cf-mitigated") || /challenge-platform|cf-chl|<title>Just a moment/i.test(body))
    throw new Error(`${url}: the site answered with a bot challenge. Not bypassed.`);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}.`);
  return body;
}

const resolve = championResolver(read("champions.json"));
const files = { "pro-games.json": read("pro-games.json"), "pro-builds.json": read("pro-builds.json") };
const report = [], problems = [];
let stopped;
for (const [file, data] of Object.entries(files)) {
  let set = 0;
  for (const g of data.games ?? []) {
    if (g.firstPick) continue;
    try {
      const got = pickOrderFor(g, parseGamePage(await get(gameUrl(g.id))), resolve);
      if (got.problems) { problems.push(`${g.id} ${g.series} G${g.game}: ${got.problems.join("; ")}`); continue; }
      if (!got.firstPick) { problems.push(`${g.id} ${g.series} G${g.game}: no clear First Pick mark`); continue; }
      if (g.blue.pickOrder && g.blue.pickOrder.join() !== got.blue.join()) { problems.push(`${g.id}: blue pick order differs from the stored one`); continue; }
      if (g.red.pickOrder && g.red.pickOrder.join() !== got.red.join()) { problems.push(`${g.id}: red pick order differs from the stored one`); continue; }
      g.blue.pickOrder = got.blue;
      g.red.pickOrder = got.red;
      g.firstPick = got.firstPick;
      set += 1;
    } catch (e) { stopped = String(e.message ?? e); break; }
  }
  report.push(`${file}: first pick stored for ${set} game${set === 1 ? "" : "s"}.`);
  if (!dry && set) writeFileSync(join(dataDir, file), file === "pro-builds.json" ? compactJson(data) : JSON.stringify(data, null, 2) + "\n");
  if (stopped) break;
}
const out = [...report, ...(stopped ? [`Stopped: ${stopped}`] : []), ...problems.map((p) => `Not set: ${p}`)].join("\n");
console.log(out);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, out + "\n");
