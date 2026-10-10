// First Pick rail: pool tier first (alan, 2026-10-10), then confidence, then name.
import { describe, expect, it } from "vitest";
import { getBotPairings, getMidJungle, getPool } from "@/lib/data";
import { nameMap } from "@/lib/lookup";
import { poolTierRank, sortBotPicks, sortMidJunglePicks } from "@/lib/first-pick-order";

const pool = getPool();
const names = nameMap();

describe("first pick order", () => {
  it("lists bot picks core first, flex last, and keeps every pick", () => {
    const rows = sortBotPicks(getBotPairings(), pool, names);
    expect(rows).toHaveLength(getBotPairings().length);
    const ranks = rows.map((r) => poolTierRank(pool, "BOT", r.champion));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(poolTierRank(pool, "BOT", rows[0].champion)).toBe(0);
    expect(rows.slice(-3).map((r) => r.champion)).toContain("corki");
  });
  it("keeps mids above junglers, each by pool tier", () => {
    const rows = sortMidJunglePicks(getMidJungle(), pool, names);
    expect(rows).toHaveLength(getMidJungle().length);
    const firstJungle = rows.findIndex((r) => r.role === "JUNGLE");
    expect(rows.slice(firstJungle).every((r) => r.role === "JUNGLE")).toBe(true);
    for (const part of [rows.slice(0, firstJungle), rows.slice(firstJungle)]) {
      const ranks = part.map((r) => poolTierRank(pool, r.role, r.anchor));
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    }
  });
});
