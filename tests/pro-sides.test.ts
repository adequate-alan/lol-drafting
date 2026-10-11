// Pro Drafts side strips (alan, 2026-10-11): blue / red show the side recorded for that game, never a team's identity
// or listing order; a draft without a recorded side is neutral. Checked as relationships so daily imports keep passing.
import { describe, expect, it } from "vitest";
import { getProDrafts, getProGames } from "@/lib/data";
import { gameKey, pairRows, sideOf } from "@/lib/draft-side";
import type { ProDraft } from "@/lib/schema";

const drafts = getProDrafts();
const games = getProGames().games;

describe("recorded draft sides", () => {
  it("every recorded game has one blue team and one red team, and a winner on one side", () => {
    expect(games.length).toBeGreaterThan(0);
    for (const g of games) {
      expect(g.blue.team, `game ${g.id}`).toBeTruthy();
      expect(g.red.team, `game ${g.id}`).toBeTruthy();
      expect(g.blue.team, `game ${g.id}`).not.toBe(g.red.team);
      expect(["blue", "red"]).toContain(g.winner);
    }
  });

  it("each recorded game gives exactly one blue draft and one red draft, with the team that played that side", () => {
    for (const g of games) {
      const mine = drafts.filter((d) => d.sources.includes(`golgg-game-${g.id}`) && d.id.startsWith(`golgg-${g.id}-`));
      expect(mine.map((d) => d.side).sort(), `game ${g.id}`).toEqual(["blue", "red"]);
      for (const d of mine) {
        expect(d.team).toBe(g[d.side!].team);
        expect(d.picks).toEqual(g[d.side!].picks);
      }
    }
  });

  it("the two drafts of one game never share a side", () => {
    const byGame = new Map<string, ProDraft[]>();
    for (const d of drafts) byGame.set(gameKey(d), [...(byGame.get(gameKey(d)) ?? []), d]);
    for (const [key, g] of byGame) {
      const sides = g.map(sideOf).filter((s) => s !== "none");
      expect(new Set(sides).size, key).toBe(sides.length);
    }
  });

  it("a team's side is not fixed: it comes from each game", () => {
    // A team that played both sides keeps both, so the strip never encodes team identity.
    const sidesByTeam = new Map<string, Set<string>>();
    for (const d of drafts) if (d.side) sidesByTeam.set(d.team, (sidesByTeam.get(d.team) ?? new Set()).add(d.side));
    expect([...sidesByTeam.values()].some((s) => s.size === 2)).toBe(true);
  });

  it("a draft without a recorded side is neutral, never assumed blue", () => {
    const unrecorded = drafts.filter((d) => !d.side);
    for (const d of unrecorded) expect(sideOf(d)).toBe("none");
  });
});

describe("Pro Drafts rows", () => {
  it("a full game pairs blue first then red, and every row keeps its recorded side", () => {
    const rows = pairRows(drafts);
    for (const [i, r] of rows.entries()) {
      expect(r.side).toBe(sideOf(r.d));
      if (r.pair === "pair-a" && r.side !== "none") {
        expect(r.side).toBe("blue");
        expect(rows[i + 1].side).toBe("red");
      }
    }
  });

  it("filtering to one team keeps each row's own side", () => {
    const team = drafts.find((d) => d.side)!.team;
    const rows = pairRows(drafts.filter((d) => d.team === team));
    expect(rows.every((r) => r.pair === "" && r.side === sideOf(r.d))).toBe(true);
  });

  it("the listing order does not decide the side", () => {
    const game = games[0];
    const two = drafts.filter((d) => d.id.startsWith(`golgg-${game.id}-`));
    for (const order of [two, [...two].reverse()]) {
      const rows = pairRows(order);
      expect(rows.map((r) => [r.d.team, r.side])).toEqual([[game.blue.team, "blue"], [game.red.team, "red"]]);
    }
  });
});
