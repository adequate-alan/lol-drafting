// A DPM.LOL browser collection (lib/dpm-export.ts, alan 2026-10-22): names as DPM writes them map to the roster, the
// actual win rate is stored apart from DPM's displayed delta, duplicates and unknown names refuse the collection,
// reciprocal pairs are checked, and the stored data keeps one patch per collection. Fixture rows are test data.
import { describe, expect, it } from "vitest";
import { counterPicks, DPM_MIN_GAMES, DPM_MIN_WIN_RATE } from "@/lib/counters";
import { championResolver, compareSnapshots, parseDelta, readExport, reciprocalPairs, validateExport } from "@/lib/dpm-export";
import { getCounters, getDraftData } from "@/lib/data";
import { recommend } from "@/lib/recommend";
import { DpmExport, type DpmMatchup } from "@/lib/schema";

const data = getDraftData();
const resolve = championResolver(data.champions);
const page = (champion: string, role: string, matchups: Record<string, unknown>[], extra: Record<string, unknown> = {}) =>
  ({ champion, role, url: `https://dpm.lol/champions/${champion}/build`, matchups, ...extra });
const exp = (pages: ReturnType<typeof page>[], extra: Record<string, unknown> = {}) =>
  DpmExport.parse({ source: "dpm.lol", collectedOn: "2026-10-22", patch: "16.20", rank: "Emerald+", pages, ...extra });

describe("DPM spellings map to the roster", () => {
  it("ids, names, aliases and DPM's own spellings", () => {
    expect(resolve("MonkeyKing")).toBe("wukong");
    expect(resolve("Wukong")).toBe("wukong");
    expect(resolve("Nunu")).toBe("nunu-willump");
    expect(resolve("Renata")).toBe("renata-glasc");
    expect(resolve("Chogath")).toBe("chogath");
    expect(resolve("Cho'Gath")).toBe("chogath");
    expect(resolve("DrMundo")).toBe("dr-mundo");
    expect(resolve("KSante")).toBe("ksante");
    expect(resolve("Kaisa")).toBe("kaisa");
    expect(resolve("TwistedFate")).toBe("twisted-fate");
    expect(resolve("FiddleSticks")).toBe("fiddlesticks");
    expect(resolve("Nobody")).toBeUndefined();
  });
  it("reads DPM's delta as points, apart from the win rate", () => {
    expect(parseDelta("+3.2%")).toBe(3.2);
    expect(parseDelta("-4.5%")).toBe(-4.5);
    expect(Object.is(parseDelta("-0.0%"), 0)).toBe(true);
    expect(parseDelta("n/a")).toBeUndefined();
    const { rows } = readExport(exp([page("Jayce", "TOP", [{ enemy: "Singed", winRate: 49.91, games: 1136, delta: "+3.2%", inFullList: true }, { enemy: "Viego", winRate: 0.6029, games: 68 }])]), data.champions);
    expect(rows).toMatchObject([
      { role: "TOP", champion: "jayce", enemy: "singed", winRate: 0.4991, delta: 3.2, shown: true, games: 1136, patch: "16.20", rank: "Emerald+", updated: "2026-10-22", origin: "dpm-ingest" },
      { role: "TOP", champion: "jayce", enemy: "viego", winRate: 0.6029, games: 68 },
    ]);
    expect(rows[1].delta).toBeUndefined();
    expect(rows[1].shown).toBeUndefined();
    // The delta is never read as a win rate: 49.91% stays below the counter bar whatever DPM's +3.2 says.
    expect(rows[0].winRate < DPM_MIN_WIN_RATE).toBe(true);
  });
});

