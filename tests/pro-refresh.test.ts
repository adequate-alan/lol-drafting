// The daily pro-data refresh (scripts/refresh-pro-data.mjs), run against Gol.gg pages saved from a GitHub runner on
// 2026-10-11 (tests/fixtures/golgg). Checks parsing, validation, idempotence, the tracked-tournament allowlist and that
// nothing outside Observed Pro Evidence can change.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseChampionTable, parseFullstats, parseGamePage, parseMatchlist } from "@/scripts/golgg/parse.mjs";
import { buildGame, championResolver, firstPickOf, isComplete, seriesProblems } from "@/scripts/golgg/normalize.mjs";
import { refresh, urls, type Get } from "@/scripts/golgg/refresh.mjs";
import { draftsFromGames, freshness, gameSourceId, resultsFromGames, sourcesFromGames, stageLabel } from "@/lib/pro-games";
import { Files, type ProGames } from "@/lib/schema";
import { lastCheckedRun } from "@/components/ProFreshness";

const fixture = (f: string) => readFileSync(join(process.cwd(), "tests/fixtures/golgg", f), "utf8");
const raw = <T,>(f: string): T => JSON.parse(readFileSync(join(process.cwd(), "data", f), "utf8"));
const champions = Files["champions.json"].parse(raw("champions.json"));
const resolve = championResolver(champions);
const DEMACIA = "Demacia Cup Global Invitational 2026";

// A fresh start: the tracked list with no tournament state or games yet, and the data files as they are.
const empty: ProGames = { ...Files["pro-games.json"].parse(raw("pro-games.json")), tournaments: [], games: [] };
const baseData = () => ({
  proGames: structuredClone(empty), meta: Files["meta.json"].parse(raw("meta.json")), sources: Files["sources.json"].parse(raw("sources.json")),
  champions, botPairings: Files["bot-pairings.json"].parse(raw("bot-pairings.json")),
});

const PAGES: Record<string, string> = {
  [urls.list]: "trlist-s16.json",
  [urls.matchlist(DEMACIA)]: "demacia-matchlist-mini.html", // round 1 game 83452 plus the four unplayed quarterfinals
  [urls.championlist(DEMACIA)]: "demacia-championlist.html",
  "https://gol.gg/game/stats/83452/page-game/": "game-83452-game.html",
  "https://gol.gg/game/stats/83452/page-fullstats/": "game-83452-fullstats.html",
};
function recorder(pages = PAGES) {
  const asked: string[] = [];
  const get: Get = async (url) => {
    asked.push(url);
    if (!pages[url]) throw new Error(`not saved: ${url}`);
    return fixture(pages[url]);
  };
  return { get, asked };
}
const NOW = new Date("2026-10-11T12:00:00Z");

describe("Gol.gg parsers", () => {
  it("read the match list: played series with scores, upcoming ones without", () => {
    const ml = parseMatchlist(fixture("demacia-matchlist.html"));
    expect(ml.caption).toBe(`${DEMACIA} results`);
    expect(ml.series).toHaveLength(24);
    expect(ml.series.filter((s) => s.score)).toHaveLength(20);
    expect(ml.series.filter((s) => s.score).reduce((n, s) => n + s.score![0] + s.score![1], 0)).toBe(39);
    expect(ml.series.find((s) => s.id === 83540)).toMatchObject({ team1: "JD Gaming", team2: "Natus Vincere", score: [2, 1], winner: "JD Gaming", stage: "ROUND4", patch: "16.18", date: "2026-10-08" });
    expect(parseMatchlist(fixture("empty-matchlist.html")).series).toEqual([]);
  });

  it("read a game page and its full-stats roles", () => {
    const g = parseGamePage(fixture("game-83540-game.html"));
    expect(g).toMatchObject({ series: "NAVI vs JD Gaming", tournament: DEMACIA, date: "2026-10-08", stage: "ROUND4", patch: "16.18", game: 1, draftMode: "Fearless Draft" });
    expect(g.seriesGames.map((x) => x.id)).toEqual([83540, 83541, 83542]);
    expect(g.blue).toMatchObject({ team: "JD Gaming", result: "LOSS", bans: ["Nocturne", "Cassiopeia", "Vi", "Lucian", "Lulu"] });
    expect(g.red).toMatchObject({ team: "Natus Vincere", result: "WIN" });
    expect(parseGamePage(fixture("game-83542-game.html")).game).toBe(3);
    const roles = parseFullstats(fixture("game-83540-fullstats.html"))!;
    expect(roles.blue.map((x) => x.role)).toEqual(["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"]);
    expect(roles.red.find((x) => x.role === "SUPPORT")?.champion).toBe("Nautilus");
  });

  it("names champions by icon file, since Gol.gg leaves apostrophes unescaped in alt text", () => {
    const html = fixture("game-83540-fullstats.html").replace("champions_icon/Galio.png' alt='Galio'", "champions_icon/KSante.png' alt='K'Sante'");
    const roles = parseFullstats(html)!;
    expect(roles.blue[0]).toEqual({ champion: "KSante", role: "TOP" });
    expect(resolve("KSante")).toBe("ksante");
    expect(resolve("Kaisa")).toBe("kaisa");
    expect(resolve("JarvanIV")).toBe("jarvan-iv");
  });

  it("read the tournament champion table", () => {
    const t = parseChampionTable(fixture("demacia-championlist.html"))!;
    const played = t.rows.filter((r) => (r.picks ?? 0) + (r.bans ?? 0) > 0);
    expect(played.reduce((n, r) => n + r.picks!, 0)).toBe(390);
    expect(t.rows.find((r) => r.name === "Nocturne")).toMatchObject({ picks: 2, bans: 36, wins: 2, losses: 0 });
  });
});

