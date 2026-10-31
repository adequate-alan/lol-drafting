// Pro Drafts game inspection (alan, 2026-10-12): the open game is both teams of one Gol.gg game, and each champion in
// it opens that player's recorded build for that exact game, named by game id, side and role, never by row position.
import { describe, expect, it } from "vitest";
import { getBuildGameRecords, getBuildGames, getProDrafts } from "@/lib/data";
import { banPhases, bansOf, buildFor, buildParam, carryBuild, draftOrder, gameFacts, gameIdOf, gameView, latestBatch, newSince, parseBuildParam, pickedFirst } from "@/lib/pro-drafts-game";
import { rows } from "@/lib/pro-builds-bundle";
import { ROLES, type Role } from "@/lib/schema";

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

  it("the latest refresh's games are the ones carrying its import day", () => {
    expect(latestBatch([{ id: 1, added: "2026-10-29" }, { id: 2, added: "2026-10-30" }, { id: 3, added: "2026-10-30" }, { id: 4, added: null }]))
      .toEqual({ ids: [2, 3], day: "2026-10-30" });
    expect(latestBatch([{ id: 1, added: null }])).toEqual({ ids: [], day: null });
    const book = gameFacts(getBuildGameRecords());
    const w = drafts.filter((d) => /^Worlds/.test(d.tournament) && gameIdOf(d));
    const { ids, day } = latestBatch(w.map((d) => ({ id: gameIdOf(d), added: book[gameIdOf(d)]?.added ?? null })));
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(book[id].added).toBe(day);
    for (const d of w) expect((book[gameIdOf(d)]?.added ?? "") <= day!).toBe(true);
  });

  it("Worlds games are their own tournament, never Demacia Cup, on their own patch", () => {
    const w = drafts.filter((d) => /^Worlds/.test(d.tournament));
    expect(w.length).toBeGreaterThan(0);
    const g = records.filter((x) => x.event.startsWith("worlds"));
    for (const x of g) expect(x.tournament).toMatch(/^Worlds/);
    expect(new Set(drafts.map((d) => d.id)).size).toBe(drafts.length);
  });
});

// Draft order (alan, 2026-10-24): rebuilt only from each team's pickOrder and Gol.gg's First Pick mark.
describe("the draft order view", () => {
  const side = (team: string, order: string[], roles: readonly Role[] = ROLES) => ({ team, bans: ["b1", "b2", "b3", "b4", "b5"].map((b) => `${team}-${b}`), pickOrder: order, picks: Object.fromEntries(order.map((c, i) => [roles[i], c])) });
  const blueOrder = ["ba", "bb", "bc", "bd", "be"], redOrder = ["ra", "rb", "rc", "rd", "re"];
  const record = (firstPick?: "blue" | "red", orders = true) => ({
    id: 9001, firstPick,
    blue: orders ? side("Blue Team", blueOrder) : { team: "Blue Team", bans: [] },
    red: orders ? side("Red Team", redOrder, ["MID", "TOP", "SUPPORT", "JUNGLE", "BOT"]) : { team: "Red Team", bans: [] },
  });
  const teams = [{ team: "Blue Team", side: "blue" as const }, { team: "Red Team", side: "red" as const }];

  it("red first: red takes R1, blue B1 · B2, red R2 · R3, blue B3; then R4, B4 · B5, R5 last", () => {
    const o = draftOrder(9001, gameFacts([record("red")]), teams);
    if (!o.ok) throw new Error(o.reason);
    expect(o.firstPick).toBe("red");
    expect(o.steps.map((s) => s.label)).toEqual(["R1", "B1 · B2", "R2 · R3", "B3", "B4", "R4 · R5", "B5"]);
    expect(o.steps.map((s) => s.turns)).toEqual([[1], [2, 3], [4, 5], [6], [7], [8, 9], [10]]);
    expect(o.steps.map((s) => s.rotation)).toEqual(["first", "first", "first", "first", "second", "second", "last"]);
    expect(o.steps[0].picks).toEqual([{ champion: "ra", role: "MID" }]);
    expect(o.steps[6].picks).toEqual([{ champion: "be", role: "SUPPORT" }]);
    expect(o.bans.blue).toEqual([["Blue Team-b1", "Blue Team-b2", "Blue Team-b3"], ["Blue Team-b4", "Blue Team-b5"]]);
  });

  it("blue first mirrors it, and every pick appears once in its team's own order", () => {
    const o = draftOrder(9001, gameFacts([record("blue")]), teams);
    if (!o.ok) throw new Error(o.reason);
    expect(o.steps.map((s) => s.label)).toEqual(["B1", "R1 · R2", "B2 · B3", "R3", "R4", "B4 · B5", "R5"]);
    const by = (sd: string) => o.steps.filter((s) => s.side === sd).flatMap((s) => s.picks.map((p) => p.champion));
    expect(by("blue")).toEqual(blueOrder);
    expect(by("red")).toEqual(redOrder);
  });

  it("is unavailable without the First Pick mark, without either team's order, or for a record of other teams", () => {
    expect(draftOrder(9001, gameFacts([record(undefined)]), teams).ok).toBe(false);
    expect(draftOrder(9001, gameFacts([record("blue", false)]), teams)).toMatchObject({ ok: false, reason: expect.stringMatching(/role order/) });
    expect(draftOrder(9001, gameFacts([record("blue")]), [{ team: "Someone Else", side: "blue" }]).ok).toBe(false);
    expect(draftOrder(0, gameFacts([record("blue")]), teams).ok).toBe(false);
  });

  it("every recorded game with a mark and both orders reads in full; the rest say why", () => {
    const records = getBuildGameRecords(), book = gameFacts(records);
    for (const g of records) {
      const o = draftOrder(g.id, book, [{ team: g.blue.team, side: "blue" }, { team: g.red.team, side: "red" }]);
      expect(o.ok, String(g.id)).toBe(!!g.firstPick && !!g.blue.pickOrder && !!g.red.pickOrder);
      if (o.ok) expect(o.steps.flatMap((s) => s.picks).every((p) => p.role)).toBe(true);
    }
  });
});
