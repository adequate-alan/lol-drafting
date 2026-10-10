// alan's locked Clash conclusions. A failure here means the data changed a decision
// that only alan can change; update the data only after he says so.
import { describe, expect, it } from "vitest";
import { getBotPairings, getGenG, getMidJungle, getPool, getTopPicks } from "@/lib/data";

const bot = (id: string) => {
  const r = getBotPairings().find((b) => b.champion === id);
  if (!r) throw new Error(`missing bot pairing ${id}`);
  return r;
};
const observed = (id: string) => bot(id).observedProPairings.map((o) => o.champion);
const clash = (id: string) => [...bot(id).clashDefault, ...bot(id).alternatives];
// alan's hand-saved alternatives, without those derived from pro games (lib/pro-alternatives.ts).
const handAlts = (id: string) => bot(id).alternatives.filter((a) => !bot(id).proAlternatives?.includes(a));

describe("bot lane Clash defaults", () => {
  it("Corki → Nami; Alistar is a pro-derived alternative, never the default", () => {
    expect(bot("corki").clashDefault).toEqual(["nami"]);
    expect(handAlts("corki")).not.toContain("alistar");
    expect(bot("corki").proAlternatives).toContain("alistar");
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

  it("Ziggs → Nautilus / Leona preferred; Camille and Alistar the only alternatives (alan, 2026-10-10)", () => {
    const z = bot("ziggs");
    expect(z.clashDefault).toEqual(["nautilus", "leona"]);
    expect(handAlts("ziggs")).toEqual(["camille", "alistar"]);
    expect(z.proAlternatives).toEqual(["pyke"]);
    expect(clash("ziggs")).not.toContain("bard");
    expect(clash("ziggs")).not.toContain("karma");
  });

  it("Ziggs keeps Pyke and Camille as observed pro games; only alan's word made Camille a saved alternative", () => {
    expect(observed("ziggs")).toEqual(expect.arrayContaining(["pyke", "camille"]));
    expect(bot("ziggs").clashDefault).not.toContain("pyke");
    expect(handAlts("ziggs")).not.toContain("pyke");
    expect(bot("ziggs").clashDefault).not.toContain("camille");
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

  it("Kai'Sa → Nautilus + Rakan and Aphelios → Thresh + Lulu, joint preferred (alan, 2026-10-10)", () => {
    expect(bot("kaisa").clashDefault).toEqual(["nautilus", "rakan"]);
    expect(bot("kaisa").alternatives).toEqual([]);
    expect(bot("kaisa").clashDefault).not.toContain("rell");
    expect(bot("aphelios").clashDefault).toEqual(["thresh", "lulu"]);
    expect(bot("aphelios").alternatives).toEqual([]);
  });

  it("twelve more bots: joint preferred supports, alan's Synergy preferences, not Pro Evidence (alan, 2026-10-10)", () => {
    const saved: Record<string, string[]> = {
      draven: ["nautilus", "rell"], "kog-maw": ["lulu", "milio", "braum"], nilah: ["rakan", "seraphine"], samira: ["nautilus", "rell"],
      senna: ["tahm-kench", "seraphine"], smolder: ["lulu", "milio"], swain: ["nautilus", "leona"], tristana: ["nautilus", "rell"],
      twitch: ["lulu", "yuumi"], varus: ["karma", "nautilus"], vayne: ["lulu", "milio"], yasuo: ["rell", "alistar"],
    };
    for (const [id, supports] of Object.entries(saved)) {
      expect(bot(id).clashDefault, id).toEqual(supports);
      expect(bot(id).observedProPairings, id).toEqual([]);
      expect(bot(id).sources, id).toEqual([]);
      expect(bot(id).alternatives, id).toEqual(id === "swain" ? ["seraphine"] : []);
    }
    // alan's changes to the proposal: Milio added beside Braum for Kog'Maw, Milio over Renata for Vayne, Seraphine not preferred for Swain.
    expect(bot("vayne").clashDefault).not.toContain("renata-glasc");
    expect(bot("swain").clashDefault).not.toContain("seraphine");
  });

  it("Mel → Alistar / Pyke / Leona preferred, Nautilus an alternative (alan, 2026-10-10)", () => {
    expect(bot("mel").clashDefault).toEqual(["alistar", "pyke", "leona"]);
    expect(bot("mel").alternatives).toEqual(["karma", "bard", "neeko", "nautilus"]);
    // Synergy only: the one recorded pro game is still Mel + Alistar.
    expect(bot("mel").observedProPairings.map((o) => o.champion)).toEqual(["alistar"]);
  });

  it("Viktor bot → Leona + Nautilus, joint preferred; his mid record is separate (alan, 2026-10-10)", () => {
    expect(bot("viktor").clashDefault).toEqual(["leona", "nautilus"]);
    expect(bot("viktor").alternatives).toEqual([]);
    expect(bot("viktor").observedProPairings).toEqual([]);
    expect(getMidJungle().find((m) => m.anchor === "viktor")!.role).toBe("MID");
  });

  it("every BOT pool champion has a Synergy record", () => {
    const pool = getPool().find((p) => p.role === "BOT")!;
    for (const id of [...pool.core, ...pool.depth, ...pool.flex]) expect(bot(id).clashDefault.length, id).toBeGreaterThan(0);
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

  it("Ahri ↔ Vi is each other's saved default (alan, 2026-10-10)", () => {
    expect(mj("ahri").clashDefault[0]).toBe("vi");
    expect(mj("vi").clashDefault[0]).toBe("ahri");
    expect(mj("ahri").alternatives).not.toContain("vi");
    expect(mj("ahri").clashDefault).toEqual(expect.arrayContaining(["pantheon", "wukong"]));
    expect(mj("vi").clashDefault).toEqual(expect.arrayContaining(["akali", "syndra"]));
  });

  it("LeBlanc is a saved Lee Sin synergy, both ways (alan, 2026-10-10)", () => {
    expect(mj("lee-sin").alternatives).toContain("leblanc");
    expect(mj("lee-sin").clashDefault).toEqual(["cassiopeia", "ryze"]);
    expect(mj("leblanc").role).toBe("MID");
    expect(mj("leblanc").clashDefault).toEqual(["lee-sin"]);
    expect(mj("leblanc").observedProPairings).toEqual([]);
  });

  it("records added from alan's saved links only mirror them, never pro evidence (2026-10-10)", () => {
    for (const id of ["pantheon", "nocturne", "trundle", "wukong", "aatrox", "xin-zhao", "sylas", "twisted-fate"]) {
      const r = mj(id);
      expect(r.observedProPairings, id).toEqual([]);
      expect(r.sources, id).toEqual([]);
      for (const p of [...r.clashDefault, ...r.alternatives]) {
        const back = mj(p);
        expect(back.role, `${id} ↔ ${p}`).not.toBe(r.role);
        expect([...back.clashDefault, ...back.alternatives], `${p} lists ${id}`).toContain(id);
      }
    }
    expect(mj("pantheon").clashDefault).toEqual(["syndra", "ahri"]);
    expect(mj("nocturne").clashDefault).toEqual(["orianna", "lissandra"]);
  });

  it("Poppy and Vex records and top flex picks as alan approved (2026-10-10)", () => {
    expect(mj("poppy").clashDefault).toEqual(["orianna", "syndra"]);
    expect(mj("vex").clashDefault).toEqual(["jarvan-iv", "sejuani"]);
    const top = (id: string) => getTopPicks().find((t) => t.champion === id)!;
    const grades: Record<string, string> = { "dr-mundo": "B", gragas: "B", galio: "B-", jax: "B-", varus: "C+", fiora: "C+", anivia: "C" };
    for (const [id, g] of Object.entries(grades)) {
      expect(top(id).blindGrade, id).toBe(g);
      expect(top(id).observedProPairings, id).toEqual([]);
    }
    expect(top("anivia").surrounding.mid).toEqual(["azir"]);
  });

  it("every MID, JUNGLE and TOP pool champion has a Synergy record", () => {
    for (const p of getPool().filter((x) => x.role !== "BOT" && x.role !== "SUPPORT"))
      for (const id of [...p.core, ...p.depth, ...p.flex]) {
        if (p.role === "TOP") expect(getTopPicks().some((t) => t.champion === id), `TOP ${id}`).toBe(true);
        else expect(getMidJungle().some((m) => m.anchor === id && m.role === p.role), `${p.role} ${id}`).toBe(true);
      }
  });

  it("Yone pairs with Maokai and with Sejuani, both ways (alan, 2026-10-10)", () => {
    expect(mj("yone").role).toBe("MID");
    expect(mj("yone").clashDefault).toEqual(["maokai", "sejuani"]);
    expect(mj("maokai").role).toBe("JUNGLE");
    expect(mj("maokai").clashDefault).toEqual(["yone"]);
    expect(mj("sejuani").role).toBe("JUNGLE");
    expect(mj("sejuani").clashDefault).toEqual(["yone"]);
    // Saved layer only: no pro evidence was supplied for these duos.
    for (const id of ["yone", "maokai", "sejuani"]) expect(mj(id).observedProPairings).toEqual([]);
  });

  it("no current Gen.G pattern presents Azir + Skarner", () => {
    const current = getGenG().filter((p) => p.era === "current-playoffs");
    for (const p of current) expect(/azir/i.test(p.title) && /skarner/i.test(p.title)).toBe(false);
    expect(getGenG().some((p) => p.era === "earlier-2026" && /azir/i.test(p.title))).toBe(true);
  });
});
