// Pro Priority (alan, 2026-10-12; lib/pro-priority.ts): patch-specific picks, bans and presence from verified data only.
// Denominator accuracy, missing bans, duplicate games, role specificity, patch separation, pick order, and that the
// Draft Room label never moves a row. Fixed Demacia / LCK numbers are scoped to those events so new imports can't break them.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getDraftData, getMeta, getPriority, getProGames, getSources } from "@/lib/data";
import { draftCandidates } from "@/lib/candidates";
import {
  bucket, championHistory, forRole, markFor, ORDER_READ, ORDER_READ_LABEL, orderRead, orderText, patchKey, patchLabel, patchesOf, previousPatch, priorityChanges,
  priorityData, priorityMarks, rolePicksOf, sortRows, supportingGames,
} from "@/lib/pro-priority";
import { parseGamePage } from "@/scripts/golgg/parse.mjs";
import { championResolver, pickOrderFor } from "@/scripts/golgg/normalize.mjs";
import { Files, type Meta, type ProGame, type ProGames } from "@/lib/schema";

const meta = getMeta(), file = getProGames(), data = getPriority();
const DEMACIA = "demacia-cup-2026", LCK = "lck-2026-playoffs";
const demacia = { tournaments: [DEMACIA] }, lck = { tournaments: [LCK] };
const g0 = file.games.find((g) => g.id === 83540)!;
const clone = <T,>(x: T): T => structuredClone(x);
const withGames = (games: ProGame[], over: Partial<ProGames["tournaments"][number]> = {}): ProGames => ({
  ...file, games, tournaments: file.tournaments.map((t) => (t.event === DEMACIA ? { ...t, games: games.filter((g) => g.event === DEMACIA).length, ...over } : t)),
});

describe("patch notation", () => {
  it("shows Riot's 26.xx for Gol.gg's 16.xx and reads either", () => {
    expect(patchLabel("16.18")).toBe("26.18");
    expect(patchKey("26.18")).toBe("16.18");
    expect(patchKey("v16.18")).toBe("16.18");
    expect(patchLabel(patchKey("26.16"))).toBe("26.16");
  });
});

describe("contributions", () => {
  it("counts Demacia from its game records and the LCK playoffs from their single-patch Gol.gg table", () => {
    const dem = data.contributions.filter((c) => c.event === DEMACIA);
    expect(dem.every((c) => c.kind === "games")).toBe(true);
    expect(dem.reduce((n, c) => n + c.games, 0)).toBe(file.games.filter((g) => g.event === DEMACIA).length);
    const l = data.contributions.filter((c) => c.event === LCK);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ kind: "table", patch: "16.16", games: 41 });
  });

  it("withholds a tournament with games missing whose table can't be pinned to one patch", () => {
    const games = clone(file.games.filter((g) => g.event === DEMACIA)).slice(0, 10);
    games[0].patch = "16.17"; // the recorded games span two patches and the table covers the whole tournament
    const d = priorityData(meta, { ...file, games, tournaments: file.tournaments.map((t) => (t.event === DEMACIA ? { ...t, games: 39 } : t)) });
    expect(d.contributions.some((c) => c.event === DEMACIA)).toBe(false);
    expect(d.withheld.find((w) => w.event === DEMACIA)).toMatchObject({ recorded: 10, games: 39 });
  });
});

