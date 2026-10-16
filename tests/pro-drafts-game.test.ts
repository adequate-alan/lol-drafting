// Pro Drafts game inspection (alan, 2026-10-12): the open game is both teams of one Gol.gg game, and each champion in
// it opens that player's recorded build for that exact game, named by game id, side and role, never by row position.
import { describe, expect, it } from "vitest";
import { getBuildGameRecords, getBuildGames, getProDrafts } from "@/lib/data";
import { banPhases, bansOf, buildFor, buildParam, carryBuild, gameFacts, gameIdOf, gameView, newSince, parseBuildParam, pickedFirst } from "@/lib/pro-drafts-game";
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

// Gol.gg-style rows (alan, 2026-10-16): bans from the game record in Gol.gg's order, split 3 | 2, and the 1st Pick tag
// only from Gol.gg's First Pick mark, never from side, winner or pick order.

describe("bans and first pick", () => {
  const records = getBuildGameRecords();
  const book = gameFacts(records);
  const sides = ["blue", "red"] as const;

  it("every recorded game shows each team's own five bans, in the record's order", () => {
    for (const g of records) for (const side of sides) {
      const d = drafts.find((x) => gameIdOf(x) === g.id && x.side === side && x.team === g[side].team);
      if (!d) continue;
      expect(bansOf(d, book)).toEqual(g[side].bans);
    }
    // The LCK archive drafts store no bans; they read them from their game record.
    expect(stored.bans).toBeUndefined();
    expect(bansOf(stored, book)).toHaveLength(5);
  });

  it("splits five bans into Gol.gg's two ban phases and leaves fewer unsplit", () => {
    expect(banPhases(["a", "b", "c", "d", "e"])).toEqual([["a", "b", "c"], ["d", "e"]]);
    expect(banPhases(["a", "b", "c", "d"])).toEqual([["a", "b", "c", "d"]]);
    expect(banPhases([])).toEqual([[]]);
  });

  it("marks exactly the team Gol.gg marks, on either side, and nothing when the game has no mark", () => {
    const marked = records.filter((g) => g.firstPick);
    expect(marked.some((g) => g.firstPick === "red")).toBe(true);
    expect(marked.some((g) => g.firstPick === "blue")).toBe(true);
    for (const g of records) for (const side of sides) {
      const d = drafts.find((x) => gameIdOf(x) === g.id && x.side === side && x.team === g[side].team);
      if (!d) continue;
      expect(pickedFirst(d, book)).toBe(g.firstPick ? g.firstPick === side : undefined);
    }
    const one = { id: "golgg-1-red", sources: ["golgg-game-1"], side: "red" as const, team: "B" };
    const rec = { id: 1, blue: { team: "A", bans: [] }, red: { team: "B", bans: [] } };
    expect(pickedFirst(one, gameFacts([{ ...rec, firstPick: "red" }]))).toBe(true);
    expect(pickedFirst({ ...one, id: "golgg-1-blue", side: "blue", team: "A" }, gameFacts([{ ...rec, firstPick: "red" }]))).toBe(false);
    expect(pickedFirst(one, gameFacts([rec]))).toBeUndefined();
    // A draft whose team is not that side's team in the record gets nothing.
    expect(pickedFirst({ ...one, team: "C" }, gameFacts([{ ...rec, firstPick: "red" }]))).toBeUndefined();
    expect(bansOf({ ...one, team: "C" }, gameFacts([{ ...rec, red: { team: "B", bans: ["x"] } }]))).toEqual([]);
  });

  it("flags only games not seen on the last visit, and nothing on a first visit", () => {
    expect(newSince(null, [1, 2])).toEqual([]);
    expect(newSince([1], [1, 2, 3])).toEqual([2, 3]);
    expect(newSince([1, 2, 3], [1, 2, 3])).toEqual([]);
  });

  it("Worlds games are their own tournament, never Demacia Cup, on their own patch", () => {
    const w = drafts.filter((d) => /^Worlds/.test(d.tournament));
    expect(w.length).toBeGreaterThan(0);
    const g = records.filter((x) => x.event.startsWith("worlds"));
    for (const x of g) expect(x.tournament).toMatch(/^Worlds/);
    expect(new Set(drafts.map((d) => d.id)).size).toBe(drafts.length);
  });
});
