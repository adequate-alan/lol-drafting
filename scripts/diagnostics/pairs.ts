// Pair-level facts: real bot/support and mid/jungle pairs vs pairs recombined from the same champions.
import { slotsOf, type Slot } from "../../lib/model-v2/analyze";
import { fn } from "./cohesion";
import { kits, lineups } from "./load";
import type { Role } from "../../lib/schema";
const ids = new Set(kits.map((k) => k.id));
const pro = lineups.filter((l) => Object.values(l.picks).every((p) => ids.has(p))).map((l) => slotsOf(l.picks, kits));
let seed = 5; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const at = (s: Slot[], r: Role) => s.find((x) => x.role === r)!;
function test(a: Role, b: Role, feats: Record<string, (x: Slot, y: Slot) => boolean>) {
  const real = pro.map((s) => [at(s, a), at(s, b)] as const);
  const fake: (readonly [Slot, Slot])[] = [];
  for (let i = 0; i < 5000; i++) { const x = real[Math.floor(rnd() * real.length)][0], y = real[Math.floor(rnd() * real.length)][1]; if (x.c.id !== y.c.id) fake.push([x, y]); }
  console.log(`\n${a} + ${b}`);
  for (const [k, f] of Object.entries(feats)) { const p = real.filter(([x, y]) => f(x, y)).length / real.length, q = fake.filter(([x, y]) => f(x, y)).length / fake.length;
    console.log(k.padEnd(52), (100 * p).toFixed(1).padStart(6), (100 * q).toFixed(1).padStart(6), ((p + .005) / (q + .005)).toFixed(2)); }
}
const enchanter = (s: Slot) => s.c.attrs.peel >= 3 && s.threat <= 1;
test("BOT", "SUPPORT", {
  "enchanter + hyper/needs-peel carry": (b, s) => enchanter(s) && fn.hyper(b),
  "enchanter + lane bully (lp>=3)": (b, s) => enchanter(s) && b.c.attrs.lanePressure >= 3,
  "primary-engage support + carry followUp>=2": (b, s) => fn.starter(s) && b.c.kit.followUp >= 2,
  "primary-engage support + carry followUp<2": (b, s) => fn.starter(s) && b.c.kit.followUp < 2,
  "primary-engage support + hyper carry": (b, s) => fn.starter(s) && fn.hyper(b),
  "both lp>=2": (b, s) => b.c.attrs.lanePressure >= 2 && s.c.attrs.lanePressure >= 2,
  "lp sum <=2": (b, s) => b.c.attrs.lanePressure + s.c.attrs.lanePressure <= 2,
  "early curve both >=3": (b, s) => b.c.kit.curve.early >= 3 && s.c.kit.curve.early >= 3,
  "carry late>=3 & support late<=1": (b, s) => b.c.kit.curve.late >= 3 && s.c.kit.curve.late <= 1,
  "carry early>=3 & support early>=3 or lp>=2": (b, s) => b.c.kit.curve.early >= 3 && (s.c.kit.curve.early >= 3 || s.c.attrs.lanePressure >= 2),
  "carry range>=2 & support peel>=2": (b, s) => b.c.kit.range >= 2 && s.c.attrs.peel >= 2,
  "short-range carry (<=1) & engage/catch support": (b, s) => b.c.kit.range <= 1 && (fn.starter(s) || fn.catcher(s)),
  "short-range carry (<=1) & enchanter": (b, s) => b.c.kit.range <= 1 && enchanter(s),
});
test("JUNGLE", "MID", {
  "jungle starter + mid followUp>=2": (j, m) => fn.starter(j) && m.c.kit.followUp >= 2,
  "jungle starter + mid aoeCc>=2": (j, m) => fn.starter(j) && m.c.kit.aoeCc >= 2,
  "jungle catch + mid burst>=2": (j, m) => fn.catcher(j) && m.c.attrs.burst >= 2,
  "jungle no-cc (fs none) + mid no fight start": (j, m) => j.c.fightStart === "none" && (m.c.fightStart === "none" || m.c.fightStart === "follow-up"),
  "both early>=3": (j, m) => j.c.kit.curve.early >= 3 && m.c.kit.curve.early >= 3,
  "jungle early>=3 & mid lp>=2": (j, m) => j.c.kit.curve.early >= 3 && m.c.attrs.lanePressure >= 2,
  "mid waveclear>=3": (j, m) => m.c.kit.waveclear >= 3,
  "jungle tank + mid ranged carry": (j, m) => fn.tank(j) && fn.ranged(m),
  "jungle diver + mid diver": (j, m) => fn.diver(j) && fn.diver(m),
  "same damage type (both >=80% one type)": (j, m) => { const t = (s: Slot) => s.physical >= 0.8 * s.threat ? "p" : s.magic >= 0.8 * s.threat ? "m" : "x"; return t(j) === t(m) && t(j) !== "x"; },
});
test("TOP", "JUNGLE", {
  "both tanks": (t, j) => fn.tank(t) && fn.tank(j),
  "neither frontline>=2": (t, j) => !fn.tank(t) && !fn.tank(j),
  "top side>=3 & jungle tank": (t, j) => fn.side(t) && fn.tank(j),
  "same damage type": (t, j) => { const ty = (s: Slot) => s.physical >= 0.8 * s.threat ? "p" : s.magic >= 0.8 * s.threat ? "m" : "x"; return ty(t) === ty(j) && ty(t) !== "x"; },
});