describe("denominators", () => {
  it("agrees with Gol.gg's Demacia table champion by champion (picks, bans, wins) over unique games", () => {
    const ev = meta.events.find((e) => e.id === DEMACIA)!;
    const b = bucket(data, { patch: ev.patch, ...demacia });
    expect(b.games).toBe(ev.games);
    for (const s of ev.stats) {
      const r = b.rows.find((x) => x.id === s.champion)!;
      expect([r.picks, r.bans, r.wins], s.champion).toEqual([s.picks, s.bans, s.wins ?? 0]);
      expect(r.presence).toBeCloseTo((s.picks + s.bans!) / ev.games!, 10);
      expect(r.pickRate).toBeCloseTo(s.picks / ev.games!, 10);
    }
    // Ten picks per game, never more than one pick-or-ban per champion per game.
    expect(b.rows.reduce((n, r) => n + r.picks, 0)).toBe(10 * b.games);
    expect(b.rows.every((r) => r.present <= b.banGames)).toBe(true);
  });

  it("uses the table's own game total for the LCK playoffs (Cassiopeia 2 picks + 35 bans of 41)", () => {
    const r = bucket(data, { patch: "16.16", ...lck }).rows.find((x) => x.id === "cassiopeia")!;
    expect(r.presence).toBeCloseTo(37 / 41, 10);
    expect(r.sideKnown).toBe(false);
    expect(r.latest).toBeUndefined();
  });

  it("counts a game stored twice once", () => {
    const games = file.games.filter((g) => g.event === DEMACIA);
    const d = priorityData(meta, withGames([...games, clone(games[0])], { games: games.length }));
    // Two records for one id: the duplicate is dropped before the tournament is checked for completeness.
    const b = bucket(d, { patch: "16.18", ...demacia });
    expect(b.games).toBe(games.length);
    expect(b.rows.reduce((n, r) => n + r.picks, 0)).toBe(10 * games.length);
  });

  it("never turns a pick-only count into presence when bans are missing", () => {
    const games = clone(file.games.filter((g) => g.event === DEMACIA));
    games[0].blue.bans = games[0].blue.bans.slice(0, 3);
    const d = priorityData(meta, withGames(games));
    const b = bucket(d, { patch: "16.18", ...demacia });
    expect(b.banGames).toBe(games.length - 1);
    expect(b.games).toBe(games.length);
    const picked = Object.values(games[0].red.picks)[0];
    const r = b.rows.find((x) => x.id === picked)!;
    // Presence and ban rate are over the games with every ban recorded; the incomplete game adds a pick but no presence.
    expect(r.presence).toBeCloseTo((r.present) / (games.length - 1), 10);
    const noBans = clone(games).map((g) => ({ ...g, blue: { ...g.blue, bans: [] }, red: { ...g.red, bans: [] } }));
    const none = bucket(priorityData(meta, withGames(noBans)), { patch: "16.18", ...demacia });
    expect(none.banGames).toBe(0);
    expect(none.rows.every((x) => x.presence === null && x.banRate === null)).toBe(true);
  });
});

describe("roles", () => {
  const b = bucket(data, { patch: "16.18", ...demacia });
  it("lists a champion under a role only with recorded picks there; bans have no role", () => {
    const jungle = forRole(b.rows, "JUNGLE");
    expect(jungle.every((r) => (r.rolePicks.JUNGLE ?? 0) > 0)).toBe(true);
    const banOnly = b.rows.filter((r) => r.picks === 0);
    expect(banOnly.length).toBeGreaterThan(0);
    for (const role of ["TOP", "JUNGLE", "MID", "BOT", "SUPPORT"] as const) expect(forRole(b.rows, role).some((r) => r.picks === 0)).toBe(false);
    expect(forRole(b.rows, "ALL")).toHaveLength(b.rows.length);
  });

  it("splits picks by recorded role and keeps presence champion-wide", () => {
    for (const r of b.rows) {
      expect(r.roleVerified).toBe(true);
      expect(Object.values(r.rolePicks).reduce((n, x) => n + x, 0)).toBe(r.picks);
    }
  });

  it("keeps LCK table picks champion-wide: no role split is invented", () => {
    const l = bucket(data, { patch: "16.16", ...lck });
    const camille = l.rows.find((r) => r.id === "camille")!;
    expect(camille.roleVerified).toBe(false);
    expect(rolePicksOf(camille, "TOP")).toBeUndefined();
    expect(camille.namedRoles).toContain("TOP");
    expect(forRole(l.rows, "TOP").map((r) => r.id)).toContain("camille");
  });
});

