// Pro Builds overview (alan, 2026-10-13): what /pro-builds/ shows before a champion is chosen, and which selection a URL
// asks for. Pure, so the precedence is tested (tests/pro-builds-home.test.ts):
//   1. explicit URL parameters (champion and role, an exact game and player) open that record;
//   2. links from other features (Draft Room, drawer, Synergies, Pro Drafts, Pinned Players) are URL parameters too;
//   3. no parameters (the sidebar) is the overview. Nothing is reopened from storage: recently viewed entries are
//      shortcuts on the overview, never a default selection.
// Observed Pro Evidence only: recorded games, newest patch first; nothing here scores or touches saved pairings.
import { newestGamesFirst, recordStamp } from "./chronology";
import { comparePatch, patchKey, samePatch } from "./patch";
import { samePlayer, type BuildRow, type ChampionBuilds } from "./pro-builds";
import { ROLES, type Role } from "./schema";

export interface BuildsQuery { champion?: string; role?: string; game?: string; player?: string; from?: string }

/**
 * What a Pro Builds URL selects.
 * - `champion`: that champion; `role` when the URL names one it has builds in (else its most recorded role, unless the
 *   link came from Draft Room, where the asked role is exact and missing builds are an empty state).
 * - `missing`: an explicit champion with no recorded builds: an empty state, never another champion in its place.
 * - `record`: no champion, but a game and/or player: the champion and role come from that recorded build once the
 *   build rows are loaded (`recordFor`).
 * - `home`: nothing asked: the overview.
 */
export type BuildsSelection =
  | { kind: "home"; game?: string }
  | { kind: "champion"; champion: string; role?: Role; entry?: ChampionBuilds; roles: ChampionBuilds[] }
  | { kind: "missing"; champion: string; role?: Role }
  | { kind: "record"; game?: string; player?: string };

export const parseRole = (r?: string): Role | undefined => ROLES.find((x) => x === r?.toUpperCase());

export function selectionOf(q: BuildsQuery, index: ChampionBuilds[]): BuildsSelection {
  const asked = parseRole(q.role);
  if (q.champion) {
    const roles = index.filter((e) => e.champion === q.champion);
    if (!roles.length) return q.from ? { kind: "champion", champion: q.champion, role: asked, entry: undefined, roles } : { kind: "missing", champion: q.champion, role: asked };
    const entry = roles.find((e) => e.role === asked) ?? (q.from && asked ? undefined : roles[0]);
    return { kind: "champion", champion: q.champion, role: entry?.role ?? asked, entry, roles };
  }
  if (q.player) return { kind: "record", game: q.game, player: q.player };
  return { kind: "home", game: q.game };
}

/** The recorded build a game and/or player names: that player in that game, else the player's newest game. */
export function recordFor(rows: BuildRow[], game?: string, player?: string): BuildRow | undefined {
  return rows.find((r) => (!game || String(r.game.id) === game) && (!player || samePlayer(r, player)));
}

/** Newest patch with recorded builds (Riot's 26.xx), the overview's default patch. */
export const latestPatch = (index: ChampionBuilds[]) =>
  index.flatMap((e) => Object.keys(e.patches)).sort((a, b) => comparePatch(b, a))[0];
/** Every patch with recorded builds, newest first. */
export const buildPatches = (index: ChampionBuilds[]) =>
  [...new Set(index.flatMap((e) => Object.keys(e.patches)))].sort((a, b) => comparePatch(b, a));

export interface HomeFilter { q?: string; role?: Role; patch?: string; game?: string }

/** The champion browser: champions and roles with builds in the scope, by name; a name search also finds players. */
export function browse(index: ChampionBuilds[], f: HomeFilter, name: (id: string) => string) {
  const q = f.q?.trim().toLowerCase() ?? "";
  const playerHit = (e: ChampionBuilds) => (q ? e.names.find((p) => p.toLowerCase().includes(q)) : undefined);
  return index
    .filter((e) => (!f.role || e.role === f.role) && (!f.patch || (e.patches[patchKey(f.patch)] ?? 0) > 0)
      && (!q || name(e.champion).toLowerCase().includes(q) || playerHit(e)))
    .map((e) => ({ entry: e, games: f.patch ? e.patches[patchKey(f.patch)] ?? 0 : e.games, player: name(e.champion).toLowerCase().includes(q) ? undefined : playerHit(e) }))
    .sort((a, b) => name(a.entry.champion).localeCompare(name(b.entry.champion)) || ROLES.indexOf(a.entry.role) - ROLES.indexOf(b.entry.role));
}

/**
 * Recent recorded builds, newest game first (lib/chronology.ts: date, newer patch on a shared date, a series in
 * descending game order). A game without a date sorts after every dated game: recency is never invented.
 */
export function recentBuilds(rows: BuildRow[], f: HomeFilter, name: (id: string) => string): BuildRow[] {
  const q = f.q?.trim().toLowerCase() ?? "";
  return newestGamesFirst(rows
    .filter((r) => (!f.role || r.build.role === f.role) && (!f.patch || samePatch(r.game.patch, f.patch)) && (!f.game || String(r.game.id) === f.game)
      && (!q || r.build.player.toLowerCase().includes(q) || name(r.build.champion).toLowerCase().includes(q) || r.team.toLowerCase().includes(q))),
    (r) => recordStamp(r.game));
}

// ---------- recently viewed (this browser only) ----------
// Shortcuts on the overview, newest first, one per champion and role (the last game opened on it). Never reopened
// automatically.
export interface Viewed { champion: string; role: Role; game?: number; player?: string }
export const RECENT_KEY = "pro-builds:recently-viewed";
export const RECENT_MAX = 8;
export function addViewed(list: Viewed[], v: Viewed, max = RECENT_MAX): Viewed[] {
  return [v, ...list.filter((x) => !(x.champion === v.champion && x.role === v.role))].slice(0, max);
}
export function readViewed(raw: string | null): Viewed[] {
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v.filter((x) => x && typeof x.champion === "string" && parseRole(x.role)).slice(0, RECENT_MAX) : [];
  } catch { return []; }
}

/**
 * The game Pro Builds shows for a champion (alan, 2026-10-13), from rows already in the active filters, newest first:
 *   1. the URL's game, when it is among them;
 *   2. a chosen player: the rows are already that player's, so their newest game (never replaced by a pin);
 *   3. the newest game of a pinned player (the pinned player who played it most recently, not the one with most games);
 *   4. the newest game.
 * Pins are Gol.gg player ids, so newly recorded games count on their own.
 */
export function defaultGame(rows: BuildRow[], q: { game?: string; player?: string }, pins: string[]): BuildRow | undefined {
  const asked = q.game ? rows.find((r) => String(r.game.id) === q.game) : undefined;
  if (asked) return asked;
  if (q.player) return rows[0];
  const pinned = new Set(pins);
  return rows.find((r) => pinned.has(String(r.build.playerId))) ?? rows[0];
}
