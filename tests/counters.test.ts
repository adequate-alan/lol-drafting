// Counters (lib/counters.ts): a fourth signal, separate from Synergy, Pro Pairings and Logic. DPM.LOL matchup data is the
// counter signal; recorded pro games (same role, opposite sides, recorded winner, repeated, newer patches weigh more) only
// corroborate it and never make a counter alone. Pool first, and a counter never moves the draft-fit ranking. The
// fixtures below are test data, not claims about real games.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { counterPicks, describeEvidence, describePro, detectEnemyRoles, enemyParam, parseEnemy, resultGames, type CounterInput, type EnemyDraft } from "@/lib/counters";
import { getCounters, getDraftData, getProGames } from "@/lib/data";
import type { Draft } from "@/lib/evaluate";
import { recommend } from "@/lib/recommend";
import type { Counters, DpmDuoMatchup, DpmMatchup, ProDraft, Role } from "@/lib/schema";

const data = getDraftData();
const fits = (d: Draft, enemy: EnemyDraft) => recommend(d, Object.values(enemy) as string[], data, Infinity);
const empty: Counters = { updated: "2026-10-10", dpmStatus: { reachable: false, checkedOn: "2026-10-10", note: "" }, proResults: [], dpm: [], dpmDuos: [] };

let gameNo = 90000;
type Picks = ProDraft["picks"];
const base: Picks = { TOP: "gnar", JUNGLE: "vi", MID: "ryze", BOT: "ezreal", SUPPORT: "karma" };
const other: Picks = { TOP: "ornn", JUNGLE: "lee-sin", MID: "orianna", BOT: "caitlyn", SUPPORT: "bard" };
/** One recorded game: side A ("Blue") and side B ("Red"), and who won. */
function game(a: Partial<Picks>, b: Partial<Picks>, winner: "Blue" | "Red", patch = "16.18") {
  const src = `golgg-game-${++gameNo}`;
  const side = (team: string, opp: string, picks: Partial<Picks>, fill: Picks): ProDraft => ({
    id: `${src}-${team}`.toLowerCase(), tournament: "Fixture", seriesGame: "G1", stage: "x", team, opponent: opp, patch,
    picks: { ...fill, ...picks }, read: "", sources: [src],
  });
  return { drafts: [side("Blue", "Red", a, base), side("Red", "Blue", b, other)], result: { game: src, winner, sources: [src] } };
}
function input(games: ReturnType<typeof game>[], extra: Partial<Counters> = {}): CounterInput {
  return { champions: data.champions, pool: data.pool, proDrafts: games.flatMap((g) => g.drafts),
    counters: { ...empty, proResults: games.map((g) => g.result), ...extra } };
}
const dpm = (role: Role, enemy: string, champion: string, winRate: number, games = 2000, patch = "16.18"): DpmMatchup =>
  ({ role, enemy, champion, winRate, games, patch, url: "https://dpm.lol/", updated: "2026-10-10", origin: "externally-provided" });
const duo = (enemy: [string, string], mine: [string, string], winRate: number, games = 800): DpmDuoMatchup =>
  ({ enemy: { bot: enemy[0], support: enemy[1] }, duo: { bot: mine[0], support: mine[1] }, winRate, games, patch: "16.18",
    url: "https://dpm.lol/", updated: "2026-10-10", origin: "externally-provided" });
const run = (d: Draft, enemy: EnemyDraft, inp: CounterInput) => counterPicks(d, enemy, inp, fits(d, enemy));
const ids = (list?: { champion: string }[]) => (list ?? []).map((c) => c.champion);
/** Three games where `mine` (top) beat `enemy` (top), side B playing the enemy. */
const wins = (role: Role, mine: string, enemy: string, n = 3, patch = "16.18") =>
  Array.from({ length: n }, () => game({ [role]: mine }, { [role]: enemy }, "Blue", patch));

