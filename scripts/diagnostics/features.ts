// Which team-level facts separate real pro lineups from shuffled lineups built from the same champions?
import { facts, slotsOf, economyBurden, siegeOf } from "../../lib/model-v2/analyze";
import { fn, plans } from "./cohesion";
import { kits, lineups } from "./load";
import type { Role } from "../../lib/schema";
import type { Slot } from "../../lib/model-v2/analyze";
const ids = new Set(kits.map((k) => k.id));
const ROLES: Role[] = ["TOP", "JUNGLE", "MID", "BOT", "SUPPORT"];
const pro = lineups.filter((l) => Object.values(l.picks).every((p) => ids.has(p))).map((l) => l.picks);
let seed = 11; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pools = Object.fromEntries(ROLES.map((r) => [r, pro.map((p) => p[r])])) as Record<Role, string[]>;
const sh: Record<Role, string>[] = [];
while (sh.length < 3000) { const d = {} as Record<Role, string>; const u = new Set<string>(); for (const r of ROLES) { let c; do c = pools[r][Math.floor(rnd() * pools[r].length)]; while (u.has(c)); u.add(c); d[r] = c; } sh.push(d); }
type F = (s: Slot[]) => boolean;
const cnt = (s: Slot[], p: (x: Slot) => boolean) => s.filter(p).length;
const feats: Record<string, F> = {
  "no tank (frontline>=2)": (s) => cnt(s, fn.tank) === 0,
  "3+ tanks": (s) => cnt(s, fn.tank) >= 3,
  "hold < 1 (tank + half bruiser)": (s) => cnt(s, fn.tank) + 0.5 * cnt(s, (x) => fn.bruiser(x) && !fn.tank(x)) < 1,
  "no primary starter": (s) => cnt(s, fn.starter) === 0,
  "2+ primary starters": (s) => cnt(s, fn.starter) >= 2,
  "no starter or catcher": (s) => cnt(s, (x) => fn.starter(x) || fn.catcher(x)) === 0,
  "physical share >= 75%": (s) => (facts(s).physicalShare ?? 0) >= 0.75,
  "magic share >= 75%": (s) => (facts(s).magicShare ?? 0) >= 0.75,
  "physical share 35-65%": (s) => { const p = facts(s).physicalShare ?? 0; return p >= 0.35 && p <= 0.65; },
  "<=2 damage threats": (s) => cnt(s, fn.carry) <= 2,
  "5 damage threats": (s) => cnt(s, fn.carry) >= 5,
  "hyper carry w/ <2 peelers": (s) => { const h = s.find(fn.hyper); return !!h && cnt(s, (x) => x !== h && fn.peeler(x)) < 2; },
  "hyper carry w/ 2+ non-starter peelers": (s) => { const h = s.find(fn.hyper); return !!h && cnt(s, (x) => x !== h && fn.peeler(x) && !fn.starter(x)) >= 2; },
  "0-1 peelers": (s) => cnt(s, fn.peeler) <= 1,
  "economy warning": (s) => economyBurden(s).warn,
  "3+ resource-hungry (any role)": (s) => cnt(s, (x) => x.c.kit.resourceDemand >= 3) >= 3,
  "3+ 'stuck' melee carries": (s) => cnt(s, fn.stuck) >= 3,
  "3+ short-range carries (current rule)": (s) => facts(s).shortRange.length >= 3,
  "0-1 ranged carries": (s) => cnt(s, fn.ranged) <= 1,
  "4+ ranged carries": (s) => cnt(s, fn.ranged) >= 4,
  "follow-up total < 7": (s) => facts(s).followUp < 7,
  "team waveclear <= 6": (s) => facts(s).waveclear <= 6,
  "mean early <= 1.8": (s) => facts(s).curve.early <= 1.8,
  "mean late <= 1.8": (s) => facts(s).curve.late <= 1.8,
  "early-only x2 + late-only carry": (s) => cnt(s, fn.earlyOnly) >= 2 && cnt(s, (x) => fn.lateOnly(x) && x.threat >= 3) >= 1,
  "2+ late-only carries": (s) => cnt(s, (x) => fn.lateOnly(x) && x.threat >= 3) >= 2,
  "siege High": (s) => siegeOf(s).score >= 1.9,
  "2+ side laners": (s) => cnt(s, fn.side) >= 2,
  "mid + jungle both early>=3": (s) => { const m = s.find((x) => x.role === "MID"), j = s.find((x) => x.role === "JUNGLE"); return !!m && !!j && fn.early(m) && fn.early(j); },
  "mid + jungle both early<=2": (s) => { const m = s.find((x) => x.role === "MID"), j = s.find((x) => x.role === "JUNGLE"); return !!m && !!j && m.c.kit.curve.early <= 2 && j.c.kit.curve.early <= 2; },
  "bot lane: 2 low-prio (sum lp <=2)": (s) => { const b = s.find((x) => x.role === "BOT")!, p = s.find((x) => x.role === "SUPPORT")!; return b.c.attrs.lanePressure + p.c.attrs.lanePressure <= 2; },
  "enchanter (peel3, threat<=1) + hyper": (s) => !!s.find(fn.hyper) && s.some((x) => x.role === "SUPPORT" && x.c.attrs.peel >= 3 && x.threat <= 1),
  "engage support + no follow-up bot": (s) => { const p = s.find((x) => x.role === "SUPPORT")!, b = s.find((x) => x.role === "BOT")!; return fn.starter(p) && b.c.kit.followUp < 2; },
  "no 3+ curve-late pick": (s) => cnt(s, (x) => x.c.kit.curve.late >= 3) === 0,
  "every plan < 75%": (s) => plans(s)[0].fit < 0.75,
  "teamfight plan 4/4": (s) => plans(s).find((p) => p.id === "teamfight")!.fit === 1,
  "protect plan 4/4": (s) => plans(s).find((p) => p.id === "protect")!.fit === 1,
  "dive plan 5/5": (s) => plans(s).find((p) => p.id === "dive")!.fit === 1,
};
const P = pro.map((d) => slotsOf(d, kits)), S = sh.map((d) => slotsOf(d, kits));
const rows = Object.entries(feats).map(([k, f]) => { const a = P.filter(f).length / P.length, b = S.filter(f).length / S.length; return { k, pro: a, shuf: b, ratio: (a + 0.005) / (b + 0.005) }; }).sort((x, y) => x.ratio - y.ratio);
for (const r of rows) console.log(r.k.padEnd(42), (100 * r.pro).toFixed(1).padStart(6), (100 * r.shuf).toFixed(1).padStart(6), r.ratio.toFixed(2));
