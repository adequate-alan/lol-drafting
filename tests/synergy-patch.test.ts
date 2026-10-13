// Champion Synergies patch scope (alan, 2026-10-13): All patches by default on every role page; a picked patch is kept
// for the browsing session until changed or cleared, and a patch in the URL always wins.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { patchToRestore } from "@/lib/synergy-patch";
import { laneViews } from "@/components/TopDraft";

describe("synergies patch scope", () => {
  it("restores a picked patch only when the URL names none", () => {
    expect(patchToRestore(null, null)).toBeUndefined(); // default: All patches
    expect(patchToRestore(null, "26.18")).toBe("26.18"); // role switch, Draft Room link without a patch
    expect(patchToRestore("26.16", "26.18")).toBeUndefined(); // explicit URL patch wins
    expect(patchToRestore("all", "26.18")).toBeUndefined(); // explicit All patches wins
    expect(patchToRestore(null, "all")).toBeUndefined(); // All patches is never stored as a choice to restore
  });

  it("the lane rail defaults to All patches and takes meta priority from one named patch", () => {
    const src = readFileSync("components/TopRail.tsx", "utf8");
    expect(src).toMatch(/const patch = raw && raw !== "all" \? patchKey\(raw\) : undefined;/);
    expect(src).not.toMatch(/defaultTopPatch/);
    expect(src).toMatch(/newest patch/);
  });

  it("each lane has its own report tabs; Duo drafting only on Bot and Support", () => {
    const ids = (r: Parameters<typeof laneViews>[0]) => laneViews(r).map(([v]) => v);
    expect(ids("TOP")).toEqual(["overview", "usage", "matchups", "synergies", "pro"]);
    expect(ids("MID")).toEqual(["overview", "usage", "matchups", "pro"]);
    expect(ids("BOT")).toContain("duo");
    expect(ids("SUPPORT")).toContain("duo");
  });
});
