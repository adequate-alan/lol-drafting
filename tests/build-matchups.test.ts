// Pro Builds matchups (alan, 2026-11-12): each build's lane opponent comes only from its own Gol.gg game's ten-champion
// record (picks by role from Gol.gg's role table), never from draft position or "anyone on the other team". An opponent
// the records do not verify is an explicit unknown and never matches a matchup filter. The `vs` filter combines with
// champion, role, tournament, patch, team and player. Recorded-data checks pick their pairs from the data, so new games
// never break them.
import { describe, expect, it } from "vitest";
import { rows } from "@/lib/pro-builds-bundle";
import { buildRows, laneOpponent, matchupHref, matchups, scoped, type BuildRow } from "@/lib/pro-builds";
import { patchKey } from "@/lib/patch";
import { ROLES, type ProBuild, type ProGame } from "@/lib/schema";
import builds from "@/data/pro-builds.json";
import games from "@/data/pro-games.json";

const records = new Map<number, ProGame>([...(games as unknown as { games: ProGame[] }).games, ...((builds as unknown as { games?: ProGame[] }).games ?? [])].map((g) => [g.id, g]));
const other = (s: "blue" | "red") => (s === "blue" ? "red" : "blue");

describe("lane opponent from the recorded game", () => {
  it("every shown opponent is the other side's pick in the same role of that exact game", () => {
    let shown = 0;
    for (const r of rows) {
      const g = records.get(r.game.id)!;
      expect(g, `game ${r.game.id}`).toBeDefined();
      if (!r.opponent) { expect(r.opponentUnknown).toBeTruthy(); continue; }
      shown++;
      expect(g[r.side].picks[r.build.role]).toBe(r.build.champion);
      expect(r.opponent.champion).toBe(g[other(r.side)].picks[r.build.role]);
      expect(Object.values(g[r.side].picks)).not.toContain(r.opponent.champion);
      // The opposing player's own build, when recorded, is that champion in that role.
      const theirs = rows.find((x) => x.game.id === r.game.id && x.side !== r.side && x.build.role === r.build.role);
      if (theirs) { expect(theirs.build.champion).toBe(r.opponent.champion); expect(r.opponent.player).toBe(theirs.build.player); expect(r.opponent.playerId).toBe(theirs.build.playerId); }
    }
    expect(shown).toBeGreaterThan(0);
  });

  it("covers all five roles, several patches and several tournaments", () => {
    const withOpp = rows.filter((r) => r.opponent);
    expect(new Set(withOpp.map((r) => r.build.role))).toEqual(new Set(ROLES));
    expect(new Set(withOpp.map((r) => patchKey(r.game.patch))).size).toBeGreaterThanOrEqual(2);
    expect(new Set(withOpp.map((r) => r.game.event)).size).toBeGreaterThanOrEqual(2);
  });

  const game = (blue: Record<string, string>, red: Record<string, string>) => ({ blue: { team: "A", picks: blue }, red: { team: "B", picks: red } }) as unknown as ProGame;
  const blue = { TOP: "aatrox", JUNGLE: "vi", MID: "akali", BOT: "xayah", SUPPORT: "rakan" };
  const red = { TOP: "renekton", JUNGLE: "sejuani", MID: "viktor", BOT: "kaisa", SUPPORT: "nautilus" };

  it("verifies the same-role opponent and names the opposing player when recorded", () => {
    expect(laneOpponent({ champion: "akali", role: "MID", side: "blue" }, game(blue, red), { champion: "viktor", player: "Knight", playerId: 1 }))
      .toEqual({ opponent: { champion: "viktor", player: "Knight", playerId: 1 } });
    expect(laneOpponent({ champion: "viktor", role: "MID", side: "red" }, game(blue, red))).toEqual({ opponent: { champion: "akali" } });
  });

  it("an ambiguous role assignment is an explicit unknown, never a guessed matchup", () => {
    // The build says MID, the game's role table puts Akali in TOP: no lane opponent.
    const swapped = laneOpponent({ champion: "akali", role: "MID", side: "blue" }, game({ ...blue, TOP: "akali", MID: "aatrox" }, red));
    expect(swapped).toHaveProperty("unknown");
    // The opposing build names another champion than the role table.
    expect(laneOpponent({ champion: "akali", role: "MID", side: "blue" }, game(blue, red), { champion: "renekton", player: "X", playerId: 2 })).toHaveProperty("unknown");
    // No opposing pick in that role.
    expect(laneOpponent({ champion: "akali", role: "MID", side: "blue" }, game(blue, { ...red, MID: "" }))).toHaveProperty("unknown");
  });

  it("buildRows keeps the unknown state and the filter never matches it", () => {
    const g = { ...game({ ...blue, TOP: "akali", MID: "aatrox" }, red),
      id: 1, event: "e", tournament: "T", series: "S", game: 1, stage: "", date: "2026-11-01", patch: "16.20", url: "https://gol.gg/x", winner: "blue" } as unknown as ProGame;
    const b = { game: 1, side: "blue", role: "MID", champion: "akali", player: "Faker", playerId: 9 } as unknown as ProBuild;
    const [r] = buildRows([b], [g], {});
    expect(r.opponent).toBeUndefined();
    expect(r.opponentUnknown).toMatch(/not verified/);
    expect(scoped([r], { vs: "viktor" })).toEqual([]);
    expect(scoped([r], { vs: "aatrox" })).toEqual([]); // a teammate is never an opponent
    expect(matchupHref(r)).toBeUndefined();
  });
});

