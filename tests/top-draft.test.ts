// Top lane draft usage (lib/top-draft.ts): the draft order rebuilt from each team's pick order and the side Gol.gg marks
// as picking first, blind / response / uncertain per recorded top selection, conservative flex handling, Fearless
// eligibility, repeated responses and DPM-supported counters kept apart. Observed Pro Evidence only.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGamePage } from "@/scripts/golgg/parse.mjs";
import { championResolver, firstPickOf, pickOrderFor } from "@/scripts/golgg/normalize.mjs";
import { getBuildGameRecords, getChampions, getDraftData, getTopDraft, getTopPicks } from "@/lib/data";
import type { ProGame } from "@/lib/schema";
import {
  defaultTopPatch, dpmCounter, roleBook, rotationOf, topRows, topSelections, turnOf, usageCounts, type DPMRow, type TopSelection,
} from "@/lib/top-draft";

const champions = getChampions();
const records = getBuildGameRecords();
const book = roleBook(champions, records);
const fixture = (f: string) => readFileSync(join(process.cwd(), "tests/fixtures/golgg", f), "utf8");

// A synthetic game: blue and red picks by role, each team's order, and who picked first.
function game(over: Partial<ProGame> & { id: number }, blue: [string[], string[]], red: [string[], string[]], firstPick?: "blue" | "red"): ProGame {
  const side = ([picks, order]: [string[], string[]], team: string) => ({
    team, bans: [], picks: { TOP: picks[0], JUNGLE: picks[1], MID: picks[2], BOT: picks[3], SUPPORT: picks[4] }, pickOrder: order,
  });
  return {
    event: "test", tournament: "Test", seriesId: over.id, series: "A vs B", game: 1, date: "2026-10-01", patch: "16.18",
    blue: side(blue, "A"), red: side(red, "B"), winner: "blue", url: "https://gol.gg/x", rolesUrl: "https://gol.gg/y", checkedOn: "2026-10-01",
    ...(firstPick ? { firstPick } : {}), ...over,
  } as ProGame;
}
const A = ["olaf", "vi", "orianna", "jhin", "nautilus"], B = ["jax", "sejuani", "ryze", "kaisa", "rakan"];

describe("draft order", () => {
  it("interleaves first team F1 S1 S2 F2 F3 S3 | S4 F4 F5 S5", () => {
    expect([0, 1, 2, 3, 4].map((i) => turnOf(i, true))).toEqual([1, 4, 5, 8, 9]);
    expect([0, 1, 2, 3, 4].map((i) => turnOf(i, false))).toEqual([2, 3, 6, 7, 10]);
    expect([1, 3, 4, 6, 7, 9, 10].map(rotationOf)).toEqual(["first", "first", "phase1", "phase1", "phase2", "phase2", "last"]);
  });

  it("reads the real Gol.gg game pages: per-team order and the first-pick side together give the interleaved draft", () => {
    const resolve = championResolver(champions);
    // 83540: Natus Vincere (red) picked first, so Ryze was pick 1 of the game and JDG's Ashe pick 2, not the reverse.
    const page = parseGamePage(fixture("game-83540-game.html"));
    const stored = records.find((g) => g.id === 83540)!;
    const got = pickOrderFor(stored, page, resolve);
    if (got.problems) throw new Error(got.problems.join("; "));
    expect(got.firstPick).toBe("red");
    expect(firstPickOf(page)).toBe("red");
    expect([stored.blue.pickOrder, stored.red.pickOrder, stored.firstPick]).toEqual([got.blue, got.red, "red"]);
    const g = { ...stored, blue: { ...stored.blue, pickOrder: got.blue }, red: { ...stored.red, pickOrder: got.red }, firstPick: "red" as const };
    const tops = topSelections([g], book);
    const jdg = tops.find((s) => s.team === "JD Gaming")!, navi = tops.find((s) => s.team !== "JD Gaming")!;
    expect(navi.champion).toBe("rumble");
    expect(navi.turn).toBe(5); // NAVI picks 1, 4, 5: Ryze, Jarvan IV, Rumble
    expect(jdg.champion).toBe("galio");
    expect(jdg.turn).toBe(7); // JDG picks 2, 3, 6, 7, 10: Ashe, Seraphine, Qiyana, Galio, Locke
    expect(navi.usage).toBe("blind");
    expect(jdg.enemySeen).toEqual(["ryze", "jarvan-iv", "rumble"]);
    expect(jdg.usage).toBe(book.rolesOf("rumble").length === 1 || book.rolesOf("ryze").length === 1 ? "response" : "uncertain");
  });
});

