import { kits, lineups } from "./load";
const cnt = new Map<string, number>();
for (const l of lineups) for (const [r, c] of Object.entries(l.picks)) cnt.set(`${c}|${r}`, (cnt.get(`${c}|${r}`) ?? 0) + 1);
const byId = new Map(kits.map((k) => [k.id, k]));
console.log("champ|role n fs thr range acc fl peel dis ce fu aoe wc lp side curve flags");
for (const [k, n] of [...cnt].sort((a, b) => b[1] - a[1])) {
  const [id, role] = k.split("|"); const c = byId.get(id);
  if (!c) { console.log(k, n, "NO KIT"); continue; }
  const d = c.damageByRole[role as never] as any;
  console.log(k.padEnd(22), n, c.fightStart, d?.damageThreat, c.kit.range, c.kit.backlineAccess, c.attrs.frontline, c.attrs.peel, c.kit.disengage, c.kit.counterEngage, c.kit.followUp, c.kit.aoeCc, c.kit.waveclear, c.attrs.lanePressure, c.attrs.sidePressure, `${c.kit.curve.early}${c.kit.curve.mid}${c.kit.curve.late}`, c.flags.join(","));
}
