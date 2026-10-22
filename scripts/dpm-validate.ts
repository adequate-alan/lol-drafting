// Checks a DPM.LOL browser collection before it is stored (alan, 2026-10-22): every pool champion/role page present,
// every name on the roster, valid numbers, no duplicate matchup, the actual win rate kept apart from DPM's displayed
// delta, the rows DPM's Full List showed against the list's count, and reciprocal pairs (A's page vs B and B's page vs
// A) summing to 100% within sampling. Prints a Markdown report; exits 1 when the collection must not be stored.
//
//   npx tsx scripts/dpm-validate.ts <export.json>
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RECIPROCAL_MATERIAL_POINTS, validateExport } from "../lib/dpm-export";
import { DpmExport, Files } from "../lib/schema";

const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!file) { console.error("usage: npx tsx scripts/dpm-validate.ts <export.json>"); process.exit(2); }
const root = process.cwd();
const raw = (f: string) => JSON.parse(readFileSync(join(root, "data", f), "utf8"));
const parsed = DpmExport.safeParse(JSON.parse(readFileSync(file, "utf8")));
if (!parsed.success) { console.error(`Not a DPM collection: ${parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`); process.exit(1); }
const exp = parsed.data;
const champions = Files["champions.json"].parse(raw("champions.json"));
const pool = Files["pool.json"].parse(raw("pool.json"));
const name = (id: string) => champions.find((c) => c.id === id)?.name ?? id;
const r = validateExport(exp, champions, pool);
const pct = (x: number) => `${(x * 100).toFixed(2)}%`;

const out = [`## DPM.LOL collection check: ${file}`, "",
  `- Source ${exp.source}, collected ${exp.collectedOn}, patch ${exp.patch}, ${exp.rank}`,
  `- Pages: ${r.pages} (pool champion/roles missing: ${r.missingPages.length}${r.extraPages.length ? `; outside the pool: ${r.extraPages.join(", ")}` : ""})`,
  `- Matchup rows: ${r.rows}; shown in DPM's Full List: ${r.shown}; carrying DPM's displayed delta: ${r.withDelta} (stored apart from the win rate, never used as one)`,
  `- Reciprocal pairs (both pages list each other): ${r.reciprocal.pairs}; A + B − 100% deviates by ${r.reciprocal.meanAbsDeviation} points on average, ${r.reciprocal.maxAbsDeviation} at most; ${r.reciprocal.material.length} beyond ${RECIPROCAL_MATERIAL_POINTS}; sample sizes differing by over 10%: ${r.reciprocal.gamesMismatch.length}`,
  `- Perspective: every row is the page champion's win rate against the opponent (A ≈ 100% − B on the reciprocal pairs confirms it)`, ""];
if (r.fullListMismatch.length) { out.push("### Full List count vs rows marked as shown", ""); for (const m of r.fullListMismatch) out.push(`- ${m.page}: list ${m.listed}, marked ${m.shown}`); out.push(""); }
if (r.reciprocal.material.length) {
  out.push(`### Reciprocal pairs beyond ${RECIPROCAL_MATERIAL_POINTS} point`, "");
  for (const p of r.reciprocal.material.slice(0, 20)) out.push(`- ${p.role} ${name(p.a)} ${pct(p.winRateA)} (${p.gamesA}) vs ${name(p.b)} ${pct(p.winRateB)} (${p.gamesB}): ${p.deviation > 0 ? "+" : ""}${p.deviation}`);
  out.push("");
}
if (r.warnings.length) { out.push("### Notes", ""); for (const w of r.warnings) out.push(`- ${w}`); out.push(""); }
if (r.problems.length) { out.push("### Problems (the collection must not be stored)", ""); for (const p of r.problems) out.push(`- ${p}`); out.push(""); }
out.push(r.ok ? "**Result: valid.** Store it with `npx tsx scripts/ingest-dpm.ts`." : "**Result: refused.**");
console.log(out.join("\n"));
process.exit(r.ok ? 0 : 1);
