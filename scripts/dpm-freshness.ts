// Is the stored DPM.LOL counter data from the current patch? (alan, 2026-10-22). Prints a short Markdown note for a run
// summary and, under GitHub Actions, writes stale=true|false (and the patches) to GITHUB_OUTPUT so the patch-notes
// workflow can raise an issue the day a newer patch is recognised. Read-only; the site itself marks older-patch rows.
//   npx tsx scripts/dpm-freshness.ts
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { counterFreshness, newestPatch } from "../lib/counter-freshness";
import { buildPatchIndex } from "../lib/patch-changes";
import { patchLabel } from "../lib/patch";
import { Files } from "../lib/schema";

const raw = (f: string) => JSON.parse(readFileSync(join(process.cwd(), "data", f), "utf8"));
const counters = Files["counters.json"].parse(raw("counters.json"));
const notes = Files["patch-notes.json"].parse(raw("patch-notes.json"));
const games = Files["pro-games.json"].parse(raw("pro-games.json")).games;
const newest = newestPatch(notes.patches.map((p) => p.patch), games.map((g) => g.patch));
const f = counterFreshness(counters, buildPatchIndex(notes), newest);
const changed = Object.keys(f.changes).length;
const lines = [`## DPM.LOL counter data`, "",
  f.patch ? `- Stored rows: ${counters.dpm.length} lane matchups, patch ${patchLabel(f.patch)}, collected ${f.collected}` : "- No DPM rows stored",
  `- Newest recognised patch: ${newest ? patchLabel(newest) : "none"}`,
  f.stale ? `- **Older patch**: the counters are from ${patchLabel(f.patch!)} while ${patchLabel(newest!)} is current; ${changed} champion${changed === 1 ? "" : "s"} in the rows changed since. The site marks every such row; a fresh browser collection (scripts/dpm-collect/) and \`npx tsx scripts/ingest-dpm.ts\` bring it up to date.` : "- Current: the counters are from the newest recognised patch.", ""];
console.log(lines.join("\n"));
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `stale=${f.stale}\ndpm_patch=${f.patch ? patchLabel(f.patch) : ""}\nnewest_patch=${newest ? patchLabel(newest) : ""}\ncollected=${f.collected ?? ""}\n`);