describe("enemy role detection", () => {
  it("places bare ids by their listed roles", () => {
    expect(detectEnemyRoles(["ornn", "jarvan-iv"], data.champions)).toEqual({ TOP: "ornn", JUNGLE: "jarvan-iv" });
    expect(detectEnemyRoles(["ahri", "sivir", "lulu", "aatrox"], data.champions)).toEqual({ TOP: "aatrox", MID: "ahri", BOT: "sivir", SUPPORT: "lulu" });
  });
  it("resolves flex champions to the arrangement that fits everyone", () => {
    // Aatrox plays top or jungle; with Ornn on top he goes jungle.
    expect(detectEnemyRoles(["aatrox", "ornn"], data.champions)).toEqual({ TOP: "ornn", JUNGLE: "aatrox" });
  });
  it("keeps roles from the URL and leaves out a champion with no free role", () => {
    expect(parseEnemy("top:aatrox,ahri", data.champions)).toEqual({ TOP: "aatrox", MID: "ahri" });
    expect(detectEnemyRoles(["ksante", "ornn"], data.champions)).toEqual({ TOP: "ksante" });
    expect(parseEnemy("ornn,nope,ornn,jinx", data.champions, ["jinx"])).toEqual({ TOP: "ornn" });
    expect(enemyParam({ MID: "ahri", TOP: "aatrox" })).toBe("top:aatrox,mid:ahri");
  });
});

describe("pro games corroborate, never decide", () => {
  const jayce = () => dpm("TOP", "aatrox", "jayce", 0.55);
  it("a pro win/loss record alone is never a counter", () => {
    const res = run({}, { TOP: "aatrox" }, input(wins("TOP", "jayce", "aatrox", 5)));
    expect(res.TOP!.counters).toEqual([]);
  });

  it("agreement lifts the DPM signal one step; the pro sample stays separate", () => {
    const res = run({}, { TOP: "aatrox" }, input(wins("TOP", "jayce", "aatrox"), { dpm: [jayce()] }));
    const c = res.TOP!.counters[0];
    expect(c.evidence).toMatchObject({ source: "dpm", strength: "strong", winRate: 0.55 });
    expect(c.pro).toMatchObject({ games: 3, wins: 3, verdict: "agrees" });
    expect(c.strength).toBe("confirmed");
    expect(describePro(c.pro!)).toBe("Pro · 3 games · 3–0 · 26.18 · agrees");
    // A favorable DPM matchup with pro agreement becomes strong.
    const fav = run({}, { TOP: "aatrox" }, input(wins("TOP", "jayce", "aatrox"), { dpm: [dpm("TOP", "aatrox", "jayce", 0.525)] }));
    expect(fav.TOP!.counters[0].strength).toBe("strong");
  });

  it("disagreement keeps DPM as the signal, unaveraged, and says so", () => {
    const lost = Array.from({ length: 4 }, () => game({ TOP: "jayce" }, { TOP: "aatrox" }, "Red"));
    const c = run({}, { TOP: "aatrox" }, input(lost, { dpm: [jayce()] })).TOP!.counters[0];
    expect(c.strength).toBe("strong");
    expect(c.evidence.winRate).toBe(0.55);
    expect(c.pro).toMatchObject({ games: 4, wins: 0, verdict: "disagrees" });
    expect(c.cautions.join()).toMatch(/Pro games disagree: 0–4/);
  });

  it("the pro sample needs the same role on opposite sides, a recorded winner, and at least three games", () => {
    const two = run({}, { TOP: "aatrox" }, input(wins("TOP", "jayce", "aatrox", 2), { dpm: [jayce()] })).TOP!.counters[0];
    expect(two.pro).toBeNull();
    expect(two.strength).toBe("strong");
    // Opposite teams but not the same lane: Jayce top against Aatrox jungle says nothing about Jayce into Aatrox top.
    const cross = run({}, { TOP: "aatrox" }, input(Array.from({ length: 3 }, () => game({ TOP: "jayce" }, { JUNGLE: "aatrox" }, "Blue")), { dpm: [jayce()] }));
    expect(cross.TOP!.counters[0].pro).toBeNull();
    // Without results the games say nothing about who was favoured.
    const noResults = input(wins("TOP", "jayce", "aatrox"), { dpm: [jayce()] });
    noResults.counters.proResults = [];
    expect(resultGames(noResults.proDrafts, [])).toEqual([]);
    expect(run({}, { TOP: "aatrox" }, noResults).TOP!.counters[0].pro).toBeNull();
  });

  it("weights newer patches more", () => {
    const newerWins = [...wins("TOP", "jayce", "aatrox", 2, "16.18"), game({ TOP: "jayce" }, { TOP: "aatrox" }, "Red", "16.16")];
    const olderWins = [...wins("TOP", "jayce", "aatrox", 2, "16.16"), game({ TOP: "jayce" }, { TOP: "aatrox" }, "Red", "16.18")];
    // 2–1 either way: 2 / 2.7 = 0.74 agrees when the wins are newer; 1.4 / 2.4 = 0.58 is mixed when they are older.
    expect(run({}, { TOP: "aatrox" }, input(newerWins, { dpm: [jayce()] })).TOP!.counters[0].pro?.verdict).toBe("agrees");
    expect(run({}, { TOP: "aatrox" }, input(olderWins, { dpm: [jayce()] })).TOP!.counters[0].pro?.verdict).toBe("mixed");
  });
});

