// alan's reviewed Comp Library decisions (data/comp-review.json, 2026-10-16): pro swaps, supporting lineups and
// historical marks. Observed Pro Evidence only: every cited game is recorded and shows the claim, a pro swap needs two
// independent series, and nothing in the review changes a comp's own lineup, its General Draft Logic swaps or any other
// layer.
import { describe, expect, it } from "vitest";
import { buildLibrary } from "@/lib/comp-library";
import { lineupKey, shellPicks, type Picks } from "@/lib/comp-discovery";
import { getBuildGameRecords, getCompReview, getCompShells, getLibrary, getProGames, getSources } from "@/lib/data";
import { comparePatch } from "@/lib/patch";
import { Files, ROLES } from "@/lib/schema";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const review = getCompReview();
const library = getLibrary();
const records = new Map(getBuildGameRecords().map((g) => [g.id, g]));
const shellOf = (id: string) => library.shells.find((s) => s.id === id);
const discovered = Files["discovered-comps.json"].parse(JSON.parse(readFileSync(join(process.cwd(), "data", "discovered-comps.json"), "utf8")));

describe("pro swaps", () => {
  it.each(review.proSwaps.map((p) => [`${p.comp} ${p.role} ${p.champion}`, p] as const))("%s: recorded games show the champion in that slot", (_, p) => {
    const shell = shellOf(p.comp);
    expect(shell, "comp exists").toBeDefined();
    expect(shell!.slots[p.role].champion).not.toBe(p.champion);
    const series = new Set<number>();
    for (const r of p.games) {
      const g = records.get(r.game);
      expect(g, `game ${r.game} recorded`).toBeDefined();
      expect(g![r.side].picks[p.role]).toBe(p.champion);
      // The rest of the lineup is the comp: at least two of the other four slots match.
      expect(ROLES.filter((x) => x !== p.role && g![r.side].picks[x] === shell!.slots[x].champion).length).toBeGreaterThanOrEqual(2);
      series.add(g!.seriesId);
    }
    expect(series.size, "two independent series").toBeGreaterThanOrEqual(2);
  });

  it("show their games, series, teams and patches, newest patch first", () => {
    for (const p of review.proSwaps) {
      const row = library.extras[p.comp]?.proSwaps?.[p.role]?.find((x) => x.champion === p.champion);
      expect(row).toBeDefined();
      expect(row!.games).toHaveLength(p.games.length);
      expect(row!.series).toBeGreaterThanOrEqual(2);
      expect(row!.teams).toBeGreaterThanOrEqual(1);
      expect([...row!.patches].sort((a, b) => comparePatch(b, a))).toEqual(row!.patches);
    }
  });

  it("never change a comp's lineup or its general-logic swaps", () => {
    const plain = buildLibrary(getCompShells(), discovered, getProGames().games);
    expect(library.shells).toEqual(plain.shells);
  });
});

