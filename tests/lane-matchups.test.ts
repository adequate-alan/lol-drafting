// Lane matchups on the board (alan, 2026-10-22): with both sides of a lane locked, DPM.LOL rows say whether the matchup
// favors us, them, is relatively even, or has too small a sample; a row from the enemy champion's page is the same
// sample turned round, never a second source. Labels only. Fixture rows are test data, not claims about real matchups.
import { describe, expect, it } from "vitest";
import { laneMatchups } from "@/lib/counters";
import { getDraftData } from "@/lib/data";
import { recommend } from "@/lib/recommend";
import type { DpmMatchup, Role } from "@/lib/schema";

const row = (role: Role, champion: string, enemy: string, winRate: number, games = 2000, patch = "16.20"): DpmMatchup =>
  ({ role, enemy, champion, winRate, games, patch, url: "https://dpm.lol/", updated: "2026-10-10", origin: "externally-provided" });

describe("lane matchups", () => {
  it("classifies from my champion's row", () => {
    const rows = [row("TOP", "jayce", "aatrox", 0.55), row("MID", "ahri", "syndra", 0.47), row("JUNGLE", "vi", "lee-sin", 0.505)];
    const reads = laneMatchups({ TOP: "jayce", MID: "ahri", JUNGLE: "vi" }, { TOP: "aatrox", MID: "syndra", JUNGLE: "lee-sin" }, rows);
    expect(reads.map((r) => [r.role, r.verdict, r.strong])).toEqual([["TOP", "us", true], ["JUNGLE", "even", false], ["MID", "them", false]]);
    expect(reads.find((r) => r.role === "JUNGLE")!.note).toMatch(/SoloQ head-to-head/);
  });
  it("turns the enemy's row round, marked as the same sample", () => {
    const [r] = laneMatchups({ TOP: "jayce" }, { TOP: "aatrox" }, [row("TOP", "aatrox", "jayce", 0.56)]);
    expect(r).toMatchObject({ verdict: "them", inverted: true, winRate: 0.44, games: 2000, strong: true });
  });
  it("prefers my own row when both pages list the pair; never counts both", () => {
    const [r] = laneMatchups({ TOP: "jayce" }, { TOP: "aatrox" }, [row("TOP", "aatrox", "jayce", 0.46), row("TOP", "jayce", "aatrox", 0.54)]);
    expect(r).toMatchObject({ inverted: false, winRate: 0.54, games: 2000 });
  });
  it("small samples are insufficient; no row is no data; unlocked lanes are left out", () => {
    const reads = laneMatchups({ TOP: "jayce", MID: "ahri", BOT: "jinx" }, { TOP: "aatrox", MID: "syndra" }, [row("TOP", "jayce", "aatrox", 0.6, 120)]);
    expect(reads.map((r) => [r.role, r.verdict])).toEqual([["TOP", "insufficient"], ["MID", "no-data"]]);
  });
  it("marks rows from an older patch, verdict unchanged", () => {
    const [r] = laneMatchups({ BOT: "jinx" }, { BOT: "caitlyn" }, [row("BOT", "jinx", "caitlyn", 0.45)], "26.21");
    expect(r).toMatchObject({ verdict: "them", stale: true });
    expect(r.note).toMatch(/no duo-vs-duo data/);
  });
  it("reading lane matchups never changes the draft-fit ranking", () => {
    const data = getDraftData();
    const before = recommend({ TOP: "jayce" }, ["aatrox"], data, Infinity);
    laneMatchups({ TOP: "jayce" }, { TOP: "aatrox" }, data.counters.dpm, data.newestPatch);
    expect(recommend({ TOP: "jayce" }, ["aatrox"], data, Infinity)).toEqual(before);
  });
});