describe("patch separation", () => {
  it("defaults to the newest patch and never mixes another patch into it", () => {
    const patches = patchesOf(data);
    expect(patches[0]).toBe("16.18");
    const newest = bucket(data, { patch: patches[0] });
    expect(newest.contributions.every((c) => c.patch === "16.18")).toBe(true);
    expect(newest.games).toBe(bucket(data, { patch: "16.18", ...demacia }).games);
  });

  it("combines patches only when asked, and says which", () => {
    const all = bucket(data, {});
    expect(all.patches).toEqual(["16.18", "16.16"]);
    expect(all.games).toBe(bucket(data, { patch: "16.18" }).games + 41);
    const cass = all.rows.find((r) => r.id === "cassiopeia")!;
    expect(cass.patches).toEqual(["16.18", "16.16"]);
  });

  it("aggregates tournaments sharing a patch", () => {
    const m: Meta = clone(meta);
    const copy = { ...m.events.find((e) => e.id === DEMACIA)!, id: "other-cup", name: "Other Cup", short: "Other" };
    m.events.push(copy);
    const extra = file.games.filter((g) => g.event === DEMACIA).slice(0, 4).map((g, i) => ({ ...clone(g), id: 900000 + i, event: "other-cup" }));
    const d = priorityData(m, { ...file, games: [...file.games, ...extra], tournaments: [...file.tournaments, { ...file.tournaments[0], event: "other-cup", games: 4, recorded: 4 }] });
    expect(bucket(d, { patch: "16.18" }).games).toBe(bucket(data, { patch: "16.18" }).games + 4);
    expect(bucket(d, { patch: "16.18", tournaments: ["other-cup"] }).games).toBe(4);
  });

  it("history keeps each patch on its own and shows 0 where a champion was absent", () => {
    const h = championHistory(data, "orianna");
    expect(h.map((p) => p.patch)).toEqual(["16.16", "16.18"]);
    expect(h[0].presence).toBeCloseTo(25 / 41, 10);
    const none = championHistory(data, "no-such-champion");
    expect(none.every((p) => p.presence === 0 || p.presence === null)).toBe(true);
  });
});

describe("priority changes", () => {
  it("compares with the previous patch in percentage points, absent counting as 0", () => {
    expect(previousPatch(data, "16.18")).toBe("16.16");
    expect(previousPatch(data, "16.18", demacia.tournaments)).toBeUndefined();
    const c = priorityChanges(data, "16.18", "16.16");
    const q = [...c.rising, ...c.falling].find((m) => m.id === "qiyana")!;
    expect(q.change).toBeCloseTo(q.presence[1] - q.presence[0], 10); // a difference, not a ratio
    expect(c.rising.every((m) => m.change >= 0.1)).toBe(true);
    expect(c.falling.every((m) => m.change <= -0.1)).toBe(true);
    for (const m of c.rising.filter((x) => x.kind === "new")) expect(m.presence[0]).toBeLessThan(0.05);
  });
});

describe("pick order", () => {
  it("is omitted when not stored, never rebuilt from the lineup", () => {
    const b = bucket(data, { patch: "16.18", ...demacia });
    const ordered = file.games.filter((g) => g.event === DEMACIA && g.blue.pickOrder && g.red.pickOrder && g.firstPick).length;
    expect(b.orderGames).toBe(ordered);
    if (!ordered) expect(b.rows.every((r) => r.order.known === 0 && orderRead(r.order) === undefined)).toBe(true);
  });

  it("counts pick 1 of the draft as first pick and each team's first three picks as first rotation, whichever side picked first", () => {
    const games = clone(file.games.filter((g) => g.event === DEMACIA));
    games.forEach((g, i) => { g.blue.pickOrder = Object.values(g.blue.picks); g.red.pickOrder = Object.values(g.red.picks); g.firstPick = i % 2 ? "red" : "blue"; });
    const b = bucket(priorityData(meta, withGames(games)), { patch: "16.18", ...demacia });
    expect(b.orderGames).toBe(games.length);
    const total = b.rows.reduce((n, r) => n + r.order.firstRotation, 0);
    expect(total).toBe(6 * games.length);
    expect(b.rows.reduce((n, r) => n + r.order.firstPick, 0)).toBe(games.length);
    expect(b.rows.reduce((n, r) => n + r.order.lastPick, 0)).toBe(games.length);
    expect(b.rows.reduce((n, r) => n + r.order.phase2, 0)).toBe(4 * games.length);
    // A red first pick is the first pick of the game: red's first champion, not blue's.
    const g = games.find((x) => x.firstPick === "red")!;
    const one = bucket(priorityData(meta, withGames([g])), { patch: "16.18", ...demacia });
    expect(one.rows.find((r) => r.id === g.red.pickOrder![0])!.order.firstPick).toBe(1);
    expect(one.rows.find((r) => r.id === g.blue.pickOrder![0])!.order.firstPick).toBe(0);
    // Without the first-pick side the order is not used at all.
    const unknown = clone(games).map((x) => ({ ...x, firstPick: undefined }));
    expect(bucket(priorityData(meta, withGames(unknown)), { patch: "16.18", ...demacia }).orderGames).toBe(0);
  });

  it("is read back from a stored game's Gol.gg page only when teams, picks and bans match", () => {
    const champions = Files["champions.json"].parse(JSON.parse(readFileSync(join(process.cwd(), "data/champions.json"), "utf8")));
    const resolve = championResolver(champions);
    const page = parseGamePage(readFileSync(join(process.cwd(), "tests/fixtures/golgg/game-83540-game.html"), "utf8"));
    const got = pickOrderFor(g0, page, resolve);
    expect(got).toEqual({ blue: ["ashe", "seraphine", "qiyana", "galio", "locke"], red: ["ryze", "jarvan-iv", "rumble", "jhin", "nautilus"], firstPick: "red" });
    const other = clone(g0);
    other.blue.bans = [...other.blue.bans].reverse();
    expect(pickOrderFor(other, page, resolve).problems).toBeDefined();
    expect(Files["pro-games.json"].safeParse({ ...file, games: [{ ...g0, blue: { ...g0.blue, pickOrder: ["ashe", "ashe", "qiyana", "galio", "locke"] } }] }).success).toBe(false);
  });
});