describe("first pick (draft order since 2026)", () => {
  // Real Gol.gg pages: the "First Pick" mark sits on red in three of these four games, so blue is never assumed.
  it.each([["83452", "red"], ["83540", "red"], ["83541", "red"], ["83542", "blue"]])("game %s: %s picked first", (id, side) => {
    const page = parseGamePage(fixture(`game-${id}-game.html`));
    expect(firstPickOf(page)).toBe(side);
    const other = side === "blue" ? "red" : "blue";
    expect(page[side as "blue"]?.pickGroups).toEqual([1, 2, 2]);
    expect(page[other as "blue"]?.pickGroups).toEqual([2, 2, 1]);
  });
  it("is left unset when the mark is missing or the turns do not match the draft", () => {
    const page = parseGamePage(fixture("game-83542-game.html"));
    expect(firstPickOf({ ...page, blue: { ...page.blue, firstPick: false } })).toBeUndefined();
    expect(firstPickOf({ ...page, red: { ...page.red, firstPick: true } })).toBeUndefined();
    expect(firstPickOf({ ...page, blue: { ...page.blue, pickGroups: [2, 2, 1] } })).toBeUndefined();
  });
});

describe("game records", () => {
  const page = parseGamePage(fixture("game-83540-game.html"));
  const stats = parseFullstats(fixture("game-83540-fullstats.html"));
  const expectFor = { tournament: DEMACIA, event: "demacia-cup-2026", seriesId: 83540, teams: ["JD Gaming", "Natus Vincere"] as [string, string] };

  it("hold sides, result, all ten picks by role, bans, patch, date and the exact source URL", () => {
    const { game } = buildGame(83540, page, stats, expectFor, resolve, "2026-10-11");
    expect(game).toMatchObject({
      id: 83540, seriesId: 83540, series: "NAVI vs JD Gaming", game: 1, date: "2026-10-08", patch: "16.18", winner: "red",
      blue: { team: "JD Gaming", picks: { TOP: "galio", JUNGLE: "qiyana", MID: "locke", BOT: "ashe", SUPPORT: "seraphine" } },
      red: { team: "Natus Vincere", picks: { TOP: "rumble", JUNGLE: "jarvan-iv", MID: "ryze", BOT: "jhin", SUPPORT: "nautilus" }, bans: ["syndra", "ezreal", "olaf", "ksante", "ornn"] },
      url: "https://gol.gg/game/stats/83540/page-game/",
    });
    expect(Files["pro-games.json"].shape.games.element.safeParse(game).success).toBe(true);
  });

  it("are rejected when a field is missing or the pages disagree, never filled in", () => {
    const noRoles = buildGame(83540, page, undefined, expectFor, resolve, "2026-10-11");
    expect(noRoles.problems).toBeDefined();
    const swapped = structuredClone(stats)!;
    swapped.blue[0].champion = "Aatrox"; // role table no longer matches the drafted champions
    expect(buildGame(83540, page, swapped, expectFor, resolve, "2026-10-11").problems?.join()).toMatch(/disagree/);
    const noResult = { ...page, red: { ...page.red!, result: undefined } };
    expect(buildGame(83540, noResult, stats, expectFor, resolve, "2026-10-11").problems?.join()).toMatch(/result/);
    expect(buildGame(83540, { ...page, patch: undefined }, stats, expectFor, resolve, "2026-10-11").problems?.join()).toMatch(/patch/);
    expect(buildGame(83540, page, stats, { ...expectFor, tournament: "LCK 2026 Season Playoffs" }, resolve, "2026-10-11").problems).toBeDefined();
    expect(buildGame(83540, page, stats, { ...expectFor, teams: ["JD Gaming", "T1"] }, resolve, "2026-10-11").problems?.join()).toMatch(/match list/);
  });

  it("a series whose recorded wins contradict its score is rejected", () => {
    const { game } = buildGame(83540, page, stats, expectFor, resolve, "2026-10-11");
    const series = { id: 83540, title: "NAVI vs JD Gaming", team1: "JD Gaming", team2: "Natus Vincere", score: [0, 1] as [number, number], stage: "ROUND4" };
    expect(seriesProblems(series, [game!])).toEqual([]);
    expect(seriesProblems({ ...series, score: [1, 0] }, [game!])).toHaveLength(1);
  });

  it("feed the site as two drafts, one verified source and one result per game", () => {
    const { game } = buildGame(83540, page, stats, expectFor, resolve, "2026-10-11");
    const drafts = draftsFromGames([game!]);
    expect(drafts).toHaveLength(2);
    expect(new Set(drafts.flatMap((d) => d.sources))).toEqual(new Set([gameSourceId(game!)]));
    expect(drafts.find((d) => d.side === "red")).toMatchObject({ team: "Natus Vincere", opponent: "JD Gaming", won: true, seriesGame: "NAVI vs JD Gaming G1", stage: "Round 4" });
    expect(sourcesFromGames([game!], [])[0]).toMatchObject({ refreshStatus: "verified", origin: "golgg-refresh", lastChecked: "2026-10-11", date: "2026-10-08" });
    expect(sourcesFromGames([game!], [{ id: gameSourceId(game!) } as never])).toEqual([]);
    expect(resultsFromGames([game!], [])).toEqual([{ game: "golgg-game-83540", winner: "Natus Vincere", sources: ["golgg-game-83540"] }]);
    expect(stageLabel("QUARTERFINALS")).toBe("Quarterfinals");
  });
});

