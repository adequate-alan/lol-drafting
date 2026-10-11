// One Draft Room candidate list per open role (alan, 2026-10-11; lib/candidates.ts): Synergy, Pro, Fit and Counter are
// independent signals on one row per champion. A Pro-only candidate gets a full row; it never becomes a saved pairing,
// never takes Synergy, and pro game counts never move a row.
import { describe, expect, it } from "vitest";
import { getDraftData, getSources } from "@/lib/data";
import type { Draft } from "@/lib/evaluate";
import { draftCandidates, hasSignal, type Candidate } from "@/lib/candidates";
import type { EnemyDraft } from "@/lib/counters";
import { recommend } from "@/lib/recommend";
import type { ProDraft, Role } from "@/lib/schema";

const data = getDraftData();
const sources = Object.fromEntries(getSources().map((s) => [s.id, s]));
const rows = (d: Draft, role: Role, enemy: EnemyDraft = {}, d2 = data) => draftCandidates(d, enemy, d2, sources).unified[role] ?? [];
const row = (list: Candidate[], id: string) => list.find((c) => c.champion === id);
const jhinGame = data.proDrafts.find((d) => d.id === "lck26po-finals-g4-hle")!;
// A recorded game pairing Jhin with a support (synthetic: the stored data has no Jhin + Milio game).
const fake = (support: string, n: number): ProDraft[] => Array.from({ length: n }, (_, i) => ({
  ...jhinGame, id: `test-jhin-${support}-${i}`, picks: { ...jhinGame.picks, SUPPORT: support },
}));

