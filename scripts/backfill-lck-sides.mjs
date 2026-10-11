#!/usr/bin/env node
// One-time backfill (alan, 2026-10-11): blue / red side, winner and date for the LCK 2026 Season Playoffs games the
// stored drafts already cite. It is not part of the daily refresh, which still requests only the tracked tournaments.
//
//   node scripts/backfill-lck-sides.mjs [--dry-run]
//
// For each cited game it reads the existing Gol.gg URLs (page-game: sides, result, date; page-fullstats: roles) with
// plain requests a few seconds apart. A side is set only when one side of the page shows exactly the five champions of
// a stored draft, role for role (or, when Gol.gg has no role table for the game, the same five champions in that side's
// pick row); nothing is inferred from team names, row order or the winner. Games that cannot be
// matched are reported and left without a side. Writes data/sources.json only (the game-level record each team row
// inherits from); drafts, champions, roles, teams and evidence ids are untouched. A refused request stops the run.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseFullstats, parseGamePage } from "./golgg/parse.mjs";
import { championResolver, gameUrl, ROLES } from "./golgg/normalize.mjs";

const TOURNAMENT = "LCK 2026 Season Playoffs";
const dry = process.argv.includes("--dry-run");
const dataDir = join(process.cwd(), "data");
const read = (f) => JSON.parse(readFileSync(join(dataDir, f), "utf8"));
const UA = "lol-drafting-backfill/1.0 (+https://github.com/adequate-alan/lol-drafting; one-time, a few pages)";
const PAUSE_MS = Number(process.env.GOLGG_PAUSE_MS ?? 2500);
let last = 0;

async function get(url) {
  const wait = last + PAUSE_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const res = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { "User-Agent": UA } });
  const body = await res.text();
  if (res.headers.get("cf-mitigated") || /challenge-platform|cf-chl|<title>Just a moment/i.test(body))
    throw new Error(`${url}: the site answered with a bot challenge. Not bypassed; nothing written.`);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}. Nothing written.`);
  return body;
}

const drafts = read("pro-drafts.json").filter((d) => d.tournament === TOURNAMENT);
const sources = read("sources.json");
const resolve = championResolver(read("champions.json"));
const today = new Date().toISOString().slice(0, 10);
const byId = new Map(sources.map((s) => [s.id, s]));
const gameIds = [...new Set(drafts.flatMap((d) => d.sources))].filter((id) => byId.get(id)?.type === "golgg-game");

const report = [], unresolved = [];
for (const sid of gameIds) {
  const src = byId.get(sid);
  if (src.sides) continue; // already recovered from its page
  const num = Number((src.url.match(/game\/stats\/(\d+)\//) ?? [])[1]);
  const mine = drafts.filter((d) => d.sources.includes(sid));
  const fail = (why) => { unresolved.push(`${sid} (${mine.map((d) => `${d.team} ${d.seriesGame}`).join(", ")}): ${why}`); };
  if (!num) { fail("no game id in the URL"); continue; }
  const page = parseGamePage(await get(gameUrl(num)));
  const stats = parseFullstats(await get(gameUrl(num, "page-fullstats")));
  if (!/LCK/i.test(page.tournament ?? "")) { fail(`page tournament is "${page.tournament}"`); continue; }
  const roleOf = { TOP: "TOP", JUNGLE: "JUNGLE", MID: "MID", ADC: "BOT", BOT: "BOT", SUPPORT: "SUPPORT" };
  const picks = {}, picked = {};
  for (const color of ["blue", "red"]) {
    picks[color] = {};
    for (const { champion, role } of stats?.[color] ?? []) picks[color][roleOf[role]] = resolve(champion);
    // The side panel's five picks (draft order, no roles): enough to tell the sides apart when the role table is missing.
    picked[color] = new Set((page[color]?.picks ?? []).map(resolve).filter(Boolean));
  }
  const byRole = !!stats;
  if (!byRole && !["blue", "red"].every((c) => picked[c].size === 5)) { fail("no role table and no five picks per side on the game page"); continue; }
  const results = { blue: page.blue?.result, red: page.red?.result };
  if (!((results.blue === "WIN") !== (results.red === "WIN") && results.blue && results.red)) { fail("page shows no single winner"); continue; }
  const sideFor = (d) => ["blue", "red"].filter((c) => byRole
    ? ROLES.every((r) => picks[c][r] === d.picks[r])
    : ROLES.every((r) => picked[c].has(d.picks[r])));
  const matched = mine.map((d) => ({ d, sides: sideFor(d) }));
  const bad = matched.find((m) => m.sides.length !== 1);
  if (bad) { fail(`${bad.d.team}'s stored picks match ${bad.sides.length} sides of the page`); continue; }
  if (new Set(matched.map((m) => m.sides[0])).size !== matched.length) { fail("both stored drafts match the same side"); continue; }
  const gameNo = Number((mine[0].seriesGame.match(/G(\d+)$/) ?? [])[1]);
  if (gameNo && page.game && gameNo !== page.game) { fail(`stored as game ${gameNo}, page is game ${page.game}`); continue; }
  // Team names as the stored drafts write them: a matched draft names its side; the other side is its opponent.
  const sides = {};
  for (const { d, sides: [c] } of matched) { sides[c] = d.team; sides[c === "blue" ? "red" : "blue"] ??= d.opponent; }
  for (const { d, sides: [c] } of matched) if (sides[c === "blue" ? "red" : "blue"] !== d.opponent) { fail(`${d.team}'s opponent ${d.opponent} is not on the other side`); }
  if (unresolved.some((u) => u.startsWith(sid))) continue;
  const winner = results.blue === "WIN" ? "blue" : "red";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(page.date ?? "") ? page.date : undefined;
  Object.assign(src, { sides: { blue: sides.blue, red: sides.red, winner }, ...(date ? { date } : {}) });
  if (!src.pendingClaim) Object.assign(src, { lastChecked: today, refreshStatus: "verified", origin: "golgg-refresh" });
  report.push(`${sid}${byRole ? "" : " (matched by the five picks; no role table)"}: blue ${sides.blue} (page: ${page.blue?.team}), red ${sides.red} (page: ${page.red?.team}), ${winner} won, ${date ?? "no date"}`);
}

const lines = [`LCK side backfill, ${gameIds.length} games cited by stored drafts.`, ...report,
  ...(unresolved.length ? ["", "Left without a side:", ...unresolved.map((u) => `- ${u}`)] : ["", "Every cited game resolved."])];
console.log(lines.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## LCK side backfill\n\n${lines.join("\n")}\n`);
if (!dry && report.length) writeFileSync(join(dataDir, "sources.json"), JSON.stringify(sources, null, 2) + "\n");
