// Ingest a DPM.LOL lane-matchup collection into data/counters.json (alan, 2026-10-22).
//
// DPM.LOL answers Claude's environments and GitHub runners with a Cloudflare challenge (dpm-probe.yml), so the data is
// collected in alan's own browser on his Mac from each champion's Build page (robots.txt keeps every agent off the
// versus pages and the players' versus / synergy API). This script turns that export into stored rows, and it refuses
// rather than writes when anything is off:
//
//   - one patch and one rank bracket per collection; patches are never combined
//   - every champion and enemy maps to the roster, the champion plays the role, no duplicate matchup
//   - a collection that covers fewer champion/roles, or far fewer rows, than the stored one for the same scope is
//     refused (a failed or partial read never overwrites valid data) unless --allow-shrink
//   - an older patch than the stored one is refused unless --allow-older
//
// The stored rows are archived first, gzipped, in data/dpm-history/<patch>-<collected>.json.gz, for comparison and
// rollback. Saved pairings, pool tiers, kits and every score are untouched: counters are labels.
//
//   npx tsx scripts/ingest-dpm.ts <export.json> [--dry-run] [--allow-shrink] [--allow-older]
//
// Export format (what the browser collection writes):
//   { "source": "dpm.lol", "collectedOn": "YYYY-MM-DD", "patch": "16.20" | "26.20", "rank": "Emerald+",
//     "note": "how it was collected",
//     "pages": [ { "champion": "Jayce", "role": "TOP", "url": "https://dpm.lol/champions/Jayce/build",
//                  "matchups": [ { "enemy": "Corki", "winRate": 58.49, "games": 106 } ] } ] }
// winRate in percent (58.49) or as a fraction (0.5849); champion names as DPM writes them.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { comparePatch, parsePatch, shortPatch } from "../lib/patch";
import { Counters, ROLES, type DpmMatchup, type Role } from "../lib/schema";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const flag = (f: string) => args.includes(f);
if (!file) { console.error("usage: npx tsx scripts/ingest-dpm.ts <export.json> [--dry-run] [--allow-shrink] [--allow-older]"); process.exit(2); }

const root = process.cwd();
const fail = (msg: string): never => { console.error(`Refused: ${msg}\nNothing was written.`); process.exit(1); };

interface Page { champion: string; role: string; url: string; matchups: { enemy: string; winRate: number; games: number }[] }
interface Export { source: string; collectedOn: string; patch: string; rank: string; note?: string; pages: Page[] }

const exp = JSON.parse(readFileSync(file, "utf8")) as Export;
if (exp.source !== "dpm.lol") fail(`source is "${exp.source}", expected "dpm.lol"`);
if (!/^\d{4}-\d{2}-\d{2}$/.test(exp.collectedOn ?? "")) fail("collectedOn must be YYYY-MM-DD");
if (!parsePatch(exp.patch)) fail(`unreadable patch "${exp.patch}"`);
if (!exp.rank) fail("rank bracket missing");
if (!exp.pages?.length) fail("no pages");

const champions = JSON.parse(readFileSync(join(root, "data/champions.json"), "utf8")) as { id: string; name: string; roles: Role[] }[];
const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
const byName = new Map<string, (typeof champions)[number]>();
for (const c of champions) { byName.set(norm(c.name), c); byName.set(norm(c.id), c); }
byName.set("wukong", byName.get("wukong") ?? byName.get("monkeyking")!);
const idOf = (name: string, where: string) => byName.get(norm(name))?.id ?? fail(`"${name}" (${where}) is not in the roster`);
const ROLE_ALIAS: Record<string, Role> = { top: "TOP", jungle: "JUNGLE", mid: "MID", middle: "MID", bot: "BOT", adc: "BOT", bottom: "BOT", support: "SUPPORT", utility: "SUPPORT" };

const patch = shortPatch(exp.patch); // stored in the client / pro-data spelling, like every other pro-data row
const rows: DpmMatchup[] = [];
const seen = new Set<string>();
for (const p of exp.pages) {
  const role = ROLE_ALIAS[p.role.toLowerCase()] ?? (ROLES.includes(p.role as Role) ? (p.role as Role) : fail(`unknown role "${p.role}"`));
  const champion = idOf(p.champion, "page");
  if (!champions.find((c) => c.id === champion)!.roles.includes(role)) fail(`${p.champion} does not play ${role} in the roster`);
  if (!/^https:\/\/dpm\.lol\/champions\//.test(p.url)) fail(`page URL ${p.url} is not a dpm.lol champion page`);
  for (const m of p.matchups) {
    const enemy = idOf(m.enemy, `${p.champion} ${role}`);
    if (enemy === champion) fail(`${p.champion} listed against itself`);
    const winRate = m.winRate > 1 ? m.winRate / 100 : m.winRate;
    if (!(winRate > 0 && winRate < 1) || !Number.isInteger(m.games) || m.games <= 0) fail(`bad numbers for ${p.champion} vs ${m.enemy}`);
    const key = `${role}|${champion}|${enemy}`;
    if (seen.has(key)) fail(`duplicate matchup ${key}`);
    seen.add(key);
    rows.push({ role, enemy, champion, winRate: Math.round(winRate * 10000) / 10000, games: m.games, patch, rank: exp.rank, url: p.url, updated: exp.collectedOn, origin: "dpm-ingest" });
  }
}

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

const MIN_GAMES = 300, MIN_WR = 0.52;
const qualifying = (list: DpmMatchup[]) => list.filter((r) => r.games >= MIN_GAMES && r.winRate >= MIN_WR).length;
const sampledPages = (list: DpmMatchup[]) => new Set(list.filter((r) => r.games >= MIN_GAMES).map((r) => `${r.role}|${r.champion}`));
const nowSampled = [...sampledPages(rows)].filter((k) => !sampledPages(stored.dpm).has(k));
console.log(`Patch ${exp.patch} (${exp.rank}), collected ${exp.collectedOn}: ${rows.length} rows from ${after.size} champion/role pages (stored: ${stored.dpm.length} rows, ${before.size} pages, patch ${oldPatch ?? "none"}).`);
console.log(`Rows with ${MIN_GAMES}+ games: ${rows.filter((r) => r.games >= MIN_GAMES).length} (stored ${stored.dpm.filter((r) => r.games >= MIN_GAMES).length}). Qualifying counters: ${qualifying(rows)} (stored ${qualifying(stored.dpm)}).`);
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
