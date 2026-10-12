// Pinned Players (alan, 2026-10-12): profiles are derived from the Pro Builds rows only, keyed by Gol.gg player id.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  championBuildsHref, expandedRow, gameHref, inPlayerScope, migratePins, playerDirectory, playerProfile, profileHref, rowsOfPlayer, togglePin,
} from "@/lib/pinned-players";
import { buildRows, scoped, type BuildRow } from "@/lib/pro-builds";
import { Files, type BuildAssets, type ProBuild, type ProBuilds, type ProGame, type ProGames } from "@/lib/schema";

const picks = (x: string) => ({ TOP: `${x}top`, JUNGLE: `${x}jg`, MID: `${x}mid`, BOT: `${x}bot`, SUPPORT: `${x}sup` });
const game = (id: number, date: string, patch: string, event: string, blue: string, red: string, winner: "blue" | "red", botBlue = "jhin"): ProGame => ({
  id, event, tournament: event, seriesId: id, series: `${blue} vs ${red}`, game: 1, date, patch,
  blue: { team: blue, picks: { ...picks("b"), BOT: botBlue }, bans: [] }, red: { team: red, picks: picks("r"), bans: [] },
  winner, url: `https://gol.gg/game/stats/${id}/page-game/`, rolesUrl: `https://gol.gg/game/stats/${id}/page-fullstats/`, checkedOn: date,
} as ProGame);
const build = (g: ProGame, player: string, playerId: number, side: "blue" | "red" = "blue"): ProBuild =>
  ({ game: g.id, side, role: "BOT", champion: g[side].picks.BOT, player, playerId, checkedOn: g.date } as ProBuild);

const g1 = game(1, "2026-10-03", "16.18", "demacia-cup-2026", "GAM", "T1", "blue");
const g2 = game(2, "2026-10-05", "16.18", "demacia-cup-2026", "GAM", "BLG", "red", "ashe");
const g3 = game(3, "2026-09-01", "16.16", "lck-2026-playoffs", "KT", "GEN", "blue", "aphelios");
const g4 = game(4, "2026-10-06", "16.18", "demacia-cup-2026", "T1", "GAM", "blue");
const builds = [build(g1, "Artemis", 10), build(g2, "Artemis", 10), build(g3, "Artemis", 10), build(g1, "Gumayusi", 20, "red"),
  build(g4, "Artemis", 30)]; // a second player also named Artemis
const rows = buildRows(builds, [g1, g2, g3, g4], {});

describe("player profiles", () => {
  it("collect every recorded game of one player id, newest first, with results from the game records", () => {
    const p = playerProfile(rows, "10");
    expect(p).toMatchObject({ name: "Artemis", team: "GAM", teams: ["GAM", "KT"], role: "BOT", games: 3, wins: 2, losses: 1 });
    expect(p.recent).toEqual([false, true, true]);
    // Most games first, then the most recently played.
    expect(p.champions.map((c) => [c.champion, c.games])).toEqual([["ashe", 1], ["jhin", 1], ["aphelios", 1]]);
    expect(p.last?.game.id).toBe(2);
  });

  it("keep two players with the same name apart, and label them by team in the picker", () => {
    expect(playerProfile(rows, "30").games).toBe(1);
    expect(playerProfile(rows, "10").games).toBe(3);
    const labels = playerDirectory(rows).filter((p) => p.name === "Artemis").map((p) => p.label).sort();
    expect(labels).toEqual(["Artemis (GAM)", "Artemis (T1)"]);
  });

  it("keep one profile across a team change", () => {
    const p = playerProfile(rows, "10");
    expect(p.teams).toEqual(["GAM", "KT"]);
    expect(new Set(rowsOfPlayer(rows, "10").map((r) => r.build.playerId))).toEqual(new Set([10]));
  });

  it("filter by tournament and patch, and stay listed with zero games when nothing matches", () => {
    expect(playerProfile(rows, "10", { event: "lck-2026-playoffs" })).toMatchObject({ games: 1, team: "KT", wins: 1 });
    expect(playerProfile(rows, "10", { patch: "26.18" }).games).toBe(2); // Riot's spelling matches Gol.gg's 16.18
    const empty = playerProfile(rows, "20", { event: "lck-2026-playoffs" });
    expect(empty).toMatchObject({ id: "20", name: "Gumayusi", games: 0, champions: [], recent: [] });
    expect(playerProfile([], "99", {}, "Saved name")).toMatchObject({ name: "Saved name", games: 0 });
  });

  it("pick up a newly recorded game on its own", () => {
    const g5 = game(5, "2026-10-09", "16.18", "worlds-2026", "GAM", "HLE", "blue", "varus");
    const more = buildRows([...builds, build(g5, "Artemis", 10)], [g1, g2, g3, g4, g5], {});
    const p = playerProfile(more, "10");
    expect(p.games).toBe(4);
    expect(p.last?.game.id).toBe(5);
    expect(p.champions.map((c) => c.champion)).toContain("varus");
  });

  it("open the exact Pro Builds game for that player, and the player's champion builds", () => {
    const r = rowsOfPlayer(rows, "10").find((x) => x.game.id === 3)!;
    expect(gameHref(r)).toBe("/pro-builds/?champion=aphelios&role=BOT&game=3&player=10");
    const url = new URLSearchParams(gameHref(r).split("?")[1]);
    const shown = scoped(rows, { champion: url.get("champion")!, role: "BOT", player: url.get("player")! });
    expect(shown.map((x) => x.key)).toEqual([r.key]);
    expect(championBuildsHref("10", "jhin", "BOT", "compare")).toBe("/pro-builds/?champion=jhin&role=BOT&player=10&mode=compare");
    expect(profileHref("10")).toBe("/pro-builds/pinned/?player=10");
  });

  it("a player filter by id never mixes two players with one name; an old name link still works", () => {
    expect(scoped(rows, { player: "30" }).every((r: BuildRow) => r.build.playerId === 30)).toBe(true);
    expect(scoped(rows, { player: "Artemis" })).toHaveLength(4);
  });
});