describe("validation refuses what must not be stored", () => {
  const full = () => exp(data.pool.flatMap((p) => [...p.core, ...p.depth, ...p.flex].map((c) => page(data.champions.find((x) => x.id === c)!.name, p.role, [{ enemy: c === "jayce" ? "Ornn" : "Jayce", winRate: 55, games: 400 }]))));
  it("every pool champion/role page, no duplicate, no unknown name, no self matchup", () => {
    expect(validateExport(full(), data.champions, data.pool)).toMatchObject({ ok: true, pages: 87, missingPages: [] });
    const missing = validateExport(exp(full().pages.slice(1)), data.champions, data.pool);
    expect(missing.ok).toBe(false);
    expect(missing.missingPages).toHaveLength(1);
    const bad = validateExport(exp([page("Jayce", "TOP", [{ enemy: "Ornn", winRate: 55, games: 400 }, { enemy: "Ornn", winRate: 54, games: 300 }, { enemy: "Jayce", winRate: 50, games: 300 }, { enemy: "Nobody", winRate: 50, games: 300 }, { enemy: "Sett", winRate: 150, games: 300 }])]), data.champions, data.pool);
    expect(bad.problems.join("\n")).toMatch(/duplicate matchup TOP\|jayce\|ornn/);
    expect(bad.problems.join("\n")).toMatch(/listed against itself/);
    expect(bad.problems.join("\n")).toMatch(/"Nobody" \(Jayce TOP\) is not in the roster/);
    expect(bad.problems.join("\n")).toMatch(/bad numbers for Jayce vs Sett/);
    expect(validateExport(exp([page("Lulu", "TOP", [{ enemy: "Ornn", winRate: 55, games: 400 }])]), data.champions, data.pool).problems.join()).toMatch(/Lulu does not play TOP/);
  });
  it("the Full List count must match the rows marked as shown; a delta belongs to a shown row", () => {
    const r = validateExport(exp([page("Jayce", "TOP", [{ enemy: "Ornn", winRate: 55, games: 400, inFullList: true, delta: "+1.0%" }, { enemy: "Sett", winRate: 51, games: 400, delta: "+0.5%" }], { fullListRows: 2 })]), data.champions, data.pool);
    expect(r.fullListMismatch).toEqual([{ page: "Jayce TOP", listed: 2, shown: 1 }]);
    expect(r.warnings.join("\n")).toMatch(/Jayce TOP vs Sett: a delta on a row the Full List did not show/);
  });
  it("reciprocal pairs sum to 100% within sampling; a large deviation is listed, never corrected", () => {
    const rows: DpmMatchup[] = [
      { role: "TOP", champion: "jayce", enemy: "gragas", winRate: 0.4395, games: 2214, patch: "16.20", url: "https://dpm.lol/", updated: "2026-10-22", origin: "dpm-ingest" },
      { role: "TOP", champion: "gragas", enemy: "jayce", winRate: 0.5599, games: 2195, patch: "16.20", url: "https://dpm.lol/", updated: "2026-10-22", origin: "dpm-ingest" },
      { role: "TOP", champion: "jayce", enemy: "ornn", winRate: 0.56, games: 500, patch: "16.20", url: "https://dpm.lol/", updated: "2026-10-22", origin: "dpm-ingest" },
      { role: "TOP", champion: "ornn", enemy: "jayce", winRate: 0.47, games: 500, patch: "16.20", url: "https://dpm.lol/", updated: "2026-10-22", origin: "dpm-ingest" },
    ];
    const pairs = reciprocalPairs(rows);
    expect(pairs.map((p) => [p.a, p.b, p.deviation])).toEqual([["gragas", "jayce", -0.06], ["jayce", "ornn", 3]]);
    const r = validateExport(exp([page("Jayce", "TOP", [{ enemy: "Ornn", winRate: 56, games: 500 }]), page("Ornn", "TOP", [{ enemy: "Jayce", winRate: 47, games: 500 }])]), data.champions, data.pool);
    expect(r.reciprocal.material.map((p) => p.deviation)).toEqual([3]);
    expect(r.reciprocal.maxAbsDeviation).toBe(3);
  });
});

