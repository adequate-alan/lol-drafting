// Gen.G Worlds 2026 Finals hub (alan, 2026-11-14; lib/finals.ts). Fixed numbers are scoped to the games recorded before
// the final (Gol.gg ids up to 83721), so the refresh that records the final can never break them; the states after the
// final are tested on synthetic games.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { labHref } from "../components/FinalsLab";
import { BLG, FINAL_INFO, finalChanges, finalRead, GENG, isFinalGame, matchups, pickedAndBanned, preFinal, presence, repeatsInSeries, seriesOf, tendencies } from "../lib/finals";
import { gamePlayers } from "../lib/pro-drafts-game";
import { ROLES, type ProGame } from "../lib/schema";
import { laneSelections, roleBook } from "../lib/top-draft";

const json = (f: string) => JSON.parse(readFileSync(`data/${f}`, "utf8"));
const all: ProGame[] = json("pro-games.json").games;
const known = all.filter((g) => g.id <= 83721);
const builds = json("pro-builds.json");

const semi = known.find((g) => g.id === 83715)!; // Invictus Gaming (blue) vs Gen.G (red), Gen.G won
/** A synthetic final game: Gen.G blue, Bilibili Gaming red, picks borrowed from a recorded game. */
const finalGame = (no: number, winner: "blue" | "red", stage = "FINAL"): ProGame => ({
  ...semi, id: 990000 + no, seriesId: 990001, series: "Gen.G vs Bilibili Gaming", game: no, stage, date: FINAL_INFO.date, winner,
  blue: { ...semi.red, team: GENG }, red: { ...semi.blue, team: BLG },
});

describe("road to the finals, from the recorded games", () => {
  const road = seriesOf(GENG, known);
  it("lists Gen.G's five series newest first with the recorded scores", () => {
    expect(road.map((s) => [s.stage, s.opponent, `${s.wins}-${s.losses}`])).toEqual([
      ["Semifinals", "Invictus Gaming", "3-0"], ["Quarterfinals", "LYON", "3-0"], ["Swiss Round 3", "LYON", "2-1"],
      ["Swiss Round 2", "Hanwha Life Esports", "1-0"], ["Swiss Round 1", "Invictus Gaming", "1-0"],
    ]);
    expect(road.flatMap((s) => s.games.map((g) => g.id))).toEqual([83715, 83714, 83713, 83701, 83700, 83699, 83661, 83660, 83659, 83651, 83638]);
  });
  it("takes side, result and first pick from each game's record, never from the side", () => {
    for (const s of road) for (const g of s.games) {
      const rec = known.find((x) => x.id === g.id)!;
      expect(rec[g.side].team).toBe(GENG);
      expect(g.won).toBe(rec.winner === g.side);
      expect(g.firstPick).toBe(rec.firstPick === g.side);
      expect(g.draft).toBe(`golgg-${g.id}-${g.side}`);
    }
    // Red side and first pick in the same game: the mark, not the side.
    expect(road[0].games[0]).toMatchObject({ id: 83715, side: "red", firstPick: true });
  });
  it("Bilibili Gaming's road: seven series, 11-4", () => {
    const blg = seriesOf(BLG, known);
    expect(blg.length).toBe(7);
    expect([blg.reduce((n, s) => n + s.wins, 0), blg.reduce((n, s) => n + s.losses, 0)]).toEqual([11, 4]);
  });
});

describe("pre-final comparison", () => {
  const pre = preFinal(known);
  const book = roleBook(json("champions.json"), [...known, ...(builds.games ?? [])]);
  const sel = ROLES.flatMap((r) => laneSelections(pre, book, r));
  const a = tendencies(GENG, pre, sel), b = tendencies(BLG, pre, sel);
  it("counts inside the main event before the final, each with its denominator", () => {
    expect(pre.length).toBe(72);
    expect([a.games, a.wins, b.games, b.wins]).toEqual([11, 10, 15, 11]);
    expect([a.firstPick, a.marked, b.firstPick, b.marked]).toEqual([7, 11, 5, 15]);
    expect(a.ordered).toBe(11);
    for (const t of [a, b]) {
      for (const r of ROLES) {
        expect(t.byRole[r].reduce((n, c) => n + c.n, 0)).toBe(t.games);
        const u = t.usage[r];
        expect(u.blind + u.response + u.uncertain).toBe(t.games);
      }
      expect(t.bans.reduce((n, c) => n + c.n, 0)).toBeLessThanOrEqual(t.games * 5);
      // First rotation = the team's first three picks: three per ordered game, never more than the champion's picks.
      expect(t.firstRotation.reduce((n, c) => n + c.n, 0)).toBe(t.ordered * 3);
      for (const c of t.firstRotation) expect(c.n).toBeLessThanOrEqual(c.picks);
      for (const c of t.blind) expect(c.n).toBeLessThanOrEqual(c.picks);
    }
    expect(a.byRole.JUNGLE[0]).toMatchObject({ champion: "qiyana", n: 5 });
    expect(b.byRole.MID[0]).toMatchObject({ champion: "orianna", n: 6 });
  });
  it("presence is picks plus bans over the scope's games", () => {
    const p = presence(pre);
    expect(p.games).toBe(72);
    expect(Object.values(p.rows).reduce((n, r) => n + r.picks, 0)).toBe(720);
  });
  it("ban overlap needs two picks and two bans", () => {
    for (const x of [...pickedAndBanned(a, b), ...pickedAndBanned(b, a)]) { expect(x.picks).toBeGreaterThanOrEqual(2); expect(x.bans).toBeGreaterThanOrEqual(2); }
  });
  it("no champion repeats inside a recorded main-event series", () => {
    expect(repeatsInSeries(pre)).toEqual({ series: 19, repeated: 0 });
  });
  it("player matchups come from the recorded builds: one player per role in every game", () => {
    const m = matchups(pre, gamePlayers(builds.builds, [...known, ...(builds.games ?? [])]));
    expect(m.map((x) => [x.geng?.name, x.blg?.name])).toEqual([["Kiin", "Bin"], ["Canyon", "XUN"], ["Chovy", "Knight"], ["Ruler", "Viper"], ["Duro", "ON"]]);
    for (const x of m) { expect(x.geng!.games).toBe(11); expect(x.blg!.games).toBe(15); }
  });
  it("the final's games never enter the pre-final comparison", () => {
    const withFinal = [...known, finalGame(1, "blue"), finalGame(2, "red")];
    expect(preFinal(withFinal).length).toBe(72);
    expect(tendencies(GENG, preFinal(withFinal), sel)).toEqual(a);
  });
});