describe("role-correct counters", () => {
  it("each open role reads only its own lane opponent", () => {
    const res = run({}, { TOP: "aatrox", MID: "ahri" }, input([], { dpm: [dpm("TOP", "aatrox", "jayce", 0.55), dpm("MID", "ahri", "syndra", 0.55), dpm("MID", "aatrox", "ryze", 0.6)] }));
    expect(ids(res.TOP?.counters)).toEqual(["jayce"]);
    expect(ids(res.MID?.counters)).toEqual(["syndra"]);
    expect(res.JUNGLE).toBeUndefined();
  });
  it("drops a counter who does not play the role, and one already picked", () => {
    const res = run({ JUNGLE: "gnar" }, { TOP: "aatrox" }, input([], { dpm: [dpm("TOP", "aatrox", "lulu", 0.6), dpm("TOP", "aatrox", "gnar", 0.6), dpm("TOP", "aatrox", "jayce", 0.55)] }));
    expect(ids(res.TOP?.counters)).toEqual(["jayce"]);
  });
  it("no counters for a role that is already locked", () => {
    expect(run({ TOP: "jayce" }, { TOP: "aatrox" }, input([], { dpm: [dpm("TOP", "aatrox", "gnar", 0.6)] })).TOP).toBeUndefined();
  });
});

describe("pool prioritisation", () => {
  it("Core, then Depth, then Prepared / flex, then out-of-pool as reference", () => {
    const rows = [dpm("TOP", "aatrox", "shen", 0.6), dpm("TOP", "aatrox", "sion", 0.6), dpm("TOP", "aatrox", "ambessa", 0.6), dpm("TOP", "aatrox", "jayce", 0.6)];
    const list = run({}, { TOP: "aatrox" }, input([], { dpm: rows })).TOP!.counters;
    expect(list.map((c) => [c.champion, c.tier])).toEqual([["jayce", "core"], ["ambessa", "depth"], ["sion", "flex"], ["shen", null]]);
    expect(list[3].cautions[0]).toMatch(/Not in your pool/);
  });
  it("never adds a counter to the pool", () => {
    const before = JSON.stringify(data.pool);
    run({}, { TOP: "aatrox" }, input([], { dpm: [dpm("TOP", "aatrox", "shen", 0.6)] }));
    expect(JSON.stringify(data.pool)).toBe(before);
    expect(data.pool.find((p) => p.role === "TOP")![("core")]).not.toContain("shen");
  });
});

