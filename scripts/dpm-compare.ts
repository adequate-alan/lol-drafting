// Before-and-after statistics for two DPM.LOL collections (alan, 2026-10-22): the stored rows (or an archived snapshot in
// data/dpm-history/) against a new export, at the site's own thresholds (300 games, 52% favourable, 54% strong). Lists the
// counters the new data supports that the old one did not, the ones that disappeared or weakened, and the largest
// win-rate moves among rows sampled in both. Read-only; the numbers explain nothing on their own (a longer patch means
// bigger samples), so the report says what moved and leaves the reason to a person.
//
//   npx tsx scripts/dpm-compare.ts <export.json> [--old data/counters.json | data/dpm-history/16.20-2026-10-10.json.gz]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { compareSnapshots, readExport, type RowChange, type SnapshotStats } from "../lib/dpm-export";
import { patchLabel } from "../lib/patch";
import { Counters, DpmExport, Files, ROLES, type DpmMatchup } from "../lib/schema";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const oldArg = args[args.indexOf("--old") + 1];
if (!file) { console.error("usage: npx tsx scripts/dpm-compare.ts <export.json> [--old <counters.json|snapshot.json.gz>]"); process.exit(2); }
const root = process.cwd();
const champions = Files["champions.json"].parse(JSON.parse(readFileSync(join(root, "data/champions.json"), "utf8")));
const name = (id: string) => champions.find((c) => c.id === id)?.name ?? id;

const oldPath = args.includes("--old") && oldArg ? oldArg : "data/counters.json";
const oldRaw = oldPath.endsWith(".gz") ? gunzipSync(readFileSync(join(root, oldPath))).toString("utf8") : readFileSync(join(root, oldPath), "utf8");
const oldJson = JSON.parse(oldRaw) as { dpm: unknown[] };
const before: DpmMatchup[] = Counters.shape.dpm.parse(oldJson.dpm);
const exp = DpmExport.parse(JSON.parse(readFileSync(file, "utf8")));
const { rows: after, problems } = readExport(exp, champions);
if (problems.length) { console.error(`The export has problems; run dpm-validate first:\n  ${problems.slice(0, 5).join("\n  ")}`); process.exit(1); }

const c = compareSnapshots(before, after);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const stat = (k: keyof SnapshotStats, label: string) => `| ${label} | ${String(c.before[k])} | ${String(c.after[k])} |`;
const line = (x: RowChange) => `- ${x.role} ${name(x.champion)} vs ${name(x.enemy)}: ${x.note}`;
const out = [`## DPM.LOL snapshots: ${patchLabel(c.before.patch ?? "?")} collected ${c.before.collected ?? "?"} → ${patchLabel(c.after.patch ?? "?")} collected ${c.after.collected ?? "?"}`, "",
  "| | Before | After |", "| --- | --- | --- |",
  stat("rows", "Matchup rows"), stat("sampled", "Rows with 300+ games"), stat("qualifying", "Qualifying counters (300+ games, 52%+)"), stat("strong", "Strong counters (300+ games, 54%+)"),
  stat("championRolesWithCounter", "Pool champion/roles with a qualifying counter"), stat("championsWithCounter", "Pool champions with a qualifying counter"),
  stat("enemyRolesAnswered", "Enemy champion/roles with a qualifying response"), stat("enemiesAnswered", "Enemy champions with a qualifying response"), "",
  `By role (rows / qualifying): ${ROLES.map((r) => `${r} ${c.before.byRole[r].rows}/${c.before.byRole[r].qualifying} → ${c.after.byRole[r].rows}/${c.after.byRole[r].qualifying}`).join("; ")}`, "",
  `Rows in both: ${c.shared}; only before: ${c.onlyBefore}; only after: ${c.onlyAfter}. Games on shared rows grew ×${c.gamesGrowth.median} (median; ×${c.gamesGrowth.min} to ×${c.gamesGrowth.max}).`, ""];
const section = (title: string, list: RowChange[], max = 60) => {
  out.push(`### ${title} (${list.length})`, "");
  if (!list.length) out.push("- none");
  for (const x of list.slice(0, max)) out.push(line(x));
  if (list.length > max) out.push(`- … ${list.length - max} more`);
  out.push("");
};
section("Newly supported counters", c.newCounters);
section("Counters that disappeared", c.lostCounters);
section("Counters that weakened (strong → favourable)", c.weakened);
section("Counters that strengthened (favourable → strong)", c.strengthened);
out.push("### Largest win-rate moves (rows with 300+ games in both)", "");
for (const x of c.largestMoves) out.push(`- ${x.role} ${name(x.champion)} vs ${name(x.enemy)}: ${x.note} (${((x.after!.winRate - x.before!.winRate) * 100) > 0 ? "+" : ""}${((x.after!.winRate - x.before!.winRate) * 100).toFixed(1)} points)`);
out.push("", `Thresholds unchanged. Rows under 300 games stay preliminary, never Counter labels; nothing here scores or orders a recommendation. Figures are DPM's own; ${pct(0.52)} / ${pct(0.54)} are the site's bars.`);
console.log(out.join("\n"));
