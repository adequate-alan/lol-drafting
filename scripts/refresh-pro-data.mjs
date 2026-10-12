#!/usr/bin/env node
// Daily pro-data refresh (run by .github/workflows/refresh-pro-data.yml, or by hand):
//
//   node scripts/refresh-pro-data.mjs [--dry-run] [--builds-only]
//
// Reads Gol.gg with plain GET/POST requests a few seconds apart, as a browser would load the same public pages. A
// refused request (403, 429, a challenge page) stops the run with an error: it is never retried around, and nothing is
// written. Writes data/pro-games.json, data/meta.json, data/sources.json, data/pro-builds.json and data/build-assets.json
// (player builds and their Data Dragon names and icons) only when verified data changed, and
// reports `changed=true|false` to GitHub Actions.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { refresh } from "./golgg/refresh.mjs";
import { compactJson } from "./golgg/builds.mjs";

const dry = process.argv.includes("--dry-run");
const buildsOnly = process.argv.includes("--builds-only"); // backfill player builds for games already recorded; nothing else
const dataDir = join(process.cwd(), "data");
const read = (f, fallback) => (fallback && !existsSync(join(dataDir, f)) ? fallback : JSON.parse(readFileSync(join(dataDir, f), "utf8")));
const write = (f, v) => writeFileSync(join(dataDir, f), JSON.stringify(v, null, 2) + "\n");

const UA = "lol-drafting-refresh/1.0 (+https://github.com/adequate-alan/lol-drafting; twice daily, a few pages)";
const PAUSE_MS = Number(process.env.GOLGG_PAUSE_MS ?? 2500);
let requests = 0, last = 0;

async function get(url, { method = "GET", body } = {}) {
  const wait = last + PAUSE_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  requests += 1;
  const res = await fetch(url, {
    method, body, signal: AbortSignal.timeout(30000),
    headers: { "User-Agent": UA, ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
  });
  const text = await res.text();
  if (res.headers.get("cf-mitigated") || /challenge-platform|cf-chl|<title>Just a moment/i.test(text))
    throw new Error(`${url}: the site answered with a bot challenge. Not bypassed; nothing written.`);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}. Nothing written.`);
  return text;
}

const data = { proGames: read("pro-games.json"), meta: read("meta.json"), sources: read("sources.json"), champions: read("champions.json"), botPairings: read("bot-pairings.json"),
  proBuilds: read("pro-builds.json", { builds: [], unavailable: [] }), buildAssets: read("build-assets.json", { patches: {} }) };
const out = await refresh(data, get, { buildsOnly });

const lines = [
  `Checked ${new Date().toISOString()} with ${requests} request${requests === 1 ? "" : "s"}.`,
  ...out.report,
  ...(out.rejected.length ? ["", "Not imported (kept out until the source agrees):", ...out.rejected.map((r) => `- ${r}`)] : []),
  "", out.changed.length ? `Data changed: ${out.changed.join(", ")}.` : "No verified data changed; nothing written.",
];
console.log(lines.join("\n"));
for (const r of out.rejected) console.log(`::warning title=Pro data not imported::${r.replace(/\n/g, " ")}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Pro-data refresh\n\n${lines.join("\n")}\n`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${out.changed.length > 0}\n`);

if (out.changed.length && !dry) {
  write("pro-games.json", out.proGames);
  write("meta.json", out.meta);
  write("sources.json", out.sources);
  writeFileSync(join(dataDir, "pro-builds.json"), compactJson(out.proBuilds));
  writeFileSync(join(dataDir, "build-assets.json"), compactJson(out.buildAssets));
}