describe("source separation", () => {
  it("every counter is a DPM matchup, labelled DPM; pro context lives in its own field", () => {
    const res = run({}, { TOP: "aatrox" }, input(wins("TOP", "jayce", "aatrox"), { dpm: [dpm("TOP", "aatrox", "jayce", 0.6), dpm("TOP", "aatrox", "gnar", 0.553, 4120)] }));
    const byId = Object.fromEntries(res.TOP!.counters.map((c) => [c.champion, c]));
    for (const c of res.TOP!.counters) expect(c.evidence.source).toBe("dpm");
    expect(describeEvidence(byId.gnar.evidence)).toBe("DPM · 55.3% matchup · 4,120 games · 26.18");
    expect(byId.gnar.pro).toBeNull();
    expect(byId.jayce.pro?.verdict).toBe("agrees");
  });
  it("counters never change the draft-fit ranking", () => {
    const d: Draft = { JUNGLE: "vi", MID: "ahri", BOT: "sivir", SUPPORT: "lulu" };
    const enemy = { TOP: "aatrox" };
    const before = fits(d, enemy);
    const list = data.champions.filter((c) => c.roles.includes("TOP")).map((c) => dpm("TOP", "aatrox", c.id, 0.56));
    const res = counterPicks(d, enemy, input([], { dpm: list }), before);
    expect(fits(d, enemy)).toEqual(before);
    // Every top laner "counters" here, yet only the best overall fit is marked as such; the rest say where they rank.
    const best = res.TOP!.counters.filter((c) => c.fitRank === 1);
    expect(best.map((c) => c.champion)).toEqual([before.TOP![0].champion]);
    for (const c of res.TOP!.counters.filter((x) => x.fitRank && x.fitRank > 1)) expect(c.cautions.join()).toMatch(/fits the draft better/);
  });
  it("a counter that triggers a warning carries it as a caution", () => {
    const d: Draft = { JUNGLE: "nidalee", MID: "azir", BOT: "sivir", SUPPORT: "lulu" };
    const enemy = { TOP: "aatrox" };
    const f = fits(d, enemy);
    const risky = f.TOP!.find((r) => r.parts.some((p) => p.kind === "risk"));
    expect(risky).toBeTruthy();
    const res = counterPicks(d, enemy, input([], { dpm: [dpm("TOP", "aatrox", risky!.champion, 0.6)] }), f);
    const c = res.TOP!.counters[0];
    expect(c.fitRank).not.toBe(1);
    expect(c.cautions.some((t) => risky!.parts.some((p) => p.kind === "risk" && p.text === t))).toBe(true);
  });
});

describe("duplicate recommendation merging", () => {
  it("one entry per champion per role, whatever the number of sources", () => {
    const res = run({}, { TOP: "aatrox" }, input(wins("TOP", "jayce", "aatrox"), { dpm: [dpm("TOP", "aatrox", "jayce", 0.6), dpm("TOP", "aatrox", "jayce", 0.58, 900, "16.16")] }));
    expect(ids(res.TOP?.counters)).toEqual(["jayce"]);
  });
  it("the counter attaches to the same champion's draft-fit entry instead of a second recommendation", () => {
    const d: Draft = { BOT: "sivir" };
    const enemy = { TOP: "aatrox" };
    const f = fits(d, enemy);
    const top = f.TOP![0].champion;
    const c = counterPicks(d, enemy, input([], { dpm: [dpm("TOP", "aatrox", top, 0.56)] }), f).TOP!.counters[0];
    expect(c.fit).toBe(f.TOP![0]);
    expect(c.fitRank).toBe(1);
  });
});