describe("classification", () => {
  it("blind before the opposing top, response after it, never from side or result", () => {
    // Blue first: blue Olaf at pick 1; red Jax at red's 5th pick (turn 10).
    const g = game({ id: 1, winner: "red" }, [A, ["olaf", "vi", "orianna", "jhin", "nautilus"]], [B, ["sejuani", "ryze", "kaisa", "rakan", "jax"]], "blue");
    const [olaf, jax] = ["olaf", "jax"].map((c) => topSelections([g], book).find((s) => s.champion === c)!);
    expect(olaf.usage).toBe("blind");
    expect(olaf.turn).toBe(1);
    expect(jax.usage).toBe("response");
    expect(jax.turn).toBe(10);
    // Same picks, red picked first: Jax is still red's last pick (turn 9), still after Olaf (blue's first, turn 2).
    const r = topSelections([{ ...g, firstPick: "red" }], book);
    expect(r.find((s) => s.champion === "jax")!.turn).toBe(9);
    expect(r.find((s) => s.champion === "olaf")!.turn).toBe(2);
  });

  it("is uncertain without the first-pick mark or the pick order", () => {
    const g = game({ id: 2 }, [A, A], [B, B]);
    expect(topSelections([g], book).every((s) => s.usage === "uncertain")).toBe(true);
    const noOrder = game({ id: 3 }, [A, A], [B, B], "blue");
    delete noOrder.red.pickOrder;
    expect(topSelections([noOrder], book).every((s) => s.usage === "uncertain")).toBe(true);
  });

  it("does not call a response when the opposing top could still have gone to another role", () => {
    // Red picks Jayce (top or mid) first, then the top responds; red's mid is picked later, so Jayce's lane was unknown.
    const red = ["jayce", "sejuani", "ryze", "kaisa", "rakan"];
    const g = game({ id: 4 }, [A, ["vi", "olaf", "orianna", "jhin", "nautilus"]], [red, ["jayce", "sejuani", "kaisa", "rakan", "ryze"]], "red");
    const olaf = topSelections([g], book).find((s) => s.champion === "olaf")!;
    expect(book.rolesOf("jayce")).toContain("MID");
    expect(olaf.usage).toBe("uncertain");
    expect(olaf.why).toMatch(/could still have played mid/);
    // Once a one-role mid is on the board, Jayce can only be the top: a response.
    const red2 = ["jayce", "sejuani", "syndra", "kaisa", "rakan"];
    const g2 = game({ id: 5 }, [A, ["vi", "orianna", "jhin", "nautilus", "olaf"]], [red2, ["jayce", "syndra", "sejuani", "kaisa", "rakan"]], "red");
    expect(book.rolesOf("syndra")).toEqual(["MID"]);
    expect(topSelections([g2], book).find((s) => s.champion === "olaf")!.usage).toBe("response");
  });

  it("knows Fearless eligibility only when every earlier game of the series is recorded", () => {
    const g1 = game({ id: 10, seriesId: 10, game: 1 }, [A, A], [B, B], "blue");
    const g2 = game({ id: 11, seriesId: 10, game: 2 }, [["gnar", "lee-sin", "azir", "xayah", "rakan"], ["gnar", "lee-sin", "azir", "xayah", "rakan"]], [["rumble", "vi", "ahri", "ezreal", "karma"], ["rumble", "vi", "ahri", "ezreal", "karma"]], "red");
    const g3 = game({ id: 12, seriesId: 10, game: 3 }, [["ksante", "xin-zhao", "taliyah", "sivir", "lulu"], ["ksante", "xin-zhao", "taliyah", "sivir", "lulu"]], [["renekton", "nocturne", "viktor", "corki", "nami"], ["renekton", "nocturne", "viktor", "corki", "nami"]], "blue");
    const s = topSelections([g1, g2, g3], book);
    expect(s.find((x) => x.game === 11)!.unavailable).toEqual(expect.arrayContaining(["olaf", "jax"]));
    expect(topSelections([g1, g3], book).find((x) => x.game === 12)!.unavailable).toBeNull();
    // Olaf is counted as locked out of games 11 and 12, never as having lost priority there; Gnar only out of game 12.
    expect(topRows(s, {}).find((r) => r.champion === "olaf")!.unavailableGames).toBe(2);
    expect(topRows(s, {}).find((r) => r.champion === "gnar")!.unavailableGames).toBe(1);
  });
});

