// Ingest a DPM.LOL lane-matchup collection into data/counters.json (alan, 2026-10-22).
//
// DPM.LOL answers Claude's environments and GitHub runners with a Cloudflare challenge (dpm-probe.yml), so the data is
// collected in alan's own browser on his Mac from each champion's Build page (robots.txt keeps every agent off the
// versus pages and the players' versus / synergy API); the procedure and the in-page routine live in
// scripts/dpm-collect/. This script turns that export into stored rows, and it refuses rather than writes when anything
// is off (the checks are lib/dpm-export.ts; scripts/dpm-validate.ts prints them in full):
//
//   - one patch and one rank bracket per collection; patches are never combined
//   - every champion and enemy maps to the roster (DPM's spellings included), the champion plays the role, no duplicate
//   - a collection that covers fewer champion/roles, or far fewer rows, than the stored one for the same scope is
//     refused (a failed or partial read never overwrites valid data) unless --allow-shrink
//   - an older patch than the stored one is refused unless --allow-older
//
// The stored rows are archived first, gzipped, in data/dpm-history/<patch>-<collected>.json.gz, for comparison and
// rollback. Saved pairings, pool tiers, kits and every score are untouched: counters are labels.
//
//   npx tsx scripts/ingest-dpm.ts <export.json> [--dry-run] [--allow-shrink] [--allow-older]
//
// Export format: see DpmExport in lib/schema.ts. winRate in percent (58.49) or as a fraction (0.5849); champion names as
// DPM writes them; delta as DPM shows it, stored apart from the win rate; inFullList stored as `shown`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { qualifies, readExport, validateExport } from "../lib/dpm-export";
import { comparePatch, parsePatch, shortPatch } from "../lib/patch";
import { Counters, DpmExport, Files, type DpmMatchup } from "../lib/schema";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const flag = (f: string) => args.includes(f);
if (!file) { console.error("usage: npx tsx scripts/ingest-dpm.ts <export.json> [--dry-run] [--allow-shrink] [--allow-older]"); process.exit(2); }

const root = process.cwd();
const fail = (msg: string): never => { console.error(`Refused: ${msg}\nNothing was written.`); process.exit(1); };

const parsed = DpmExport.safeParse(JSON.parse(readFileSync(file, "utf8")));
const exp = parsed.success ? parsed.data : fail(`the export is not a DPM collection: ${parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
if (!parsePatch(exp.patch)) fail(`unreadable patch "${exp.patch}"`);

const champions = Files["champions.json"].parse(JSON.parse(readFileSync(join(root, "data/champions.json"), "utf8")));
const pool = Files["pool.json"].parse(JSON.parse(readFileSync(join(root, "data/pool.json"), "utf8")));
const report = validateExport(exp, champions, pool);
if (!report.ok) fail(report.problems.join("\n  "));
for (const w of report.warnings) console.warn(`Note: ${w}`);
const { rows } = readExport(exp, champions);
const patch = shortPatch(exp.patch); // stored in the client / pro-data spelling, like every other pro-data row

const path = join(root, "data/counters.json");
const stored = Counters.parse(JSON.parse(readFileSync(path, "utf8")));
const oldPatch = stored.dpm[0]?.patch;
const oldRank = stored.dpm[0]?.rank;
if (oldPatch && comparePatch(patch, oldPatch) < 0 && !flag("--allow-older")) fail(`patch ${exp.patch} is older than the stored ${oldPatch}`);
if (oldRank && oldRank !== exp.rank) console.warn(`Note: rank bracket changes from ${oldRank} to ${exp.rank}.`);

// Completeness against the stored collection: same champion/role pages, about as many rows.
const pagesOf = (list: DpmMatchup[]) => new Set(list.map((r) => `${r.role}|${r.champion}`));
const before = pagesOf(stored.dpm), after = pagesOf(rows);
const lost = [...before].filter((k) => !after.has(k));
if (lost.length && !flag("--allow-shrink")) fail(`${lost.length} champion/role pages in the stored data are missing: ${lost.slice(0, 12).join(", ")}${lost.length > 12 ? " …" : ""}`);
if (rows.length < stored.dpm.length * 0.8 && !flag("--allow-shrink")) fail(`${rows.length} rows against ${stored.dpm.length} stored: looks like a partial read`);

const MIN_GAMES = 300;
const sampledPages = (list: DpmMatchup[]) => new Set(list.filter((r) => r.games >= MIN_GAMES).map((r) => `${r.role}|${r.champion}`));
const nowSampled = [...sampledPages(rows)].filter((k) => !sampledPages(stored.dpm).has(k));
console.log(`Patch ${exp.patch} (${exp.rank}), collected ${exp.collectedOn}: ${rows.length} rows from ${after.size} champion/role pages (stored: ${stored.dpm.length} rows, ${before.size} pages, patch ${oldPatch ?? "none"}).`);
console.log(`Rows with ${MIN_GAMES}+ games: ${rows.filter((r) => r.games >= MIN_GAMES).length} (stored ${stored.dpm.filter((r) => r.games >= MIN_GAMES).length}). Qualifying counters: ${rows.filter(qualifies).length} (stored ${stored.dpm.filter(qualifies).length}).`);
console.log(`Rows DPM's Full List showed: ${report.shown}; with DPM's delta: ${report.withDelta}. Reciprocal pairs: ${report.reciprocal.pairs}, mean deviation ${report.reciprocal.meanAbsDeviation} points, max ${report.reciprocal.maxAbsDeviation}.`);
console.log(`Champion/role pages newly with a ${MIN_GAMES}-game matchup: ${nowSampled.join(", ") || "none"}. New pages: ${[...after].filter((k) => !before.has(k)).length}.`);

if (flag("--dry-run")) { console.log("Dry run: nothing written."); process.exit(0); }

const hist = join(root, "data/dpm-history");
if (!existsSync(hist)) mkdirSync(hist, { recursive: true });
if (stored.dpm.length || stored.dpmDuos.length) {
  const collected = [...stored.dpm, ...stored.dpmDuos].map((r) => r.updated).sort().at(-1);
  const name = join(hist, `${oldPatch ?? "unknown"}-${collected}.json.gz`);
  if (!existsSync(name)) writeFileSync(name, gzipSync(JSON.stringify({ dpmStatus: stored.dpmStatus, dpm: stored.dpm, dpmDuos: stored.dpmDuos })));
  console.log(`Archived the stored rows to ${name}.`);
}
const note = exp.note ?? `DPM.LOL lane matchups, browser-collected from each champion's Build page for patch ${exp.patch}, ${exp.rank}.`;
const next = Counters.parse({ ...stored, updated: exp.collectedOn, dpmStatus: { reachable: true, checkedOn: exp.collectedOn, note }, dpm: rows,
  // Duo rows are kept only when they come from the same collection; a new lane collection never carries old duo rows forward.
  dpmDuos: stored.dpmDuos.filter((r) => r.patch === patch && r.updated === exp.collectedOn) });
writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);
console.log(`Wrote ${path}.`);
