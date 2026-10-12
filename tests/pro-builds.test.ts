// Pro Builds (alan, 2026-10-12): parsing Gol.gg's build answer, the Data Dragon name and icon mapping, the stored data,
// the summaries the drawer shows, and the refresh step that collects them. Fixtures: the game page and Xiaoxu's Yorick
// build from Demacia Cup game 83452 (BRO vs JD Gaming), saved from a GitHub runner on 2026-10-12, and a subset of Riot's
// Data Dragon 16.18.1 files (tests/fixtures/ddragon).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assetsFor, buildFromAnswer, buildUrl, compactJson, ddragonVersionFor, parsePlayers, referencedIds } from "@/scripts/golgg/builds.mjs";
import { championResolver } from "@/scripts/golgg/normalize.mjs";
import { CDRAGON_PERKS, refresh, type Get } from "@/scripts/golgg/refresh.mjs";
import { buildRows, common, itemTip, overview, rowsFor, shopVisits, skillSummary } from "@/lib/pro-builds";
import { Files, ProBuild, type BuildAssets, type ProBuilds, type ProGames } from "@/lib/schema";

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
const raw = <T,>(f: string): T => JSON.parse(read(`data/${f}`));
const champions = Files["champions.json"].parse(raw("champions.json"));
const resolve = championResolver(champions);
const answer = JSON.parse(read("tests/fixtures/golgg/build-83452-4918.json"));
const dd = JSON.parse(read("tests/fixtures/ddragon/16.18.1-subset.json"));
const who = { game: 83452, side: "blue" as const, role: "TOP" as const, champion: "yorick", player: "Xiaoxu", playerId: 4918 };
const yorick = { ...buildFromAnswer(answer, who).build!, checkedOn: "2026-10-12" } as ProBuild;
const assets = assetsFor(referencedIds([yorick]), "16.18.1", dd, resolve).assets;

describe("Gol.gg build answer", () => {
  it("reads the players of a game page with their Gol.gg ids", () => {
    const p = parsePlayers(read("tests/fixtures/golgg/game-83452-game.html"))!;
    expect(p.blue.map((x) => x.player)).toEqual(["Xiaoxu", "xiaofang", "Angel", "GALA", "Vampire"]);
    expect(p.blue[0]).toEqual({ champion: "Yorick", playerId: 4918, player: "Xiaoxu" });
    expect(p.red.map((x) => x.champion)).toEqual(["Jayce", "LeeSin", "Ryze", "MissFortune", "Nautilus"]);
    // The live page nests a rune tooltip table in every player row (saved 2026-10-12, scripts and head removed).
    expect(parsePlayers(read("tests/fixtures/golgg/game-83452-game-live.html"))).toEqual(p);
  });

  it("keeps exactly what the answer shows: spells, final slots, rune page, skill order, purchase log", () => {
    expect(ProBuild.parse(yorick)).toBeTruthy();
    expect(yorick).toMatchObject({
      spells: [4, 12], spellCasts: [3, 6], final: [6665, 3161, 1011, 3078, 3047, 3082], trinket: 3340,
      runes: { primary: 8400, keystone: 8437, primaryRunes: [8446, 8444, 8242], secondary: 8300, secondaryRunes: [8345, 8347], shards: [5005, 5008, 5011] },
      skills: "QEWQQRQEQEREEWWRWW", skillCasts: [201, 25, 71, 8],
    });
    expect(yorick.missing).toBeUndefined();
    expect(yorick.purchases!.slice(0, 3)).toEqual([[3, 2003, "buy"], [3, 1054, "buy"], [3, 3340, "buy"]]);
    // Components merged into an item are not purchases; sells are kept as sells.
    expect(yorick.purchases!.some(([, id, e]) => id === 2031 && e === "sell")).toBe(true);
    expect(answer[1].filter((e: { typeEvent: string }) => e.typeEvent === "ITEM_PURCHASED" || e.typeEvent === "ITEM_SOLD")).toHaveLength(yorick.purchases!.length);
  });

  it("names what is missing instead of filling it in", () => {
    const partial = structuredClone(answer);
    partial[0][0].skillorder = "";
    partial[0][0].perkprimarystyle = null;
    partial[0][0].summoner1Casts = null;
    partial[1] = [];
    const b = buildFromAnswer(partial, who).build!;
    expect(b.missing).toEqual(["runes", "skill order", "purchase timeline"]);
    expect(b.skills).toBeUndefined();
    expect(b.runes).toBeUndefined();
    expect(b.spellCasts).toBeUndefined();
    expect(b.spells).toEqual([4, 12]);
    expect(buildFromAnswer([[]], who).problems).toBeTruthy();
  });

  it("drops an undone purchase", () => {
    const a = [answer[0], [{ build_time: "3", typeEvent: "ITEM_PURCHASED", itemId: "1054" }, { build_time: "4", typeEvent: "ITEM_UNDO", itemId: "1054" }, { build_time: "5", typeEvent: "ITEM_PURCHASED", itemId: "1055" }]];
    expect(buildFromAnswer(a, who).build!.purchases).toEqual([[5, 1055, "buy"]]);
  });
});

