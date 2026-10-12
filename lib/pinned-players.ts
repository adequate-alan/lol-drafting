// Pinned Players (alan, 2026-10-12): follow a professional player through every recorded game in the build data. Pure
// over the Pro Builds rows (lib/pro-builds.ts `buildRows`: data/pro-builds.json joined with the game records), so a game
// the daily refresh records shows up here without anything else being written. There is no separate player database.
// A player is keyed by Gol.gg's player id, never by name: two players with one name stay two profiles, and a player who
// changes team keeps one profile. Everything is "recorded games", never a career.
import { comparePatch, samePatch } from "./patch";
import { buildsHref, type BuildRow } from "./pro-builds";
import { ROLES, type Role } from "./schema";

export type PlayerId = string; // Gol.gg player id as a string (URL and localStorage friendly)
export const playerKey = (r: BuildRow): PlayerId => String(r.build.playerId);

export interface PlayerFilter { event?: string; patch?: string; champion?: string; result?: "win" | "loss" }
export const inPlayerScope = (r: BuildRow, f: PlayerFilter) =>
  (!f.event || r.game.event === f.event) && (!f.patch || samePatch(r.game.patch, f.patch))
  && (!f.champion || r.build.champion === f.champion) && (!f.result || (f.result === "win") === r.won);

export interface ChampionLine { champion: string; role: Role; games: number; wins: number; losses: number; latestPatch: string; last: BuildRow }
export interface PlayerProfile {
  id: PlayerId;
  name: string; // the name on the most recent recorded game
  names: string[]; // every spelling recorded for this id
  team?: string; // team on the most recent recorded game in scope
  teams: string[]; // newest first
  role?: Role; // most played role in scope
  games: number; wins: number; losses: number;
  events: string[];
  champions: ChampionLine[]; // most games first
  last?: BuildRow; // most recent recorded game in scope
  recent: boolean[]; // results of the last five games in scope, newest first
}

/** Every recorded game of one player, newest first (rows are already newest first). */
export const rowsOfPlayer = (rows: BuildRow[], id: PlayerId) => rows.filter((r) => playerKey(r) === id);

/** One player's profile over the rows in scope. A player with no game in scope still gets a profile (zero games). */
export function playerProfile(rows: BuildRow[], id: PlayerId, filter: PlayerFilter = {}, fallbackName?: string): PlayerProfile {
  const mine = rowsOfPlayer(rows, id);
  const shown = mine.filter((r) => inPlayerScope(r, filter));
  const champs = new Map<string, ChampionLine>();
  for (const r of shown) {
    const k = `${r.build.champion}-${r.build.role}`;
    const c = champs.get(k) ?? { champion: r.build.champion, role: r.build.role, games: 0, wins: 0, losses: 0, latestPatch: r.game.patch, last: r };
    c.games += 1;
    if (r.won) c.wins += 1; else c.losses += 1;
    if (comparePatch(r.game.patch, c.latestPatch) > 0) c.latestPatch = r.game.patch;
    champs.set(k, c);
  }
  const roleCount = new Map<Role, number>();
  for (const r of shown) roleCount.set(r.build.role, (roleCount.get(r.build.role) ?? 0) + 1);
  const role = [...roleCount.entries()].sort((a, b) => b[1] - a[1] || ROLES.indexOf(a[0]) - ROLES.indexOf(b[0]))[0]?.[0];
  const wins = shown.filter((r) => r.won).length;
  return {
    id, name: mine[0]?.build.player ?? fallbackName ?? id, names: [...new Set(mine.map((r) => r.build.player))],
    team: (shown[0] ?? mine[0])?.team, teams: [...new Set(mine.map((r) => r.team))], role: role ?? mine[0]?.build.role,
    games: shown.length, wins, losses: shown.length - wins,
    events: [...new Set(shown.map((r) => r.game.event))],
    champions: [...champs.values()].sort((a, b) => b.games - a.games || b.last.game.date.localeCompare(a.last.game.date) || a.champion.localeCompare(b.champion)),
    last: shown[0], recent: shown.slice(0, 5).map((r) => r.won),
  };
}

/** Every player in the rows, for the pin picker: id, latest name and team, disambiguated when two share a name. */
export function playerDirectory(rows: BuildRow[]): { id: PlayerId; name: string; team: string; label: string }[] {
  const seen = new Map<PlayerId, { id: PlayerId; name: string; team: string }>();
  for (const r of rows) if (!seen.has(playerKey(r))) seen.set(playerKey(r), { id: playerKey(r), name: r.build.player, team: r.team });
  const list = [...seen.values()];
  const count = new Map<string, number>();
  for (const p of list) count.set(p.name.toLowerCase(), (count.get(p.name.toLowerCase()) ?? 0) + 1);
  return list.map((p) => ({ ...p, label: (count.get(p.name.toLowerCase()) ?? 0) > 1 ? `${p.name} (${p.team})` : p.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** The exact Pro Builds view of one player's game: champion, role, player and game in the URL. */
export const gameHref = (r: BuildRow) => `${buildsHref(r.build.champion, r.build.role, r.game.id)}&player=${playerKey(r)}`;
/** One player's builds on one champion, in a Pro Builds mode (games, common, compare). */
export const championBuildsHref = (id: PlayerId, champion: string, role: Role, mode?: "common" | "compare") =>
  `${buildsHref(champion, role)}&player=${id}${mode ? `&mode=${mode}` : ""}`;
export const profileHref = (id: PlayerId) => `/pro-builds/pinned/?player=${id}`;

// ---------- pins ----------
// Pins are a list of player ids in this browser's localStorage. Pins saved before ids (player names, 2026-10-12) are
// moved to the id of the most recent recorded player with that name, once the build data is loaded.
export const isLegacyPin = (p: string) => !/^\d+$/.test(p);
export function migratePins(stored: string[], rows: BuildRow[]): string[] {
  const out: string[] = [];
  for (const p of stored) {
    const id = isLegacyPin(p) ? (rows.find((r) => r.build.player === p) ? playerKey(rows.find((r) => r.build.player === p)!) : undefined) : p;
    if (id && !out.includes(id)) out.push(id);
    else if (!id && !out.includes(p)) out.push(p); // a name with no recorded game yet stays until it can be matched
  }
  return out;
}
export const togglePin = (pins: string[], id: string) => (pins.includes(id) ? pins.filter((p) => p !== id) : [...pins, id]);
