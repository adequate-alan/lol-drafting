// Pro Drafts side strips (alan, 2026-10-11): blue / red show the side recorded for that game, never a team's identity
// or listing order; a draft without a recorded side is neutral. Checked as relationships so daily imports keep passing.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getProDrafts, getProGames, getSources } from "@/lib/data";
import { gameKey, pairRows, sideOf, withGameSides } from "@/lib/draft-side";
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

// LCK 2026 playoffs (one-time backfill, alan 2026-10-11): sides live on the game's source record (`Source.sides`, read
// from the Gol.gg page by scripts/backfill-lck-sides.mjs) and every stored draft citing that game inherits them.
describe("stored drafts inherit their game's side", () => {
  const raw: ProDraft[] = JSON.parse(readFileSync(join(process.cwd(), "data", "pro-drafts.json"), "utf8"));
  const sourceList = getSources();
  const sources = Object.fromEntries(sourceList.map((s) => [s.id, s]));
  const stored = drafts.filter((d) => raw.some((r) => r.id === d.id));
  const gameOf = (d: ProDraft) => d.sources.map((id) => sources[id]).find((s) => s?.type === "golgg-game");

  it("keeps every stored draft's id, team, opponent, picks and evidence ids", () => {
    expect(stored.length).toBe(raw.length);
    for (const r of raw) {
      const d = stored.find((x) => x.id === r.id)!;
      expect({ team: d.team, opponent: d.opponent, picks: d.picks, sources: d.sources, seriesGame: d.seriesGame })
        .toEqual({ team: r.team, opponent: r.opponent, picks: r.picks, sources: r.sources, seriesGame: r.seriesGame });
    }
  });

  it("a game record with sides names two different teams and a winning side", () => {
    for (const s of sourceList.filter((x) => x.sides)) {
      expect(s.type).toBe("golgg-game");
      expect(s.sides!.blue).not.toBe(s.sides!.red);
      expect(s.refreshStatus === "verified" || !!s.pendingClaim, s.id).toBe(true);
    }
  });

  it("every draft citing a game with sides gets its side from that record", () => {
    for (const d of stored) {
      const g = gameOf(d)?.sides;
      if (!g) { expect(d.side).toBeUndefined(); continue; }
      expect(d.side, d.id).toBe(d.team === g.blue ? "blue" : "red");
      expect(d.team).toBe(g[d.side!]);
      expect(d.opponent).toBe(g[d.side === "blue" ? "red" : "blue"]);
      expect(d.won).toBe(g.winner === d.side);
    }
  });

  it("opposing rows share the game id and have opposite sides and results", () => {
    const byGame = new Map<string, ProDraft[]>();
    for (const d of stored) { const g = gameOf(d); if (g) byGame.set(g.id, [...(byGame.get(g.id) ?? []), d]); }
    for (const [id, rows] of byGame) {
      expect(rows.length, id).toBeLessThanOrEqual(2);
      if (rows.length === 2 && rows[0].side) {
        expect(rows[0].team).toBe(rows[1].opponent);
        expect(new Set(rows.map((r) => r.side))).toEqual(new Set(["blue", "red"]));
        expect(rows[0].won).not.toBe(rows[1].won);
      }
    }
  });

  it("counts each game once: one row per team, no champion on both sides", () => {
    const byGame = new Map<string, ProDraft[]>();
    for (const d of drafts) for (const id of d.sources) if (sources[id]?.type === "golgg-game") byGame.set(id, [...(byGame.get(id) ?? []), d]);
    for (const [id, rows] of byGame) {
      expect(new Set(rows.map((r) => r.team)).size, id).toBe(rows.length);
      const picks = rows.flatMap((r) => Object.values(r.picks));
      expect(new Set(picks).size, id).toBe(picks.length);
    }
  });

  it("the side never comes from team, row order or winner", () => {
    const game = sourceList.find((s) => s.sides);
    if (!game) return;
    const rows = raw.filter((d) => d.sources.includes(game.id));
    const forward = withGameSides(rows, sources).map((d) => d.side);
    const backward = withGameSides([...rows].reverse(), sources).reverse().map((d) => d.side);
    expect(forward).toEqual(backward);
    // A draft whose teams are not that game's two sides stays neutral.
    const stranger = { ...rows[0], team: "Not A Team", opponent: rows[0].team };
    expect(withGameSides([stranger], sources)[0].side).toBeUndefined();
  });
});
