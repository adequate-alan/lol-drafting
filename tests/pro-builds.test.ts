// Pro Builds (alan, 2026-10-12): parsing Gol.gg's build answer, the Data Dragon name and icon mapping, the stored data,
// the summaries the drawer shows, and the refresh step that collects them. Fixtures: the game page and Xiaoxu's Yorick
// build from Demacia Cup game 83452 (BRO vs JD Gaming), saved from a GitHub runner on 2026-10-12, and a subset of Riot's
// Data Dragon 16.18.1 files (tests/fixtures/ddragon).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assetsFor, buildFromAnswer, buildUrl, compactJson, ddragonVersionFor, parsePlayers, referencedIds } from "@/scripts/golgg/builds.mjs";
import { championResolver } from "@/scripts/golgg/normalize.mjs";
import { CDRAGON_PERKS, refresh, refreshBuilds, type Get } from "@/scripts/golgg/refresh.mjs";
import { buildRows, buildsHref, championIndex, common, fullRunes, itemTip, overview, rowsFor, scoped, shopVisits, skillSummary } from "@/lib/pro-builds";
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
    expect(c.keystones.counts.map((k) => k.games)).toEqual([1, 1]);
    expect(c.items.counts.find((i) => i.value === 6665)?.games).toBe(2);
    expect(c.maxOrders).toEqual({ of: 2, counts: [{ value: "Q → E → W", games: 2 }] });
    expect(c.spells).toEqual({ of: 2, counts: [{ value: [4, 12], games: 2 }] });
    expect(c.firstItems.counts[0]).toEqual({ value: 3078, games: 2 });
  });
});

describe("missing and partial records", () => {
  const games = Files["pro-games.json"].parse(raw("pro-games.json")).games;

  it("keeps a keystone-only rune page as just that, and says the full page is missing", () => {
    const partial = structuredClone(answer);
    for (const k of ["perk1", "perk2", "perk3", "perk4", "perk5"]) partial[0][0][k] = 0;
    partial[0][0].perksubstyle = 0;
    const b = buildFromAnswer(partial, who).build!;
    expect(b.runes).toEqual({ primary: 8400, keystone: 8437, shards: [5005, 5008, 5011] });
    expect(b.missing).toEqual(["full rune page"]);
    expect(ProBuild.parse({ ...b, checkedOn: "2026-10-12" })).toBeTruthy();
    expect(fullRunes(b.runes)).toBeUndefined();
    expect(fullRunes(yorick.runes)).toBeTruthy();
    // Referenced ids skip what the record does not have.
    expect([...referencedIds([b]).trees]).toEqual([8400]);
  });

  it("full rune aggregates use only complete pages; keystones count every game that recorded one", () => {
    const keystoneOnly = { ...yorick, game: 83540, player: "Partial", runes: { primary: 8400, keystone: 8437 }, missing: ["full rune page"] };
    const noRunes = { ...yorick, game: 83541, player: "None", runes: undefined, missing: ["runes"] };
    const c = common(buildRows([yorick, keystoneOnly, noRunes].filter((b) => games.some((g) => g.id === b.game)) as ProBuild[], games, { "16.18": assets }));
    expect(c.runePages.of).toBe(1);
    expect(c.runePages.counts).toHaveLength(1);
    expect(c.runePages.counts[0].value.primaryRunes).toEqual([8446, 8444, 8242]);
    expect(c.keystones.of).toBe(c.games - (games.some((g) => g.id === 83541) ? 1 : 0));
    expect(c.secondaryTrees.of).toBe(1);
  });

  it("an incomplete game shows what it has: no purchase log means no overview, the final inventory stays", () => {
    const noLog = { ...yorick, purchases: undefined, missing: ["purchase timeline"] };
    const o = overview(noLog, assets);
    expect(o.complete).toBe(false);
    expect(o.core).toEqual([]);
    expect(o.first).toBeUndefined();
    expect(shopVisits(noLog)).toEqual([]);
    expect(noLog.final).toEqual(yorick.final);
  });
});

describe("item chronology and skill levels", () => {
  it("the purchase timeline is in game order, with completed items marked", () => {
    const v = shopVisits(yorick, assets);
    const times = v.flatMap((x) => x.steps.map((s) => s.at));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    for (let i = 1; i < v.length; i++) expect(v[i].at - v[i - 1].steps.at(-1)!.at).toBeGreaterThan(40);
    expect(v.flatMap((x) => x.steps).find((s) => s.item === 6665)?.kind).toBe("completed");
    const o = overview(yorick, assets);
    expect(o.first).toBe(o.core[0]);
    // The core is the first three completed items in purchase order: each bought no later than the next.
    const at = (id: number) => yorick.purchases!.find(([, x, e]) => x === id && e === "buy")![0];
    expect(o.core.map(at)).toEqual([...o.core.map(at)].sort((a, b) => a - b));
  });

  it("skill levels are exactly the recorded points, never extended to 18", () => {
    const s = skillSummary("QEWQQRQE", { Q: 5, W: 5, E: 5, R: 3 });
    expect(s.levels).toBe(8);
    expect(s.points).toEqual({ Q: 4, W: 1, E: 2, R: 1 });
    expect(skillSummary(yorick.skills!).levels).toBe(18);
  });
});

