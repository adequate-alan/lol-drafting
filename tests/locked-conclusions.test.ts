// alan's locked Clash conclusions. A failure here means the data changed a decision
// that only alan can change; update the data only after he says so.
import { describe, expect, it } from "vitest";
import { getBotPairings, getGenG, getMidJungle } from "@/lib/data";

const bot = (id: string) => {
  const r = getBotPairings().find((b) => b.champion === id);
  if (!r) throw new Error(`missing bot pairing ${id}`);
  return r;
};
const observed = (id: string) => bot(id).observedProPairings.map((o) => o.champion);
const clash = (id: string) => [...bot(id).clashDefault, ...bot(id).alternatives];

describe("bot lane Clash defaults", () => {
  it("Corki → Nami; Alistar is observed only", () => {
    expect(bot("corki").clashDefault).toEqual(["nami"]);
    expect(clash("corki")).not.toContain("alistar");
    expect(observed("corki")).toContain("alistar");
  });

  it("Caitlyn → Bard / Karma", () => {
    expect(bot("caitlyn").clashDefault).toEqual(["bard", "karma"]);
  });

  it("Sivir → Lulu; Karma is the observed tempo alternative", () => {
    expect(bot("sivir").clashDefault).toEqual(["lulu"]);
    expect(bot("sivir").alternatives).toEqual(["karma", "bard", "rakan", "seraphine"]);
    expect(observed("sivir")).toContain("karma");
  });

  it("Ezreal → Karma, with Seraphine / Bard / Milio / Neeko / Nautilus as alternatives only", () => {
    expect(bot("ezreal").clashDefault).toEqual(["karma"]);
    expect(bot("ezreal").alternatives).toEqual(["seraphine", "bard", "milio", "neeko", "nautilus"]);
  });

  it("Yunara → Lulu; Braum kept as the anti-dive option", () => {
    expect(bot("yunara").clashDefault).toEqual(["lulu"]);
    expect(bot("yunara").alternatives).toContain("braum");
  });

  it("Ziggs → Nautilus / Leona with no Clash alternatives", () => {
    const z = bot("ziggs");
    expect(z.clashDefault).toEqual(["nautilus", "leona"]);
    expect(z.alternatives).toEqual([]);
    expect(clash("ziggs")).not.toContain("bard");
    expect(clash("ziggs")).not.toContain("karma");
  });

  it("Ziggs keeps Pyke and Camille as observed pro variants, never as Clash picks", () => {
    expect(observed("ziggs")).toEqual(expect.arrayContaining(["pyke", "camille"]));
    expect(clash("ziggs")).not.toContain("pyke");
    expect(clash("ziggs")).not.toContain("camille");
  });

  it("Ziggs carries the engage / catch logic warning", () => {
    expect(bot("ziggs").logic.warning).toBe(
      "Ziggs needs reliable engage or catch somewhere else in the composition if support is not providing it.",
    );
  });

  it("Xayah → Rakan, Kalista → Renata, Zeri → Yuumi", () => {
    expect(bot("xayah").clashDefault).toEqual(["rakan"]);
    expect(bot("kalista").clashDefault).toEqual(["renata-glasc"]);
    expect(bot("zeri").clashDefault).toEqual(["yuumi"]);
  });
});

describe("mid / jungle", () => {
  const mj = (anchor: string) => {
    const r = getMidJungle().find((m) => m.anchor === anchor);
    if (!r) throw new Error(`missing mid/jungle pairing ${anchor}`);
    return r;
  };

  it("Skarner + Locke is the current pairing", () => {
    expect(mj("skarner").clashDefault).toContain("locke");
    expect(mj("skarner").observedProPairings.find((o) => o.champion === "locke")?.era).toBe("current-playoffs");
    expect(mj("locke").clashDefault).toContain("skarner");
  });

  it("Azir + Skarner exists only as earlier-2026 history", () => {
    const azir = mj("azir");
    expect(azir.clashDefault).not.toContain("skarner");
    expect(azir.alternatives).not.toContain("skarner");
    expect(azir.observedProPairings.filter((o) => o.champion === "skarner" && o.era === "current-playoffs")).toEqual([]);
    expect(azir.history).toEqual([expect.objectContaining({ partner: "skarner", era: "earlier-2026" })]);
    expect(mj("skarner").clashDefault).not.toContain("azir");
  });

  it("no current Gen.G pattern presents Azir + Skarner", () => {
    const current = getGenG().filter((p) => p.era === "current-playoffs");
    for (const p of current) expect(/azir/i.test(p.title) && /skarner/i.test(p.title)).toBe(false);
    expect(getGenG().some((p) => p.era === "earlier-2026" && /azir/i.test(p.title))).toBe(true);
  });
});