describe("matchups", () => {
  const dpm: DPMRow[] = [{ role: "TOP", champion: "jax", enemy: "olaf", winRate: 0.55, games: 900, patch: "16.20", url: "https://dpm.lol/x" }];
  const jaxInto = (id: number, seriesId: number) =>
    game({ id, seriesId }, [A, ["olaf", "vi", "orianna", "jhin", "nautilus"]], [B, ["sejuani", "ryze", "kaisa", "rakan", "jax"]], "blue");

  it("one response is observed, the same response in two series is repeated, a DPM row makes it a supported counter", () => {
    const one = topRows(topSelections([jaxInto(20, 20)], book), {});
    expect(one.find((r) => r.champion === "jax")!.respondedInto[0].status).toBe("observed");
    const sameSeries = topSelections([jaxInto(21, 21), { ...jaxInto(22, 21), game: 2 }], book);
    expect(topRows(sameSeries, {}).find((r) => r.champion === "jax")!.respondedInto[0].status).toBe("observed");
    const two = topRows(topSelections([jaxInto(23, 23), jaxInto(24, 24)], book), {});
    const pair = two.find((r) => r.champion === "jax")!.respondedInto[0];
    expect(pair.status).toBe("repeated");
    expect(pair.series).toBe(2);
    expect(two.find((r) => r.champion === "olaf")!.answeredBy[0].champion).toBe("jax");
    const sup = topRows(topSelections([jaxInto(25, 25)], book), {}, dpm).find((r) => r.champion === "jax")!.respondedInto[0];
    expect(sup.status).toBe("supported");
    expect(sup.dpm?.strong).toBe(true);
  });

  it("never reads a counter from win / loss: a response that won every game stays a response", () => {
    const won = [30, 31, 32].map((id) => ({ ...jaxInto(id, id), winner: "red" as const }));
    const pair = topRows(topSelections(won, book), {}).find((r) => r.champion === "jax")!.respondedInto[0];
    expect(pair.wins).toBe(3);
    expect(pair.status).toBe("repeated");
    expect(dpmCounter([{ ...dpm[0], games: 100 }], "jax", "olaf")).toBeUndefined();
  });
});