describe("comparing two collections", () => {
  const row = (champion: string, enemy: string, winRate: number, games: number, updated = "2026-10-10"): DpmMatchup =>
    ({ role: "TOP", champion, enemy, winRate, games, patch: "16.20", url: "https://dpm.lol/", updated, origin: "dpm-ingest" });
  it("counts at the site's thresholds and names what appeared, disappeared and moved", () => {
    const before = [row("jayce", "ornn", 0.55, 400), row("jayce", "sett", 0.56, 120), row("gnar", "ornn", 0.53, 350), row("gnar", "sett", 0.545, 400)];
    const after = [row("jayce", "ornn", 0.51, 1200, "2026-10-22"), row("jayce", "sett", 0.555, 500, "2026-10-22"), row("gnar", "ornn", 0.53, 900, "2026-10-22"), row("gnar", "sett", 0.535, 900, "2026-10-22"), row("gnar", "darius", 0.6, 100, "2026-10-22")];
    const c = compareSnapshots(before, after);
    expect(c.before).toMatchObject({ rows: 4, sampled: 3, qualifying: 3, strong: 2, championRolesWithCounter: 2, enemyRolesAnswered: 2 });
    expect(c.after).toMatchObject({ rows: 5, sampled: 4, qualifying: 3, strong: 1, championRolesWithCounter: 2, enemiesAnswered: 2 });
    expect(c.newCounters.map((x) => `${x.champion}>${x.enemy}`)).toEqual(["jayce>sett"]);
    expect(c.lostCounters.map((x) => `${x.champion}>${x.enemy}`)).toEqual(["jayce>ornn"]);
    expect(c.weakened.map((x) => `${x.champion}>${x.enemy}`)).toEqual(["gnar>sett"]);
    expect(c.largestMoves[0]).toMatchObject({ champion: "jayce", enemy: "ornn" });
    expect(c).toMatchObject({ shared: 4, onlyBefore: 0, onlyAfter: 1, gamesGrowth: { median: 3 } });
  });
});

describe("the stored collection (2026-10-22)", () => {
  const stored = getCounters();
  it("is one patch, one bracket, one collection date, with DPM's delta kept apart from the win rate", () => {
    expect(new Set(stored.dpm.map((r) => r.patch)).size).toBe(1);
    expect(new Set(stored.dpm.map((r) => r.rank)).size).toBe(1);
    expect(new Set(stored.dpm.map((r) => r.updated)).size).toBe(1);
    for (const r of stored.dpm) {
      expect(typeof r.shown).toBe("boolean");
      if (r.delta !== undefined) expect(r.shown).toBe(true);
      expect(r.winRate).toBeGreaterThan(0);
      expect(r.winRate).toBeLessThan(1);
    }
    expect(stored.dpm.some((r) => r.delta !== undefined)).toBe(true);
  });
  it("covers every pool champion/role once, with no champion listed against itself", () => {
    const pages = new Set(stored.dpm.map((r) => `${r.role}|${r.champion}`));
    for (const p of data.pool) for (const c of [...p.core, ...p.depth, ...p.flex]) expect(pages.has(`${p.role}|${c}`), `${p.role} ${c}`).toBe(true);
    const keys = stored.dpm.map((r) => `${r.role}|${r.champion}|${r.enemy}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("rows under the sample bar never count as counters, and the data never moves the ranking", () => {
    const small = stored.dpm.filter((r) => r.games < DPM_MIN_GAMES && r.winRate >= DPM_MIN_WIN_RATE);
    expect(small.length).toBeGreaterThan(0);
    const before = recommend({ JUNGLE: "vi" }, ["aatrox"], data, Infinity);
    const read = counterPicks({ JUNGLE: "vi" }, { TOP: "aatrox" }, { champions: data.champions, pool: data.pool, proDrafts: [], counters: stored, newestPatch: data.newestPatch }, before);
    expect(read.TOP!.counters.length).toBeGreaterThan(0);
    expect(recommend({ JUNGLE: "vi" }, ["aatrox"], data, Infinity)).toEqual(before);
  });
});
