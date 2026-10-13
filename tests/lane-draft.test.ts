// Mid and bot-lane draft usage (lib/top-draft.ts, alan 2026-10-13): the Top engine extended to Mid (lane responses, with
// the enemy jungler kept as composition context) and to the bot lane as a duo (what each pick could see of the enemy ADC
// and support, when its own partner was picked, how the whole duo was built). Observed Pro Evidence only.
import { describe, expect, it } from "vitest";
import { getBuildGameRecords, getChampions } from "@/lib/data";
import type { ProGame } from "@/lib/schema";
import {
  duoResponses, duoRows, duoSelections, laneSelections, roleBook, sameTurn, topRows, topSelections, type LaneSelection,
} from "@/lib/top-draft";

const records = getBuildGameRecords();
const book = roleBook(getChampions(), records);

// A synthetic game: picks by role [TOP, JUNGLE, MID, BOT, SUPPORT], each team's own order, and who picked first.
function game(id: number, blue: [string[], string[]], red: [string[], string[]], firstPick?: "blue" | "red", over: Partial<ProGame> = {}): ProGame {
  const side = ([p, order]: [string[], string[]], team: string) => ({
    team, bans: [], picks: { TOP: p[0], JUNGLE: p[1], MID: p[2], BOT: p[3], SUPPORT: p[4] }, pickOrder: order,
  });
  return {
    id, event: "test", tournament: "Test", seriesId: id, series: "A vs B", game: 1, date: "2026-10-01", patch: "16.18",
    blue: side(blue, "A"), red: side(red, "B"), winner: "blue", url: "https://gol.gg/x", rolesUrl: "https://gol.gg/y", checkedOn: "2026-10-01",
    ...(firstPick ? { firstPick } : {}), ...over,
  } as ProGame;
}
const BLUE = ["jax", "vi", "orianna", "jinx", "nautilus"], RED = ["renekton", "sejuani", "syndra", "ezreal", "rakan"];
const pick = (sel: LaneSelection[], side: "blue" | "red", id?: number) => sel.find((s) => s.side === side && (id == null || s.game === id))!;
const lanes = (games: ProGame[], b = book) => {
  const adc = laneSelections(games, b, "BOT"), sup = laneSelections(games, b, "SUPPORT");
  return { adc, sup, duo: duoSelections(adc, sup) };
};

describe("paired turns", () => {
  it("treats a team's two picks in one turn as unordered", () => {
    expect([[2, 3], [4, 5], [8, 9], [3, 2]].every(([a, b]) => sameTurn(a, b))).toBe(true);
    expect([[1, 4], [5, 8], [6, 7], [9, 10]].some(([a, b]) => sameTurn(a, b))).toBe(false);
  });
});

describe("mid", () => {
  // Blue picks first: blue turns 1 4 5 8 9, red 2 3 6 7 10. Orianna 5, Syndra 6.
  const g = game(1, [BLUE, ["jinx", "vi", "orianna", "nautilus", "jax"]], [RED, ["ezreal", "rakan", "syndra", "sejuani", "renekton"]], "blue");
  const mid = laneSelections([g], book, "MID");

  it("is blind before the enemy mid and a response after it, with the enemy jungler as separate context", () => {
    expect(pick(mid, "blue")).toMatchObject({ champion: "orianna", usage: "blind", turn: 5, opponentTurn: 6, laneSeen: false, enemyJungle: "hidden" });
    expect(pick(mid, "red")).toMatchObject({ champion: "syndra", usage: "response", turn: 6, laneSeen: true, enemyJungle: "revealed" });
  });

  it("stays uncertain when the enemy mid could still have played another lane", () => {
    // Ziggs (mid or bot) is red's first pick; blue's mid answers before red shows its ADC.
    const z = game(2, [BLUE, ["vi", "orianna", "jinx", "nautilus", "jax"]], [["renekton", "sejuani", "ziggs", "ezreal", "rakan"], ["ziggs", "sejuani", "ezreal", "rakan", "renekton"]], "red");
    const s = pick(laneSelections([z], book, "MID"), "blue");
    expect(s.usage).toBe("uncertain");
    expect(s.why).toMatch(/could still have played bot/);
  });
});

