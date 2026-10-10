// Meta / Research hub: built only from recorded or supplied evidence, and honest about what it cannot compute.
import { describe, expect, it } from "vitest";
import { getBotPairings, getMeta, getProDrafts, getSources } from "@/lib/data";
import { MIN_PICKS, MIN_SHIFT, comparison, eventSummary, hubData, pairings, recentDrafts, roleRows, sortRoleRows, trending } from "@/lib/meta-hub";
import { listsRole, presenceOf, roleShare } from "@/lib/pool-stats";

const sources = Object.fromEntries(getSources().map((s) => [s.id, s]));
const hub = hubData({ meta: getMeta(), proDrafts: getProDrafts(), botPairings: getBotPairings(), sources });

describe("meta hub", () => {
  it("orders tournaments newest patch first and summarises them from the data", () => {
    expect(hub.events.map((e) => e.id)).toEqual(["demacia-cup-2026", "lck-2026-playoffs"]);
    const lck = eventSummary(hub, hub.events[1], sources);
    // 18 recorded drafts plus two supplied LCK game pages (Ezreal + Nautilus 82383, Ziggs + Camille 82413).
    expect(lck.recordedGames).toBe(getMeta().tournament.recordedGames + 2);
    const dem = eventSummary(hub, hub.events[0], sources);
    expect(dem.recordedGames).toBe(4);
    expect(dem.refreshed).toBe(false);
    expect(dem.providedOn).toBe("2026-10-10");
  });

  it("role rows only use stats recorded for that role", () => {
    for (const r of roleRows(hub, "MID")) {
      if (r.stat) expect(listsRole(r.stat, "MID")).toBe(true);
      for (const g of r.games) expect(g.picks.MID).toBe(r.id);
    }
    const pres = (r: { stat?: Parameters<typeof presenceOf>[0] }) => (r.stat ? presenceOf(r.stat) : null);
    const sorted = sortRoleRows(roleRows(hub, "MID"), "presence");
    const k = sorted.findIndex((r) => pres(r) == null);
    if (k >= 0) expect(sorted.slice(k).every((r) => pres(r) == null)).toBe(true);
  });

  it("keeps tournament aggregates and recorded games apart (alan, 2026-10-10)", () => {
    // Renata at the LCK playoffs: 8 picks / 1 ban / 22% presence are tournament-wide; only 2 of those games are stored.
    const renata = roleRows(hub, "SUPPORT", "lck-2026-playoffs").find((r) => r.id === "renata-glasc")!;
    expect(renata.stat!.stat).toMatchObject({ picks: 8, bans: 1, wins: 5 });
    expect(presenceOf(renata.stat!)).toBeCloseTo(9 / 41, 6);
    expect(renata.games.length).toBe(2);
    // Karma at the Demacia Cup: Gol.gg's table says 7 picks / 5 bans / 3 wins; only 2 of those games are stored here.
    const karma = roleRows(hub, "SUPPORT", "demacia-cup-2026").find((r) => r.id === "karma")!;
    expect(karma.stat!.stat).toMatchObject({ picks: 7, bans: 5, wins: 3 });
    expect(presenceOf(karma.stat!)).toBeCloseTo(12 / 39, 6);
    expect(karma.games.length).toBe(2);
    // Without a game total there is no presence, whatever the picks and bans.
    expect(presenceOf({ ...karma.stat!, event: { ...karma.stat!.event, games: undefined } })).toBeNull();
    // A role share is only shown from verified role picks; Gol.gg's tables give none.
    expect(roleShare(renata.stat!.stat)).toBeUndefined();
    expect(roleShare({ ...renata.stat!.stat, rolePicks: { MID: 6, SUPPORT: 2 } })).toBe("6 MID · 2 SUP");
    // One tournament's aggregate never fills another's row.
    for (const r of roleRows(hub, "SUPPORT", "demacia-cup-2026")) if (r.stat) expect(r.stat.event.id).toBe("demacia-cup-2026");
  });

  it("trends need both game totals, full tables, at least 3 picks and a 10-point move", () => {
    const t = trending(hub);
    expect(t.blocked).toBeUndefined();
    expect(t.newer?.id).toBe("demacia-cup-2026");
    for (const x of t.rising) { expect(x.to - x.from).toBeGreaterThanOrEqual(MIN_SHIFT); expect(x.toPicks).toBeGreaterThanOrEqual(MIN_PICKS); }
    for (const x of t.falling) { expect(x.from - x.to).toBeGreaterThanOrEqual(MIN_SHIFT); expect(x.fromPicks).toBeGreaterThanOrEqual(MIN_PICKS); }
    // Without a game total there is nothing to compare.
    const noTotal = { ...hub, events: hub.events.map((e, i) => (i === 0 ? { ...e, games: undefined } : e)) };
    expect(trending(noTotal).blocked).toMatch(/Demacia Cup/);
  });

  it("comparison marks what persisted across tournaments", () => {
    const locke = comparison(hub, "MID").find((c) => c.id === "locke")!;
    expect(locke.seenIn).toEqual(["demacia-cup-2026", "lck-2026-playoffs"]);
    expect(locke.cells["demacia-cup-2026"]).toMatchObject({ picks: 5, games: 0 });
  });

  it("pairings and drafts come from recorded games, freshest first", () => {
    const bot = pairings(hub, "BOT", "SUPPORT");
    expect(bot[0].latest.patch).toBe("16.18");
    expect(bot.find((p) => p.a === "yunara" && p.b === "lulu")!.games.length).toBe(4);
    expect(pairings(hub, "BOT", "SUPPORT", "demacia-cup-2026")).toHaveLength(4);
    const drafts = recentDrafts(hub);
    expect(drafts[0].patch).toBe("16.18");
    const lckGame = drafts.find((d) => d.key === "golgg-game-82962")!;
    expect(lckGame.sides).toHaveLength(2);
    expect(lckGame.partial).toBe(false);
  });
});
