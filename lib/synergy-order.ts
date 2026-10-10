// Champion Synergies rail order (alan, 2026-10-10: "Pool tier"): core, then depth, then flex, then picks outside the pool;
// confidence and name break ties. Mid / Jungle keeps mids above junglers. Top keeps its blind-grade order.
// Display order only; nothing here touches saved pairings or the draft-fit score.
import type { BotPairing, MidJunglePairing, PoolEntry, Role } from "./schema";

const TIERS = ["core", "depth", "flex"] as const;
const CONFIDENCE = ["high", "medium-high", "medium", "low"];
const ROLE_ORDER: Role[] = ["MID", "JUNGLE"];

export function poolTierRank(pool: PoolEntry[], role: Role, id: string): number {
  const entry = pool.find((p) => p.role === role);
  const i = entry ? TIERS.findIndex((t) => entry[t].includes(id)) : -1;
  return i < 0 ? TIERS.length : i;
}

export function sortBotPicks(rows: BotPairing[], pool: PoolEntry[], names: Record<string, string>): BotPairing[] {
  return [...rows].sort((a, b) =>
    poolTierRank(pool, "BOT", a.champion) - poolTierRank(pool, "BOT", b.champion)
    || CONFIDENCE.indexOf(a.confidence) - CONFIDENCE.indexOf(b.confidence)
    || (names[a.champion] ?? a.champion).localeCompare(names[b.champion] ?? b.champion));
}

export function sortMidJunglePicks(rows: MidJunglePairing[], pool: PoolEntry[], names: Record<string, string>): MidJunglePairing[] {
  return [...rows].sort((a, b) =>
    ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)
    || poolTierRank(pool, a.role, a.anchor) - poolTierRank(pool, b.role, b.anchor)
    || CONFIDENCE.indexOf(a.confidence) - CONFIDENCE.indexOf(b.confidence)
    || (names[a.anchor] ?? a.anchor).localeCompare(names[b.anchor] ?? b.anchor));
}
