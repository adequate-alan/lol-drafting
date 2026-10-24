// Newest professional games first everywhere (alan, 2026-10-16): the shared order in lib/chronology.ts and every game
// history that uses it (Pro Drafts, Pro Builds, Pinned Players match histories, evidence lists). Real-data checks are
// relationships, so daily imports keep passing.
import { describe, expect, it } from "vitest";
import { newestGamesFirst, recordStamp, type GameStamp } from "@/lib/chronology";
import { getBotPairings, getBuildGameRecords, getChampions, getMeta, getPriority, getProDrafts, getProGames, getSources } from "@/lib/data";
import { hubData, recentDrafts } from "@/lib/meta-hub";
import { proGames } from "@/lib/pool-stats";
import { comparePatch } from "@/lib/patch";
import { rows as buildRows } from "@/lib/pro-builds-bundle";
import { pinnedOnChampion, playerKey, playerProfile, rowsOfPlayer } from "@/lib/pinned-players";
import { recentBuilds } from "@/lib/pro-builds-home";
import { bucket, patchesOf, supportingGames } from "@/lib/pro-priority";
import { laneSelections, roleBook } from "@/lib/top-draft";
import type { ProGame } from "@/lib/schema";

type G = GameStamp & { name: string };
const g = (name: string, date: string | undefined, patch: string, series: string, game: number, id: number): G => ({ name, date, patch, series, game, id });
const order = (xs: G[]) => newestGamesFirst(xs, (x) => x).map((x) => x.name);
const shuffle = <T,>(xs: T[], seed: number) => xs.map((x, i) => [((i + 1) * 7919 * seed) % 101, x] as const).sort((a, b) => a[0] - b[0]).map((p) => p[1]);

describe("the shared order", () => {
  // Gol.gg ids deliberately out of play order: the later tournament's games were recorded first.
  const demacia = [g("dem-semi-1", "2026-10-15", "16.18", "dem|semi", 1, 83608), g("dem-semi-2", "2026-10-15", "16.18", "dem|semi", 2, 83609)];
  const worlds = [g("w-a-1", "2026-10-15", "16.20", "w|a", 1, 83593), g("w-a-2", "2026-10-15", "16.20", "w|a", 2, 83594), g("w-b-1", "2026-10-15", "16.20", "w|b", 1, 83598)];
  const earlier = [g("dem-qf-3", "2026-10-14", "16.18", "dem|qf", 3, 83605), g("lck", "2026-09-13", "16.16", "lck|f", 1, 82962)];
  const undated = [g("undated", undefined, "16.20", "x|y", 1, 99999)];
  const all = [...demacia, ...worlds, ...earlier, ...undated];

  it("sorts by date first, then the newer patch on a shared date, never by game id across dates", () => {
    expect(order(all)).toEqual(["w-b-1", "w-a-2", "w-a-1", "dem-semi-2", "dem-semi-1", "dem-qf-3", "lck", "undated"]);
  });

  it("is the same whatever order the items arrive in (import order never matters)", () => {
    for (const seed of [1, 2, 3, 5, 8]) expect(order(shuffle(all, seed))).toEqual(order(all));
  });

  it("keeps a series together in descending game order, even when ids interleave with another series", () => {
    const xs = [g("a1", "2026-10-15", "16.20", "a", 1, 10), g("b1", "2026-10-15", "16.20", "b", 1, 12), g("a2", "2026-10-15", "16.20", "a", 2, 14)];
    expect(order(xs)).toEqual(["a2", "a1", "b1"]);
  });

  it("keeps items of one game together in their arrival order", () => {
    const xs = [g("blue", "2026-10-15", "16.20", "a", 1, 10), g("red", "2026-10-15", "16.20", "a", 1, 10)];
    expect(order(xs)).toEqual(["blue", "red"]);
  });

  it("a filter of the sorted list equals the sorted filter", () => {
    const sorted = newestGamesFirst(all, (x) => x);
    for (const f of [(x: G) => x.patch === "16.18", (x: G) => (x.date ?? "") >= "2026-10-15", (x: G) => x.series.startsWith("w")])
      expect(sorted.filter(f)).toEqual(newestGamesFirst(all.filter(f), (x) => x));
  });
});

