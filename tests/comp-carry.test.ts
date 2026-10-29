// Who a protect plan is built around (alan, 2026-10-26): never the first peel-dependent champion in role order. A
// champion stored as needing peel outranks one that only meets the kit heuristic, a carry who peels herself is
// secondary damage and utility, equal candidates stay a dual carry, an approved comp's named carry wins, and damage
// share never decides. Text only: every score, identity and need is unchanged.
import { describe, expect, test } from "vitest";
import { getDraftData, getLibrary } from "@/lib/data";
import { analyze, facts, protectTarget, slotsOf, type Draft } from "@/lib/model-v2/analyze";
import { analyzePlan } from "@/lib/model-v2/plan";
import { convertKits } from "@/lib/model-v2/kits";
import { readLineup } from "@/lib/comp-discovery";

const kits = convertKits(getDraftData().champions);
const nameOf = (id: string) => kits.find((k) => k.id === id)?.name ?? id;
const target = (d: Draft, named?: string) => { const t = protectTarget(slotsOf(d, kits), false, named); return { primary: t.primary?.c.id, carries: t.carries.map((s) => s.c.id) }; };

// Recorded lineups (Gol.gg game ids in the names).
const vitality: Draft = { TOP: "ksante", JUNGLE: "naafiri", MID: "anivia", BOT: "yunara", SUPPORT: "lulu" }; // 83450 red
const viktor: Draft = { TOP: "ksante", JUNGLE: "jarvan-iv", MID: "viktor", BOT: "kalista", SUPPORT: "renata-glasc" }; // 83641 red
const jdg: Draft = { TOP: "ksante", JUNGLE: "vi", MID: "viktor", BOT: "yunara", SUPPORT: "lulu" }; // 83527 blue
const brion: Draft = { TOP: "ambessa", JUNGLE: "chogath", MID: "anivia", BOT: "corki", SUPPORT: "shen" }; // 83612 blue
const bnk: Draft = { TOP: "yorick", JUNGLE: "maokai", MID: "viktor", BOT: "corki", SUPPORT: "nami" }; // 82399 blue

describe("the protected carry", () => {
  test("Team Vitality protects Yunara; Anivia, earlier in role order, is secondary damage and utility", () => {
    expect(target(vitality)).toEqual({ primary: "yunara", carries: ["yunara"] });
    const a = analyze(vitality, kits);
    expect(a.headline).toMatch(/^Protect Yunara/);
    expect(a.winCondition).toMatch(/^Play around Yunara: K'Sante, Anivia and Lulu stay with Yunara/);
    expect(a.winCondition).toContain("Anivia and Yunara deal damage");
    expect(analyzePlan(vitality, kits).plan?.jobs.find((j) => j.id === "protectors")?.missing).toContain("protect Yunara");
  });
  test("a stored needs-peel carry wins over the main damage threat: damage share never decides", () => {
    const s = slotsOf(jdg, kits);
    expect(facts(s).main?.c.id).toBe("viktor");
    expect(target(jdg).primary).toBe("yunara");
  });
  test("a single peel-dependent carry is the one protected", () => {
    expect(target(viktor)).toEqual({ primary: "viktor", carries: ["viktor"] });
  });
  test("a carry who peels or disengages herself gives way to the other candidate", () => {
    expect(target(brion)).toEqual({ primary: "corki", carries: ["corki"] });
  });
  test("two candidates of equal standing are a dual carry: no primary, both named", () => {
    const t = target(bnk);
    expect(t.primary).toBeUndefined();
    expect(t.carries).toEqual(["viktor", "corki"]);
    const a = analyze(bnk, kits);
    expect(a.headline).toMatch(/^Protect Viktor and Corki/);
    expect(a.winCondition).toMatch(/^Play around Viktor and Corki: Maokai and Nami stay with them/);
  });
  test("a carry an approved comp names wins, and reads say so", () => {
    expect(target(vitality, "anivia").primary).toBe("anivia");
    const r = readLineup(vitality as Required<Draft>, kits, nameOf, "yunara");
    expect(r.ok && r.read.winCondition).toMatch(/^Play around Yunara/);
  });
});

describe("text only", () => {
  test("naming a carry changes no identity score, need or weak point", () => {
    for (const d of [vitality, viktor, jdg, brion, bnk]) {
      const plain = analyze(d, kits), named = analyze(d, kits, [], { carry: d.MID });
      expect(named.identity.all.map((i) => [i.id, i.score])).toEqual(plain.identity.all.map((i) => [i.id, i.score]));
      expect(named.needs.map((n) => [n.id, n.priority])).toEqual(plain.needs.map((n) => [n.id, n.priority]));
      expect([...named.weakPoints, ...named.more].map((w) => [w.id, w.severity])).toEqual([...plain.weakPoints, ...plain.more].map((w) => [w.id, w.severity]));
    }
  });
});

describe("Comp Library", () => {
  const library = getLibrary();
  test("Viktor's card leads with alan's win condition; the comp check's read stays in Details", () => {
    const s = library.shells.find((x) => x.id === "pro-83641-red")!;
    expect(s.name).toBe("Front-to-back + Zone Control · Viktor");
    expect(s.winCondition).toBe("Control objective approaches with Viktor's zone denial, use K'Sante and Jarvan IV to establish the frontline and initiate favorable fights, then let Viktor and Kalista deal sustained damage while Renata disrupts enemy engages.");
    const read = library.extras[s.id].discovered!;
    expect(read.winCondition).toContain("while Jarvan IV starts fights");
    expect(read.winCondition).toContain("Viktor and Kalista deal damage");
  });
  test("Team Vitality's stored read protects Yunara", () => {
    const s = library.shells.find((x) => x.id === "pro-83450-red")!;
    expect(s.winCondition).toMatch(/^Play around Yunara/);
    expect(s.why).toMatch(/protect Yunara/);
  });
});
