#!/usr/bin/env node
// Daily patch-notes check (run by .github/workflows/refresh-patch-notes.yml, or by hand):
//
//   node scripts/refresh-patch-notes.mjs [--dry-run] [--force]
//
// Reads Riot's official patch notes (leagueoflegends.com; robots.txt allows it) with plain GET requests, a couple of
// seconds apart. A refused request or a challenge page stops the run: nothing is retried around and nothing is written.
// Writes data/patch-notes.json only when Summoner's Rift content changed, and reports `changed=true|false`.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { refresh } from "./riot/refresh.mjs";

const dry = process.argv.includes("--dry-run"), force = process.argv.includes("--force");
const dataDir = join(process.cwd(), "data");
const read = (f) => JSON.parse(readFileSync(join(dataDir, f), "utf8"));

const UA = "lol-drafting-patch-notes/1.0 (+https://github.com/adequate-alan/lol-drafting; daily, a few pages)";
const PAUSE_MS = Number(process.env.RIOT_PAUSE_MS ?? 2000);
let requests = 0, last = 0;
async function get(url) {
  const wait = last + PAUSE_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  requests += 1;
  const res = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { "User-Agent": UA, "Accept-Language": "en-US" } });
  const text = await res.text();
  if (res.headers.get("cf-mitigated") || /challenge-platform|cf-chl|<title>Just a moment/i.test(text))
    throw new Error(`${url}: the site answered with a bot challenge. Not bypassed; nothing written.`);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}. Nothing written.`);
  return text;
}

const out = await refresh({ patchNotes: read("patch-notes.json"), champions: read("champions.json") }, get, { force });
const lines = [
  `Checked ${new Date().toISOString()} with ${requests} request${requests === 1 ? "" : "s"}.`, ...out.report,
  ...(out.warnings.length ? ["", "Warnings:", ...out.warnings.map((w) => `- ${w}`)] : []),
  "", out.changed.length ? `Patch notes changed: ${out.changed.join(", ")}.` : "No Summoner's Rift change; nothing written.",
];
console.log(lines.join("\n"));
for (const w of out.warnings) console.log(`::warning title=Patch notes::${w.replace(/\n/g, " ")}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Patch-notes check\n\n${lines.join("\n")}\n`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${out.changed.length > 0}\n`);
if (out.changed.length && !dry) writeFileSync(join(dataDir, "patch-notes.json"), JSON.stringify(out.patchNotes, null, 2) + "\n");
