#!/usr/bin/env node
// One-time backfill (alan, 2026-10-12: "populate it with the lck playoff games too"): every player's build for the
// LCK 2026 Season Playoffs games, for the Pro Builds page. The LCK playoffs stay a frozen archive: the daily refresh
// still requests only the tracked tournaments, and this script is not part of it.
//
//   node scripts/backfill-lck-builds.mjs [--dry-run]
//
// Reads the tournament's Gol.gg match list, then each game's page-game and page-fullstats with plain requests a few
// seconds apart, and keeps a game record only when buildGame verifies it (same checks as the daily refresh; nothing is
// inferred, a game missing a field is reported and left out). Builds come from the same Gol.gg answer the daily refresh
// reads. Writes data/pro-builds.json (builds, plus the archive game records in `games`) and data/build-assets.json only.
// Drafts, sources, tournament totals and pro-games.json are untouched. A refused request stops the run; nothing written.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseFullstats, parseGamePage, parseMatchlist } from "./golgg/parse.mjs";
import { buildGame, championResolver, gameUrl, seriesProblems } from "./golgg/normalize.mjs";
import { compactJson } from "./golgg/builds.mjs";
import { refreshBuilds, urls } from "./golgg/refresh.mjs";

const TOURNAMENT = "LCK 2026 Season Playoffs";
const EVENT = "lck-2026-playoffs";
const dry = process.argv.includes("--dry-run");
const dataDir = join(process.cwd(), "data");
const read = (f) => JSON.parse(readFileSync(join(dataDir, f), "utf8"));
const UA = "lol-drafting-backfill/1.0 (+https://github.com/adequate-alan/lol-drafting; one-time, a few pages)";
const PAUSE_MS = Number(process.env.GOLGG_PAUSE_MS ?? 2500);
let last = 0, requests = 0;
const cache = new Map(); // a game page read for the record is not requested again for its player ids