describe("per-champion rows", () => {
  it("needs 3 classified games for a label and marks fewer than 5 as a small sample", () => {
    const sel = (n: number, usage: TopSelection["usage"]) => Array.from({ length: n }, (_, i) => ({
      game: i + Math.random(), event: "t", tournament: "T", patch: "16.18", date: "2026-10-01", series: "s", seriesId: i, gameNo: 1,
      champion: "gnar", team: "A", opponent: "B", side: "blue", won: true, opponentTop: "jax", usage, why: "", enemySeen: [], ownSeen: [], flex: [], unavailable: [],
    } as TopSelection));
    expect(topRows(sel(2, "blind"), {})[0].usage).toBe("too-few");
    const r = topRows([...sel(2, "blind"), ...sel(1, "response")], {})[0];
    expect(r.usage).toBe("blind");
    expect(r.low).toBe(true);
    expect(usageCounts(r)).toBe("Blind 2/3 · Response 1/3");
    expect(topRows([...sel(3, "blind"), ...sel(3, "response")], {})[0].usage).toBe("both");
    expect(topRows([...sel(1, "blind"), ...sel(4, "response"), ...sel(4, "uncertain")], {})[0]).toMatchObject({ usage: "response", uncertain: 4, games: 9 });
  });

  it("covers every recorded game once, both tops each, and defaults to a patch with enough classified games", () => {
    const all = topSelections(records, book);
    expect(all.length).toBe(2 * new Set(records.map((g) => g.id)).size);
    const p = defaultTopPatch(all);
    expect(p).toBeDefined();
    for (const s of all) if (s.usage !== "uncertain") expect(s.turn).not.toBe(s.opponentTurn);
  });
});

describe("recorded games (fixed Demacia / LCK facts, scoped to those games)", () => {
  const all = topSelections(records, book);
  const at = (game: number, team: string) => all.find((s) => s.game === game && s.team === team)!;

  it("BNK FearX vs LGD game 2 (83454): Olaf blind at pick 4, Jax a response at pick 7, not called a counter", () => {
    expect(at(83454, "BNK FearX")).toMatchObject({ champion: "olaf", usage: "blind", turn: 4, firstPicker: true });
    expect(at(83454, "LGD Gaming")).toMatchObject({ champion: "jax", usage: "response", turn: 7 });
    const jax = topRows(all, {}, getTopDraft().dpm).find((r) => r.champion === "jax")!;
    const pair = jax.respondedInto.find((p) => p.into === "olaf")!;
    expect(pair.games.map((g) => g.game)).toContain(83454);
    expect(pair.status).not.toBe("supported");
  });

  it("keeps the game without a First Pick mark (83450) unclassified", () => {
    expect(all.filter((s) => s.game === 83450).every((s) => s.usage === "uncertain")).toBe(true);
  });

  it("every classified selection names its Gol.gg game, both turns and the board it saw", () => {
    for (const s of all.filter((x) => x.usage !== "uncertain")) {
      expect(records.some((g) => g.id === s.game)).toBe(true);
      expect(s.turn && s.opponentTurn).toBeTruthy();
      expect(s.enemySeen.includes(s.opponentTop)).toBe(s.usage === "response");
    }
  });
});

describe("Draft Room and pages", () => {
  it("never feeds the ranking: the candidate and recommendation code does not read top usage", () => {
    for (const f of ["lib/candidates.ts", "lib/recommend.ts", "lib/counters.ts", "lib/evaluate.ts"])
      expect(readFileSync(join(process.cwd(), f), "utf8")).not.toMatch(/top-draft|topUsage/);
  });

  it("ships usage marks for the default patch and never edits saved grades", () => {
    const d = getDraftData();
    expect(d.topUsage.patch).toBe(defaultTopPatch(topSelections(records, book)));
    expect(Object.keys(d.topUsage.marks).length).toBeGreaterThan(5);
    const before = JSON.parse(readFileSync(join(process.cwd(), "data/top.json"), "utf8"));
    expect(getTopPicks().map((t) => t.blindGrade)).toEqual(before.map((t: { blindGrade: string }) => t.blindGrade));
  });

  it("keeps the kit read apart from pro evidence", () => {
    const b = getTopDraft();
    expect(b.blind.rumble?.length).toBeGreaterThan(0);
    expect(JSON.stringify(b.blind)).not.toMatch(/pro|game|blinded/i);
  });
});
