// Is the stored DPM.LOL counter data from the current patch? (alan, 2026-10-22). Prints a short Markdown note for the
// daily patch-notes run summary: the data's patch, its collection date and the newest recognised patch. Data from an
// older patch is an expected condition between the rare browser collections (alan, 2026-10-23): the site marks every such
// row, so this note asks for nothing and the workflow opens no issue. A missing or invalid data file throws, which fails
// the workflow step: a broken pipeline is the actionable case. Read-only.
//   npx tsx scripts/dpm-freshness.ts
import { readFileSync } from "node:fs";
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
  f.stale ? `- Older patch (expected between collections): the counters are from ${patchLabel(f.patch!)}, collected ${f.collected}, while ${patchLabel(newest!)} is current; ${changed} champion${changed === 1 ? "" : "s"} in the rows changed since. The site marks every such row "older patch"; strength and scoring are unchanged. Refresh procedure, when wanted: scripts/dpm-collect/README.md.` : "- Current: the counters are from the newest recognised patch.", ""];
console.log(lines.join("\n"));