async function get(url, { method = "GET", body } = {}) {
  if (method === "GET" && cache.has(url)) return cache.get(url);
  const wait = last + PAUSE_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  requests += 1;
  // A connection that never opens (timeout, reset) is retried twice after a pause; an answer, any answer, is not retried.
  let res;
  for (let attempt = 0; ; attempt += 1) {
    try {
      res = await fetch(url, {
        method, body, signal: AbortSignal.timeout(30000),
        headers: { "User-Agent": UA, ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
      });
      break;
    } catch (e) {
      if (attempt >= 2) throw e;
      console.log(`${url}: ${e.cause?.code ?? e.message}; trying again in ${30 * (attempt + 1)}s.`);
      await new Promise((r) => setTimeout(r, 30000 * (attempt + 1)));
    }
  }
  const text = await res.text();
  if (res.headers.get("cf-mitigated") || /challenge-platform|cf-chl|<title>Just a moment/i.test(text))
    throw new Error(`${url}: the site answered with a bot challenge. Not bypassed; nothing written.`);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}. Nothing written.`);
  if (method === "GET") cache.set(url, text);
  return text;
}

const champions = read("champions.json");
const resolve = championResolver(champions);
const proGames = read("pro-games.json");
const proBuilds = read("pro-builds.json");
const buildAssets = read("build-assets.json");
const today = new Date().toISOString().slice(0, 10);
if (proGames.tracked.some((t) => t.event === EVENT)) throw new Error(`${EVENT} is tracked by the daily refresh; this backfill is for the archive only.`);

const ml = parseMatchlist(await get(urls.matchlist(TOURNAMENT)));
if (ml.caption !== `${TOURNAMENT} results`) throw new Error(`match list page has caption "${ml.caption}"`);
const played = ml.series.filter((s) => s.score);
const totalGames = played.reduce((n, s) => n + s.score[0] + s.score[1], 0);

const games = [], rejected = [];
const known = new Set((proBuilds.games ?? []).map((g) => g.id));
for (const s of played) {
  const first = parseGamePage(await get(gameUrl(s.id)));
  const ids = first.seriesGames.map((g) => g.id);
  if (!ids.length) { rejected.push(`${s.title} (${s.date ?? "no date"}): no games in the series menu.`); continue; }
  const fresh = [];
  for (const id of ids) {
    const page = id === s.id ? first : parseGamePage(await get(gameUrl(id)));
    if (!page.blue?.result || !page.red?.result) { rejected.push(`${s.title} (${gameUrl(id)}): no result on the game page.`); continue; }
    const stats = parseFullstats(await get(gameUrl(id, "page-fullstats")));
    const built = buildGame(id, page, stats, { tournament: TOURNAMENT, event: EVENT, seriesId: s.id, teams: [s.team1, s.team2] }, resolve, today);
    if (built.problems) { rejected.push(`${s.title} game ${page.game ?? "?"} (${gameUrl(id)}): ${built.problems.join("; ")}`); continue; }
    fresh.push(built.game);
  }
  const problems = seriesProblems(s, fresh);
  if (problems.length) { rejected.push(...problems); continue; }
  games.push(...fresh);
}
games.sort((a, b) => a.date.localeCompare(b.date) || a.seriesId - b.seriesId || a.game - b.game);

// Keep any archive record stored earlier that this run did not re-verify; replace the ones it did.
const byId = new Map((proBuilds.games ?? []).map((g) => [g.id, g]));
for (const g of games) byId.set(g.id, g);
const archive = [...byId.values()].sort((a, b) => a.date.localeCompare(b.date) || a.seriesId - b.seriesId || a.game - b.game);
// A few games at a time, so a run that stops part way (a refused request, a lost connection) still writes every game it
// finished; the next run skips games that already have builds.
let out = { proBuilds: { ...proBuilds, games: archive }, buildAssets, report: [], rejected: [] };
let stopped;
for (let i = 0; i < archive.length; i += 5) {
  try {
    const step = await refreshBuilds({ proGames, champions, proBuilds: out.proBuilds, buildAssets: out.buildAssets }, get, today, Infinity, { only: archive.slice(i, i + 5) });
    out = { ...step, report: [...out.report, ...step.report], rejected: [...out.rejected, ...step.rejected] };
  } catch (e) { stopped = e; break; }
}

const lckBuilds = out.proBuilds.builds.filter((b) => byId.has(b.game));
const withBuilds = new Set(lckBuilds.map((b) => b.game));
const lines = [
  `LCK builds backfill, ${new Date().toISOString()}, ${requests} requests.`,
  `${TOURNAMENT}: ${played.length} series, ${totalGames} games on the match list; ${games.length} game records verified${known.size ? ` (${known.size} stored before)` : ""}.`,
  `Builds: ${withBuilds.size} games, ${lckBuilds.length} player builds (${lckBuilds.filter((b) => b.missing?.length).length} with a missing part).`,
  ...new Set(out.report.filter((l) => !/player builds stored/.test(l))),
  ...(stopped ? ["", `Stopped early: ${stopped.message}${stopped.cause?.code ? ` (${stopped.cause.code})` : ""}. Finished games are written; run again to continue.`] : []),
  ...([...rejected, ...out.rejected].length ? ["", "Not imported:", ...[...rejected, ...out.rejected].map((r) => `- ${r}`)] : []),
];
console.log(lines.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## LCK builds backfill\n\n${lines.join("\n")}\n`);
if (!dry && withBuilds.size) {
  // Only games that got builds are kept as archive records: the records exist to give those builds their context.
  out.proBuilds.games = archive.filter((g) => withBuilds.has(g.id));
  writeFileSync(join(dataDir, "pro-builds.json"), compactJson(out.proBuilds));
  writeFileSync(join(dataDir, "build-assets.json"), compactJson(out.buildAssets));
}
if (stopped) process.exit(1);
