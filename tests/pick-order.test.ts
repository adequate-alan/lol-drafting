// Pick-order statistics (alan, 2026-10-24): only verified chronological records, rotation by default with exact positions
// as a drill-down, every count with its sample, win-loss as context only.
import { describe, expect, it } from "vitest";
import { getBuildGameRecords } from "@/lib/data";
import { breakdown, coverage, filterPicks, isOrdered, orderGame, orderedPicks, pickRows, slotOf, slotTeam, type OrderGame } from "@/lib/pick-order";

const ROLE_ORDER = ["TOP", "JUNGLE", "MID", "BOT", "SUPPORT"] as const;
const side = (team: string, order: string[] | undefined, lineup: string[]) => ({
  team, ...(order ? { order } : {}), picks: Object.fromEntries(ROLE_ORDER.map((r, i) => [r, lineup[i]])),
});
const game = (id: number, o: Partial<OrderGame> & { blueOrder?: string[]; redOrder?: string[] }): OrderGame => {
  const blue = ["b-top", "b-jg", "b-mid", "b-bot", "b-sup"], red = ["r-top", "r-jg", "r-mid", "r-bot", "r-sup"];
  return {
    id, event: "worlds-2026", tournament: "Worlds 2026 Main Event", stage: "ROUND1", patch: "16.20", date: "2026-10-23", seriesId: id, series: "A vs B",
    winner: "blue", firstPick: "red", ...o,
    blue: side("Blue Team", "blueOrder" in o ? o.blueOrder : ["b-mid", "b-bot", "b-jg", "b-sup", "b-top"], blue),
    red: side("Red Team", "redOrder" in o ? o.redOrder : ["r-bot", "r-sup", "r-jg", "r-top", "r-mid"], red),
  };
};

describe("ordered picks", () => {
  it("maps each team's own order onto the turns from the First Pick mark, never from side", () => {
    const ps = orderedPicks([game(1, {})]);
    const at = (c: string) => ps.find((p) => p.champion === c)!;
    expect(at("r-bot")).toMatchObject({ turn: 1, slot: "1", rotation: "first", firstPicker: true, side: "red", role: "BOT" });
    expect([at("b-mid").turn, at("b-bot").turn]).toEqual([2, 3]);
    expect(at("b-mid").slot).toBe("2-3");
    expect(at("r-jg").turn).toBe(5);
    expect(at("b-jg")).toMatchObject({ turn: 6, rotation: "first" });
    expect(at("b-sup")).toMatchObject({ turn: 7, rotation: "second" });
    expect(at("r-mid")).toMatchObject({ turn: 9, rotation: "second" });
    expect(at("b-top")).toMatchObject({ turn: 10, slot: "10", rotation: "last" });
    expect(ps).toHaveLength(10);
  });

  it("leaves out games without the First Pick mark or either team's drawn order, and counts them as excluded", () => {
    const games = [game(1, {}), game(2, { firstPick: undefined }), game(3, { redOrder: undefined })];
    expect(games.map(isOrdered)).toEqual([true, false, false]);
    expect(orderedPicks(games)).toHaveLength(10);
    expect(coverage(games, {})).toEqual({ ordered: 1, excluded: 2 });
  });

  it("positions belong to the first-pick team at 1, 4-5, 8-9 and to the other team at 2-3, 6, 7, 10", () => {
    expect([1, 4, 5, 8, 9].map((t) => slotTeam(slotOf(t)))).toEqual(["first", "first", "first", "first", "first"]);
    expect([2, 3, 6, 7, 10].map((t) => slotTeam(slotOf(t)))).toEqual(["second", "second", "second", "second", "second"]);
  });
});

describe("champion rows", () => {
  // Two games: "x" is red's first pick in both (lost both); "y" is blue's last pick in one (won).
  const g1 = game(1, { winner: "blue" }), g2 = { ...game(2, { winner: "blue", patch: "16.18" }) };
  for (const g of [g1, g2]) g.red = side("Red Team", ["x", "r-sup", "r-jg", "r-top", "r-mid"], ["r-top", "r-jg", "r-mid", "x", "r-sup"]);
  g1.blue = side("Blue Team", ["b-mid", "b-bot", "b-jg", "b-sup", "y"], ["y", "b-jg", "b-mid", "b-bot", "b-sup"]);
  const all = orderedPicks([g1, g2]);

  it("counts rotation, first pick, sides and series with the sample, and win-loss beside it", () => {
    const x = pickRows(all).find((r) => r.champion === "x")!;
    expect(x).toMatchObject({ picks: 2, first: 2, firstOverall: 2, last: 0, wins: 0, series: 2, small: true });
    expect(x.red).toMatchObject({ picks: 2, first: 2 });
    expect(x.blue.picks).toBe(0);
    expect(x.slots["1"]).toBe(2);
  });

  it("a position keeps only champions taken there; sorting never reads wins", () => {
    const last = pickRows(all, "slot:10");
    expect(last.map((r) => r.champion).sort()).toEqual(["b-top", "y"]); // g2 keeps b-top last, g1 has y last
    expect(last.every((r) => r.at > 0)).toBe(true);
    // Flip every result: the order of the rows does not move (x lost both games and keeps its place).
    const flipped = all.map((p) => ({ ...p, won: !p.won }));
    for (const sort of ["at", "first", "firstOverall", "last", "picks"] as const)
      expect(pickRows(flipped, "first", sort).map((r) => r.champion)).toEqual(pickRows(all, "first", sort).map((r) => r.champion));
    expect(pickRows(all, undefined, "firstOverall")[0].champion).toBe("x");
  });

  it("filters by side (blue, red, first-pick team), patch and role", () => {
    expect(filterPicks(all, { side: "first" }).every((p) => p.side === "red")).toBe(true);
    expect(filterPicks(all, { side: "blue" })).toHaveLength(10);
    expect(filterPicks(all, { patch: "26.18" })).toHaveLength(10);
    expect(filterPicks(all, { role: "BOT", side: "red" }).map((p) => p.champion)).toEqual(["x", "x"]);
  });

  it("breaks a champion down by patch, newest first, each line with its own sample", () => {
    expect(breakdown(all, "x", "patch").map((l) => [l.key, l.picks])).toEqual([["26.20", 1], ["26.18", 1]]);
    expect(breakdown(all, "x", "scope")[0].key).toBe("worlds-2026:swiss");
  });
});

describe("recorded games", () => {
  const games = getBuildGameRecords().map(orderGame);
  const picks = orderedPicks(games);

  it("every verified game gives exactly ten picks on ten distinct turns, five per team", () => {
    const by = new Map<number, number[]>();
    for (const p of picks) by.set(p.game, [...(by.get(p.game) ?? []), p.turn]);
    expect(by.size).toBe(games.filter(isOrdered).length);
    for (const [id, turns] of by) expect([...turns].sort((a, b) => a - b), String(id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("each game has one first pick, made by the team carrying the mark", () => {
    const firsts = picks.filter((p) => p.turn === 1);
    expect(firsts).toHaveLength(games.filter(isOrdered).length);
    for (const p of firsts) expect(games.find((g) => g.id === p.game)!.firstPick).toBe(p.side);
  });
});
