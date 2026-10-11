// Types for refresh.mjs.
import type { BotPairing, Champion, Meta, ProGames, Source } from "../../lib/schema";
export const urls: { list: string; matchlist(name: string): string; championlist(name: string): string; picksandbans(name: string): string };
export type Get = (url: string, init?: { method?: string; body?: string }) => Promise<string>;
export function refresh(
  data: { proGames: ProGames; meta: Meta; sources: Source[]; champions: Champion[]; botPairings: BotPairing[] },
  get: Get, opts?: { now?: Date },
): Promise<{ proGames: ProGames; meta: Meta; sources: Source[]; changed: string[]; report: string[]; rejected: string[] }>;