describe("bot lane", () => {
  it("both enemy bot laners known: duo-vs-duo evidence first, with the partner it was measured with", () => {
    const res = run({}, { BOT: "sivir", SUPPORT: "lulu" }, input([], {
      dpmDuos: [duo(["sivir", "lulu"], ["ezreal", "karma"], 0.55)],
      dpm: [dpm("BOT", "sivir", "caitlyn", 0.58)],
    }));
    expect(res.BOT!.scope).toBe("duo");
    expect(res.BOT!.vs).toEqual(["sivir", "lulu"]);
    expect(res.BOT!.counters.map((c) => [c.champion, c.evidence.with])).toEqual([["ezreal", "karma"]]);
    expect(ids(res.SUPPORT?.counters)).toEqual(["karma"]);
  });
  it("pro duo games corroborate a duo row only when both whole duos match", () => {
    const row = duo(["sivir", "lulu"], ["ezreal", "karma"], 0.55);
    const g = Array.from({ length: 3 }, () => game({ BOT: "ezreal", SUPPORT: "karma" }, { BOT: "sivir", SUPPORT: "lulu" }, "Blue"));
    const half = Array.from({ length: 3 }, () => game({ BOT: "ezreal", SUPPORT: "karma" }, { BOT: "sivir", SUPPORT: "nami" }, "Blue"));
    const full = run({}, { BOT: "sivir", SUPPORT: "lulu" }, input(g, { dpmDuos: [row] })).BOT!.counters[0];
    expect(full.pro).toMatchObject({ scope: "duo", with: "karma", verdict: "agrees" });
    expect(full.strength).toBe("confirmed");
    expect(run({}, { BOT: "sivir", SUPPORT: "lulu" }, input(half, { dpmDuos: [row] })).BOT!.counters[0].pro).toBeNull();
    // Pro duo games without a DPM duo row make no counter.
    expect(run({}, { BOT: "sivir", SUPPORT: "lulu" }, input(g)).BOT!.counters).toEqual([]);
  });
  it("my locked support must match the duo; otherwise fall back to the role matchup, labelled", () => {
    const res = run({ SUPPORT: "nami" }, { BOT: "sivir", SUPPORT: "lulu" }, input([], {
      dpmDuos: [duo(["sivir", "lulu"], ["ezreal", "karma"], 0.6)],
      dpm: [dpm("BOT", "sivir", "caitlyn", 0.58)],
    }));
    expect(res.BOT!.scope).toBe("lane");
    expect(ids(res.BOT!.counters)).toEqual(["caitlyn"]);
    expect(res.BOT!.counters[0].evidence.strength).toBe("favorable");
    expect(res.BOT!.note).toMatch(/No duo-vs-duo data for Sivir \+ Lulu/);
  });
  it("one enemy bot-lane champion known: champion-level data, held to favourable", () => {
    const res = run({}, { BOT: "sivir" }, input([], { dpm: [dpm("BOT", "sivir", "caitlyn", 0.6)] }));
    expect(res.BOT!.counters[0].evidence).toMatchObject({ strength: "favorable", note: expect.stringMatching(/Only one enemy bot-lane champion/) });
    expect(res.SUPPORT).toBeUndefined(); // no enemy support, no support lane opponent
  });
});

describe("jungle", () => {
  it("a SoloQ head-to-head is matchup data, not a strong counter claim", () => {
    const res = run({}, { JUNGLE: "lee-sin" }, input([], { dpm: [dpm("JUNGLE", "lee-sin", "vi", 0.6)] }));
    expect(res.JUNGLE!.counters[0].evidence).toMatchObject({ source: "dpm", strength: "favorable" });
    expect(res.JUNGLE!.note).toMatch(/head-to-head only/);
  });
});

describe("no counter without enough evidence", () => {
  it("thin DPM samples and coin-flip win rates are ignored", () => {
    const res = run({}, { TOP: "aatrox" }, input([], { dpm: [dpm("TOP", "aatrox", "jayce", 0.6, 120), dpm("TOP", "aatrox", "gnar", 0.51)] }));
    expect(res.TOP!.counters).toEqual([]);
  });
  it("the stored data invents nothing: DPM rows only when collected, no recorded results", () => {
    const stored = getCounters();
    if (!stored.dpmStatus.reachable) expect(stored.dpm).toEqual([]);
    expect(stored.dpmDuos).toEqual([]);
    // Hand-entered results: none. Results come only from games the daily refresh recorded from Gol.gg, one per game.
    const raw = JSON.parse(readFileSync(join(process.cwd(), "data/counters.json"), "utf8")) as { proResults: unknown[] };
    expect(raw.proResults).toEqual([]);
    const imported = new Set(getProGames().games.map((g) => `golgg-game-${g.id}`));
    for (const r of stored.proResults) expect(imported.has(r.game), r.game).toBe(true);
    expect(stored.proResults.length).toBe(imported.size);
    const byId = new Map(data.champions.map((c) => [c.id, c]));
    for (const row of stored.dpm) {
      expect(row.url).toMatch(/^https:\/\/dpm\.lol\/champions\//);
      expect(byId.get(row.champion)?.roles, `${row.champion} ${row.role}`).toContain(row.role);
      expect(byId.has(row.enemy), row.enemy).toBe(true);
      expect(row.champion).not.toBe(row.enemy);
    }
  });
  it("every stored row names a source, patch, sample and date", () => {
    const stored = getCounters();
    for (const row of [...stored.dpm, ...stored.dpmDuos]) expect(row.url && row.patch && row.games && row.updated).toBeTruthy();
    for (const r of stored.proResults) expect(r.sources.length).toBeGreaterThan(0);
  });
});