describe("daily refresh", () => {
  it("imports new completed games from tracked tournaments only", async () => {
    const { get, asked } = recorder();
    const out = await refresh(baseData(), get, { now: NOW, maxBuildGames: 0 });
    expect(out.proGames.games.map((g) => g.id)).toEqual([83452]);
    expect(out.changed).toEqual(["demacia-cup-2026"]);
    expect(out.report.join("\n")).toMatch(/Worlds 2026: not listed on Gol.gg yet/);
    // Every request is the season list or a Demacia Cup page; nothing for the LCK playoffs or any other event.
    for (const u of asked) expect(u === urls.list || u.includes("Demacia%20Cup") || /game\/stats\/83452\//.test(u), u).toBe(true);
    expect(asked.join()).not.toMatch(/LCK/);
    const t = out.proGames.tournaments[0];
    expect(t).toMatchObject({ event: "demacia-cup-2026", status: "ongoing", recorded: 1, games: 1, lastUpdate: NOW.toISOString(), lastCheck: NOW.toISOString() });
    expect(Files["pro-games.json"].safeParse(out.proGames).success).toBe(true);
  });

  it("never computes tournament totals from a partial sample", async () => {
    const before = baseData();
    const out = await refresh(before, recorder().get, { now: NOW, maxBuildGames: 0 });
    // The saved champion table covers 39 games, the shortened match list 1: the totals are refused and kept as they were.
    expect(out.rejected.join()).toMatch(/tournament totals not updated/);
    const ev = (m: typeof before.meta) => m.events.find((e) => e.id === "demacia-cup-2026")!;
    expect(ev(out.meta).stats).toEqual(ev(before.meta).stats);
    expect(ev(out.meta).games).toBe(ev(before.meta).games);
  });

  it("is idempotent: a second run finds nothing new, requests no game pages and changes nothing", async () => {
    const first = await refresh(baseData(), recorder().get, { now: NOW, maxBuildGames: 0 });
    const { get, asked } = recorder();
    const second = await refresh({ ...baseData(), proGames: first.proGames, meta: first.meta, sources: first.sources }, get, { now: new Date("2026-10-12T12:00:00Z"), maxBuildGames: 0 });
    expect(second.changed).toEqual([]);
    expect(second.proGames).toEqual(first.proGames); // the check time is stored only with a data change
    expect(asked.filter((u) => u.includes("/game/stats/"))).toEqual([]);
  });

  it("confirms a supplied game link only when the recorded game shows the claimed duo", async () => {
    const out = await refresh(baseData(), recorder().get, { now: NOW, maxBuildGames: 0 });
    const s = out.sources.find((x) => x.id === "golgg-game-83452")!;
    expect(s.pendingClaim).toBeUndefined();
    expect(s).toMatchObject({ refreshStatus: "verified", origin: "golgg-refresh", lastChecked: "2026-10-11" });
    const game = out.proGames.games[0];
    expect(game.blue.picks).toMatchObject({ BOT: "ezreal", SUPPORT: "karma" });
  });

  it("stops on a refused request and returns nothing to write", async () => {
    const get: Get = async () => { throw new Error("HTTP 403"); };
    await expect(refresh(baseData(), get, { now: NOW, maxBuildGames: 0 })).rejects.toThrow(/403/);
  });

  it("does not request a finished tournament again", async () => {
    const data = baseData();
    data.proGames.tournaments = data.proGames.tracked.map((t) => ({ event: t.event, golgg: t.names[0], status: "complete" as const, series: 1, seriesPlayed: 1, games: 1, recorded: 1,
      matchlist: urls.matchlist(t.names[0]), lastUpdate: null, lastCheck: null }));
    const { get, asked } = recorder();
    const out = await refresh(data, get, { now: NOW, maxBuildGames: 0 });
    expect(asked).toEqual([]);
    expect(out.changed).toEqual([]);
  });

  it("marks a tournament finished once every series is played and the final is in", () => {
    const s = (stage: string, score?: [number, number], date = "2026-10-17") => ({ id: 1, title: "", team1: "a", team2: "b", stage, score, date });
    expect(isComplete([s("FINAL", [3, 1]), s("SEMIFINALS", [3, 0])], "2026-10-17")).toBe(true);
    expect(isComplete([s("FINAL"), s("SEMIFINALS", [3, 0])], "2026-10-17")).toBe(false);
    expect(isComplete([s("ROUND4", [1, 0], "2026-10-01")], "2026-10-09")).toBe(true);
    expect(isComplete([s("ROUND4", [1, 0], "2026-10-08")], "2026-10-09")).toBe(false);
  });

  it("only ever writes pro-evidence files", () => {
    const src = readFileSync(join(process.cwd(), "scripts/refresh-pro-data.mjs"), "utf8");
    const written = [...src.matchAll(/write\("([^"]+)"|join\(dataDir, "([^"]+)"\), compactJson/g)].map((m) => m[1] ?? m[2]).sort();
    expect(written).toEqual(["build-assets.json", "meta.json", "pro-builds.json", "pro-games.json", "sources.json"]);
    const wf = readFileSync(join(process.cwd(), ".github/workflows/refresh-pro-data.yml"), "utf8");
    // The workflow stages the evidence files plus the one stored derived dataset, the Comp Library's discovered comps,
    // regenerated from the new lineups (alan, 2026-10-14); saved pairings, pool tiers and proposed synergy never.
    expect(wf).toMatch(/git add data\/pro-games\.json data\/meta\.json data\/sources\.json data\/pro-builds\.json data\/build-assets\.json data\/discovered-comps\.json reports\/comp-discovery\.md\n/);
    expect(wf).toMatch(/run: npx tsx scripts\/discover-comps\.ts\n/);
    expect(wf.indexOf("scripts/discover-comps.ts")).toBeLessThan(wf.indexOf("run: npm test"));
  });

  it("never counts a schedule that stopped at the time gate as a check", () => {
    const run = (start: string, seconds: number) => ({ run_started_at: start, updated_at: new Date(Date.parse(start) + seconds * 1000).toISOString() });
    // Newest first, as GitHub lists them: an 8-second gate skip, then the last run that really read Gol.gg.
    expect(lastCheckedRun([run("2026-10-14T06:08:30Z", 8), run("2026-10-13T19:51:41Z", 150)])).toBe("2026-10-13T19:54:11.000Z");
    expect(lastCheckedRun([run("2026-10-14T06:08:30Z", 8)])).toBeNull();
    // A real check that found nothing new is short but still a check (2026-10-14 17:08 UTC, 24 seconds).
    expect(lastCheckedRun([run("2026-10-14T18:00:21Z", 6), run("2026-10-14T17:08:44Z", 24)])).toBe("2026-10-14T17:09:08.000Z");
    expect(lastCheckedRun(undefined)).toBeNull();
  });

  it("follows only Demacia Cup 2026 and Worlds 2026", () => {
    const tracked = Files["pro-games.json"].parse(raw("pro-games.json")).tracked;
    expect(tracked.map((t) => t.event)).toEqual(["demacia-cup-2026", "worlds-2026", "worlds-2026-play-in"]);
    for (const n of tracked.flatMap((t) => t.names)) expect(n).toMatch(/^(Demacia Cup Global Invitational 2026|World(s| Championship)\b.*2026.*)$/);
  });

  it("freshness says which tournaments are listed, ongoing or finished", () => {
    const f = freshness(empty);
    expect(f.map((x) => [x.label, x.listed])).toEqual([["Demacia Cup", false], ["Worlds 2026", false], ["Worlds 2026 Play-In", false]]);
  });
});
