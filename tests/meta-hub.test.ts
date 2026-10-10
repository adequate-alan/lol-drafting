// Meta / Research hub: built only from recorded or supplied evidence, and honest about what it cannot compute.
import { describe, expect, it } from "vitest";
import { getBotPairings, getMeta, getProDrafts, getSources } from "@/lib/data";
import { comparison, eventSummary, hubData, pairings, recentDrafts, roleRows, sortRoleRows, trending } from "@/lib/meta-hub";
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
      if (r.stat) expect(listsRole(r.stat.stat, "MID")).toBe(true);
      for (const g of r.games) expect(g.picks.MID).toBe(r.id);
    }
    const pres = (r: { stat?: Parameters<typeof presenceOf>[0] }) => (r.stat ? presenceOf(r.stat) : null);
    const sorted = sortRoleRows(roleRows(hub, "MID"), "presence");
    const k = sorted.findIndex((r) => pres(r) == null);
    expect(sorted.slice(k).every((r) => pres(r) == null)).toBe(true);
  });

  it("keeps tournament aggregates and recorded games apart (alan, 2026-10-10)", () => {
    // Renata at the LCK playoffs: 8 picks / 1 ban / 22% presence are tournament-wide; only 2 of those games are stored.
    const renata = roleRows(hub, "SUPPORT", "lck-2026-playoffs").find((r) => r.id === "renata-glasc")!;
    expect(renata.stat!.stat).toMatchObject({ picks: 8, bans: 1 });
    expect(presenceOf(renata.stat!)).toBeCloseTo(9 / 41, 6);
    expect(renata.games.length).toBe(2);
    // Karma at the Demacia Cup: recorded games only, so there is no aggregate to show.
    const karma = roleRows(hub, "SUPPORT", "demacia-cup-2026").find((r) => r.id === "karma")!;
    expect(karma.stat).toBeUndefined();
    expect(karma.games.length).toBeGreaterThan(0);
    // Locke at the Demacia Cup: picks, bans and WR were reported, but without the event's game total there is no presence.
    const locke = roleRows(hub, "MID", "demacia-cup-2026").find((r) => r.id === "locke")!;
    expect(locke.stat!.stat).toMatchObject({ picks: 3, bans: 1 });
    expect(presenceOf(locke.stat!)).toBeNull();
    expect(roleShare(locke.stat!.stat)).toBe("3 MID");
    // A role share is only shown from verified role picks.
    expect(roleShare(renata.stat!.stat)).toBeUndefined();
    expect(roleShare({ ...renata.stat!.stat, rolePicks: { MID: 6, SUPPORT: 2 } })).toBe("6 MID · 2 SUP");
    // One tournament's aggregate never fills another's row.
    for (const r of roleRows(hub, "SUPPORT", "demacia-cup-2026")) if (r.stat) expect(r.stat.event.id).toBe("demacia-cup-2026");
  });

  it("does not invent trends without comparable pick rates", () => {
    const t = trending(hub);
    expect(t.rising).toEqual([]);
    expect(t.falling).toEqual([]);
    expect(t.blocked).toMatch(/Demacia Cup/);
  });

  it("comparison marks what persisted across tournaments", () => {
    const locke = comparison(hub, "MID").find((c) => c.id === "locke")!;
    expect(locke.seenIn).toEqual(["demacia-cup-2026", "lck-2026-playoffs"]);
    expect(locke.cells["demacia-cup-2026"]).toMatchObject({ picks: 3, games: 0 });
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
