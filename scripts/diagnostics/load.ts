// Diagnostic only (five-role cohesion review, 2026-10-14). Loads every recorded pro lineup and the converted kits.
// Nothing here is imported by the site.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { convertKits } from "../../lib/model-v2/kits";
import { Files } from "../../lib/schema";
import type { Role } from "../../lib/schema";

const root = process.cwd();
const raw = (f: string) => JSON.parse(readFileSync(join(root, "data", f), "utf8"));
export const champions = Files["champions.json"].parse(raw("champions.json"));
export const kits = convertKits(champions);
export const nameOf = (id: string) => champions.find((c) => c.id === id)?.name ?? id;

export interface Lineup {
  key: string; game: number; side: "blue" | "red"; event: string; tournament: string; patch: string; date: string | null;
  series: string; gameNo: number; team: string; opponent: string; won: boolean; url: string;
  picks: Record<Role, string>; enemy: Record<Role, string>; pickOrder?: string[]; firstPick?: string;
}
type G = { id: number; event: string; tournament: string; patch: string; date?: string; series: string; game: number; url: string; winner: "blue" | "red"; firstPick?: string;
  blue: { team: string; picks: Record<Role, string>; pickOrder?: string[] }; red: { team: string; picks: Record<Role, string>; pickOrder?: string[] } };
const games = new Map<number, G>();
for (const g of [...raw("pro-games.json").games, ...raw("pro-builds.json").games] as G[]) if (!games.has(g.id)) games.set(g.id, g);
export const lineups: Lineup[] = [...games.values()].flatMap((g) => (["blue", "red"] as const).map((side) => {
  const other = side === "blue" ? "red" : "blue";
  return { key: `${g.id}-${side}`, game: g.id, side, event: g.event, tournament: g.tournament, patch: g.patch, date: g.date ?? null,
    series: g.series, gameNo: g.game, team: g[side].team, opponent: g[other].team, won: g.winner === side, url: g.url,
    picks: g[side].picks, enemy: g[other].picks, pickOrder: g[side].pickOrder, firstPick: g.firstPick };
}));
