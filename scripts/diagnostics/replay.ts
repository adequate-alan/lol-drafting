// Replays each team's own picks in order and asks both models what each real pick changed.
import { writeFileSync } from "node:fs";
import { analyze, readCandidate } from "../../lib/model-v2/analyze";
import { pickDelta } from "./cohesion";
import { kits, lineups, nameOf } from "./load";
import type { Role } from "../../lib/schema";
const ids = new Set(kits.map((k) => k.id)); const byId = new Map(kits.map((k) => [k.id, k]));
type Row = { key: string; team: string; n: number; champ: string; role: Role; curFixes: string[]; curTradeoffs: string[]; cohGained: string[]; cohLost: string[]; cohCreates: string[]; cohRemoves: string[]; planBefore: string; planAfter: string };
const rows: Row[] = [];
for (const l of lineups) {
  if (!l.pickOrder || Object.values(l.picks).some((p) => !ids.has(p))) continue;
  const roleOf = Object.fromEntries(Object.entries(l.picks).map(([r, c]) => [c, r as Role]));
  const draft: Partial<Record<Role, string>> = {};
  l.pickOrder.forEach((champ, i) => {
    const role = roleOf[champ];
    if (i >= 1) {
      const a = analyze(draft, kits);
      const needs = a.roleNeeds[role] ?? [];
      const r = readCandidate(byId.get(champ)!, role, draft, kits, needs);
      const d = pickDelta(draft, role, champ, kits);
      rows.push({ key: l.key, team: l.team, n: i + 1, champ, role, curFixes: r.fixes.map((x) => x.label), curTradeoffs: r.tradeoffs,
        cohGained: d.planChanges.flatMap((p) => p.gained.map((g) => `${p.label}: ${g}`)), cohLost: d.planChanges.flatMap((p) => p.lost.map((g) => `${p.label}: ${g}`)),
        cohCreates: d.creates.filter((x) => x.severity !== "minor").map((x) => x.label), cohRemoves: d.removes.filter((x) => x.severity !== "minor").map((x) => x.label), planBefore: d.plan.before, planAfter: d.plan.after });
    }
    draft[role] = champ;
  });
}
const pct = (f: (r: Row) => boolean, rs = rows) => `${(100 * rs.filter(f).length / rs.length).toFixed(1)}%`;
console.log("picks", rows.length);
console.log("cur: no tradeoff listed", pct((r) => !r.curTradeoffs.length), "cur: fixes but no tradeoff", pct((r) => r.curFixes.length > 0 && !r.curTradeoffs.length));
console.log("coh: a cost (plan job lost or finding created)", pct((r) => r.cohLost.length + r.cohCreates.length > 0), "coh: both a gain and a cost", pct((r) => (r.cohGained.length + r.cohRemoves.length) > 0 && (r.cohLost.length + r.cohCreates.length) > 0));
console.log("cur: no tradeoff where coh found a cost", pct((r) => !r.curTradeoffs.length && r.cohLost.length + r.cohCreates.length > 0));
for (const n of [2, 3, 4, 5]) { const rs = rows.filter((r) => r.n === n); console.log(`pick ${n}`, rs.length, "cur tradeoff", pct((r) => r.curTradeoffs.length > 0, rs), "coh cost", pct((r) => r.cohLost.length + r.cohCreates.length > 0, rs)); }
const tl = (xs: string[]) => Object.entries(xs.reduce((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {} as Record<string, number>)).sort((a, b) => b[1] - a[1]).slice(0, 12);
console.log("cur tradeoffs", tl(rows.flatMap((r) => r.curTradeoffs)));
console.log("coh lost", tl(rows.flatMap((r) => r.cohLost)));
console.log("coh creates", tl(rows.flatMap((r) => r.cohCreates)));
writeFileSync(process.argv[2] ?? "/dev/null", JSON.stringify(rows));
if (process.argv[3]) for (const r of rows.filter((r) => r.key === process.argv[3])) console.log(JSON.stringify(r));
