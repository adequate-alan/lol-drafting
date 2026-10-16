// alan's approvals of 2026-10-16 (Comp Library follow-up): a pick with no kit makes Comp Check say its read is
// incomplete instead of reading the slot as empty; Yone's initial kit; Weakside Tank shown as a named variant inside
// Protected Hypercarry; "Pick · Protected Yunara" keeps its id.
import { describe, expect, it } from "vitest";
import { compSummary } from "@/lib/comp-summary";
import { getCompReview, getDraftData, getLibrary } from "@/lib/data";
import type { Draft } from "@/lib/model-v2/analyze";
import { convertKits } from "@/lib/model-v2/kits";
import { analyzePlan } from "@/lib/model-v2/plan";
import { lineups } from "../scripts/diagnostics/load";

const kits = convertKits(getDraftData().champions);
const real = (r: ReturnType<typeof analyzePlan>) => [...r.weaknesses, ...r.more].map((w) => w.id);

describe("incomplete read for a pick without a kit", () => {
  // A made-up id stands in for an unreviewed champion, so this survives Locke and Zaahen getting kits.
  const draft: Draft = { TOP: "aatrox", JUNGLE: "maokai", MID: "not-a-kit", BOT: "caitlyn", SUPPORT: "bard" };
  const r = analyzePlan(draft, kits);

  it("names the unread pick and is never clean", () => {
    expect(r.unread).toEqual([{ role: "MID", id: "not-a-kit" }]);
    const s = compSummary(r);
    expect(s.incomplete).toBe(true);
    expect(s.clean).toBe(false);
  });

  it("keeps only gaps that stand whoever plays the slot", () => {
    for (const mid of ["orianna", "azir", "ahri", "sylas"]) {
      const filled = real(analyzePlan({ ...draft, MID: mid }, kits));
      for (const id of real(r)) expect(filled, `${id} with ${mid}`).toContain(id);
    }
  });

  it("marks the plan's missing jobs as not read rather than missing when the slot could cover them", () => {
    const unreadJobs = (r.plan?.jobs ?? []).filter((j) => !j.met && j.unread);
    for (const j of unreadJobs) expect(j.unread).toEqual(["not-a-kit"]);
  });

  it("shows no gap at all with two unread picks", () => {
    const two = analyzePlan({ ...draft, TOP: "also-not-a-kit" }, kits);
    expect(two.unread).toHaveLength(2);
    expect(real(two)).toEqual([]);
  });

  it("leaves a fully kitted read unchanged", () => {
    const full = analyzePlan({ ...draft, MID: "orianna" }, kits);
    expect(full.unread).toEqual([]);
    expect(full.withheld).toBe(0);
  });
});

describe("Yone's kit (approved 2026-10-16)", () => {
  const yone = kits.find((k) => k.id === "yone");
  it("has a kit; Locke and Zaahen still wait for review", () => {
    expect(yone).toBeDefined();
    const roster = getDraftData().champions;
    for (const id of ["locke", "zaahen"]) if (roster.some((c) => c.id === id)) expect(kits.some((k) => k.id === id), id).toBe(false);
  });

  it("every recorded Yone lineup is read, with no critical gap", () => {
    const withYone = lineups.filter((l) => Object.values(l.picks).includes("yone") && Object.values(l.picks).every((p) => kits.some((k) => k.id === p)));
    expect(withYone.length).toBeGreaterThanOrEqual(5);
    for (const l of withYone) {
      const r = analyzePlan(l.picks, kits);
      expect(r.unread, l.team).toEqual([]);
      expect([...r.weaknesses, ...r.more].filter((w) => w.tier === "critical").map((w) => w.id), l.team).toEqual([]);
    }
  });

  it("still exposes real weaknesses in comps that lack what he needs", () => {
    // No fight starter around a follow-up skirmisher, and an almost all-physical team.
    const r = analyzePlan({ TOP: "riven", JUNGLE: "kayn", MID: "yone", BOT: "samira", SUPPORT: "pyke" }, kits);
    expect([...r.weaknesses, ...r.more].some((w) => w.tier === "critical")).toBe(true);
  });
});

describe("Comp Library review: variants and rename", () => {
  const library = getLibrary();
  const review = getCompReview();

  it("each variant stays a comp (Draft Room links) and is listed by its parent", () => {
    expect(review.variants.length).toBeGreaterThan(0);
    for (const v of review.variants) {
      expect(library.shells.some((s) => s.id === v.comp), v.comp).toBe(true);
      expect(library.extras[v.comp]?.variantOf).toEqual({ parent: v.parent, name: v.name });
      expect(library.extras[v.parent]?.variants?.map((x) => x.id)).toContain(v.comp);
    }
  });

  it("Weakside Tank is shown inside Protected Hypercarry", () => {
    expect(review.variants).toContainEqual(expect.objectContaining({ comp: "weakside-tank-carry-bot", parent: "protected-hypercarry" }));
  });

  it("Pick · Protected Yunara keeps its id", () => {
    expect(library.shells.find((s) => s.id === "yunara-protect")?.name).toBe("Pick · Protected Yunara");
  });
});
