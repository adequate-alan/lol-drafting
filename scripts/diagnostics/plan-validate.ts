// Validation of the plan-aware read (lib/model-v2/plan.ts) against the current Comp Check: recorded pro lineups,
// role-preserving shuffled lineups, and the archetypes. Diagnostic only.
import { writeFileSync } from "node:fs";
import { analyze } from "../../lib/model-v2/analyze";
import { analyzePlan } from "../../lib/model-v2/plan";
import { ARCHETYPES } from "../../lib/model-v2/archetypes";
import { kits, lineups, nameOf } from "./load";
import type { Role } from "../../lib/schema";
const ids = new Set(kits.map((k) => k.id));
const ROLES: Role[] = ["TOP", "JUNGLE", "MID", "BOT", "SUPPORT"];
const pro = lineups.filter((l) => Object.values(l.picks).every((p) => ids.has(p)));
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pools = Object.fromEntries(ROLES.map((r) => [r, pro.map((p) => p.picks[r])])) as Record<Role, string[]>;
const shuffled: Record<Role, string>[] = [];
while (shuffled.length < 3000) { const d = {} as Record<Role, string>; const u = new Set<string>(); for (const r of ROLES) { let c; do c = pools[r][Math.floor(rnd() * pools[r].length)]; while (u.has(c)); u.add(c); d[r] = c; } shuffled.push(d); }
type F = { id: string; label: string; tier: string };
const cur = (d: Record<Role, string>): F[] => { const a = analyze(d, kits); return [...a.weakPoints, ...a.more].map((w) => ({ id: w.id, label: w.label.replace(/^.* is unprotected$/, "Carry unprotected"), tier: w.severity === "major" ? "critical" : w.severity === "moderate" ? "weakness" : "minor" })); };
const plan = (d: Record<Role, string>): F[] => { const a = analyzePlan(d, kits); return [...a.weaknesses, ...a.more, ...a.accepted].map((w) => ({ id: w.id, label: w.label.replace(/^(Front-to-back|Dive|Pick|Poke \/ siege|Protect the carry|Skirmish|Wombo|Split-push|Early tempo|Scaling): missing /, "$1: missing "), tier: w.tier === "weakness" && w.severity === "minor" ? "minor" : w.tier })); };
const P = { cur: pro.map((l) => cur(l.picks)), plan: pro.map((l) => plan(l.picks)) }, S = { cur: shuffled.map(cur), plan: shuffled.map(plan) };
const rate = (rs: F[][], f: (x: F) => boolean) => rs.filter((r) => r.some(f)).length / rs.length;
const out: Record<string, unknown> = {};
for (const e of ["cur", "plan"] as const) {
  const labels = new Map<string, string>(); for (const r of [...P[e], ...S[e]]) for (const w of r) labels.set(`${w.id}|${w.tier}`, w.label);
  const rules = [...labels].map(([k, label]) => { const [id, tier] = k.split("|"); const f = (x: F) => x.id === id && x.tier === tier; const p = rate(P[e], f), s = rate(S[e], f); return { id, tier, label, pro: p, shuffled: s, ratio: (p + 0.005) / (s + 0.005) }; })
    .filter((x) => x.pro + x.shuffled >= 0.01).sort((a, b) => b.pro - a.pro);
  const avg = (rs: F[][], t: (x: F) => boolean) => rs.reduce((n, r) => n + r.filter(t).length, 0) / rs.length;
  const crit = (x: F) => x.tier === "critical", real = (x: F) => x.tier === "critical" || x.tier === "weakness";
  out[e] = { critical: [rate(P[e], crit), rate(S[e], crit)], real: [rate(P[e], real), rate(S[e], real)], avgReal: [avg(P[e], real), avg(S[e], real)], avgCrit: [avg(P[e], crit), avg(S[e], crit)], accepted: [avg(P[e], (x) => x.tier === "accepted"), avg(S[e], (x) => x.tier === "accepted")], rules };
  console.log(e, JSON.stringify({ critical: (out[e] as any).critical, real: (out[e] as any).real, avgReal: (out[e] as any).avgReal, avgCrit: (out[e] as any).avgCrit, accepted: (out[e] as any).accepted }));
  for (const r of rules) console.log("  ", `${r.label} [${r.tier}]`.padEnd(70), (100 * r.pro).toFixed(1).padStart(6), (100 * r.shuffled).toFixed(1).padStart(6), r.ratio.toFixed(2));
}
console.log("\nARCHETYPES");
const arch = ARCHETYPES.map((a) => { const r = analyzePlan(a.draft, kits); const c = analyze(a.draft, kits);
  return { name: a.name, expect: a.expect, cur: c.headline, curWeak: [...c.weakPoints].map((w) => w.label), plan: r.headline, jobs: r.plan?.jobs.map((j) => `${j.met ? "✓" : "✗"} ${j.label}`), weak: r.weaknesses.map((w) => `${w.tier}: ${w.label}`), accepted: r.accepted.map((w) => w.label), win: r.winCondition, needs: r.needs.slice(0, 3).map((n) => n.label) }; });
for (const a of arch) console.log(JSON.stringify(a));
const examples = pro.map((l) => { const r = analyzePlan(l.picks, kits); const c = analyze(l.picks, kits);
  return { key: l.key, team: l.team, opponent: l.opponent, won: l.won, url: l.url, patch: l.patch, tournament: l.tournament, lineup: ROLES.map((x) => nameOf(l.picks[x])).join(" / "),
    cur: c.headline, curWeak: [...c.weakPoints, ...c.more].filter((w) => w.severity !== "minor").map((w) => `${w.severity}: ${w.label}`),
    plan: r.headline, jobs: r.plan?.jobs.map((j) => `${j.met ? "✓" : "✗"} ${j.label}${j.met ? ` (${j.by})` : ""}`), weak: [...r.weaknesses, ...r.more].map((w) => `${w.tier}: ${w.label} — ${w.why}`), accepted: r.accepted.map((w) => `${w.label} — ${w.why}`) }; });
writeFileSync(process.argv[2] ?? "/dev/null", JSON.stringify({ out, arch, examples }, null, 1));
