import { describe, expect, it } from "vitest";
import { getDraftData } from "@/lib/data";
import { profile, warnings } from "@/lib/evaluate";
import { clashSuggestions, logicSuggestions, proSuggestions } from "@/lib/suggest";

const data = getDraftData();
const ids = (ws: { id: string }[]) => ws.map((w) => w.id);

describe("draft evaluation", () => {
  it("is deterministic", () => {
    const d = { TOP: "jayce", JUNGLE: "vi", MID: "ryze", BOT: "lucian", SUPPORT: "milio" };
    expect(profile(d, data.champions)).toEqual(profile(d, data.champions));
    expect(warnings(d, data.champions)).toEqual(warnings(d, data.champions));
  });

  it("flags Ziggs without a fight starter", () => {
    expect(ids(warnings({ BOT: "ziggs", SUPPORT: "lulu" }, data.champions))).toContain("needs-fight-starter");
    expect(ids(warnings({ BOT: "ziggs", SUPPORT: "nautilus" }, data.champions))).not.toContain("needs-fight-starter");
  });

  it("flags an all-AD comp", () => {
    const ad = warnings({ TOP: "jayce", JUNGLE: "lee-sin", BOT: "caitlyn", SUPPORT: "pyke" }, data.champions);
    expect(ids(ad)).toContain("too-much-ad");
  });

  it("does not warn on an empty draft", () => {
    expect(warnings({}, data.champions)).toEqual([]);
  });

  it("every warning states its rule and reason", () => {
    for (const w of warnings({ TOP: "jayce", JUNGLE: "lee-sin", BOT: "caitlyn", SUPPORT: "pyke" }, data.champions)) {
      expect(w.rule.length).toBeGreaterThan(0);
      expect(w.why.length).toBeGreaterThan(0);
    }
  });
});

describe("suggestions stay in separate layers", () => {
  it("Clash suggestions for Ziggs offer only Nautilus / Leona at support", () => {
    const s = clashSuggestions({ BOT: "ziggs" }, data).SUPPORT!.map((x) => x.champion);
    expect(s).toEqual(expect.arrayContaining(["nautilus", "leona"]));
    for (const banned of ["bard", "karma", "pyke", "camille"]) expect(s).not.toContain(banned);
  });

  it("bot shapes from other picks never add Bard or Karma next to a locked Ziggs", () => {
    for (const mid of ["azir", "orianna", "ryze", "locke", "viktor"]) {
      const s = clashSuggestions({ BOT: "ziggs", MID: mid }, data).SUPPORT!.map((x) => x.champion);
      expect(s, mid).not.toContain("bard");
      expect(s, mid).not.toContain("karma");
    }
    for (const top of data.topPicks.map((t) => t.champion)) {
      const s = clashSuggestions({ BOT: "ziggs", TOP: top }, data).SUPPORT!.map((x) => x.champion);
      expect(s, top).not.toContain("bard");
      expect(s, top).not.toContain("karma");
    }
  });

  it("Clash suggestions for Corki put Nami first and never Alistar", () => {
    const s = clashSuggestions({ BOT: "corki" }, data).SUPPORT!;
    expect(s[0].champion).toBe("nami");
    expect(s.map((x) => x.champion)).not.toContain("alistar");
  });

  it("pro suggestions come only from recorded drafts", () => {
    const s = proSuggestions({ BOT: "corki" }, data.proDrafts);
    const recorded = new Set(data.proDrafts.filter((d) => d.picks.BOT === "corki").map((d) => d.picks.SUPPORT));
    for (const x of s.SUPPORT ?? []) expect(recorded.has(x.champion)).toBe(true);
  });

  it("logic suggestions only fix an active warning", () => {
    expect(logicSuggestions({}, data)).toEqual({ TOP: [], JUNGLE: [], MID: [], BOT: [], SUPPORT: [] });
  });

  it("locked picks are never suggested again", () => {
    const d = { BOT: "sivir", SUPPORT: "lulu" };
    for (const list of Object.values(clashSuggestions(d, data))) expect(list!.map((x) => x.champion)).not.toContain("lulu");
  });
});
