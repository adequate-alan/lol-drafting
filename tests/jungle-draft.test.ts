// Jungle draft usage (alan, 2026-10-13): the same pick-order engine as Top, Mid, Bot and Support, plus Mid/Jungle
// order (who was picked first), the pair completed before / after the enemy mid or jungler, lane partners, and the
// enemy board traits at each pick (General Draft Logic over champions already picked). Observed Pro Evidence never
// becomes a saved pairing.
import { describe, expect, it } from "vitest";
import { getBuildGameRecords, getChampions, getDraftData, getJungleBoard, getLaneDraft, getMidJungle } from "@/lib/data";
import { boardTraits, CONTEXT } from "@/lib/jungle-context";
import { factBook } from "@/lib/jungle-kits";
import type { ProGame } from "@/lib/schema";
import { laneSelections, mateRows, roleBook, topUsageMarks, turnOf } from "@/lib/top-draft";

const champions = getChampions();
const records = getBuildGameRecords();
const book = roleBook(champions, records);
const bundle = getLaneDraft("JUNGLE");
const sel = bundle.selections;

function game(id: number, blue: [string[], string[]], red: [string[], string[]], firstPick?: "blue" | "red"): ProGame {
  const side = ([picks, order]: [string[], string[]], team: string) => ({
    team, bans: [], picks: { TOP: picks[0], JUNGLE: picks[1], MID: picks[2], BOT: picks[3], SUPPORT: picks[4] }, pickOrder: order,
  });
  return {
    id, event: "test", tournament: "Test", seriesId: id, series: "A vs B", game: 1, date: "2026-10-01", patch: "16.18",
    blue: side(blue, "A"), red: side(red, "B"), winner: "blue", url: "https://gol.gg/x", rolesUrl: "https://gol.gg/y", checkedOn: "2026-10-01",
    ...(firstPick ? { firstPick } : {}),
  } as ProGame;
}

