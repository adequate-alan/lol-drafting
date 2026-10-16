// Pro Drafts side strips (alan, 2026-10-11): blue / red show the side recorded for that game, never a team's identity
// or listing order; a draft without a recorded side is neutral. Checked as relationships so daily imports keep passing.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getProDrafts, getProGames, getSources } from "@/lib/data";
import { gameKey, golggGameId, groupGames, newestGameFirst, pairRows, sideOf, withGameSides } from "@/lib/draft-side";
import { comparePatch } from "@/lib/patch";
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

  // One game is one visual unit (alan, 2026-10-13): two opposing drafts under a shared game label.
  it("groups both sides of a game into one unit, blue first, and keeps every row's side under a filter", () => {
    const all = groupGames(drafts);
    expect(all.length).toBeGreaterThan(0);
    for (const g of all) {
      expect(g.rows.length).toBe(g.paired ? 2 : 1);
      for (const r of g.rows) { expect(gameKey(r.d)).toBe(g.key); expect(r.side).toBe(sideOf(r.d)); }
      if (g.paired) { expect(g.rows[0].d.opponent).toBe(g.rows[1].d.team); if (g.rows[0].side !== "none") expect(g.rows.map((r) => r.side)).toEqual(["blue", "red"]); }
    }
    expect(all.filter((g) => g.paired).length).toBeGreaterThan(0);
    expect(all.flatMap((g) => g.rows.map((r) => r.d.id))).toEqual(pairRows(drafts).map((r) => r.d.id));
    const team = drafts.find((d) => d.side === "red")!.team;
    const one = groupGames(drafts.filter((d) => d.team === team));
    expect(one.every((g) => !g.paired && g.rows.length === 1 && g.rows[0].d.team === team)).toBe(true);
    expect(one.some((g) => g.rows[0].side === "red")).toBe(true);
  });

  // Demacia Cup 2026: Team WE and HANJIN BRION met in two series with the same label (2026-10-15 refresh), so a game is
  // keyed by its Gol.gg id, never by tournament, series label and teams alone.
  it("a rematch with the same series label and game number stays two games", () => {
    const [blue, red] = drafts.filter((d) => d.id.startsWith(`golgg-${games[0].id}-`));
    const rematch = [blue, red].map((d) => ({ ...d, id: d.id.replace(/^golgg-\d+/, "golgg-1"), sources: ["golgg-game-1"] }));
    const units = groupGames([blue, red, ...rematch]);
    expect(units.map((g) => g.rows.length)).toEqual([2, 2]);
    expect(new Set(units.map((g) => g.key)).size).toBe(2);
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

describe("newest games first, across tournaments (alan, 2026-10-12; 2026-10-16)", () => {
  const seriesOf = (d: ProDraft) => `${d.date}|${d.tournament}|${d.seriesGame.replace(/\s*G\d+$/, "")}`;
  const gameNo = (d: ProDraft) => Number(/G(\d+)$/.exec(d.seriesGame)?.[1] ?? 0);

  it("lists drafts by date, then newer patch on a shared date; undated games follow", () => {
    for (let i = 1; i < drafts.length; i++) {
      const [a, b] = [drafts[i - 1], drafts[i]];
      const order = (b.date ?? "").localeCompare(a.date ?? "");
      expect(order, `${a.id} before ${b.id}`).toBeLessThanOrEqual(0);
      if (order === 0 && a.patch && b.patch) expect(comparePatch(a.patch, b.patch), `${a.id} before ${b.id}`).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps each series together with its games in descending game order", () => {
    const seen = new Set<string>();
    for (let i = 0; i < drafts.length; i++) {
      const s = seriesOf(drafts[i]);
      if (i > 0 && seriesOf(drafts[i - 1]) === s) {
        expect(gameNo(drafts[i - 1]), `${drafts[i - 1].id} before ${drafts[i].id}`).toBeGreaterThanOrEqual(gameNo(drafts[i]));
        continue;
      }
      expect(seen.has(s), `series ${s} split`).toBe(false);
      seen.add(s);
    }
  });

  it("puts a game from the newest recorded date on the first row of Pro Drafts", () => {
    const newest = games.map((g) => g.date).sort().at(-1);
    expect(pairRows(drafts)[0].d.date).toBe(newest);
  });

  it("puts the Worlds 2026 Play-In (26.20) above the Demacia Cup games played the same day (26.18)", () => {
    const at = (id: number) => drafts.findIndex((d) => golggGameId(d) === id);
    const worlds = [83593, 83594, 83595, 83598, 83599, 83600, 83601, 83602].map(at);
    const demacia = [83603, 83608, 83609, 83610, 83611, 83612].map(at);
    expect([...worlds, ...demacia].every((i) => i >= 0)).toBe(true);
    expect(Math.max(...worlds)).toBeLessThan(Math.min(...demacia));
    // C9 vs KC G5 … G1, then FURIA vs MVK G3 … G1 (series tie-break), then WE vs BRO G5 … G1
    const order = [...new Set(drafts.map(golggGameId))].filter((id) => [...[83593, 83594, 83595, 83598, 83599, 83600, 83601, 83602], 83608, 83609, 83610, 83611, 83612].includes(id));
    expect(order).toEqual([83602, 83601, 83600, 83599, 83598, 83595, 83594, 83593, 83612, 83611, 83610, 83609, 83608]);
  });

  it("keeps the order under every filter: a filter only removes rows", () => {
    const filters: ((d: ProDraft) => boolean)[] = [
      (d) => d.tournament.startsWith("Demacia"), (d) => d.tournament.startsWith("Worlds"), (d) => d.team === "Gen.G",
      (d) => d.picks.MID === "ryze", (d) => d.patch === "16.18", (d) => d.stage === "Semifinals",
    ];
    for (const f of filters) expect(drafts.filter(f)).toEqual(newestGameFirst(drafts.filter(f)));
  });

  it("dates the LCK archive drafts from their Gol.gg game records", () => {
    expect(drafts.filter((d) => d.tournament === "LCK 2026 Season Playoffs").every((d) => /^2026-\d\d-\d\d$/.test(d.date ?? ""))).toBe(true);
  });
});
