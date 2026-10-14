// Negative control: same champions in the same roles, recombined at random across teams. A rule that reads cohesion
// should fire less often on real pro lineups than on shuffled ones built from identical parts.
import { writeFileSync } from "node:fs";
import { analyze } from "../../lib/model-v2/analyze";
import { cohesion } from "./cohesion";
import { kits, lineups } from "./load";
import type { Role } from "../../lib/schema";
const ids = new Set(kits.map((k) => k.id));
const ROLES: Role[] = ["TOP", "JUNGLE", "MID", "BOT", "SUPPORT"];
const pro = lineups.filter((l) => Object.values(l.picks).every((p) => ids.has(p))).map((l) => l.picks);
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pools = Object.fromEntries(ROLES.map((r) => [r, pro.map((p) => p[r])])) as Record<Role, string[]>;
const shuffled: Record<Role, string>[] = [];
while (shuffled.length < 3000) {
  const d = {} as Record<Role, string>; const used = new Set<string>();
  for (const r of ROLES) { let c; do c = pools[r][Math.floor(rnd() * pools[r].length)]; while (used.has(c)); used.add(c); d[r] = c; }
  shuffled.push(d);
}
type Read = { cur: { id: string; label: string; sev: string }[]; coh: { id: string; label: string; sev: string }[] };
const read = (d: Record<Role, string>): Read => {
  const a = analyze(d, kits), c = cohesion(d, kits);
  return { cur: [...a.weakPoints, ...a.more].map((w) => ({ id: w.id, label: w.label.replace(/^.* is unprotected$/, "Carry unprotected"), sev: w.severity })),
    coh: c.findings.map((f) => ({ id: f.id.replace(/^gap:[a-z]+:/, "gap:"), label: f.id.startsWith("gap:") ? `Plan gap: ${f.label.split(": ")[1] ?? f.label}` : f.id === "x:exposed-carry" ? "Carry exposed" : f.label, sev: f.severity })) };
};
const P = pro.map(read), S = shuffled.map(read);
const out: Record<string, unknown> = {};
for (const eng of ["cur", "coh"] as const) {
  const any = (rs: Read[], ok: (s: string) => boolean) => rs.filter((r) => r[eng].some((w) => ok(w.sev))).length / rs.length;
  const labels = new Map<string, string>();
  for (const r of [...P, ...S]) for (const w of r[eng]) labels.set(w.id, w.label);
  const rules = [...labels].map(([id, label]) => {
    const p = P.filter((r) => r[eng].some((w) => w.id === id)).length / P.length, s = S.filter((r) => r[eng].some((w) => w.id === id)).length / S.length;
    return { id, label, pro: p, shuffled: s, ratio: (p + 0.005) / (s + 0.005) };
  }).filter((x) => x.pro + x.shuffled >= 0.01).sort((a, b) => b.pro - a.pro);
  out[eng] = { major: [any(P, (s) => s === "major"), any(S, (s) => s === "major")], nonMinor: [any(P, (s) => s !== "minor"), any(S, (s) => s !== "minor")],
    avgNonMinor: [P.reduce((n, r) => n + r[eng].filter((w) => w.sev !== "minor").length, 0) / P.length, S.reduce((n, r) => n + r[eng].filter((w) => w.sev !== "minor").length, 0) / S.length], rules };
  console.log(eng, JSON.stringify((out[eng] as any).major), JSON.stringify((out[eng] as any).nonMinor), JSON.stringify((out[eng] as any).avgNonMinor));
  for (const r of rules) console.log("  ", r.label.padEnd(48), (100 * r.pro).toFixed(1).padStart(6), (100 * r.shuffled).toFixed(1).padStart(6), r.ratio.toFixed(2));
}
writeFileSync(process.argv[2] ?? "/dev/null", JSON.stringify(out, null, 1));
