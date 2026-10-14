// Narrow-screen Comp Check summary (lib/comp-summary.ts): names what the draft is missing from the same plan read the
// rail shows (alan, 2026-10-14: the plan-aware read is the default); never a score, nothing until two picks, "Early
// read" below a full read.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getChampions } from "@/lib/data";
import { analyzePlan } from "@/lib/model-v2/plan";
import { convertKits } from "@/lib/model-v2/kits";
import { compSummary, summaryText } from "@/lib/comp-summary";

const kits = convertKits(getChampions());
const plan = (d: Parameters<typeof analyzePlan>[0], vs: string[] = []) => analyzePlan(d, kits, vs);

describe("Comp Check summary line", () => {
  it("says nothing actionable before two picks", () => {
    expect(summaryText(compSummary(plan({}), "TOP"))).toBe("Lock a pick to start");
    const one = compSummary(plan({ BOT: "sivir" }), "SUPPORT");
    expect(one.state).toBe("none");
    expect(summaryText(one)).toBe("Read starts at two picks");
  });

  it("marks two or three picks as an early read", () => {
    expect(compSummary(plan({ BOT: "sivir", MID: "ahri" }), "SUPPORT").state).toBe("early");
  });

  it("names the open role's needs and the top weak point from the rail's own plan read", () => {
    const draft = { TOP: "ambessa", JUNGLE: "skarner", MID: "ahri", BOT: "sivir" };
    const r = plan(draft, ["renekton", "ezreal", "karma"]);
    const s = compSummary(r, "SUPPORT");
    expect(s.state).toBe("read");
    expect(s.needs).toEqual((r.roleNeeds.SUPPORT ?? []).slice(0, 2).map((n) => n.label));
    const top = [...r.weaknesses, ...r.more].find((w) => w.tier === "critical" || w.tier === "needed" || w.severity !== "minor");
    if (top) expect(r.plan && top.source === "plan" ? `${r.plan.label}: ${s.weak!.label.replace(/^M/, "m")}` : s.weak!.label).toBe(top.label);
    const text = summaryText(s);
    expect(text).toMatch(/^Needs /);
    expect(text).not.toMatch(/\d+\s*\/\s*\d+|score/i);
  });

  it("never names an accepted tradeoff", () => {
    const r = plan({ TOP: "riven", JUNGLE: "lee-sin", MID: "sylas", BOT: "kalista", SUPPORT: "renata-glasc" });
    const s = compSummary(r);
    for (const a of r.accepted) expect(s.weak?.label).not.toBe(a.label);
  });

  it("says so when nothing needs acting on", () => {
    expect(summaryText({ state: "read", picks: 5, needs: [], clean: true })).toBe("No major weak points");
  });

  it("the rail, the phone line and the header badge read one plan read; the old rules are debug-only", () => {
    const room = readFileSync("components/DraftRoom.tsx", "utf8");
    expect(room).toMatch(/usePlanRead\(/);
    expect((room.match(/read=\{planRead\}/g) ?? []).length).toBe(4); // CompStatus, two summary lines, CompCheck
    expect(room).toMatch(/\{legacyCheck && <div className="cc-section">\s*<div className="cc-label">Rule checks/);
    expect(room).not.toMatch(/badge danger">\{critical\}/);
  });
});
