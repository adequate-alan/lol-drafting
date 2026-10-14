// Review audits for the plan-aware read (alan's PR #114 review, 2026-10-14): engage-support pairings, short-range
// carries with enchanters, four-pick vs five-pick reads, enemy exposure on real matchups, and the pro lineups the read
// still flags as critical. Diagnostic only. Usage: npx tsx scripts/diagnostics/plan-review.ts [out.json]
import { writeFileSync } from "node:fs";
import { analyzePlan, followOf } from "../../lib/model-v2/plan";
import { slotsOf } from "../../lib/model-v2/analyze";
import { kits, lineups, nameOf } from "./load";
import type { Role } from "../../lib/schema";
const ROLES: Role[] = ["TOP", "JUNGLE", "MID", "BOT", "SUPPORT"];
const ids = new Set(kits.map((k) => k.id));
const pro = lineups.filter((l) => Object.values(l.picks).every((p) => ids.has(p)));
const by = new Map(kits.map((k) => [k.id, k]));
const out: Record<string, unknown> = {};
const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "—");

// 1. Engage supports: what each carry brings to the engage
const engage = pro.filter((l) => by.get(l.picks.SUPPORT)!.fightStart === "primary");
const pairs = new Map<string, { n: number; read: string }>();
for (const l of engage) {
  const r = analyzePlan(l.picks, kits); const all = [...r.weaknesses, ...r.more];
  const read = all.some((w) => w.id === "duo-engage-no-follow") ? "cannot follow" : all.some((w) => w.id === "duo-engage-ranged-follow") ? "ranged follow-up (minor)" : "follows";
  const k = `${nameOf(l.picks.BOT)} + ${nameOf(l.picks.SUPPORT)}`; const cur = pairs.get(k) ?? { n: 0, read }; cur.n++; pairs.set(k, cur);
}
console.log(`ENGAGE SUPPORT PAIRS (${engage.length} pro lineups)`); for (const [k, v] of [...pairs].sort((a, b) => b[1].n - a[1].n)) console.log(" ", k.padEnd(28), v.n, v.read);
const bots = [...new Set(pro.map((l) => l.picks.BOT))].map((b) => { const s = slotsOf({ BOT: b }, kits)[0]; const f = followOf(s); return { bot: nameOf(b), followUp: s.c.kit.followUp, range: s.c.kit.range, access: s.c.kit.backlineAccess, ...f }; });
console.log("\nBOT FOLLOW READ"); for (const b of bots.sort((a, b) => a.bot.localeCompare(b.bot))) console.log(" ", b.bot.padEnd(14), `fu${b.followUp} r${b.range} ba${b.access}`, ["allIn", "ranged", "joins", "extended"].filter((x) => (b as any)[x]).join(" "));
out.engagePairs = [...pairs]; out.bots = bots;

// 2. Short-range carries
const short = pro.filter((l) => { const s = slotsOf({ BOT: l.picks.BOT }, kits)[0]; return s.threat >= 2 && s.c.kit.range <= 1; });
const sc = new Map<string, { n: number; flagged: boolean }>();
for (const l of short) { const r = analyzePlan(l.picks, kits); const k = `${nameOf(l.picks.BOT)} + ${nameOf(l.picks.SUPPORT)}`; const c = sc.get(k) ?? { n: 0, flagged: [...r.weaknesses, ...r.more].some((w) => w.id === "duo-short-no-peel") }; c.n++; sc.set(k, c); }
console.log(`\nSHORT-RANGE BOT CARRIES (${short.length})`); for (const [k, v] of [...sc].sort((a, b) => b[1].n - a[1].n)) console.log(" ", k.padEnd(28), v.n, v.flagged ? "flagged: no protector" : "ok");

// 3. Four picks vs five
let crit4 = 0, needed4 = 0, closedByReal = 0, unfixable = 0; const rows: string[] = [];
for (const l of pro) for (const drop of ROLES) {
  const d = { ...l.picks } as Partial<Record<Role, string>>; delete d[drop];
  const r4 = analyzePlan(d, kits, Object.values(l.enemy));
  const five = analyzePlan(l.picks, kits); const still = new Set(five.critical.map((x) => x.id));
  for (const x of [...r4.weaknesses, ...r4.more]) {
    if (x.tier === "critical") { crit4++; unfixable++; }
    if (x.tier === "needed") { needed4++; if (!still.has(x.id)) closedByReal++; else rows.push(`${l.team} drop ${drop}: ${x.label} still open after ${nameOf(l.picks[drop])}`); }
  }
}
console.log(`\nFOUR PICKS (${pro.length * 5} states): needed ${needed4}, still critical (no available fix) ${crit4}; real 5th pick closed ${closedByReal}/${needed4} (${pct(closedByReal, needed4)})`);
out.fourPick = { states: pro.length * 5, needed4, crit4, closedByReal };

// 4. Enemy exposure on the real matchups
const exp = { exploited: 0, structural: 0, "less-relevant": 0 } as Record<string, number>; const pokeRows: string[] = [];
for (const l of pro) {
  const r = analyzePlan(l.picks, kits, Object.values(l.enemy));
  for (const x of [...r.weaknesses, ...r.more]) exp[x.exposure]++;
  if (r.identity.primary?.id === "poke") { const a = [...r.weaknesses, ...r.more].find((x) => x.id === "plan:anti-engage" || x.id === "no-frontline");
    pokeRows.push(`${ROLES.map((x) => nameOf(l.picks[x])).join("/")} vs ${ROLES.map((x) => nameOf(l.enemy[x])).join("/")}: ${a ? `${a.label} → ${a.exposure}${a.against ? ` (${a.against})` : ""}` : "no anti-engage gap"}${l.won ? " · won" : " · lost"}`); }
}
console.log("\nEXPOSURE of real weaknesses on the actual matchups", JSON.stringify(exp));
console.log("POKE COMPS vs their real opponent"); for (const p of pokeRows) console.log(" ", p);
out.exposure = exp; out.poke = pokeRows;

// 5. Pro lineups still read as critical
const flagged = pro.map((l) => ({ l, r: analyzePlan(l.picks, kits, Object.values(l.enemy)) })).filter((x) => x.r.critical.length);
console.log(`\nPRO LINEUPS WITH A CRITICAL (${flagged.length}/${pro.length})`);
for (const { l, r } of flagged) console.log(" ", `${l.team} ${l.won ? "W" : "L"}`.padEnd(14), ROLES.map((x) => nameOf(l.picks[x])).join("/").padEnd(48), r.critical.map((x) => `${x.label}${x.exposure !== "structural" ? ` [${x.exposure}]` : ""}`).join("; "));
out.flagged = flagged.map(({ l, r }) => ({ team: l.team, won: l.won, url: l.url, lineup: ROLES.map((x) => nameOf(l.picks[x])).join(" / "), critical: r.critical.map((x) => ({ label: x.label, why: x.why, exposure: x.exposure, against: x.against })) }));
writeFileSync(process.argv[2] ?? "/dev/null", JSON.stringify(out, null, 1));
