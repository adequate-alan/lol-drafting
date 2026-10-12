// Types for refresh.mjs.
import type { BotPairing, BuildAssets, Champion, Meta, ProBuilds, ProGames, Source } from "../../lib/schema";
export const urls: { list: string; matchlist(name: string): string; championlist(name: string): string; picksandbans(name: string): string };
export type Get = (url: string, init?: { method?: string; body?: string }) => Promise<string>;
export function refresh(
  data: { proGames: ProGames; meta: Meta; sources: Source[]; champions: Champion[]; botPairings: BotPairing[]; proBuilds?: ProBuilds; buildAssets?: BuildAssets },
  get: Get, opts?: { now?: Date; buildsOnly?: boolean; maxBuildGames?: number },
): Promise<{ proGames: ProGames; meta: Meta; sources: Source[]; proBuilds: ProBuilds; buildAssets: BuildAssets; changed: string[]; report: string[]; rejected: string[] }>;
export const MAX_BUILD_GAMES: number;
export const CDRAGON_PERKS: string;
