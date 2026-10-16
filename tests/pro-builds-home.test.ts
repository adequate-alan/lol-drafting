// Pro Builds overview and navigation precedence (alan, 2026-10-13): explicit URL parameters open the exact record, links
// from other features are URL parameters too, and /pro-builds/ with nothing asked is the overview: never a default
// champion, never a champion reopened from storage.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildRows, championIndex } from "@/lib/pro-builds";
import {
  addViewed, browse, defaultGame, buildPatches, latestPatch, readViewed, recentBuilds, recordFor, selectionOf, RECENT_MAX,
} from "@/lib/pro-builds-home";
import type { ProBuild, ProGame } from "@/lib/schema";

const picks = (x: string) => ({ TOP: `${x}top`, JUNGLE: `${x}jg`, MID: `${x}mid`, BOT: `${x}bot`, SUPPORT: `${x}sup` });
const game = (id: number, date: string, patch: string, blue: string, red: string, botBlue: string): ProGame => ({
  id, event: "ev", tournament: "ev", seriesId: id, series: `${blue} vs ${red}`, game: 1, date, patch,
  blue: { team: blue, picks: { ...picks("b"), BOT: botBlue }, bans: [] }, red: { team: red, picks: picks("r"), bans: [] },
  winner: "blue", url: "", rolesUrl: "", checkedOn: date,
} as ProGame);
const build = (g: ProGame, role: "BOT" | "MID", player: string, playerId: number, side: "blue" | "red" = "blue"): ProBuild =>
  ({ game: g.id, side, role, champion: g[side].picks[role], player, playerId, checkedOn: g.date } as ProBuild);

const g1 = game(1, "2026-09-01", "16.16", "KT", "GEN", "aphelios");
const g2 = game(2, "2026-10-03", "16.18", "GAM", "T1", "jhin");
const g3 = game(3, "2026-10-05", "16.18", "GAM", "BLG", "ashe");
const g4 = game(4, "", "16.18", "T1", "HLE", "jhin"); // no date recorded
const builds = [build(g1, "BOT", "Deft", 1), build(g2, "BOT", "Artemis", 10), build(g2, "MID", "Faker", 7, "red"), build(g3, "BOT", "Artemis", 10), build(g4, "BOT", "Gumayusi", 20)];
const games = [g1, g2, g3, g4];
const rows = buildRows(builds, games, {});
const index = championIndex(builds, games);
const name = (id: string) => id;

describe("what a Pro Builds URL opens", () => {
  it("no parameters is the overview, whatever has the most games", () => {
    expect(selectionOf({}, index)).toEqual({ kind: "home", game: undefined });
    // Filters alone (the overview's patch and role) stay on the overview.
    expect(selectionOf({ role: "MID" }, index).kind).toBe("home");
  });

  it("an explicit champion and role open that champion in that role", () => {
    const s = selectionOf({ champion: "jhin", role: "BOT" }, index);
    expect(s).toMatchObject({ kind: "champion", champion: "jhin", role: "BOT" });
    // Role in any case; an unknown role falls back to the champion's recorded role.
    expect(selectionOf({ champion: "jhin", role: "bot" }, index)).toMatchObject({ role: "BOT" });
    expect(selectionOf({ champion: "jhin", role: "TOP" }, index)).toMatchObject({ kind: "champion", role: "BOT" });
  });

  it("from Draft Room the asked role is exact: no builds there is an empty state, not another role", () => {
    const s = selectionOf({ champion: "jhin", role: "SUPPORT", from: "bot=jhin" }, index);
    expect(s).toMatchObject({ kind: "champion", champion: "jhin", role: "SUPPORT", entry: undefined });
    expect(selectionOf({ champion: "caitlyn", role: "BOT", from: "bot=caitlyn" }, index)).toMatchObject({ kind: "champion", entry: undefined, roles: [] });
  });

  it("an explicit champion without recorded builds is named, never replaced by another champion", () => {
    expect(selectionOf({ champion: "ryze" }, index)).toEqual({ kind: "missing", champion: "ryze", role: undefined });
  });

  it("a game and player without a champion select that exact recorded build", () => {
    expect(selectionOf({ game: "2", player: "7" }, index)).toEqual({ kind: "record", game: "2", player: "7" });
    expect(recordFor(rows, "2", "7")?.build).toMatchObject({ champion: "rmid", role: "MID", player: "Faker" });
    expect(recordFor(rows, undefined, "10")?.game.id).toBe(3); // the player's newest game
    expect(recordFor(rows, "1", "10")).toBeUndefined(); // not that player's game
    expect(selectionOf({ game: "2" }, index)).toEqual({ kind: "home", game: "2" }); // a game alone lists its builds
  });
});