describe("Jhin with SUPPORT open", () => {
  const list = rows({ BOT: "jhin" }, "SUPPORT");

  it("shows Nautilus with its Pro signal and game count, beside its saved alternative", () => {
    const n = row(list, "nautilus")!;
    expect(n).toBeDefined();
    expect(n.signals).toContain("pro");
    expect(n.pro!.score).toBeGreaterThanOrEqual(2);
    expect(n.pro!.with).toEqual(["jhin"]);
    expect(hasSignal(n, "pro")).toBe(true);
  });

  it("shows supports seen with Jhin in pro games but not saved for him as full Pro candidates", () => {
    for (const id of ["leona", "camille"]) {
      const c = row(list, id)!;
      expect(c, id).toBeDefined();
      expect(c.signals, id).toEqual(["pro"]);
      expect(c.fit.eligible, id).toBe(false);
      expect(c.fit.saved, id).toBeNull();
      expect(c.theoretical, id).toBe(false);
      expect(c.fit.parts.length, id).toBeGreaterThan(0); // a real comp read: benefit and drawback
      expect(c.fit.parts.some((p) => p.kind === "saved" || p.kind === "proposed"), id).toBe(false);
      expect(c.bestFit || c.fit.bestFix, id).toBe(false);
    }
  });

  it("Milio shows as a full Pro candidate once a recorded game pairs it with Jhin, without touching the saved record", () => {
    expect(row(list, "milio")).toBeUndefined(); // no recorded Jhin + Milio game today: never invented
    const withMilio = { ...data, proDrafts: [...data.proDrafts, ...fake("milio", 5)] };
    const m = row(rows({ BOT: "jhin" }, "SUPPORT", {}, withMilio), "milio")!;
    expect(m.pro!.score).toBe(5);
    expect(m.signals).toEqual(["pro"]);
    expect(m.fit.saved).toBeNull();
    const rec = withMilio.botPairings.find((b) => b.champion === "jhin")!;
    expect([...rec.clashDefault, ...rec.alternatives]).not.toContain("milio");
    // The Synergy list itself is unchanged: recommend() without include still recommends only Jhin's saved supports.
    expect((recommend({ BOT: "jhin" }, [], withMilio, Infinity).SUPPORT ?? []).map((r) => r.champion)).not.toContain("milio");
  });

  it("each champion appears once", () => {
    const ids = list.map((c) => c.champion);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("ordering", () => {
  it("a preferred saved pairing leads every bot alone", () => {
    for (const b of data.botPairings) expect(b.clashDefault, b.champion).toContain(rows({ BOT: b.champion }, "SUPPORT")[0].champion);
  });

  it("Ziggs: Nautilus / Leona lead; Camille and Pyke stay below them", () => {
    const list = rows({ BOT: "ziggs" }, "SUPPORT").map((c) => c.champion);
    expect(list.slice(0, 2).sort()).toEqual(["leona", "nautilus"]);
  });

  it("pro game counts never move a row: five games of a pairing rank exactly like one", () => {
    const one = rows({ BOT: "jhin" }, "SUPPORT", {}, { ...data, proDrafts: [...data.proDrafts, ...fake("milio", 1)] }).map((c) => c.champion);
    const five = rows({ BOT: "jhin" }, "SUPPORT", {}, { ...data, proDrafts: [...data.proDrafts, ...fake("milio", 5)] }).map((c) => c.champion);
    expect(five).toEqual(one);
  });

  it("Synergy alternatives do not automatically outrank Pro candidates: after the preferred pairing, comp fit decides", () => {
    const list = rows({ BOT: "jhin" }, "SUPPORT");
    const after = list.filter((c) => !(c.fit.eligible && c.fit.saved === "default") && !c.theoretical);
    for (let i = 1; i < after.length; i++) expect(after[i - 1].compFit, after.map((c) => c.champion).join()).toBeGreaterThanOrEqual(after[i].compFit);
    const leona = list.findIndex((c) => c.champion === "leona"), bard = list.findIndex((c) => c.champion === "bard");
    expect(leona).toBeLessThan(bard); // Leona (pro only) fits the comp better than Bard (saved alternative)
  });

  it("a support counter outside the locked bot's saved supports, with no pro games, is theoretical and last", () => {
    const list = rows({ BOT: "sivir" }, "SUPPORT", { BOT: "ezreal", SUPPORT: "karma" });
    const firstTheory = list.findIndex((c) => c.theoretical);
    if (firstTheory >= 0) expect(list.slice(firstTheory).every((c) => c.theoretical)).toBe(true);
    for (const c of list.filter((x) => x.theoretical)) expect(c.counter?.theoretical).toBe(true);
    expect(row(list, "karma")).toBeUndefined(); // the enemy's pick is never a candidate
  });

  it("counters outside SUPPORT are never theoretical", () => {
    const list = rows({}, "TOP", { TOP: "aatrox" });
    expect(list.length).toBeGreaterThan(0);
    for (const c of list) { expect(c.theoretical).toBe(false); expect(c.signals).toContain("counter"); }
  });
});

describe("filters read the same candidate set", () => {
  it("every filtered row is in All, with that signal", () => {
    const list = rows({ TOP: "ornn", JUNGLE: "sejuani", MID: "orianna", BOT: "jhin" }, "SUPPORT");
    expect(list.filter((c) => hasSignal(c, "all"))).toEqual(list);
    expect(list.filter((c) => hasSignal(c, "synergy")).every((c) => c.fit.saved || c.fit.proposed)).toBe(true);
    expect(list.filter((c) => hasSignal(c, "pro")).every((c) => c.pro && c.pro.score > 0)).toBe(true);
    expect(list.some((c) => hasSignal(c, "fit"))).toBe(true);
  });
});

describe("locked bot eligibility", () => {
  it("a support outside the saved bot's supports comes in only through games with that bot, counting only those", () => {
    const d: Draft = { TOP: "ornn", JUNGLE: "sejuani", MID: "orianna", BOT: "jhin" };
    const list = rows(d, "SUPPORT");
    const rec = data.botPairings.find((b) => b.champion === "jhin")!;
    for (const c of list.filter((x) => x.pro && ![...rec.clashDefault, ...rec.alternatives].includes(x.champion))) {
      expect(c.pro!.with, c.champion).toEqual(["jhin"]);
      const games = data.proDrafts.filter((g) => g.picks.BOT === "jhin" && g.picks.SUPPORT === c.champion).length;
      expect(c.pro!.score, c.champion).toBe(games + c.pro!.evidence.filter((e) => e.pending).length);
    }
  });
});
