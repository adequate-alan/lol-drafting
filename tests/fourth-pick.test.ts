// The 4th-pick correction (alan, 2026-10-14): team-wide weaknesses switch on at four picks, and a candidate is charged
// only for a weakness it creates, never for one the earlier picks already had. Creates / worsens / unresolved /
// improves / fixes are read in lib/model-v2/analyze.ts (weaknessChanges); lib/recommend.ts scores only Creates.
import { describe, expect, it } from "vitest";
import { getDraftData } from "@/lib/data";
import { analyze, readCandidate, type Draft } from "@/lib/model-v2/analyze";
import { convertKits } from "@/lib/model-v2/kits";
import { recommend } from "@/lib/recommend";
import type { Role } from "@/lib/schema";

const data = getDraftData();
const kits = convertKits(data.champions);
const byId = new Map(kits.map((k) => [k.id, k]));
const read = (draft: Draft, role: Role, id: string) => readCandidate(byId.get(id)!, role, draft, kits, analyze(draft, kits).roleNeeds[role] ?? []);
const ids = (ws: { id: string }[]) => ws.map((w) => w.id);
const rec = (draft: Draft, role: Role, id: string) => recommend(draft, [], data, 500)[role]!.find((r) => r.champion === id)!;

describe("3 → 4 picks: inherited weaknesses are not created by the 4th pick", () => {
  // K'Sante, Lucian and Milio already lean on Lucian for damage and are mostly physical with little tank damage.
  const draft: Draft = { TOP: "ksante", BOT: "lucian", SUPPORT: "milio" };

  it("Vi is not charged for the single-threat or armor weaknesses the first three picks had", () => {
    const r = read(draft, "JUNGLE", "vi");
    expect(r.tradeoffs).not.toContain("Creates: Single-threat damage profile");
    expect(r.tradeoffs).not.toContain("Creates: Poor into armor and frontline");
    // Vi's own engage with nobody to follow it is new with her pick, and stays a tradeoff.
    expect(ids(r.changes.creates)).toEqual(["engage-no-follow-up"]);
  });

  it("Vi adds a second damage threat: single-threat improves from major to moderate", () => {
    const r = read(draft, "JUNGLE", "vi");
    const single = r.changes.improves.find((w) => w.id === "single-threat");
    expect(single?.severity).toBe("moderate");
  });

  it("a 4th pick that does not fix an inherited gap leaves it unresolved, with no penalty", () => {
    const r = read({ TOP: "jayce", MID: "viktor", BOT: "ezreal" }, "JUNGLE", "nidalee");
    expect(ids(r.changes.unresolved)).toContain("no-frontline");
    expect(r.tradeoffs.some((t) => t.includes("frontline"))).toBe(false);
  });

  it("a 4th pick that supplies the missing job fixes it", () => {
    const r = read({ TOP: "jayce", MID: "viktor", BOT: "ezreal" }, "JUNGLE", "sejuani");
    expect(ids(r.changes.fixes)).toContain("no-frontline");
    expect(ids(r.changes.creates)).not.toContain("no-frontline");
  });

  it("the v1 'Vulnerable to hard engage' warning is inherited, not triggered, by the 4th pick", () => {
    // Jayce, Viktor and Ezreal: no frontline, little peel, no disengage.
    const r = rec({ TOP: "jayce", MID: "viktor", BOT: "ezreal" }, "JUNGLE", "nidalee");
    expect(r.parts.some((p) => p.text.startsWith('Triggers "Vulnerable to hard engage"'))).toBe(false);
  });

  it("comp-fit points come only from contributions: the frontline jungler still outscores one who adds none", () => {
    const d: Draft = { TOP: "jayce", MID: "viktor", BOT: "ezreal" };
    expect(rec(d, "JUNGLE", "sejuani").score).toBeGreaterThan(rec(d, "JUNGLE", "nidalee").score);
  });
});

describe("real worsening is still a tradeoff", () => {
  it("a 4th pick that is the third short-range carry creates Short range", () => {
    const r = read({ JUNGLE: "jarvan-iv", MID: "akali", SUPPORT: "lulu" }, "BOT", "lucian");
    expect(ids(r.changes.creates)).toContain("short-range");
    expect(r.tradeoffs).toContain("Creates: Short range");
    expect(rec({ JUNGLE: "jarvan-iv", MID: "akali", SUPPORT: "lulu" }, "BOT", "lucian").parts.some((p) => p.text === "Tradeoff: Creates: Short range")).toBe(true);
  });

  it("completing the draft: the 5th pick is charged for a weakness it creates, not for one already there", () => {
    const four: Draft = { TOP: "rumble", JUNGLE: "jarvan-iv", BOT: "ashe", SUPPORT: "milio" };
    expect(read(four, "MID", "akali").tradeoffs).toContain("Creates: Short range");
    // Same four picks with a third short-range carry already in: Akali inherits it.
    const already: Draft = { TOP: "rumble", JUNGLE: "jarvan-iv", BOT: "lucian", SUPPORT: "milio" };
    const r = read(already, "MID", "akali");
    expect(ids(r.changes.unresolved)).toContain("short-range");
    expect(r.tradeoffs).not.toContain("Creates: Short range");
  });

  it("a merged warning the earlier picks had (poor into armor) is inherited when the pick removes half of it", () => {
    // Jarvan IV, Ashe, Seraphine and Jayce: mostly physical with little tank damage. Irelia adds tank damage, so only
    // "Almost all physical damage" is left, which was already there.
    const r = read({ TOP: "jayce", JUNGLE: "jarvan-iv", BOT: "ashe", SUPPORT: "seraphine" }, "MID", "irelia");
    expect(r.tradeoffs).not.toContain("Creates: Almost all physical damage");
  });
});

describe("early picks are unchanged", () => {
  it("before the 4th pick no team-wide weakness is read, so nothing is inherited or created", () => {
    const r = read({ BOT: "lucian" }, "SUPPORT", "nautilus");
    expect(ids(r.changes.unresolved)).toEqual(ids(r.changes.unresolved).filter((id) => id === "needs-setup"));
    expect(r.tradeoffs.some((t) => t.startsWith("Creates: Short range"))).toBe(false);
  });
});
