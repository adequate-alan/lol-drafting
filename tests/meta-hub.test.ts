// Meta / Research hub: built only from recorded or supplied evidence, and honest about what it cannot compute.
import { describe, expect, it } from "vitest";
import { getBotPairings, getMeta, getProDrafts, getSources } from "@/lib/data";
import { MIN_PICKS, MIN_SHIFT, comparison, eventSummary, hubData, pairings, recentDrafts, roleRows, sortRoleRows, trending } from "@/lib/meta-hub";
import { listsRole, presenceOf, roleShare } from "@/lib/pool-stats";

const sources = Object.fromEntries(getSources().map((s) => [s.id, s]));
// Scoped to the two events these checks were written for, so a newly imported tournament (Worlds 2026) cannot move them.
const KNOWN = ["demacia-cup-2026", "lck-2026-playoffs"];
const meta = { ...getMeta(), events: getMeta().events.filter((e) => KNOWN.includes(e.id)) };
const knownNames = new Set(meta.events.map((e) => e.name));
const hub = hubData({ meta, proDrafts: getProDrafts().filter((d) => knownNames.has(d.tournament)), botPairings: getBotPairings(), sources });

describe("meta hub", () => {
  it("orders tournaments newest patch first and summarises them from the data", () => {
    // Worlds 2026 joins ahead of these once the daily refresh finds it on Gol.gg.
    expect(hub.events.map((e) => e.id).filter((id) => id === "demacia-cup-2026" || id === "lck-2026-playoffs")).toEqual(["demacia-cup-2026", "lck-2026-playoffs"]);
    expect(hub.events.at(-1)!.id).toBe("lck-2026-playoffs");
    const demEvent = hub.events.find((e) => e.id === "demacia-cup-2026")!;
    const lck = eventSummary(hub, hub.events.find((e) => e.id === "lck-2026-playoffs")!, sources);
    // 18 recorded drafts plus two supplied LCK game pages (Ezreal + Nautilus 82383, Ziggs + Camille 82413).
    expect(lck.recordedGames).toBe(getMeta().tournament.recordedGames + 2);
    const dem = eventSummary(hub, demEvent, sources);
    // Four supplied game pages, then every game the daily refresh records (never more than the event played).
    expect(dem.recordedGames).toBeGreaterThanOrEqual(4);
    expect(dem.recordedGames).toBeLessThanOrEqual(Math.max(4, demEvent.games ?? 0));
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
    // Karma at the Demacia Cup: Gol.gg's table (7 picks / 5 bans / 3 wins on Oct 10) and the stored games are separate;
    // presence uses the tournament total, and stored games never exceed the table's picks.
    const karma = roleRows(hub, "SUPPORT", "demacia-cup-2026").find((r) => r.id === "karma")!;
    const k = karma.stat!.stat;
    expect(k.picks).toBeGreaterThanOrEqual(7);
    expect(presenceOf(karma.stat!)).toBeCloseTo((k.picks + k.bans!) / karma.stat!.event.games!, 6);
    expect(karma.games.length).toBeGreaterThanOrEqual(2);
    expect(karma.games.length).toBeLessThanOrEqual(k.picks);
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
    expect(t.newer?.id).toBe(hub.events[0].id);
    expect(t.newer?.id).not.toBe("lck-2026-playoffs");
    for (const x of t.rising) { expect(x.to - x.from).toBeGreaterThanOrEqual(MIN_SHIFT); expect(x.toPicks).toBeGreaterThanOrEqual(MIN_PICKS); }
    for (const x of t.falling) { expect(x.from - x.to).toBeGreaterThanOrEqual(MIN_SHIFT); expect(x.fromPicks).toBeGreaterThanOrEqual(MIN_PICKS); }
    // Without a game total there is nothing to compare.
    const noTotal = { ...hub, events: hub.events.map((e, i) => (i === 0 ? { ...e, games: undefined } : e)) };
    expect(trending(noTotal).blocked).toMatch(new RegExp(hub.events[0].short));
  });

  it("comparison marks what persisted across tournaments", () => {
    const locke = comparison(hub, "MID").find((c) => c.id === "locke")!;
    expect(locke.seenIn).toEqual(["demacia-cup-2026", "lck-2026-playoffs"]);
    expect(locke.cells["demacia-cup-2026"]?.picks ?? 0).toBeGreaterThanOrEqual(5);
  });

  it("pairings and drafts come from recorded games, freshest first", () => {
    const bot = pairings(hub, "BOT", "SUPPORT");
    expect(bot[0].latest.patch).toBe("16.18");
    expect(bot.find((p) => p.a === "yunara" && p.b === "lulu")!.games.length).toBeGreaterThanOrEqual(4);
    expect(pairings(hub, "BOT", "SUPPORT", "demacia-cup-2026").length).toBeGreaterThanOrEqual(4);
    const drafts = recentDrafts(hub);
    expect(drafts[0].patch).toBe("16.18");
    const lckGame = drafts.find((d) => d.key === "golgg-game-82962")!;
    expect(lckGame.sides).toHaveLength(2);
    expect(lckGame.partial).toBe(false);
  });
});