describe("Pro Builds page scope and provenance", () => {
  const stored = Files["pro-builds.json"].parse(raw("pro-builds.json")) as ProBuilds;
  const games = [...Files["pro-games.json"].parse(raw("pro-games.json")).games, ...(stored.games ?? [])]; // tracked + LCK archive
  const all = buildRows(stored.builds, games,
    (Files["build-assets.json"].parse(raw("build-assets.json")) as BuildAssets).patches);

  it("filters by role and by patch in either notation", () => {
    const one = all[0];
    const champ = scoped(all, { champion: one.build.champion, role: one.build.role });
    expect(champ.every((r) => r.build.role === one.build.role && r.build.champion === one.build.champion)).toBe(true);
    const short = scoped(all, { patch: "16.18" }), riot = scoped(all, { patch: "26.18" });
    expect(riot.length).toBe(short.length);
    expect(riot.length).toBeGreaterThan(0);
    expect(scoped(all, { patch: "26.17" })).toHaveLength(all.filter((r) => r.game.patch === "16.17").length);
    const other = (["TOP", "JUNGLE", "MID", "BOT", "SUPPORT"] as const).find((x) => x !== one.build.role)!;
    expect(scoped(all, { champion: one.build.champion, role: other }).every((r) => r.build.role === other)).toBe(true);
  });

  it("every row carries its game source: Gol.gg URL, tournament, patch, date, side, result and the read date", () => {
    for (const r of all) {
      expect(r.game.url).toMatch(/^https:\/\/gol\.gg\/game\/stats\/\d+\//);
      expect(r.game.url).toContain(String(r.game.id));
      expect(r.game.tournament && r.game.patch && r.game.date).toBeTruthy();
      expect(r.side).toBe(r.build.side);
      expect(typeof r.won).toBe("boolean");
      expect(r.build.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.assets, `assets for ${r.key}`).toBeTruthy();
    }
  });

  it("the drawer index counts builds per champion and role, with the newest patch", () => {
    const builds = stored.builds;
    const idx = championIndex(builds, games);
    expect(idx.reduce((n, e) => n + e.games, 0)).toBe(builds.length);
    for (const e of idx) {
      expect(e.games).toBe(rowsFor(all, e.champion, e.role).length);
      // Player names for the rail's player search: exactly the players with a build on this champion and role.
      expect(e.names).toEqual([...new Set(rowsFor(all, e.champion, e.role).map((r) => r.build.player))].sort());
      expect(e.players).toBe(e.names.length);
    }
    expect(buildsHref("jarvan-iv", "JUNGLE", 83447)).toBe("/pro-builds/?champion=jarvan-iv&role=JUNGLE&game=83447");
  });
});

describe("stored builds", () => {
  const builds = Files["pro-builds.json"].parse(raw("pro-builds.json")) as ProBuilds;
  const assetFile = Files["build-assets.json"].parse(raw("build-assets.json")) as BuildAssets;
  const games = Files["pro-games.json"].parse(raw("pro-games.json")) as ProGames;
  const archive = builds.games ?? [];
  const byId = new Map([...games.games, ...archive].map((g) => [g.id, g]));
  const tracked = new Set(games.tracked.map((t) => t.event));
  const archived = new Set(["lck-2026-playoffs"]); // backfilled once, scripts/backfill-lck-builds.mjs

  it("every build belongs to a recorded game of a tracked tournament or the LCK archive, on the side and in the role the game shows", () => {
    for (const b of builds.builds) {
      const g = byId.get(b.game);
      expect(g, `${b.game}`).toBeTruthy();
      expect(tracked.has(g!.event) || archived.has(g!.event), `${b.game} ${g!.event}`).toBe(true);
      expect(g![b.side].picks[b.role], `${b.game} ${b.side} ${b.role}`).toBe(b.champion);
    }
    const keys = builds.builds.map((b) => `${b.game}-${b.side}-${b.role}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("archive game records stay apart from the tracked games: never tracked, never in pro-games.json, each with builds", () => {
    const ids = new Set(games.games.map((g) => g.id));
    const withBuilds = new Set(builds.builds.map((b) => b.game));
    for (const g of archive) {
      expect(tracked.has(g.event), g.event).toBe(false);
      expect(ids.has(g.id), `${g.id}`).toBe(false);
      expect(withBuilds.has(g.id), `${g.id}`).toBe(true);
    }
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

  it("an archive game gets builds only through the one-off backfill, and the daily refresh leaves it alone", async () => {
    const lck = { ...structuredClone(proGames.games[0]), event: "lck-2026-playoffs", tournament: "LCK 2026 Season Playoffs" };
    const d = { ...data(), proGames: { ...structuredClone(proGames), games: [] } };
    const r = recorder();
    const out = await refreshBuilds({ ...d, proBuilds: { builds: [], unavailable: [], games: [lck] } }, r.get, "2026-10-12", Infinity, { only: [lck] });
    expect(out.proBuilds.builds).toHaveLength(10);
    expect(out.buildAssets.patches["16.18"]).toBeTruthy();
    // The daily refresh (tracked games only) asks nothing about it and keeps its builds, record and assets.
    const daily = recorder();
    const next = await refresh({ ...d, proBuilds: out.proBuilds, buildAssets: out.buildAssets }, daily.get, { now: new Date("2026-10-13T12:00:00Z"), buildsOnly: true });
    expect(daily.asked).toEqual([]);
    expect(next.changed).toEqual([]);
    expect(next.proBuilds.games).toEqual([lck]);
  });

  it("a dropped connection during builds keeps the games and stops only the builds pass; a refusal still stops the run", async () => {
    const r = recorder();
    let n = 0;
    const flaky: Get = async (url, init) => {
      if (url === buildUrl && ++n === 4) throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });
      return r.get(url, init);
    };
    const out = await refresh(data(), flaky, { now: new Date("2026-10-12T12:00:00Z"), buildsOnly: true });
    expect(out.proBuilds.builds).toEqual([]); // the half-read game keeps nothing
    expect(out.proBuilds.unavailable).toEqual([]); // and is not marked as having no builds
    expect(out.report.join("\n")).toMatch(/connection to Gol\.gg failed \(ECONNRESET\) after 0 games/);
    const refused: Get = async (url, init) => { if (url === buildUrl) throw new Error(`${url}: HTTP 403. Nothing written.`); return r.get(url, init); };
    await expect(refresh(data(), refused, { now: new Date("2026-10-12T12:00:00Z"), buildsOnly: true })).rejects.toThrow(/403/);
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

  it("a partial record (stats before the timeline) is re-read after a few days and replaced only by a fuller answer", async () => {
    // Gol.gg's answer for a fresh game: the stats without skill order or purchase events.
    const partial = [answer[0].map((p: Record<string, unknown>) => ({ ...p, skillorder: "" })), []];
    const serve = (body: unknown): Get => async (url) => (url === buildUrl ? JSON.stringify(body) : url.includes("/page-game/") ? read("tests/fixtures/golgg/game-83452-game.html") : recorder().get(url));
    const first = await refresh(data(), serve(partial), { now: new Date("2026-10-12T12:00:00Z"), buildsOnly: true });
    expect(first.proBuilds.builds).toHaveLength(10);
    const yorick = first.proBuilds.builds.find((b) => b.player === "Xiaoxu")!;
    expect(yorick.skills).toBeUndefined();
    expect(yorick.missing).toEqual(["skill order", "purchase timeline"]);
    expect(first.proBuilds.unavailable).toEqual([]);
    // The next day nothing is asked.
    const asked: string[] = [];
    const spy = (body: unknown): Get => async (url, init) => { asked.push(url); return serve(body)(url, init); };
    const next = await refresh({ ...data(), proBuilds: first.proBuilds, buildAssets: first.buildAssets }, spy(partial), { now: new Date("2026-10-13T12:00:00Z"), buildsOnly: true });
    expect(asked).toEqual([]);
    expect(next.changed).toEqual([]);
    // Three days on, the same partial answer keeps the stored builds (checked today, so it waits again); nothing is filled in.
    const still = await refresh({ ...data(), proBuilds: first.proBuilds, buildAssets: first.buildAssets }, spy(partial), { now: new Date("2026-10-15T12:00:00Z"), buildsOnly: true });
    expect(asked.filter((u) => u === buildUrl)).toHaveLength(10);
    expect(still.proBuilds.builds.find((b) => b.player === "Xiaoxu")).toMatchObject({ missing: ["skill order", "purchase timeline"], checkedOn: "2026-10-15" });
    expect(still.report.some((l) => /completed/.test(l))).toBe(false);
    // Once Gol.gg has the timeline, the fuller answer replaces the partial builds.
    const full = await refresh({ ...data(), proBuilds: first.proBuilds, buildAssets: first.buildAssets }, serve(answer), { now: new Date("2026-10-15T12:00:00Z"), buildsOnly: true });
    expect(full.proBuilds.builds).toHaveLength(10);
    expect(full.proBuilds.builds.find((b) => b.player === "Xiaoxu")).toMatchObject({ skills: "QEWQQRQEQEREEWWRWW", checkedOn: "2026-10-15" });
    expect(full.proBuilds.builds.find((b) => b.player === "Xiaoxu")!.missing).toBeUndefined();
    expect(full.changed).toContain("pro-builds");
    expect(full.report.some((l) => /1 partial game completed/.test(l))).toBe(true);
    // A game older than three weeks is left as recorded.
    const old = { ...data(), proBuilds: first.proBuilds, buildAssets: first.buildAssets };
    asked.length = 0;
    await refresh(old, spy(answer), { now: new Date("2026-11-20T12:00:00Z"), buildsOnly: true });
    expect(asked).toEqual([]);
  });
});