describe("bot lane", () => {
  it("reads the common split: one team shows its ADC, the other answers with both, the first completes its duo", () => {
    // Blue first: Jinx 1 | Ezreal + Rakan 2-3 | ... | Nautilus 8.
    const g = game(3, [BLUE, ["jinx", "vi", "orianna", "nautilus", "jax"]], [RED, ["ezreal", "rakan", "syndra", "sejuani", "renekton"]], "blue");
    const { adc, sup, duo } = lanes([g]);
    expect(pick(adc, "blue")).toMatchObject({ usage: "blind", bot: { detail: "blind", partnerWhen: "after" } });
    expect(pick(sup, "blue")).toMatchObject({ usage: "response", turn: 8, bot: { detail: "full", partnerWhen: "before" } });
    expect(pick(adc, "red")).toMatchObject({ usage: "response", laneSeen: true, bot: { detail: "vs-adc", partnerWhen: "together" } });
    expect(pick(sup, "red").bot).toMatchObject({ detail: "vs-adc", partnerWhen: "together" });
    const blue = duo.find((d) => d.side === "blue")!, red = duo.find((d) => d.side === "red")!;
    expect(blue).toMatchObject({ adc: "jinx", support: "nautilus", order: "adc", known: { first: 0, last: 2 }, shape: "split" });
    expect(red).toMatchObject({ order: "together", known: { first: 1, last: 1 }, shape: "partial" });
  });

  it("calls a duo blind only when both picks came before either enemy bot laner, whichever side picked first", () => {
    // Red picks first (Syndra 1); blue takes Jinx + Nautilus together at 2-3; red answers with Caitlyn + Karma at 4-5.
    const red = ["renekton", "sejuani", "syndra", "caitlyn", "karma"];
    const order: [string[], string[]] = [["jinx", "nautilus", "orianna", "vi", "jax"], ["syndra", "caitlyn", "karma", "sejuani", "renekton"]];
    const g = game(4, [BLUE, order[0]], [red, order[1]], "red");
    const { adc, sup, duo } = lanes([g]);
    expect(pick(adc, "blue").bot?.detail).toBe("blind");
    expect(pick(sup, "blue").bot).toMatchObject({ detail: "blind", partnerWhen: "together" });
    expect(duo.find((d) => d.side === "blue")!.shape).toBe("blind");
    expect(duo.find((d) => d.side === "red")!).toMatchObject({ shape: "full", known: { first: 2, last: 2 } });
    // The same two orders with blue picking first: Nautilus (4) now sees Caitlyn (3), so it is not blind.
    const flipped = lanes([game(5, [BLUE, order[0]], [red, order[1]], "blue")]);
    expect(pick(flipped.adc, "blue").bot?.detail).toBe("blind");
    expect(pick(flipped.sup, "blue").bot?.detail).toBe("vs-adc");
    expect(flipped.duo.find((d) => d.side === "blue")!.shape).toBe("split");
  });

  it("separates a pick after the enemy support from one after the enemy ADC, and tracks supports picked before their ADC", () => {
    // Blue first: Jinx 1 | Rakan 2, Syndra 3 | Nautilus 4 ... | Ezreal 6.
    const g = game(6, [BLUE, ["jinx", "nautilus", "orianna", "vi", "jax"]], [RED, ["rakan", "syndra", "ezreal", "sejuani", "renekton"]], "blue");
    const { adc, sup, duo } = lanes([g]);
    expect(pick(sup, "blue")).toMatchObject({ turn: 4, bot: { detail: "vs-support", partnerWhen: "before" } });
    expect(pick(sup, "red")).toMatchObject({ turn: 2, bot: { detail: "vs-adc", partnerWhen: "after" } });
    expect(pick(adc, "red")).toMatchObject({ turn: 6, bot: { detail: "full" } });
    expect(duo.find((d) => d.side === "red")!).toMatchObject({ order: "support", known: { first: 1, last: 2 }, shape: "split" });
    const rows = topRows(sup, {});
    expect(rows.find((r) => r.champion === "rakan")!.bot).toMatchObject({ partnerAfter: 1, "vs-adc": 1 });
  });

  it("never manufactures certainty from a flex pick: possibly another lane is unclear, certainly bot lane is partial", () => {
    // Seraphine (mid or support) as red's support before red shows its mid: blue's ADC cannot know her lane.
    const g = game(7, [BLUE, ["vi", "jinx", "orianna", "nautilus", "jax"]], [["renekton", "sejuani", "syndra", "ezreal", "seraphine"], ["seraphine", "ezreal", "syndra", "sejuani", "renekton"]], "red");
    const { adc, duo } = lanes([g]);
    expect(pick(adc, "blue")).toMatchObject({ usage: "uncertain" });
    expect(duo.find((d) => d.side === "blue")!.shape).toBe("uncertain");
    // With a book where she can only be bot lane, she is a bot laner whose slot is open: a partial response, not "vs support".
    const botOnly = roleBook([...getChampions().filter((c) => c.id !== "seraphine"), { id: "seraphine", roles: ["BOT", "SUPPORT"] }], []);
    const p = pick(laneSelections([g], botOnly, "BOT"), "blue");
    expect(p.bot).toMatchObject({ enemySupport: "botlane", detail: "partial" });
    expect(p.laneSeen).toBe(false);
  });

  it("leaves everything unclassified without the first-pick mark or a pick order", () => {
    const noMark = game(8, [BLUE, ["jinx", "vi", "orianna", "nautilus", "jax"]], [RED, ["ezreal", "rakan", "syndra", "sejuani", "renekton"]]);
    const noOrder = game(9, [BLUE, ["jinx", "vi", "orianna", "nautilus", "jax"]], [RED, ["ezreal", "rakan", "syndra", "sejuani", "renekton"]], "blue");
    delete (noOrder.red as { pickOrder?: string[] }).pickOrder;
    const { adc, duo } = lanes([noMark, noOrder]);
    expect(adc.every((s) => s.usage === "uncertain" && s.turn === undefined)).toBe(true);
    expect(duo.every((d) => d.shape === "uncertain" && !d.order)).toBe(true);
    expect(laneSelections([noMark], book, "MID").every((s) => s.usage === "uncertain")).toBe(true);
  });

  it("groups duos and full duo responses by series, never by wins", () => {
    const mk = (id: number, series: number, winner: "blue" | "red") =>
      game(id, [BLUE, ["jinx", "vi", "orianna", "nautilus", "jax"]], [RED, ["ezreal", "rakan", "syndra", "sejuani", "renekton"]], "blue", { seriesId: series, winner });
    const { duo } = lanes([mk(10, 1, "red"), mk(11, 2, "red"), mk(12, 2, "red")]);
    const jinx = duoRows(duo, {}).find((d) => d.adc === "jinx")!;
    expect(jinx).toMatchObject({ support: "nautilus", series: 2, wins: 0, shapes: { split: 3 } });
    const r = duoResponses(duo, {});
    // Blue's duo is completed after both enemy bot laners: picked into Ezreal + Rakan in two series (lost all three).
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ adc: "jinx", support: "nautilus", enemyAdc: "ezreal", enemySupport: "rakan", series: 2, status: "repeated", wins: 0 });
  });
});

