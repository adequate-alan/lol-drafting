// Types for parse.mjs (plain JavaScript so the workflow runs it with node alone).
export interface Series { id: number; title: string; team1: string; team2: string; score?: [number, number]; winner?: string; stage: string; patch?: string; date?: string }
export interface SidePanel { team?: string; result?: "WIN" | "LOSS"; bans?: string[]; picks?: string[]; firstPick?: boolean; pickGroups?: number[] }
export interface GamePage { series?: string; tournament?: string; draftMode?: string; date?: string; stage?: string; patch?: string; game?: number; seriesGames: { id: number; n: number }[]; blue?: SidePanel; red?: SidePanel }
export interface ChampionRow { name: string; picks?: number; bans?: number; wins?: number; losses?: number; winRate?: number }
export function decode(s: string): string;
export function text(html: string): string;
export function num(s: unknown): number | undefined;
export function tables(html: string): { head: string[]; rows: { cells: string[]; raw: string[] }[] }[];
export function parseChampionTable(html: string): { head: string[]; rows: ChampionRow[] } | undefined;
export function parseMatchlist(html: string): { caption?: string; series: Series[] };
export function parseGamePage(html: string): GamePage;
export function parseFullstats(html: string): { blue: { champion: string; role: string }[]; red: { champion: string; role: string }[] } | undefined;
