// Clash bot/support eligibility is a hard rule: only the locked bot's Clash record can supply a Clash
// support (and the reverse), and Clash defaults always rank ahead of alternatives.
import { describe, expect, it } from "vitest";
import { getDraftData } from "@/lib/data";
import type { Draft } from "@/lib/evaluate";
import { clashSuggestions } from "@/lib/suggest";

const data = getDraftData();
const bot = (id: string) => data.botPairings.find((b) => b.champion === id)!;
const supports = (d: Draft) => (clashSuggestions(d, data).SUPPORT ?? []).map((s) => s.champion);
const bots = (d: Draft) => (clashSuggestions(d, data).BOT ?? []).map((s) => s.champion);

function expectEligible(d: Draft & { BOT: string }) {
  const r = bot(d.BOT);
  const list = supports(d);
  for (const s of list) expect([...r.clashDefault, ...r.alternatives], `${JSON.stringify(d)}: ${s}`).toContain(s);
  // Every default is listed, and all of them come before any alternative. Context may reorder
  // joint defaults (Caitlyn's Bard / Karma) but never lift an alternative above one.
  expect([...list.slice(0, r.clashDefault.length)].sort(), JSON.stringify(d)).toEqual([...r.clashDefault].sort());
}

// The 14 drafts that failed the 2026-10-10 audit.
const PREVIOUS_FAILURES: { draft: Draft & { BOT: string }; first: string; never: string[] }[] = [
  { draft: { BOT: "corki", MID: "viktor" }, first: "nami", never: ["alistar"] },
  { draft: { BOT: "corki", MID: "locke" }, first: "nami", never: ["alistar"] },
  { draft: { BOT: "corki", JUNGLE: "skarner" }, first: "nami", never: ["alistar"] },
  { draft: { BOT: "corki", TOP: "gwen" }, first: "nami", never: ["alistar"] },
  { draft: { BOT: "sivir", MID: "locke" }, first: "lulu", never: [] },
  { draft: { BOT: "sivir", JUNGLE: "skarner" }, first: "lulu", never: [] },
  { draft: { BOT: "sivir", TOP: "olaf" }, first: "lulu", never: [] },
  { draft: { BOT: "ezreal", MID: "anivia" }, first: "karma", never: [] },
  { draft: { BOT: "ezreal", MID: "annie" }, first: "karma", never: [] },
  { draft: { BOT: "jhin", MID: "viktor" }, first: "alistar", never: ["rell"] },
  { draft: { BOT: "jhin", MID: "annie" }, first: "alistar", never: ["rell"] },
  { draft: { BOT: "jhin", MID: "locke" }, first: "alistar", never: ["rell"] },
  { draft: { BOT: "jhin", TOP: "camille" }, first: "alistar", never: [] },
  { draft: { BOT: "ziggs", MID: "ahri" }, first: "nautilus", never: ["pyke", "camille", "bard", "karma"] },
];

describe("previous 14 failing drafts", () => {
  for (const { draft, first, never } of PREVIOUS_FAILURES) {
    it(`${Object.entries(draft).map(([r, c]) => `${r} ${c}`).join(" + ")}`, () => {
      const list = supports(draft);
      expect(list[0]).toBe(first);
      for (const n of never) expect(list).not.toContain(n);
      expectEligible(draft);
    });
  }
});

describe("locked conclusions in the Clash support list", () => {
  it("Sivir → Lulu, Ezreal → Karma, Corki → Nami come first", () => {
    expect(supports({ BOT: "sivir" })[0]).toBe("lulu");
    expect(supports({ BOT: "ezreal" })[0]).toBe("karma");
    expect(supports({ BOT: "corki" })[0]).toBe("nami");
  });

  it("Ziggs → Nautilus / Leona only, with any other pick locked", () => {
    const others: Draft[] = [{}, ...data.midJungle.map((m) => ({ [m.role]: m.anchor })), ...data.topPicks.map((t) => ({ TOP: t.champion }))];
    for (const o of others) expect(supports({ ...o, BOT: "ziggs" }), JSON.stringify(o)).toEqual(["nautilus", "leona"]);
  });

  it("Alistar is never a Corki Clash support and Rell never a Jhin Clash support", () => {
    const others: Draft[] = [{}, ...data.midJungle.map((m) => ({ [m.role]: m.anchor })), ...data.topPicks.map((t) => ({ TOP: t.champion }))];
    for (const o of others) {
      expect(supports({ ...o, BOT: "corki" })).not.toContain("alistar");
      expect(supports({ ...o, BOT: "jhin" })).not.toContain("rell");
    }
  });
});

describe("eligibility holds for every bot with any one other pick", () => {
  const others: Draft[] = [{}, ...data.midJungle.map((m) => ({ [m.role]: m.anchor })), ...data.topPicks.map((t) => ({ TOP: t.champion }))];
  it(`${data.botPairings.length} bots x ${others.length} contexts`, () => {
    for (const b of data.botPairings) for (const o of others) expectEligible({ ...o, BOT: b.champion });
  });

  it("observed pro pairings never make a support Clash-eligible", () => {
    for (const b of data.botPairings) {
      const proOnly = b.observedProPairings.map((o) => o.champion).filter((s) => !b.clashDefault.includes(s) && !b.alternatives.includes(s));
      for (const o of others) for (const s of proOnly) expect(supports({ ...o, BOT: b.champion }), `${b.champion}+${s}`).not.toContain(s);
    }
  });
});

describe("reverse direction: support locked, bot open", () => {
  const allSupports = [...new Set(data.botPairings.flatMap((b) => [...b.clashDefault, ...b.alternatives, ...b.observedProPairings.map((o) => o.champion)]))];
  const others: Draft[] = [{}, ...data.midJungle.map((m) => ({ [m.role]: m.anchor })), ...data.topPicks.map((t) => ({ TOP: t.champion }))];

  it("only bots whose Clash record lists the support are suggested, defaults first", () => {
    for (const s of allSupports) for (const o of others) {
      const list = bots({ ...o, SUPPORT: s });
      for (const b of list) expect([...bot(b).clashDefault, ...bot(b).alternatives], `${s}: ${b}`).toContain(s);
      const tiers = list.map((b) => (bot(b).clashDefault.includes(s) ? 0 : 1));
      expect(tiers, `${s} ${JSON.stringify(o)}`).toEqual([...tiers].sort());
    }
  });

  it("pro-only pairings give no Clash bonus in reverse", () => {
    expect(bots({ SUPPORT: "pyke" })).not.toContain("ziggs");
    expect(bots({ SUPPORT: "camille" })).not.toContain("ziggs");
    expect(bots({ SUPPORT: "alistar" })).not.toContain("corki");
    expect(bots({ SUPPORT: "rell" })).not.toContain("jhin");
    expect(bots({ SUPPORT: "nami" })[0]).toBe("corki");
  });

  it("with both bot-lane slots open, pro-only shapes add nothing", () => {
    const d = { MID: "ahri" };
    expect(supports(d)).not.toContain("pyke");
    const v = { MID: "viktor" };
    expect(supports(v)).not.toContain("alistar");
    expect(supports(v)).not.toContain("rell");
  });
});