describe("recorded games", () => {
  const sel = { MID: laneSelections(records, book, "MID"), BOT: laneSelections(records, book, "BOT"), SUPPORT: laneSelections(records, book, "SUPPORT") };
  const ids = new Set(records.map((g) => g.id));

  it("covers every recorded game once per side in every lane, and the duos match", () => {
    for (const s of Object.values(sel)) {
      expect(s).toHaveLength(2 * ids.size);
      expect(new Set(s.map((x) => `${x.game}:${x.side}`)).size).toBe(2 * ids.size);
    }
    expect(laneSelections([...records, ...records], book, "MID")).toHaveLength(2 * ids.size);
    expect(duoSelections(sel.BOT, sel.SUPPORT)).toHaveLength(2 * ids.size);
  });

  it("matches the rebuilt draft of every ordered game: a blind pick came before its lane opponent", () => {
    for (const s of [...sel.MID, ...sel.BOT, ...sel.SUPPORT]) {
      if (s.usage === "blind" && s.role === "MID") expect(s.opponentTurn!).toBeGreaterThan(s.turn!);
      if (s.bot?.detail === "blind") expect(s.enemySeen).not.toContain(s.role === "BOT" ? s.laneOpponent : s.laneOpponent);
      if (s.bot?.detail === "full") expect(s.enemySeen).toEqual(expect.arrayContaining([s.laneOpponent]));
    }
    // 83450 has no First Pick mark: nothing in it is classified.
    expect([...sel.MID, ...sel.BOT].filter((s) => s.game === 83450).every((s) => s.usage === "uncertain")).toBe(true);
  });

  it("reads recorded game 83541: red picked first, blue took Lucian + Milio together blind, red answered with Yunara + Lulu", () => {
    // Gol.gg 83541: 1 R Orianna | 2-3 B Lucian, Milio | 4-5 R Yunara, Lulu | ...
    const duo = duoSelections(sel.BOT, sel.SUPPORT).filter((d) => d.game === 83541);
    expect(duo.find((d) => d.side === "blue")).toMatchObject({ adc: "lucian", support: "milio", order: "together", shape: "blind", adcTurn: 2, supportTurn: 3 });
    expect(duo.find((d) => d.side === "red")).toMatchObject({ adc: "yunara", support: "lulu", order: "together", shape: "full", adcTurn: 4, supportTurn: 5 });
  });

  it("aggregates all patches without counting a game twice, and a patch scope keeps only that patch", () => {
    const all = topRows(sel.MID, {}), one = topRows(sel.MID, { patch: "16.18" });
    expect(all.reduce((n, r) => n + r.games, 0)).toBe(2 * ids.size);
    expect(one.every((r) => r.selections.every((s) => s.patch === "16.18"))).toBe(true);
    expect(one.reduce((n, r) => n + r.games, 0)).toBeLessThan(all.reduce((n, r) => n + r.games, 0));
    expect(topSelections(records, book)).toHaveLength(2 * ids.size);
  });
});