describe("supporting games", () => {
  it("lists exactly the recorded games behind a champion's picks and bans", () => {
    const b = bucket(data, { patch: "16.18", ...demacia });
    const r = sortRows(b.rows, "presence")[0];
    const games = supportingGames(b, r.id);
    expect(games.filter((x) => !x.banned)).toHaveLength(r.picks);
    expect(games.filter((x) => x.banned)).toHaveLength(r.bans);
  });
});

describe("Draft Room label", () => {
  const draft = getDraftData();
  const sources = Object.fromEntries(getSources().map((s) => [s.id, s]));

  it("is a label only: the candidate order is the same with and without it", () => {
    for (const d of [{ BOT: "jhin" }, { TOP: "rumble" }, { MID: "orianna" }, { JUNGLE: "vi", BOT: "ezreal" }]) {
      const withMarks = draftCandidates(d, {}, draft, sources).unified;
      const without = draftCandidates(d, {}, { ...draft, priority: {} }, sources).unified;
      for (const role of Object.keys(without) as (keyof typeof without)[]) {
        expect(withMarks[role]!.map((c) => c.champion), `${JSON.stringify(d)} ${role}`).toEqual(without[role]!.map((c) => c.champion));
        expect(withMarks[role]!.map((c) => c.signals), role).toEqual(without[role]!.map((c) => c.signals));
      }
    }
  });

  it("shows only where the champion has recorded picks in that role, on the newest patch", () => {
    const marks = priorityMarks(data);
    const ids = Object.keys(marks);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(marks[id].patch).toBe(patchesOf(data)[0]);
      expect(marks[id].presence).toBeGreaterThanOrEqual(0.3);
    }
    expect(markFor(marks, "nocturne", "JUNGLE")).toBeDefined();
    expect(markFor(marks, "nocturne", "MID")).toBeUndefined();
  });
});

describe("order read over the six-pick first rotation", () => {
  it("calls a champion early or late only past the 60 / 40 split", () => {
    const o = (first: number, late: number) => ({ known: 10, firstPick: 0, firstRotation: first, phase2: late, lastPick: 0 });
    expect(orderRead(o(6, 4))).toBe("mixed");
    expect(orderRead(o(8, 2))).toBe("early");
    expect(orderRead(o(4, 6))).toBe("late");
  });

  it("needs five ordered picks before any read and always shows the fraction", () => {
    const o = (known: number, first: number) => ({ known, firstPick: 0, firstRotation: first, phase2: known - first, lastPick: 0 });
    expect(ORDER_READ.minPicks).toBe(5);
    expect(orderRead(o(1, 1))).toBeUndefined();
    expect(orderRead(o(4, 4))).toBeUndefined();
    expect(orderText(o(1, 1))).toBe("1/1 first rotation (100%) · too few picks to read");
    expect(orderRead(o(5, 4))).toBe("early");
    expect(orderText(o(10, 8))).toBe("8/10 first rotation (80%) · usually picked early");
    // Descriptive only: never a blind-safety, counter or meta claim.
    expect(Object.values(ORDER_READ_LABEL).join(" ")).not.toMatch(/blind|safe|counter|meta|priority/i);
  });
});
