// Pro Drafts game inspection (alan, 2026-10-12): the open game is both teams of one Gol.gg game, and each champion in
// it opens that player's recorded build for that exact game, named by game id, side and role, never by row position.
import { describe, expect, it } from "vitest";
import { getBuildGames, getProDrafts } from "@/lib/data";
import { buildFor, buildParam, carryBuild, gameIdOf, gameView, parseBuildParam } from "@/lib/pro-drafts-game";
import { rows } from "@/lib/pro-builds-bundle";
import { ROLES } from "@/lib/schema";

const drafts = getProDrafts();
const withBuilds = new Set(getBuildGames());
const imported = drafts.find((d) => d.id.startsWith("golgg-") && withBuilds.has(gameIdOf(d)))!;
const stored = drafts.find((d) => d.id === "lck26po-finals-g1-geng")!;

describe("the open game", () => {
  it("names the Gol.gg game from an imported draft's id and from a stored draft's cited game page", () => {
    expect(gameIdOf(imported)).toBe(Number(imported.id.split("-")[1]));
    expect(gameIdOf(stored)).toBe(82962);
    expect(gameIdOf({ id: "hand-written", sources: ["workbook"] })).toBe(0);
  });

  it("shows both teams of the game, blue side first, with the opponent's own draft", () => {
    for (const d of [imported, stored]) {
      const v = gameView(d, drafts);
      expect(v.teams).toHaveLength(2);
      expect(v.teams[0].side).toBe("blue");
      expect(v.teams[1].side).toBe("red");
      expect(v.teams.map((t) => t.d.team).sort()).toEqual([d.team, d.opponent].sort());
      const other = v.teams.find((t) => t.d !== d)!.d;
      expect(other.opponent).toBe(d.team);
      expect(other.seriesGame).toBe(d.seriesGame);
      expect(gameIdOf(other)).toBe(gameIdOf(d));
    }
  });

  it("a game whose other side is not stored shows the one team", () => {
    const alone = { ...stored, id: "only-one", tournament: "Elsewhere" };
    expect(gameView(alone, [alone]).teams).toHaveLength(1);
  });
});

describe("the open build", () => {
  const view = gameView(imported, drafts);

  it("is named by the team row and role, and parses back to that team", () => {
    const red = view.teams[1];
    const p = parseBuildParam(buildParam(red.d, "MID"), view)!;
    expect(p.d.id).toBe(red.d.id);
    expect(p.side).toBe("red");
    expect(p.role).toBe("MID");
    expect(parseBuildParam("golgg-0-blue:MID", view)).toBeUndefined(); // another game's row
    expect(parseBuildParam(`${red.d.id}:ADC`, view)).toBeUndefined(); // not a role
    expect(parseBuildParam(undefined, view)).toBeUndefined();
  });

  it("every champion of a recorded game resolves to that game, that side and that role, played by the champion shown", () => {
    for (const t of view.teams) for (const role of ROLES) {
      const r = buildFor(rows, view.gameId, t.side, role);
      expect(r, `${t.d.team} ${role}`).toBeDefined();
      expect(r!.game.id).toBe(view.gameId);
      expect(r!.side).toBe(t.side);
      expect(r!.build.role).toBe(role);
      expect(r!.build.champion).toBe(t.d.picks[role]);
      expect(r!.team).toBe(t.d.team);
    }
  });

  it("a game without recorded builds, or a side that is not recorded, gives no build rather than another game's", () => {
    const missing = drafts.find((d) => gameIdOf(d) === 82964)!; // LCK game with no builds stored
    expect(missing).toBeDefined();
    expect(withBuilds.has(82964)).toBe(false);
    expect(buildFor(rows, 82964, "blue", "MID")).toBeUndefined();
    expect(buildFor(rows, view.gameId, "none", "MID")).toBeUndefined();
    expect(buildFor(undefined, view.gameId, "blue", "MID")).toBeUndefined();
  });

  it("opening another game row carries the open role to that row's team", () => {
    expect(carryBuild(`${imported.id}:BOT`, stored)).toBe(`${stored.id}:BOT`);
    expect(carryBuild(undefined, stored)).toBeUndefined();
    expect(carryBuild("nonsense", stored)).toBeUndefined();
  });
});