describe("matchup filter", () => {
  // The most recorded matchup per role in the data, so the check follows new games.
  const top = (rs: BuildRow[]) => {
    const n = new Map<string, BuildRow[]>();
    for (const r of rs) if (r.opponent) { const k = `${r.build.champion}|${r.build.role}|${r.opponent.champion}`; n.set(k, [...(n.get(k) ?? []), r]); }
    return [...n.values()].sort((a, b) => b.length - a.length)[0];
  };

  for (const role of ROLES) {
    it(`${role}: only builds of that champion into that opponent, combined with the other filters`, () => {
      const pair = top(rows.filter((r) => r.build.role === role))!;
      const { champion } = pair[0].build, vs = pair[0].opponent!.champion;
      const got = scoped(rows, { champion, role, vs });
      expect(got.length).toBe(pair.length);
      for (const r of got) expect(records.get(r.game.id)![other(r.side)].picks[role]).toBe(vs);
      // Every build of that champion and role that is not returned faced someone else (or has no verified opponent).
      for (const r of scoped(rows, { champion, role })) if (!got.includes(r)) expect(r.opponent?.champion).not.toBe(vs);
      // With tournament, patch, team and player: the intersection, never more.
      const r0 = got[0];
      for (const extra of [{ event: r0.game.event }, { patch: r0.game.patch }, { team: r0.team }, { player: String(r0.build.playerId) }]) {
        const both = scoped(rows, { champion, role, vs, ...extra });
        expect(both).toContain(r0);
        expect(both).toEqual(scoped(rows, { champion, role, ...extra }).filter((r) => r.opponent?.champion === vs));
      }
      // The menu count is the filter's count.
      expect(matchups(scoped(rows, { champion, role })).find((m) => m.champion === vs)!.builds).toBe(got.length);
      expect(matchupHref(r0, "26.20")).toBe(`/pro-builds/?champion=${champion}&role=${role}&vs=${vs}&patch=26.20`);
    });
  }

  it("a champion on the other team in another role is not a matchup", () => {
    const r = rows.find((x) => x.opponent)!;
    const g = records.get(r.game.id)!;
    const elsewhere = ROLES.filter((x) => x !== r.build.role).map((x) => g[other(r.side)].picks[x]);
    for (const c of elsewhere) expect(scoped([r], { vs: c })).toEqual([]);
  });
});