describe("the final follows the records", () => {
  it("is scheduled while no final game is recorded, and no earlier game counts as the final", () => {
    expect(known.some(isFinalGame)).toBe(false);
    expect(finalRead(known)).toMatchObject({ status: "scheduled", geng: 0, blg: 0 });
    expect(finalRead(known).winner).toBeUndefined();
  });
  it("some games recorded: a score so far, no winner", () => {
    const r = finalRead([...known, finalGame(1, "blue"), finalGame(2, "red")]);
    expect(r).toMatchObject({ status: "underway", geng: 1, blg: 1 });
    expect(r.winner).toBeUndefined();
    expect(r.games.map((g) => g.no)).toEqual([2, 1]); // newest first
  });
  it("three wins decide it, for either team", () => {
    const geng = finalRead([...known, finalGame(1, "blue"), finalGame(2, "red"), finalGame(3, "blue"), finalGame(4, "blue")]);
    expect(geng).toMatchObject({ status: "complete", winner: GENG, loser: BLG, geng: 3, blg: 1 });
    const blg = finalRead([...known, finalGame(1, "red"), finalGame(2, "red"), finalGame(3, "red")]);
    expect(blg).toMatchObject({ status: "complete", winner: BLG, loser: GENG, geng: 0, blg: 3 });
  });
  it("finds the final by its teams and date whatever Gol.gg calls the stage, and under a later-stage event", () => {
    expect(isFinalGame(finalGame(1, "blue", "FINALS"))).toBe(true);
    expect(isFinalGame(finalGame(1, "blue", "ROUND1"))).toBe(true);
    expect(isFinalGame({ ...finalGame(1, "blue"), event: "worlds-2026-finals" })).toBe(true);
    expect(isFinalGame({ ...finalGame(1, "blue"), event: "worlds-2026-play-in" })).toBe(false);
    expect(isFinalGame(semi)).toBe(false);
  });
  it("the road gains the final as its newest series, and the recap compares it with earlier games", () => {
    const games = [...known, finalGame(1, "blue")];
    const road = seriesOf(GENG, games);
    expect(road[0]).toMatchObject({ stage: "Grand Final", final: true, opponent: BLG, wins: 1, losses: 0 });
    expect(road.length).toBe(6);
    const before = tendencies(BLG, preFinal(games));
    const c = finalChanges(BLG, games.filter(isFinalGame), before);
    expect(c.games).toBe(1);
    expect(c.picks.length).toBe(5);
    for (const p of c.newPicks) expect(ROLES.some((r) => before.byRole[r].some((x) => x.champion === p.champion))).toBe(false);
  });
});

describe("Finals Draft Lab", () => {
  it("opens the Draft Room with Gen.G's choices as role slots and BLG's as confirmed-role enemies", () => {
    expect(labHref({}, {})).toBe("/");
    expect(labHref({ JUNGLE: "qiyana" }, { MID: "orianna", SUPPORT: "nautilus" })).toBe("/?jungle=qiyana&vs=mid:orianna,support:nautilus");
  });
  it("is a link builder only: no scoring, ranking or saved-pairing code reads the finals module", () => {
    for (const f of ["lib/recommend.ts", "lib/candidates.ts", "lib/counters.ts", "lib/model-v2/analyze.ts", "lib/model-v2/plan.ts", "lib/comp-discovery.ts"])
      expect(readFileSync(f, "utf8")).not.toMatch(/finals/);
  });
  it("the hub never calls the match live or Gen.G champions ahead of a recorded result", () => {
    const hub = readFileSync("components/FinalsHub.tsx", "utf8");
    expect(hub).not.toMatch(/>\s*Live\b|\blive now\b/i);
    expect(hub.match(/are the Worlds 2026 champions/g)?.length).toBe(2); // both only inside the complete branch
    expect(hub).toMatch(/final\.winner === GENG/);
  });
});
