// Pro Drafts game inspection (alan, 2026-10-12): a selected row opens the whole game, both teams with their ten picks and
// bans, and each champion in it opens that player's exact recorded build for that game (the same rows Pro Builds and
// Pinned Players read, components/GameBuild.tsx). Everything is named by what the data records: the game by its Gol.gg
// game id, the build by that game's side and role, never by a row's position. Observed Pro Evidence only: nothing here
// scores or touches saved pairings, and a build that was not recorded is said to be missing, never filled in.
import { gameKey, golggGameId, sideOf, type DraftSide } from "./draft-side";
import type { BuildRow } from "./pro-builds";
import { ROLES, type ProDraft, type Role } from "./schema";

/** The Gol.gg game id behind a draft: an imported draft carries it in its id (`golgg-<id>-<side>`); a stored draft
 *  names it through the one Gol.gg game page it cites. 0 when neither does. */
export const gameIdOf = (d: Pick<ProDraft, "id" | "sources">): number =>
  Number(/^golgg-(\d+)-(blue|red)$/.exec(d.id)?.[1] ?? 0) || golggGameId(d);

export interface GameView {
  gameId: number; // 0 when no Gol.gg game is named
  /** Both teams' drafts, blue first when sides are recorded; one entry when the other side is not stored. */
  teams: { d: ProDraft; side: DraftSide }[];
}

/** The game a selected draft belongs to: its own row and the opponent's row of the same game, blue side first. */
export function gameView(selected: ProDraft, all: ProDraft[]): GameView {
  const key = gameKey(selected);
  const other = all.find((d) => d !== selected && d.id !== selected.id && gameKey(d) === key && d.team === selected.opponent && d.opponent === selected.team);
  const teams = other ? [selected, other] : [selected];
  teams.sort((a, b) => (sideOf(a) === "blue" ? -1 : sideOf(b) === "blue" ? 1 : 0));
  return { gameId: gameIdOf(selected), teams: teams.map((d) => ({ d, side: sideOf(d) })) };
}

/** `?build=<draft id>:<ROLE>` names the champion whose build is open: the team row (a draft id, unique per team-game)
 *  and the role. Never a row position. */
export const buildParam = (d: Pick<ProDraft, "id">, role: Role) => `${d.id}:${role}`;
export function parseBuildParam(value: string | undefined, view: GameView): { d: ProDraft; side: DraftSide; role: Role } | undefined {
  if (!value) return undefined;
  const at = value.lastIndexOf(":");
  if (at < 0) return undefined;
  const id = value.slice(0, at), role = value.slice(at + 1) as Role;
  if (!ROLES.includes(role)) return undefined;
  const team = view.teams.find((t) => t.d.id === id);
  return team && { ...team, role };
}

/** The recorded build of the champion a team picked in a role, in this game: the build row with that game id, that
 *  team's recorded side and the role. Undefined when the game, the side or the build is not recorded. */
export function buildFor(rows: BuildRow[] | undefined, gameId: number, side: DraftSide, role: Role): BuildRow | undefined {
  if (!rows || !gameId || side === "none") return undefined;
  return rows.find((r) => r.game.id === gameId && r.side === side && r.build.role === role);
}

/** When another game row is clicked while a build is open, the same role opens on that row's team, so the panel
 *  updates in step with the selection rather than closing. */
export const carryBuild = (current: string | undefined, next: Pick<ProDraft, "id">): string | undefined => {
  const role = current?.slice(current.lastIndexOf(":") + 1) as Role | undefined;
  return role && ROLES.includes(role) ? buildParam(next, role) : undefined;
};
