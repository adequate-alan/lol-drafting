import { analyze } from "../../lib/model-v2/analyze";
import { cohesion } from "./cohesion";
import { kits, lineups, nameOf } from "./load";
const ids = new Set(kits.map((k) => k.id));
const rows = lineups.filter((l) => Object.values(l.picks).every((p) => ids.has(p))).map((l) => {
  const a = analyze(l.picks, kits);
  const c = cohesion(l.picks, kits);
  const cur = [...a.weakPoints, ...a.more];
  return { l, a, c, cur };
});
const tally = (xs: string[]) => Object.entries(xs.reduce((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {} as Record<string, number>)).sort((a, b) => b[1] - a[1]);
console.log("n", rows.length);
console.log("plans", tally(rows.map((r) => `${r.c.plan.id} ${r.c.plan.met}/${r.c.plan.total}`)));
console.log("fit>=.75", rows.filter((r) => r.c.plan.fit >= 0.75).length);
console.log("cur major", rows.filter((r) => r.cur.some((w) => w.severity === "major")).length, "coh major", rows.filter((r) => r.c.findings.some((w) => w.severity === "major")).length);
console.log("coh findings", tally(rows.flatMap((r) => r.c.findings.map((f) => `${f.id}|${f.severity}`))));
const wr = (rs: typeof rows) => `${rs.filter((r) => r.l.won).length}/${rs.length}`;
console.log("WR cur major", wr(rows.filter((r) => r.cur.some((w) => w.severity === "major"))), "cur clean", wr(rows.filter((r) => !r.cur.some((w) => w.severity === "major"))));
console.log("WR coh major", wr(rows.filter((r) => r.c.findings.some((w) => w.severity === "major"))), "coh clean", wr(rows.filter((r) => !r.c.findings.some((w) => w.severity === "major"))));
if (process.argv[2]) for (const r of rows.filter((r) => r.c.plan.id === process.argv[2] || process.argv[2] === "all").slice(0, 400))
  console.log(`${r.l.won ? "W" : "L"} ${["TOP","JUNGLE","MID","BOT","SUPPORT"].map((x) => nameOf((r.l.picks as any)[x])).join("/")} | CUR ${r.a.headline} | COH ${r.c.plan.label} ${r.c.plan.met}/${r.c.plan.total}${r.c.second ? " + " + r.c.second.label : ""}: ${r.c.findings.filter(f=>f.severity!=="minor").map((f) => f.label).join("; ")}`);