/** Every consecutive pair is newest first: date, then newer patch on a shared date, then descending game in a series. */
function expectNewestFirst(stamps: GameStamp[], label: string) {
  for (let i = 1; i < stamps.length; i++) {
    const [a, b] = [stamps[i - 1], stamps[i]];
    const date = (b.date ?? "").localeCompare(a.date ?? "");
    expect(date, `${label}: ${a.id} before ${b.id}`).toBeLessThanOrEqual(0);
    if (date === 0 && a.patch && b.patch) expect(comparePatch(a.patch, b.patch), `${label}: ${a.id} before ${b.id}`).toBeGreaterThanOrEqual(0);
    if (date === 0 && a.series === b.series) expect(a.game ?? 0, `${label}: ${a.id} before ${b.id}`).toBeGreaterThanOrEqual(b.game ?? 0);
  }
}

describe("game histories on the site", () => {
  const records = new Map(getBuildGameRecords().map((r) => [r.id, r]));
  const stampOf = (id: number) => recordStamp(records.get(id)!);

  it("Pro Builds lists every recorded build newest game first, across tournaments", () => {
    expectNewestFirst(buildRows.map((r) => stampOf(r.game.id)), "builds");
    const newest = [...records.values()].filter((r) => buildRows.some((b) => b.game.id === r.id)).map((r) => r.date).sort().at(-1);
    expect(buildRows[0].game.date).toBe(newest);
    expectNewestFirst(recentBuilds(buildRows, {}, (x) => x).map((r) => stampOf(r.game.id)), "recent builds");
    expectNewestFirst(recentBuilds(buildRows, { role: "MID" }, (x) => x).map((r) => stampOf(r.game.id)), "recent builds, MID");
  });

  it("a Worlds Play-In build is listed above the Demacia semifinal builds of the same day", () => {
    const at = (id: number) => buildRows.findIndex((r) => r.game.id === id);
    const w = at(83602), d = at(83612);
    if (w >= 0 && d >= 0) expect(w).toBeLessThan(d);
  });

  it("every player's match history is newest game first, and pinned players rank by their latest game", () => {
    const players = [...new Set(buildRows.map(playerKey))];
    for (const p of players) expectNewestFirst(rowsOfPlayer(buildRows, p).map((r) => stampOf(r.game.id)), `player ${p}`);
    const profile = playerProfile(buildRows, players[0]);
    expect(profile.last).toBe(rowsOfPlayer(buildRows, players[0])[0]);
    const champ = buildRows[0].build.champion;
    const pinned = pinnedOnChampion(buildRows, players, champ, "all");
    const firstIndex = pinned.map((p) => buildRows.indexOf(p.last));
    expect([...firstIndex].sort((a, b) => a - b)).toEqual(firstIndex);
  });

  it("supporting games and lane selections are newest game first", () => {
    const games = getProGames().games as ProGame[];
    const data = getPriority();
    for (const patch of patchesOf(data)) {
      const b = bucket(data, { patch });
      for (const r of b.rows.slice(0, 10)) expectNewestFirst(supportingGames(b, r.id).map((x) => recordStamp(x.game)), `supporting ${r.id} ${patch}`);
    }
    const sel = laneSelections(games, roleBook(getChampions(), games), "TOP");
    expectNewestFirst(sel.map((s) => stampOf(s.game)), "top selections");
  });
  // Meta's Recent drafts, the champion drawer's recorded games and Champion Pool read one list (alan, 2026-10-24): it
  // used to sort the newer patch before the date, so Play-In games of Oct 15 sat above the Demacia final of Oct 17.
  it("Meta recent drafts, the drawer and Champion Pool list their games newest first, date before patch", () => {
    const input = { meta: getMeta(), proDrafts: getProDrafts(), botPairings: getBotPairings(), sources: Object.fromEntries(getSources().map((x) => [x.id, x])) };
    const idOf = (source?: string) => Number(source?.match(/(\d+)$/)?.[1]) || undefined;
    // Each row's own date: a supplied game page without one is undated and listed last.
    const own = (x: { date?: string; patch?: string; gameSource?: string; key: string }, src?: string) => {
      const r = records.get(idOf(src) ?? -1);
      return { date: x.date, patch: x.patch, series: r && x.date === r.date ? recordStamp(r).series : x.key, game: r && x.date === r.date ? r.game : undefined, id: idOf(src) };
    };
    const games = proGames(input);
    expectNewestFirst(games.map((x) => own(x, x.gameSource)), "pro games");
    const dated = games.findLastIndex((x) => x.date);
    expect(games.slice(0, dated + 1).every((x) => x.date)).toBe(true);
    const drafts = recentDrafts(hubData(input));
    expectNewestFirst(drafts.map((x) => own(x, x.key)), "recent drafts");
    const final = drafts.findIndex((x) => x.key === "golgg-game-83618"), playIn = drafts.findIndex((x) => x.key === "golgg-game-83593");
    if (final >= 0 && playIn >= 0) expect(final).toBeLessThan(playIn);
  });
});
