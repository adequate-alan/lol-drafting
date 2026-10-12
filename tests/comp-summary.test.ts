// Narrow-screen Comp Check summary (lib/comp-summary.ts): names what the draft is missing from the same analysis the
// rail shows; never a score, nothing until two picks, "Early read" below a full read.
import { describe, expect, it } from "vitest";
import { getChampions } from "@/lib/data";
import { analyze } from "@/lib/model-v2/analyze";
import { convertKits } from "@/lib/model-v2/kits";
import { compSummary, summaryText } from "@/lib/comp-summary";

const kits = convertKits(getChampions());

describe("Comp Check summary line", () => {
  it("says nothing actionable before two picks", () => {
    expect(summaryText(compSummary(analyze({}, kits), "TOP"))).toBe("Lock a pick to start");
    const one = compSummary(analyze({ BOT: "sivir" }, kits), "SUPPORT");
    expect(one.state).toBe("none");
    expect(summaryText(one)).toBe("Read starts at two picks");
  });

  it("marks two or three picks as an early read", () => {
    expect(compSummary(analyze({ BOT: "sivir", MID: "ahri" }, kits), "SUPPORT").state).toBe("early");
  });

  it("names the open role's needs and the top weak point from the rail's own analysis", () => {
    const draft = { TOP: "ambessa", JUNGLE: "skarner", MID: "ahri", BOT: "sivir" };
    const r = analyze(draft, kits, ["renekton", "ezreal", "karma"]);
    const s = compSummary(r, "SUPPORT");
    expect(s.state).toBe("read");
    expect(s.needs).toEqual((r.roleNeeds.SUPPORT ?? []).slice(0, 2).map((n) => n.label));
    expect(s.weak?.label).toBe(r.weakPoints.find((w) => w.severity !== "minor")?.label);
    const text = summaryText(s);
    expect(text).toMatch(/^Needs /);
    expect(text).not.toMatch(/\d+\s*\/\s*\d+|score/i);
  });

  it("says so when nothing needs acting on", () => {
    expect(summaryText({ state: "read", picks: 5, needs: [], clean: true })).toBe("No major weak points");
  });
});