describe("expanded match", () => {
  const mine = rowsOfPlayer(rows, "10");
  it("is named by the game id among the rows the filters show, never by position", () => {
    expect(expandedRow(mine, "3")?.game.id).toBe(3);
    expect(expandedRow(mine, "3")?.build.playerId).toBe(10);
    expect(expandedRow(mine.filter((r) => inPlayerScope(r, { champion: "ashe" })), "3")).toBeUndefined(); // filtered out: collapsed
    expect(expandedRow(mine.filter((r) => inPlayerScope(r, { champion: "aphelios" })), "3")?.game.id).toBe(3);
    expect(expandedRow(mine, undefined)).toBeUndefined();
    expect(expandedRow(mine, "4")).toBeUndefined(); // game 4 is the other Artemis's
  });
  it("stays on the same game when rows reorder or another game is added", () => {
    const g5 = game(5, "2026-10-09", "16.18", "worlds-2026", "GAM", "HLE", "blue", "varus");
    const more = rowsOfPlayer(buildRows([build(g5, "Artemis", 10), ...builds], [g5, g1, g2, g3, g4], {}), "10");
    expect(expandedRow(more, "3")?.key).toBe(expandedRow(mine, "3")?.key);
  });
});

describe("pins", () => {
  it("pin and unpin several players", () => {
    let pins: string[] = [];
    pins = togglePin(pins, "10");
    pins = togglePin(pins, "20");
    expect(pins).toEqual(["10", "20"]);
    pins = togglePin(pins, "10");
    expect(pins).toEqual(["20"]);
  });

  it("persist through storage: what is saved reads back the same", () => {
    const store = new Map<string, string>();
    store.set("pro-builds:pinned-players", JSON.stringify(togglePin(togglePin([], "10"), "30")));
    expect(JSON.parse(store.get("pro-builds:pinned-players")!)).toEqual(["10", "30"]);
  });

  it("pins saved by name move to the id of the most recent player with that name, once, without duplicates", () => {
    expect(migratePins(["Artemis", "Gumayusi", "20"], rows)).toEqual(["30", "20"]);
    expect(migratePins(["Unknown"], rows)).toEqual(["Unknown"]); // kept until a recorded game names them
    expect(migratePins(["10"], rows)).toEqual(["10"]);
  });
});

describe("stored data", () => {
  const raw = (f: string) => JSON.parse(readFileSync(join(process.cwd(), "data", f), "utf8"));
  const b = Files["pro-builds.json"].parse(raw("pro-builds.json")) as ProBuilds;
  const g = Files["pro-games.json"].parse(raw("pro-games.json")) as ProGames;
  const a = Files["build-assets.json"].parse(raw("build-assets.json")) as BuildAssets;
  const all = buildRows(b.builds, [...g.games, ...(b.games ?? [])], a.patches);

  it("every recorded player has an id, and one id is one player per game", () => {
    for (const r of all) expect(r.build.playerId).toBeGreaterThan(0);
    const seen = new Set(all.map((r) => `${r.game.id}-${r.build.playerId}`));
    expect(seen.size).toBe(all.length);
  });

  it("profiles count exactly the player's recorded games", () => {
    const id = String(all[0].build.playerId);
    expect(playerProfile(all, id).games).toBe(all.filter((r) => String(r.build.playerId) === id).length);
  });
});