describe("Data Dragon names and icons", () => {
  it("maps every id the build uses to its name for the game's patch", () => {
    expect(ddragonVersionFor("16.18", ["16.20.1", "16.19.1", "16.18.1"])).toBe("16.18.1");
    expect(assets.items[6665]).toMatchObject({ name: "Jak'Sho, The Protean", kind: "completed" });
    expect(assets.items[3047].kind).toBe("boots");
    expect(assets.items[3340].kind).toBe("trinket");
    expect(assets.runes[8437].name).toBe("Grasp of the Undying");
    expect(assets.runes[5011]).toMatchObject({ name: "Health", shard: true });
    expect(assets.trees[8400]).toMatchObject({ name: "Resolve" });
    expect(assets.trees[8400].rows[0]).toContain(8437);
    expect(assets.spells).toMatchObject({ 4: { name: "Flash" }, 12: { name: "Teleport" } });
    expect(assets.abilities.yorick.Q).toMatchObject({ name: "Last Rites", maxrank: 5 });
    expect(itemTip(assets, 6665)).toMatch(/^Jak'Sho, The Protean · \d+ gold\n/);
  });

  it("reports ids the patch does not know instead of guessing", () => {
    const { unknown } = assetsFor({ items: new Set([999999]), runes: new Set(), trees: new Set(), spells: new Set([77]), champions: new Set() }, "16.18.1", dd, resolve);
    expect(unknown).toEqual(["item 999999", "summoner spell 77"]);
  });
});

describe("summaries read from one game", () => {
  it("max order follows the levels each ability hit max rank", () => {
    const s = skillSummary("QEWQQRQEQEREEWWRWW", { Q: 5, W: 5, E: 5, R: 3 });
    expect(s).toMatchObject({ order: ["Q", "E", "W"], maxed: ["Q", "E", "W"], levels: 18, first: ["Q", "E", "W"] });
    // A short game: nothing maxed, so the order is by points and says so.
    expect(skillSummary("QEWQQ", { Q: 5, W: 5, E: 5, R: 3 })).toMatchObject({ order: ["Q", "E", "W"], maxed: [], levels: 5 });
    // Champions with six ranks on basic abilities (Data Dragon maxrank), e.g. Jayce: five points is not maxed.
    expect(skillSummary("QWEQQQQ", { Q: 6, W: 6, E: 6, R: 1 }).maxed).toEqual([]);
    expect(skillSummary("RQWEQQQQQ", { Q: 6, W: 6, E: 6, R: 1 })).toMatchObject({ maxed: ["Q"], first: ["R", "Q", "W"] });
  });

  it("separates the purchase order from the final inventory", () => {
    const o = overview(yorick, assets);
    expect(o.starting).toEqual([2003, 1054, 3340]);
    expect(o.boots).toBe(3047);
    expect(o.core).toEqual([3078, 3161, 6665]);
    expect(o.sold.has(1054)).toBe(true);
    expect(yorick.final).toEqual([6665, 3161, 1011, 3078, 3047, 3082]); // end-of-game slots, a different thing
    const v = shopVisits(yorick);
    expect(v[0]).toMatchObject({ at: 3, steps: [{ item: 2003 }, { item: 1054 }, { item: 3340 }] });
    expect(v.flatMap((x) => x.steps)).toHaveLength(yorick.purchases!.length);
  });

  it("joins each build to its game: teams, result, lane opponent", () => {
    const games = Files["pro-games.json"].parse(raw("pro-games.json")).games;
    const g = games.find((x) => x.id === 83452)!;
    const rows = buildRows([yorick], games, { "16.18": assets });
    expect(rows[0]).toMatchObject({ team: g.blue.team, opponentTeam: g.red.team, won: g.winner === "blue", opponent: { champion: g.red.picks.TOP } });
    expect(rowsFor(rows, "yorick", "TOP")).toHaveLength(1);
    expect(rowsFor(rows, "yorick", "JUNGLE")).toHaveLength(0);
  });

  it("a common build counts games, never merges them into one player's build", () => {
    const games = Files["pro-games.json"].parse(raw("pro-games.json")).games;
    const other = { ...yorick, game: 83540, player: "Someone", runes: { ...yorick.runes!, keystone: 8439 } };
    const c = common(buildRows([yorick, other], games, { "16.18": assets }));
    expect(c.games).toBe(2);
    expect([...c.players].sort()).toEqual(["Someone", "Xiaoxu"]);
    expect(c.keystones.map((k) => k.games)).toEqual([1, 1]);
    expect(c.items.find((i) => i.value === 6665)?.games).toBe(2);
    expect(c.maxOrders).toEqual([{ value: "Q → E → W", games: 2 }]);
    expect(c.spells).toEqual([{ value: [4, 12], games: 2 }]);
  });
});

describe("stored builds", () => {
  const builds = Files["pro-builds.json"].parse(raw("pro-builds.json")) as ProBuilds;
  const assetFile = Files["build-assets.json"].parse(raw("build-assets.json")) as BuildAssets;
  const games = Files["pro-games.json"].parse(raw("pro-games.json")) as ProGames;
  const byId = new Map(games.games.map((g) => [g.id, g]));
  const tracked = new Set(games.tracked.map((t) => t.event));

  it("every build belongs to a recorded game of a tracked tournament, on the side and in the role the game shows", () => {
    for (const b of builds.builds) {
      const g = byId.get(b.game);
      expect(g, `${b.game}`).toBeTruthy();
      expect(tracked.has(g!.event)).toBe(true);
      expect(g![b.side].picks[b.role], `${b.game} ${b.side} ${b.role}`).toBe(b.champion);
    }
    const keys = builds.builds.map((b) => `${b.game}-${b.side}-${b.role}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every id a stored build uses has a name in its patch's Data Dragon files", () => {
    for (const b of builds.builds) {
      const a = assetFile.patches[byId.get(b.game)!.patch];
      expect(a, `patch for ${b.game}`).toBeTruthy();
      const ref = referencedIds([b]);
      for (const i of ref.items) expect(a.items[i], `item ${i} in ${b.game}`).toBeTruthy();
      for (const r of ref.runes) expect(a.runes[r], `rune ${r}`).toBeTruthy();
      for (const s of ref.spells) expect(a.spells[s], `spell ${s}`).toBeTruthy();
      expect(a.abilities[b.champion], `abilities ${b.champion}`).toBeTruthy();
    }
  });

  it("writes purchase steps one per line", () => {
    expect(compactJson({ purchases: [[3, 2003, "buy"]] })).toBe('{\n  "purchases": [\n    [3, 2003, "buy"]\n  ]\n}\n');
  });
});

describe("refresh step", () => {
  const base = Files["pro-games.json"].parse(raw("pro-games.json"));
  const proGames = { ...base, games: base.games.filter((g) => g.id === 83452) };
  const data = () => ({
    proGames: structuredClone(proGames), meta: Files["meta.json"].parse(raw("meta.json")), sources: Files["sources.json"].parse(raw("sources.json")),
    champions, botPairings: Files["bot-pairings.json"].parse(raw("bot-pairings.json")),
    proBuilds: { builds: [], unavailable: [] } as ProBuilds, buildAssets: { patches: {} } as BuildAssets,
  });
  const recorder = () => {
    const asked: string[] = [];
    const get: Get = async (url, init) => {
      asked.push(init?.body ? `${url} ${init.body}` : url);
      if (url === "https://gol.gg/game/stats/83452/page-game/") return read("tests/fixtures/golgg/game-83452-game.html");
      if (url === buildUrl) return init?.body?.endsWith("player_id=4918") ? JSON.stringify(answer) : "[[],[]]";
      if (url.endsWith("/api/versions.json")) return JSON.stringify(["16.20.1", "16.18.1"]);
      if (url === CDRAGON_PERKS) return JSON.stringify(dd.cdragonPerks);
      const f = url.split("/").pop()!.replace(".json", "");
      if (dd[f]) return JSON.stringify(dd[f]);
      throw new Error(`not saved: ${url}`);
    };
    return { get, asked };
  };

  it("collects every player of a recorded game, then names and icons, and is idempotent", async () => {
    const r = recorder();
    const out = await refresh(data(), r.get, { now: new Date("2026-10-12T12:00:00Z"), buildsOnly: true });
    expect(out.changed.sort()).toEqual(["build-assets", "pro-builds"]);
    expect(out.proBuilds.builds).toHaveLength(10);
    expect(r.asked.filter((u) => u.startsWith(buildUrl))).toHaveLength(10);
    const y = out.proBuilds.builds.find((b) => b.player === "Xiaoxu")!;
    expect(y).toMatchObject({ champion: "yorick", role: "TOP", side: "blue", skills: "QEWQQRQEQEREEWWRWW", checkedOn: "2026-10-12" });
    // A player Gol.gg has nothing for is stored with what is missing, not filled in.
    expect(out.proBuilds.builds.find((b) => b.player === "Casting")).toMatchObject({ champion: "jayce", role: "TOP", side: "red", missing: ["build"] });
    expect(out.buildAssets.patches["16.18"].ddragon).toBe("16.18.1");
    for (const b of out.proBuilds.builds) expect(ProBuild.parse(b)).toBeTruthy();

    const again = recorder();
    const second = await refresh({ ...data(), proBuilds: out.proBuilds, buildAssets: out.buildAssets }, again.get, { now: new Date("2026-10-13T12:00:00Z"), buildsOnly: true });
    expect(second.changed).toEqual([]);
    expect(again.asked).toEqual([]);
  });

  it("a game with no builds yet is noted and asked again only after a few days", async () => {
    const empty: Get = async (url) => (url === buildUrl ? "[[],[]]" : read("tests/fixtures/golgg/game-83452-game.html"));
    const out = await refresh(data(), empty, { now: new Date("2026-10-12T12:00:00Z"), buildsOnly: true });
    expect(out.proBuilds.builds).toEqual([]);
    expect(out.proBuilds.unavailable).toEqual([{ game: 83452, checkedOn: "2026-10-12", reason: "no build data yet" }]);
    const asked: string[] = [];
    const spy: Get = async (url) => { asked.push(url); return empty(url); };
    await refresh({ ...data(), proBuilds: out.proBuilds }, spy, { now: new Date("2026-10-13T12:00:00Z"), buildsOnly: true });
    expect(asked).toEqual([]);
    await refresh({ ...data(), proBuilds: out.proBuilds }, spy, { now: new Date("2026-10-16T12:00:00Z"), buildsOnly: true });
    expect(asked.length).toBeGreaterThan(0);
  });
});
