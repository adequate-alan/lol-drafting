// Types for builds.mjs.
import type { PatchAssets, ProBuild, Role } from "../../lib/schema";
export const buildUrl: string;
export const DDRAGON: string;
export function buildsPageUrl(id: number): string;
export function parsePlayers(html: string): { blue: Player[]; red: Player[] } | undefined;
export interface Player { champion: string; playerId: number; player: string }
export function buildFromAnswer(answer: unknown, who: { game: number; side: "blue" | "red"; role: Role; champion: string; player: string; playerId: number }):
  { build: Omit<ProBuild, "checkedOn">; missing: string[]; problems?: undefined } | { build?: undefined; missing?: undefined; problems: string[] };
export function referencedIds(builds: Pick<ProBuild, "final" | "trinket" | "purchases" | "runes" | "spells" | "champion">[]):
  { items: Set<number>; runes: Set<number>; trees: Set<number>; spells: Set<number>; champions: Set<string> };
export function assetsFor(ref: ReturnType<typeof referencedIds>, version: string, files: Record<string, unknown>, resolve: (name?: string) => string | undefined):
  { assets: PatchAssets; unknown: string[] };
export function ddragonVersionFor(patch: string, versions: string[]): string | undefined;
export function compactJson(v: unknown): string;