describe("overview", () => {
  it("opens on the newest patch with recorded builds, in Riot's spelling", () => {
    expect(latestPatch(index)).toBe("26.18");
    expect(buildPatches(index)).toEqual(["26.18", "26.16"]);
  });

  it("browses champions by name with per-patch game counts, and finds players", () => {
    expect(browse(index, { patch: "26.18" }, name).map((b) => [b.entry.champion, b.games])).toEqual([["ashe", 1], ["jhin", 2], ["rmid", 1]]);
    expect(browse(index, {}, name).map((b) => b.entry.champion)).toContain("aphelios");
    expect(browse(index, { role: "MID" }, name).map((b) => b.entry.champion)).toEqual(["rmid"]);
    expect(browse(index, { q: "arte" }, name).map((b) => [b.entry.champion, b.player])).toEqual([["ashe", "Artemis"], ["jhin", "Artemis"]]);
  });

  it("lists recent builds newest game first by date (alan, 2026-10-16), with undated games after every dated one", () => {
    expect(recentBuilds(rows, {}, name).map((r) => r.game.id)).toEqual([3, 2, 2, 1, 4]);
    expect(recentBuilds(rows, { patch: "26.16" }, name).map((r) => r.build.player)).toEqual(["Deft"]);
    expect(recentBuilds(rows, { q: "faker" }, name).map((r) => r.build.player)).toEqual(["Faker"]);
    expect(recentBuilds(rows, { game: "2" }, name)).toHaveLength(2);
  });

  it("keeps recently viewed as shortcuts: newest first, one per champion and role, capped", () => {
    let list = addViewed([], { champion: "jhin", role: "BOT", game: 2 });
    list = addViewed(list, { champion: "ashe", role: "BOT" });
    list = addViewed(list, { champion: "jhin", role: "BOT", game: 4 });
    expect(list).toEqual([{ champion: "jhin", role: "BOT", game: 4 }, { champion: "ashe", role: "BOT" }]);
    for (let i = 0; i < 20; i++) list = addViewed(list, { champion: `c${i}`, role: "MID" });
    expect(list).toHaveLength(RECENT_MAX);
    expect(readViewed("not json")).toEqual([]);
    expect(readViewed(JSON.stringify([{ champion: "jhin", role: "BOT" }, { champion: 3 }, { champion: "x", role: "NOPE" }]))).toEqual([{ champion: "jhin", role: "BOT" }]);
  });
});

describe("default game: pinned players first (alan, 2026-10-13)", () => {
  // Ashe-style case: a pinned player with older games on the champion, a newer game from someone else.
  const h1 = game(11, "2026-09-02", "16.16", "GEN", "KT", "ashe");
  const h2 = game(12, "2026-09-04", "16.16", "GEN", "T1", "ashe");
  const h3 = game(13, "2026-10-06", "16.18", "BLG", "TES", "ashe");
  const h4 = game(14, "2026-10-08", "16.18", "TES", "BLG", "ashe");
  const ashe = buildRows([build(h1, "BOT", "Ruler", 100), build(h2, "BOT", "Ruler", 100), build(h3, "BOT", "Elk", 200), build(h4, "BOT", "JackeyLove", 300)], [h1, h2, h3, h4], {});
  const ids = (r?: { game: { id: number } }) => r?.game.id;

  it("opens the pinned player's newest game on the champion, even on an older patch", () => {
    expect(ids(defaultGame(ashe, {}, ["100"]))).toBe(12);
    expect(ashe).toHaveLength(4); // everyone else's games stay in the selector
  });
  it("falls back to the newest game when nobody pinned played it, or after unpinning", () => {
    expect(ids(defaultGame(ashe, {}, []))).toBe(14);
    expect(ids(defaultGame(ashe, {}, ["999"]))).toBe(14);
  });
  it("with several pinned players, takes the one who played it most recently, not the one with most games", () => {
    expect(ids(defaultGame(ashe, {}, ["100", "200"]))).toBe(13);
  });
  it("keeps an explicit game, and a chosen player is never replaced by a pin", () => {
    expect(ids(defaultGame(ashe, { game: "11" }, ["200"]))).toBe(11);
    const elk = ashe.filter((r) => r.build.playerId === 200);
    expect(ids(defaultGame(elk, { player: "200" }, ["100"]))).toBe(13);
    expect(ids(defaultGame(ashe, { game: "999" }, ["100"]))).toBe(12); // a stale game falls back to the default
  });
  it("stays inside the active filters: a patch without the pinned player's games keeps that patch", () => {
    const on1618 = ashe.filter((r) => r.game.patch === "16.18");
    expect(ids(defaultGame(on1618, {}, ["100"]))).toBe(14);
  });
});

describe("the page itself", () => {
  const view = readFileSync(join(process.cwd(), "components/views/ProBuildsView.tsx"), "utf8");
  it("never picks a default champion and never reads the recently viewed list to choose one", () => {
    expect(view).not.toMatch(/index\[0\]/);
    expect(view).not.toMatch(/readViewed\([^)]*\)[\s\S]{0,80}(update|choose)\(/);
  });
});
