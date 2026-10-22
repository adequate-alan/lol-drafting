// Merges the page objects extract-page.js returned (one JSON file each) into a DpmExport (lib/schema.ts) and names the
// pool champion/roles that still have no page. Read-only apart from the --out file.
//   node scripts/dpm-collect/merge.mjs <folder> --patch 16.20 --collected 2026-10-22 [--rank Emerald+] [--out file.json] [--note "…"]
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const folder = args.find((a) => !a.startsWith("--"));
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
if (!folder) { console.error("usage: node scripts/dpm-collect/merge.mjs <folder> --patch 16.20 --collected YYYY-MM-DD [--rank Emerald+] [--out file.json] [--note …]"); process.exit(2); }
const patch = opt("--patch"), collectedOn = opt("--collected"), rank = opt("--rank", "Emerald+");
if (!patch || !/^\d{4}-\d{2}-\d{2}$/.test(collectedOn ?? "")) { console.error("--patch and --collected YYYY-MM-DD are required"); process.exit(2); }
const SLUG = { wukong: "MonkeyKing", chogath: "Chogath", "nunu-willump": "Nunu", "renata-glasc": "Renata", "dr-mundo": "DrMundo", ksante: "KSante", kaisa: "Kaisa", "twisted-fate": "TwistedFate", "xin-zhao": "XinZhao", "jarvan-iv": "JarvanIV", "lee-sin": "LeeSin", "miss-fortune": "MissFortune", "tahm-kench": "TahmKench", "master-yi": "MasterYi", "aurelion-sol": "AurelionSol", "kog-maw": "KogMaw", "rek-sai": "RekSai", belveth: "Belveth", velkoz: "Velkoz", khazix: "Khazix", leblanc: "Leblanc", fiddlesticks: "FiddleSticks" };
const slugOf = (id) => SLUG[id] ?? id.split("-").map((s) => s[0].toUpperCase() + s.slice(1)).join("");

const pages = [];
for (const f of readdirSync(folder).filter((f) => f.endsWith(".json")).sort()) {
  const p = JSON.parse(readFileSync(join(folder, f), "utf8"));
  if (p.notReady || !Array.isArray(p.matchups)) { console.error(`${f}: not a finished page (${p.notReady ? "page was not ready" : "no matchups"})`); process.exit(1); }
  if (p.uiUnmatched?.length) console.warn(`${f}: Full List rows not in the data request: ${p.uiUnmatched.join(", ")}`);
  const { uiUnmatched, ...page } = p;
  pages.push(page);
}
const have = new Set(pages.map((p) => `${p.role}|${p.champion}`));
const dup = pages.map((p) => `${p.role}|${p.champion}`).filter((k, i, a) => a.indexOf(k) !== i);
if (dup.length) { console.error(`duplicate pages: ${[...new Set(dup)].join(", ")}`); process.exit(1); }
try {
  const pool = JSON.parse(readFileSync(join(process.cwd(), "data/pool.json"), "utf8"));
  const missing = pool.flatMap((p) => [...p.core, ...p.depth, ...p.flex].map((c) => `${p.role}|${slugOf(c)}`)).filter((k) => !have.has(k));
  console.log(`${pages.length} pages; pool pages still missing: ${missing.length ? missing.join(", ") : "none"}`);
} catch { console.log(`${pages.length} pages (data/pool.json not found here, so no completeness check)`); }
const note = opt("--note", `Browser-collected from each champion's Build page (its data request, after clicking Full List), ranked solo, ${rank}, all regions, patch ${patch}`);
const exp = { source: "dpm.lol", collectedOn, patch, rank, note, pages };
const out = opt("--out");
if (out) { writeFileSync(out, `${JSON.stringify(exp)}\n`); console.log(`Wrote ${out}: ${pages.reduce((n, p) => n + p.matchups.length, 0)} matchup rows.`); }
else console.log(JSON.stringify(exp).slice(0, 400));
