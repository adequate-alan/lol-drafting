// Top-lane matchups (alan, 2026-11-14): lib/top-matchups.ts reads the stored DPM.LOL top rows as they are (the Counter
// data, the Counter thresholds), keeps the kit analysis apart from the statistic, and is read by nothing that scores.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DPM_MIN_GAMES, DPM_MIN_WIN_RATE } from "@/lib/counters";
import { getChampions, getCounters, getLaneDraft } from "@/lib/data";
import { factOf } from "@/lib/matchup-read";
import { ANGLE_LIMIT, blindFacts, curveLine, jungleAngles, laneGroups, laneReads, topMatchupsHref, type LaneData } from "@/lib/top-matchups";

const lanes = getLaneDraft("TOP").lanes!;
const stored = getCounters().dpm.filter((r) => r.role === "TOP");
const src = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
const name = (id: string) => getChampions().find((c) => c.id === id)?.name ?? id;

describe("the rows", () => {
  it("carries every stored top row unchanged, and only Top carries them", () => {
    expect(Object.values(lanes.rows).flat().length).toBe(stored.length);
    for (const r of stored) {
      const t = lanes.rows[r.champion].find(([e]) => e === r.enemy)!;
      expect(t[1] / 10000, `${r.champion} vs ${r.enemy}`).toBeCloseTo(r.winRate, 4);
      expect(t[2]).toBe(r.games);
    }
    for (const role of ["JUNGLE", "MID", "BOT", "SUPPORT"] as const) expect(getLaneDraft(role).lanes).toBeUndefined();
  });

  it("groups with the Counter thresholds: favourable is 300+ games at 52%+, difficult the mirror, the rest even or too few", () => {
    for (const id of Object.keys(lanes.rows)) {
      const reads = laneReads(lanes, id);
      const g = laneGroups(reads);
      expect(g.favourable.length + g.difficult.length + g.even.length + g.thin.length).toBe(reads.length);
      expect(new Set(reads.map((r) => r.enemy)).size).toBe(reads.length);
      for (const r of g.favourable) expect(r.games >= DPM_MIN_GAMES && r.winRate >= DPM_MIN_WIN_RATE, `${id} vs ${r.enemy}`).toBe(true);
      for (const r of g.difficult) expect(r.games >= DPM_MIN_GAMES && r.winRate <= 1 - DPM_MIN_WIN_RATE, `${id} vs ${r.enemy}`).toBe(true);
      for (const r of g.thin) expect(r.games).toBeLessThan(DPM_MIN_GAMES);
      // Every own-page row is there as stored.
      for (const r of stored.filter((x) => x.champion === id)) expect(reads.find((x) => x.enemy === r.enemy && !x.turned)?.winRate).toBeCloseTo(r.winRate, 4);
      const f = blindFacts(reads);
      expect(f.favourable + f.even + f.difficult).toBe(f.qualified);
      expect(f.hardest.every((r) => r.group === "difficult")).toBe(true);
    }
  });

  it("turns a pair only the opponent's page lists, marked as the same sample", () => {
    const data: LaneData = { rows: { a: [["b", 5600, 400, 1]] }, urls: { a: "u" }, patch: "16.20", rank: "Emerald+", updated: "2026-10-22", book: {} };
    const [r] = laneReads(data, "b");
    expect(r).toMatchObject({ enemy: "a", winRate: 0.44, games: 400, turned: true, page: "a", group: "difficult", strong: true });
    expect(laneReads(data, "a")[0]).toMatchObject({ enemy: "b", winRate: 0.56, turned: false, group: "favourable", strong: true });
    expect(laneReads(data, "c")).toEqual([]);
  });
});

describe("analysis stays analysis", () => {
  it("jungle and curve lines come from stored kit values, capped, with no rate and no counter claim", () => {
    let lines = 0;
    for (const id of Object.keys(lanes.rows)) for (const r of laneReads(lanes, id)) {
      const a = factOf(lanes.book, id, "TOP"), b = factOf(lanes.book, r.enemy, "TOP");
      const angles = jungleAngles(a, b, name(id), name(r.enemy));
      expect(angles.length).toBeLessThanOrEqual(ANGLE_LIMIT);
      const curve = curveLine(a, b, name(id), name(r.enemy));
      for (const l of [...angles, ...(curve ? [curve] : [])]) {
        lines++;
        expect(l.values, `${id} vs ${r.enemy}`).toBeTruthy();
        expect(l.text, `${id} vs ${r.enemy}`).not.toMatch(/%|win rate|counter(?!-)|guarantee|always|safe/i);
      }
    }
    expect(lines).toBeGreaterThan(500);
    expect(jungleAngles(undefined, factOf(lanes.book, "jax", "TOP"), "x", "Jax")).toEqual([]);
  });

  it("the analysis never sees the statistic, and nothing that scores reads the explorer", () => {
    const lib = src("lib/top-matchups.ts");
    // jungleAngles and curveLine take kit facts only.
    expect(lib).toMatch(/export function jungleAngles\(a: MatchupFacts \| undefined, b: MatchupFacts \| undefined, me: string, them: string\)/);
    expect(lib).toMatch(/export function curveLine\(a: MatchupFacts \| undefined, b: MatchupFacts \| undefined, me: string, them: string\)/);
    for (const f of ["lib/recommend.ts", "lib/candidates.ts", "lib/counters.ts", "lib/evaluate.ts", "lib/starting-picks.ts"]) expect(src(f), f).not.toMatch(/top-matchups/);
  });

  it("links to the Synergies Top matchups view", () => {
    expect(topMatchupsHref("jax")).toBe("/synergies/top/?champ=jax&view=matchups");
    expect(topMatchupsHref("jax", "renekton")).toBe("/synergies/top/?champ=jax&view=matchups&vs=renekton");
  });
});
