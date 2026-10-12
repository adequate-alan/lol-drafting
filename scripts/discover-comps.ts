#!/usr/bin/env -S npx tsx
// Weekly Comp Library discovery (run by .github/workflows/discover-comps.yml, or by hand):
//
//   npx tsx scripts/discover-comps.ts [--dry-run] [--today=YYYY-MM-DD]
//
// Reads the stored pro dataset (data/pro-games.json, kept current by the daily refresh; nothing is downloaded), runs
// lib/comp-discovery.ts and writes data/discovered-comps.json only when the library changed. The weekly report goes to
// reports/comp-discovery.md and the Actions run summary. Reports `changed=true|false` to GitHub Actions. Never writes
// any other data file: saved synergy, pool tiers and proposed synergy are untouched.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { discover, weeklyReport } from "../lib/comp-discovery";
import { convertKits } from "../lib/model-v2/kits";
import { freshness } from "../lib/pro-games";
import type { z } from "zod";
import { Files, type DiscoveredComps } from "../lib/schema";

const dry = process.argv.includes("--dry-run");
const today = process.argv.find((a) => a.startsWith("--today="))?.slice(8)
  ?? new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error(`--today must be YYYY-MM-DD, got ${today}`);

const root = process.cwd();
type FileName = keyof typeof Files;
const read = <F extends FileName>(f: F): z.infer<(typeof Files)[F]> => Files[f].parse(JSON.parse(readFileSync(join(root, "data", f), "utf8")));
const OUT = join(root, "data", "discovered-comps.json");
const REPORT = join(root, "reports", "comp-discovery.md");
const empty: DiscoveredComps = { lastAddition: null, comps: [], variations: [] };

const champions = read("champions.json");
const proGames = read("pro-games.json");
const shells = read("comp-shells.json");
const previous = existsSync(OUT) ? read("discovered-comps.json") : empty;
const names = new Map(champions.map((c) => [c.id, c.name]));
const nameOf = (id: string) => names.get(id) ?? id;

const result = discover({
  games: proGames.games, events: proGames.tracked.map((t) => t.event), shells, kits: convertKits(champions), nameOf, previous, today,
});
const file = Files["discovered-comps.json"].parse(result.file);
const text = JSON.stringify(file, null, 2) + "\n";
const changed = !existsSync(OUT) || readFileSync(OUT, "utf8") !== text;

const report = weeklyReport({
  result, previous, shells, lck: read("pro-drafts.json"), nameOf, today,
  tournaments: freshness(proGames).map((t) => ({ label: t.label, status: t.status, recorded: t.recorded, games: t.games, listed: t.listed })),
});
const summary = [
  `${file.comps.length} discovered comps (${file.comps.filter((c) => !previous.comps.some((p) => p.id === c.id)).length} new), ${file.variations.length} observed variation lineups, ${result.candidates.length + result.unread.length} proposed for review.`,
  changed ? "Library data changed." : "No library change; nothing written.",
].join(" ");
console.log(report);
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n**${summary}**\n`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);

if (!dry) {
  mkdirSync(join(root, "reports"), { recursive: true });
  writeFileSync(REPORT, report);
  if (changed) writeFileSync(OUT, text);
}