describe("jungle draft usage", () => {
  it("classifies every recorded jungle selection once, from the same engine", () => {
    const ids = new Set(records.map((g) => g.id));
    expect(sel.length).toBe(ids.size * 2);
    expect(new Set(sel.map((s) => `${s.game}:${s.side}`)).size).toBe(sel.length);
    for (const s of sel) {
      expect(["blind", "response", "uncertain"]).toContain(s.usage);
      if (s.usage !== "uncertain") expect(s.turn).toBeDefined();
      if (s.usage === "blind") expect(s.opponentTurn!).toBeGreaterThan(s.turn!);
    }
  });

  it("reads who was picked first in the Mid/Jungle core from the team's own order", () => {
    // Blue picks first: B1 jarvan-iv (jungle), R1 R2, B2 B3 = ryze + aatrox, ... so jungle is turn 1, mid turn 4.
    const g = game(1,
      [["aatrox", "jarvan-iv", "ryze", "kaisa", "nautilus"], ["jarvan-iv", "ryze", "aatrox", "kaisa", "nautilus"]],
      [["rumble", "vi", "orianna", "corki", "lulu"], ["orianna", "vi", "rumble", "corki", "lulu"]], "blue");
    const [blue, red] = ["blue", "red"].map((side) => laneSelections([g], book, "JUNGLE").find((s) => s.side === side)!);
    expect(blue.turn).toBe(1);
    expect(blue.mates!.MID).toMatchObject({ id: "ryze", turn: 4, when: "after" });
    expect(blue.core!.allyMidFirst).toBe(false);
    // Red's jungler at turn 3, its mid at turn 2: same turn (2 and 3 are one red turn), so the order is unknown within it.
    expect(red.turn).toBe(3);
    expect(red.mates!.MID).toMatchObject({ id: "orianna", turn: 2, when: "together" });
    const rows = mateRows([blue, red], "MID", {});
    expect(rows.find((r) => r.jungle === "jarvan-iv")!.order).toEqual({ jungleFirst: 1, together: 0, mateFirst: 0, unknown: 0 });
    expect(rows.find((r) => r.jungle === "vi")!.order).toEqual({ jungleFirst: 0, together: 1, mateFirst: 0, unknown: 0 });
  });

  it("a game without a First Pick mark keeps its partners but no order", () => {
    const g = game(2, [["aatrox", "jarvan-iv", "ryze", "kaisa", "nautilus"], ["jarvan-iv", "ryze", "aatrox", "kaisa", "nautilus"]],
      [["rumble", "vi", "orianna", "corki", "lulu"], ["orianna", "vi", "rumble", "corki", "lulu"]]);
    const s = laneSelections([g], book, "JUNGLE").find((x) => x.side === "blue")!;
    expect(s.usage).toBe("uncertain");
    expect(s.mates!.MID).toEqual({ id: "ryze" });
    expect(s.core).toBeUndefined();
    expect(mateRows([s], "MID", {})[0].order.unknown).toBe(1);
    expect(mateRows([s], "MID", {})[0].completed!.unclear).toBe(1);
  });

  it("mate rows count each game once and add up to the jungler's selections", () => {
    for (const j of new Set(sel.map((s) => s.champion))) {
      const mine = sel.filter((s) => s.champion === j);
      const rows = mateRows(mine, "MID", {});
      expect(rows.reduce((n, r) => n + r.games.length, 0)).toBe(mine.length);
      for (const r of rows) {
        const o = r.order;
        expect(o.jungleFirst + o.together + o.mateFirst + o.unknown).toBe(r.games.length);
        const c = r.completed!;
        expect(c.blind + c.afterEnemyCore + c.unclear).toBeLessThanOrEqual(r.games.length);
        expect(r.status).toBe(r.series >= 2 ? "repeated" : "observed");
      }
    }
  });

  it("the enemy board at a pick only names champions already picked", () => {
    for (const s of sel.filter((x) => x.turn)) {
      const hits = bundle.context![`${s.game}:${s.side}`];
      expect(hits).toBeDefined();
      for (const h of hits) for (const c of h.champions) expect(s.enemySeen, `${s.game} ${s.side} ${h.trait}`).toContain(c);
    }
    // Unordered picks get no board read.
    for (const s of sel.filter((x) => !x.turn)) expect(bundle.context![`${s.game}:${s.side}`]).toBeUndefined();
  });

  it("board traits need their thresholds", () => {
    const kits = factBook(champions);
    expect(boardTraits([], kits)).toEqual([]);
    // Limited engage / disengage and damage share need three visible champions.
    const two = boardTraits([{ champion: "jinx", role: "BOT" }, { champion: "kassadin", role: "MID" }], kits).map((h) => h.trait);
    expect(two).not.toContain("no-engage");
    expect(two).not.toContain("physical");
    expect(two).not.toContain("magic");
  });

  it("Draft Room marks carry Mid/Jungle order on every patch with the games per patch, never a score", () => {
    const u = topUsageMarks(sel, [], {}, "16.18");
    expect(u.role).toBe("JUNGLE");
    for (const id of new Set(sel.map((s) => s.champion))) {
      const rows = mateRows(sel.filter((s) => s.champion === id), "MID", {});
      for (const r of rows) {
        const w = u.withMid![id][r.mate];
        expect(w).toMatchObject({ games: r.games.length, jungleFirst: r.order.jungleFirst, together: r.order.together, midFirst: r.order.mateFirst, unknown: r.order.unknown });
        expect(w.jungleFirst + w.together + w.midFirst + w.unknown).toBe(w.games);
        expect(Object.values(w.byPatch).reduce((a, b) => a + b, 0)).toBe(w.games);
      }
    }
    expect(getDraftData().laneUsage.JUNGLE.role).toBe("JUNGLE");
  });

  it("every jungle selection is accounted for in the Mid/Jungle order (jungler first, same turn, mid first or no order)", () => {
    const rows = mateRows(sel, "MID", {});
    const t = rows.reduce((o, r) => ({ j: o.j + r.order.jungleFirst, s: o.s + r.order.together, m: o.m + r.order.mateFirst, u: o.u + r.order.unknown }), { j: 0, s: 0, m: 0, u: 0 });
    expect(t.j + t.s + t.m + t.u).toBe(sel.length);
    // The orderless selections are exactly the ones without a First Pick mark or pick order.
    const noOrder = sel.filter((s) => s.turn === undefined);
    expect(t.u).toBe(noOrder.length);
    for (const s of noOrder) expect(s.mates!.MID!.turn).toBeUndefined();
  });

  it("composition responses need the sample and the lift in CONTEXT, from picks already visible", () => {
    const { responses } = getJungleBoard();
    // Cho'Gath into an immobile carry is the clear case (9 of 10 picks, 57% across every jungle pick).
    expect(responses.chogath?.map((r) => r.trait)).toContain("immobile-carry");
    const ordered = sel.filter((s) => s.turn);
    for (const [id, list] of Object.entries(responses)) {
      const mine = ordered.filter((s) => s.champion === id);
      for (const r of list) {
        expect(r.picks).toBe(mine.length);
        expect(r.with).toBeGreaterThanOrEqual(CONTEXT.responseMin);
        expect(r.with / r.picks).toBeGreaterThanOrEqual(CONTEXT.responseShare);
        expect(r.with / r.picks).toBeGreaterThanOrEqual(CONTEXT.responseLift * (r.base / r.baseOf));
      }
    }
  });

  it("never touches saved Mid/Jungle records", () => {
    const before = JSON.stringify(getMidJungle());
    getLaneDraft("JUNGLE");
    mateRows(sel, "MID", {});
    expect(JSON.stringify(getMidJungle())).toBe(before);
  });

  it("turn reading matches the shared draft order", () => {
    expect([0, 1, 2, 3, 4].map((i) => turnOf(i, true))).toEqual([1, 4, 5, 8, 9]);
    expect([0, 1, 2, 3, 4].map((i) => turnOf(i, false))).toEqual([2, 3, 6, 7, 10]);
  });
});