describe("Caitlyn + Bard Pick", () => {
  const shell = shellOf("caitlyn-bard-pick")!;
  it("is Team Vitality's recorded lineup with sources that resolve", () => {
    expect(shellPicks(shell)).toEqual({ TOP: "jayce", JUNGLE: "qiyana", MID: "syndra", BOT: "caitlyn", SUPPORT: "bard" });
    const g = records.get(83523)!;
    expect(lineupKey(g.red.picks as Picks)).toBe(lineupKey(shellPicks(shell)));
    const sources = new Set(getSources().map((s) => s.id));
    for (const id of shell.sources) expect(sources.has(id), id).toBe(true);
  });
  it("lists its supporting lineups as observed variations", () => {
    const games = library.extras[shell.id].variations.flatMap((v) => v.games.map((g) => g.game));
    for (const r of review.supporting.flatMap((x) => x.games)) expect(games).toContain(r.game);
  });
  it("supporting lineups share the comp's core (3+ champions)", () => {
    for (const x of review.supporting) {
      const s = shellOf(x.comp)!;
      for (const r of x.games) {
        const picks = records.get(r.game)![r.side].picks;
        expect(ROLES.filter((role) => picks[role] === s.slots[role].champion).length).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe("historical marks", () => {
  it("name only a patch older than the newest recorded one, and never remove the comp", () => {
    const newest = [...records.values()].map((g) => g.patch).sort((a, b) => comparePatch(b, a))[0];
    for (const h of review.historical) {
      expect(shellOf(h.comp)).toBeDefined();
      for (const [, p] of Object.entries(library.extras[h.comp]?.historical ?? {})) expect(comparePatch(p!, newest)).toBeLessThan(0);
    }
  });
  it("disappear once pros pick the champion on the newest patch", () => {
    const games = getProGames().games;
    const newest = games.reduce((a, g) => (comparePatch(g.patch, a.patch) > 0 ? g : a));
    const shells = getCompShells();
    const s = shells.find((x) => x.id === "protected-hypercarry")!;
    const fresh = { ...newest, id: 999001, blue: { ...newest.blue, picks: { ...newest.blue.picks, BOT: s.slots.BOT.champion } } };
    const lib = buildLibrary(shells, discovered, [...games, fresh], { proSwaps: [], supporting: [], historical: [{ comp: s.id, roles: ["BOT"], approvedOn: "2026-10-16" }], variants: [], heldChampions: [], approvedComps: [], namedVariations: [], held: [], families: [] });
    expect(lib.extras[s.id]?.historical?.BOT).toBeUndefined();
  });
});

// alan's 2026-10-17 decisions on the comps Locke's and Zaahen's lineups unlocked: two named variations, four holds, and a
// light Yunara protection family. Nothing here changes a lineup, a saved pairing or a score.
describe("named variations, holds and families (2026-10-17)", () => {
  const library = getLibrary();
  const review = getCompReview();
  const key = (p: Record<string, string>) => ROLES.map((r) => p[r]).join("|");

  it("Shopify's Ornn + Jarvan IV lineup is a named variation of Protect + Front-to-back · Yunara, with FlyQuest's lineup beside it", () => {
    const v = library.extras["pro-83450-red"]?.variations.find((x) => x.named);
    expect(v?.named?.name).toMatch(/Shopify Rebellion/);
    expect(key(v!.picks)).toBe("ornn|jarvan-iv|locke|yunara|lulu");
    expect(v!.games.map((g) => `${g.game}-${g.side}`)).toEqual(["83468-red"]);
    expect(v!.named!.alike.map((a) => key(a.picks))).toEqual(["ornn|nocturne|syndra|yunara|lulu"]);
    expect(v!.named!.read?.identity).toBeTruthy();
    // FlyQuest's lineup is listed once, under the named variation only.
    expect(library.extras["pro-83450-red"].variations.filter((x) => key(x.picks) === "ornn|nocturne|syndra|yunara|lulu")).toHaveLength(0);
  });

  it("LGD's Jax + Aphelios lineup is a named variation of Speed-Up Skirmish, and the comp's own lineup is unchanged", () => {
    const x = library.extras["speed-up-skirmish"];
    const v = x?.variations[0];
    expect(v?.named?.name).toMatch(/LGD/);
    expect(key(v!.picks)).toBe("jax|skarner|locke|aphelios|karma");
    const s = library.shells.find((y) => y.id === "speed-up-skirmish")!;
    expect(ROLES.map((r) => s.slots[r].champion).join("|")).toBe("olaf|skarner|locke|sivir|karma");
  });

  it("a family links distinct comps that each keep their card; Pick · Protected Yunara keeps its lineup", () => {
    const f = review.families.find((x) => x.id === "yunara-protection")!;
    for (const id of f.comps) {
      expect(library.shells.some((s) => s.id === id), id).toBe(true);
      expect(library.extras[id]?.family?.others.map((o) => o.id).sort()).toEqual(f.comps.filter((c) => c !== id).sort());
      expect(library.extras[id]?.variantOf, id).toBeUndefined();
    }
    const pick = library.shells.find((s) => s.id === "yunara-protect")!;
    expect(ROLES.map((r) => pick.slots[r].champion).join("|")).toBe("rumble|pantheon|syndra|yunara|lulu");
  });

  it("Front-to-back + Split · Yunara is held, not a card: Team WE's and FURIA's games stay recorded evidence", () => {
    expect(library.shells.some((s) => s.id === "pro-83460-blue")).toBe(false);
    const h = review.held.find((x) => x.name === "Front-to-back + Split · Yunara")!;
    expect(h.games.map((g) => `${g.game}-${g.side}`)).toEqual(["83460-blue", "83624-red"]);
    const games = new Map(getProGames().games.map((g) => [g.id, g]));
    for (const g of h.games) expect(games.get(g.game)?.[g.side].picks.JUNGLE).toBe("sejuani");
  });

  it("held lineups are recorded games and filed under no comp", () => {
    const games = new Map(getProGames().games.map((g) => [g.id, g]));
    for (const h of review.held) for (const r of h.games) {
      expect(games.has(r.game), h.name).toBe(true);
      for (const x of Object.values(library.extras)) for (const v of x.variations) expect(v.games.some((g) => g.game === r.game && g.side === r.side), h.name).toBe(false);
    }
  });
});
