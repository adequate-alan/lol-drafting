import { analyze } from "../../lib/model-v2/analyze";
import { kits, lineups } from "./load";
const ids = new Set(kits.map((k) => k.id));
let missing = 0; const counts: Record<string, number> = {}; const prim: Record<string, number> = {}; let noMajor = 0;
const sev: Record<string, number> = {};
for (const l of lineups) {
  const miss = Object.values(l.picks).filter((p) => !ids.has(p));
  if (miss.length) { missing++; continue; }
  const a = analyze(l.picks, kits, Object.values(l.enemy).filter((p) => ids.has(p)));
  prim[a.identity.primary?.id ?? "none"] = (prim[a.identity.primary?.id ?? "none"] ?? 0) + 1;
  const all = [...a.weakPoints, ...a.more];
  if (!all.some((w) => w.severity === "major")) noMajor++;
  for (const w of all) { counts[`${w.id}|${w.severity}`] = (counts[`${w.id}|${w.severity}`] ?? 0) + 1; }
}
console.log({ lineups: lineups.length, missing, noMajor, prim });
console.log(Object.entries(counts).sort((a, b) => b[1] - a[1]));
