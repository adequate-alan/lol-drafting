// Prints the v1 vs v2 warnings for the review comps. Read-only; changes nothing.
//   npx tsx scripts/model-v2-report.ts
import { readFileSync } from "node:fs";
import { warnings } from "../lib/evaluate";
import { damageProfile, picksV2, warningsV2 } from "../lib/model-v2/evaluate";
import { convert, EXAMPLE_COMPS, EXAMPLE_ONLY, REPRESENTATIVE } from "../lib/model-v2/samples";
import { ChampionV2 } from "../lib/model-v2/schema";

const v1 = JSON.parse(readFileSync("data/champions.json", "utf8"));
const v2 = convert(v1, { ...REPRESENTATIVE, ...EXAMPLE_ONLY }).map((c) => ChampionV2.parse(c));
const out = EXAMPLE_COMPS.map((comp) => {
  const before = warnings(comp.draft, v1).map((w) => w.label);
  const after = warningsV2(comp.draft, v2);
  const d = damageProfile(picksV2(comp.draft, v2));
  return {
    name: comp.name, draft: comp.draft,
    v2Damage: { physical: d.physical, magic: d.magic, true: d.true, physicalShare: d.physicalShare, magicShare: d.magicShare },
    before, after: after.map((w) => ({ label: w.label, severity: w.severity, why: w.why })),
    added: after.map((w) => w.label).filter((l) => !before.includes(l)),
    removed: before.filter((l) => !after.some((w) => w.label === l)),
  };
});
console.log(JSON.stringify(out, null, 2));
