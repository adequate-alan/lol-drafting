// Where does each model place the champion the pro team actually picked, among the champions pros played in that role?
// Diagnostic only: the cohesion order below is a provisional read for comparison, not a proposed score.
import { analyze, readCandidate } from "../../lib/model-v2/analyze";
import { pickDelta } from "./cohesion";
import { kits, lineups } from "./load";
import type { Role } from "../../lib/schema";
const ids = new Set(kits.map((k) => k.id)); const byId = new Map(kits.map((k) => [k.id, k]));
const meta: Record<string, Set<string>> = {};
for (const l of lineups) for (const [r, c] of Object.entries(l.picks)) if (ids.has(c)) (meta[r] ??= new Set()).add(c);
const pctl: { cur: number[]; coh: number[]; n: number[] } = { cur: [], coh: [], n: [] };
const SEV = { major: 3, moderate: 2, minor: 0 } as const;
for (const l of lineups) {
  if (!l.pickOrder || Object.values(l.picks).some((p) => !ids.has(p))) continue;
  const roleOf = Object.fromEntries(Object.entries(l.picks).map(([r, c]) => [c, r as Role]));
  const draft: Partial<Record<Role, string>> = {};
  l.pickOrder.forEach((champ, i) => {
    const role = roleOf[champ];
    if (i >= 1) {
      const taken = new Set(Object.values(draft));
      const pool = [...meta[role]].filter((c) => !taken.has(c));
      const needs = analyze(draft, kits).roleNeeds[role] ?? [];
      // Current: the engine's own Best-fix order (fix score, then fewer tradeoffs).
      const cur = pool.map((c) => { const r = readCandidate(byId.get(c)!, role, draft, kits, needs); return { c, k: r.fixScore * 100 - r.tradeoffs.length }; });
      const coh = pool.map((c) => { const d = pickDelta(draft, role, c, kits);
        const k = d.planChanges.reduce((n, p) => n + p.gained.length - 2 * p.lost.length, 0) + d.removes.reduce((n, f) => n + SEV[f.severity], 0) - d.creates.reduce((n, f) => n + SEV[f.severity], 0); return { c, k }; });
      const rankOf = (xs: { c: string; k: number }[]) => { const me = xs.find((x) => x.c === champ)!.k; const better = xs.filter((x) => x.k > me).length, ties = xs.filter((x) => x.k === me).length; return (better + (ties - 1) / 2) / Math.max(1, xs.length - 1); };
      pctl.cur.push(rankOf(cur)); pctl.coh.push(rankOf(coh)); pctl.n.push(i + 1);
    }
    draft[role] = champ;
  });
}
const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const top = (xs: number[], q: number) => (100 * xs.filter((x) => x <= q).length / xs.length).toFixed(1) + "%";
console.log("picks", pctl.cur.length, "(0 = ranked first, 1 = last; random = 0.5)");
console.log("current Best-fix order: median", med(pctl.cur).toFixed(2), "top quarter", top(pctl.cur, 0.25), "bottom quarter", (100 * pctl.cur.filter((x) => x >= 0.75).length / pctl.cur.length).toFixed(1) + "%");
console.log("cohesion (provisional): median", med(pctl.coh).toFixed(2), "top quarter", top(pctl.coh, 0.25), "bottom quarter", (100 * pctl.coh.filter((x) => x >= 0.75).length / pctl.coh.length).toFixed(1) + "%");
for (const n of [2, 3, 4, 5]) { const idx = pctl.n.map((x, i) => (x === n ? i : -1)).filter((i) => i >= 0); console.log(" pick", n, "cur median", med(idx.map((i) => pctl.cur[i])).toFixed(2), "coh median", med(idx.map((i) => pctl.coh[i])).toFixed(2)); }
