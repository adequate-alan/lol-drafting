// Prints the kit review queue (lib/kit-review.ts) as Markdown for the patch-notes run summary: champions whose Riot
// changes touch crowd control, mobility, range, damage type or mechanics, with their stored values. Read-only.
//   npx tsx scripts/kit-review.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { kitReviewQueue } from "../lib/kit-review";
import { convertKits } from "../lib/model-v2/kits";
import { Files } from "../lib/schema";

const raw = (f: string) => JSON.parse(readFileSync(join(process.cwd(), "data", f), "utf8"));
const champions = Files["champions.json"].parse(raw("champions.json"));
const queue = kitReviewQueue(Files["patch-notes.json"].parse(raw("patch-notes.json")), champions, convertKits(champions), Files["kit-review.json"].parse(raw("kit-review.json")).decisions);
const name = (id: string) => champions.find((c) => c.id === id)?.name ?? id;
const out = [`## Kit review queue: ${queue.length} champion change${queue.length === 1 ? "" : "s"} to recheck`, ""];
for (const k of queue) {
  out.push(`- **${name(k.champion)}** ${k.patch} (${k.category ?? "change"}): ${[...new Set(k.flags.flatMap((f) => f.areas))].join(", ")}`);
  for (const f of k.flags.slice(0, 4)) out.push(`  - ${f.ability ? `${f.ability}: ` : ""}${f.text}`);
  if (k.values.length) out.push(`  - Stored: ${k.values.map((v) => `${v.label} ${v.value}`).join(", ")}`);
}
if (!queue.length) out.push("Nothing to recheck.");
out.push("", "Flags only: no kit, attribute, coefficient or ranking changes until alan records a decision in data/kit-review.json.");
console.log(out.join("\n"));
