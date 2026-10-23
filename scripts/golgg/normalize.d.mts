// Types for normalize.mjs.
import type { ProGame } from "../../lib/schema";
import type { ChampionRow, GamePage, Series } from "./parse.mjs";
export const ROLES: string[];
export const GOLGG: string;
export function gameUrl(id: number, page?: string): string;
export function championResolver(champions: { id: string; name: string; aliases?: string[] }[]): (name?: string) => string | undefined;
export function buildGame(id: number, page: GamePage, stats: ReturnType<typeof import("./parse.mjs").parseFullstats>,
  expect: { tournament: string; event: string; seriesId: number; teams?: [string, string] }, resolve: (name?: string) => string | undefined, checkedOn: string):
  { game: ProGame; problems?: undefined } | { game?: undefined; problems: string[] };
export function seriesProblems(series: Series, games: ProGame[]): string[];
export function buildAggregates(table: { rows: ChampionRow[] } | undefined, totalGames: number, games: ProGame[], resolve: (name?: string) => string | undefined,
  sourceIds: string[], previous?: unknown[]): { stats: Record<string, unknown>[]; rolesVerified: boolean; problems?: undefined } | { problems: string[] };
export function isComplete(series: Series[], today: string, opts?: { untilFinal?: boolean }): boolean;
export function pickOrderFor(game: ProGame, page: GamePage, resolve: (name?: string) => string | undefined):
  { blue?: string[]; red?: string[]; firstPick?: "blue" | "red"; problems?: undefined } | { problems: string[] };
export function firstPickOf(page: GamePage): "blue" | "red" | undefined;
export function turnsDrawn(page: GamePage): boolean;
