// Pro meta starting picks (alan, 2026-10-13; lib/starting-picks.ts, Draft Room before any pick): real counts per role and
// patch, first rotation from each team's recorded pick order (never the lineup), blind / response only from the
// pick-order engine, pool tiers shown and never changed, and pro meta never moving a row once picks are locked.
import { describe, expect, it } from "vitest";
import { getDraftData, getMeta, getPool, getPriority, getProGames, getSources } from "@/lib/data";
import { draftCandidates, hasSignal, startingCandidates } from "@/lib/candidates";
import { poolTier } from "@/lib/counters";
import { savedSupports } from "@/lib/recommend";
import { priorityData, priorityMarks } from "@/lib/pro-priority";
import {
  defaultPatch, engineReader, FIRST_ROTATION, hasStart, rotationLabel, sortForView, startingOrder, startingPicks, type PickReader, type StartingPick,
} from "@/lib/starting-picks";
import { laneSelections, roleBook, topSelections } from "@/lib/top-draft";
import { ROLES, type ProGame, type ProGames, type Role } from "@/lib/schema";

const prio = getPriority(), pool = getPool(), file = getProGames(), data = getDraftData();
const sources = Object.fromEntries(getSources().map((s) => [s.id, s]));
const DEMACIA = "demacia-cup-2026", LCK = "lck-2026-playoffs";
const PATCH = "16.18"; // Demacia Cup: every game recorded with pick order
const demacia = file.games.filter((g) => g.event === DEMACIA && g.patch === PATCH);
const startOf = (role: Role, patch = PATCH, opts = {}) => startingPicks(prio, pool, role, patch, { tournaments: [DEMACIA], ...opts });
const metaFor = (roles: Role[], patch = PATCH) => Object.fromEntries(roles.map((r) => [r, startingPicks(prio, pool, r, patch).rows]));

describe("zero locked picks: every role", () => {
  it.each(ROLES)("%s lists champions with recorded picks in that role, with real counts", (role) => {
    const { rows, scope } = startOf(role);
    expect(rows.length).toBeGreaterThan(3);
    expect(scope.games).toBe(demacia.length);
    // Every row's role picks equal the recorded games where that champion played this role, and nothing else is listed.
    const played = new Map<string, number>();
    for (const g of demacia) for (const s of [g.blue, g.red]) played.set(s.picks[role], (played.get(s.picks[role]) ?? 0) + 1);
    expect(new Set(rows.map((r) => r.champion))).toEqual(new Set(played.keys()));
    for (const r of rows) {
      expect(r.rolePicks, r.champion).toBe(played.get(r.champion));
      expect(r.games.length, r.champion).toBe(r.rolePicks);
      expect(r.games.every((g) => g.patch === PATCH)).toBe(true);
    }
  });

  it("role-specific: a top laner is not a support candidate unless recorded there", () => {
    const top = new Set(startOf("TOP").rows.map((r) => r.champion));
    const sup = new Set(startOf("SUPPORT").rows.map((r) => r.champion));
    expect(top.has("rumble")).toBe(true);
    expect(sup.has("rumble")).toBe(false);
  });

  it("starting candidates carry no score and no fit reasons", () => {
    for (const role of ROLES) for (const c of startingCandidates(startOf(role).rows, role)) {
      expect(c.compFit).toBe(0);
      expect(c.fit.parts).toEqual([]);
      expect(c.fit.score).toBe(0);
      expect(c.signals).toEqual([]);
    }
  });

  it("draftCandidates gives nothing with an empty board: the room shows the starting picks instead", () => {
    const { unified } = draftCandidates({}, {}, data, sources, metaFor([...ROLES]));
    for (const role of ROLES) expect(unified[role] ?? []).toEqual([]);
  });
});

describe("first rotation, first overall and pick order", () => {
  it("first rotation counts role picks within the team's first three picks, read from pickOrder", () => {
    const rumble = startOf("TOP").rows.find((r) => r.champion === "rumble")!;
    let ordered = 0, first = 0;
    for (const g of demacia) for (const s of [g.blue, g.red]) if (s.picks.TOP === "rumble" && s.pickOrder) {
      ordered += 1;
      if (s.pickOrder.indexOf("rumble") < FIRST_ROTATION) first += 1;
    }
    expect(rumble.ordered).toBe(ordered);
    expect(rumble.firstRotation).toBe(first);
    expect(rumble.later).toBe(ordered - first);
    expect(rotationLabel(rumble)).toBe(`First rotation · ${first}/${ordered} (${Math.round((first / ordered) * 100)}%)`);
  });

  it("first overall is never inferred from first rotation or from the side", () => {
    for (const r of startOf("JUNGLE").rows) {
      expect(r.firstOverall).toBeNull();
      expect(r.blind).toBeNull();
      expect(r.response).toBeNull();
    }
  });

  it("a game without pick order adds role picks but no first-rotation count", () => {
    const g = demacia.find((x) => x.blue.picks.TOP === "rumble")!;
    const stripped: ProGame = { ...g, blue: { ...g.blue, pickOrder: undefined }, red: { ...g.red, pickOrder: undefined } };
    const games = file.games.map((x) => (x.id === g.id ? stripped : x));
    const d = priorityData(getMeta(), { ...file, games } as ProGames);
    const before = startOf("TOP").rows.find((r) => r.champion === "rumble")!;
    const after = startingPicks(d, pool, "TOP", PATCH).rows.find((r) => r.champion === "rumble")!;
    expect(after.rolePicks).toBe(before.rolePicks);
    expect(after.ordered).toBe(before.ordered - 1);
    expect(after.games.find((x) => x.game === g.id)!.teamPick).toBeUndefined();
  });

  it("blind, response and first overall come only from the engine's reads, uncertain ones left unclassified", () => {
    // A stand-in engine: first-picking blue, blind when the enemy laner comes later in the team order.
    const reader: PickReader = (g, side, role) => {
      if (g.id % 3 === 0) return { situation: "uncertain" };
      const other = side === "blue" ? "red" : "blue";
      const mine = g[side].pickOrder!.indexOf(g[side].picks[role]), theirs = g[other].pickOrder!.indexOf(g[other].picks[role]);
      return { situation: mine < theirs ? "blind" : "response", firstOverall: side === "blue" && mine === 0, laneOpponent: g[other].picks[role] };
    };
    for (const r of startOf("TOP", PATCH, { reader }).rows) {
      const reads = r.games.map((g) => g.read!);
      expect(r.blind! + r.response!).toBe(r.classified);
      expect(r.classified).toBe(reads.filter((x) => x.situation !== "uncertain").length);
      expect(r.firstOverall ?? 0).toBe(reads.filter((x) => x.firstOverall).length);
      expect(r.firstOverall ?? 0).toBeLessThanOrEqual(r.firstRotation);
    }
    const viewed = sortForView(startOf("TOP", PATCH, { reader }).rows, "blind");
    expect(viewed.every((r) => (r.blind ?? 0) > 0)).toBe(true);
    expect(viewed.map((r) => r.blind)).toEqual([...viewed.map((r) => r.blind)].sort((a, b) => b! - a!));
  });
});

describe("Champion Pool tiers", () => {
  it("shows alan's tier per role and marks champions outside the pool", () => {
    for (const role of ROLES) for (const r of startOf(role).rows) expect(r.tier, `${role} ${r.champion}`).toBe(poolTier(pool, r.champion, role));
    expect(startOf("TOP").rows.find((r) => r.champion === "rumble")!.tier).toBe("core");
    expect(startOf("TOP").rows.some((r) => r.tier === null)).toBe(true);
  });

  it("Recommended lists pool champions first, then the rest, each by first-rotation picks, role picks, presence", () => {
    for (const role of ROLES) {
      const rows = startOf(role).rows;
      const firstOut = rows.findIndex((r) => !r.tier);
      if (firstOut >= 0) expect(rows.slice(firstOut).every((r) => !r.tier), role).toBe(true);
      expect(startingOrder([...rows].reverse())).toEqual(rows);
      for (let i = 1; i < rows.length; i++) if (!!rows[i].tier === !!rows[i - 1].tier) expect(rows[i - 1].firstRotation).toBeGreaterThanOrEqual(rows[i].firstRotation);
    }
  });

  it("never edits the pool", () => {
    const before = JSON.stringify(pool);
    for (const role of ROLES) startOf(role);
    expect(JSON.stringify(pool)).toBe(before);
  });
});

describe("views", () => {
  it("First rotation and Pro priority filter and sort by their own count", () => {
    const rows = startOf("MID").rows;
    const rot = sortForView(rows, "rotation");
    expect(rot.every((r) => r.firstRotation > 0)).toBe(true);
    expect(rot.map((r) => r.firstRotation)).toEqual([...rot.map((r) => r.firstRotation)].sort((a, b) => b - a));
    const pr = sortForView(rows, "priority");
    expect(pr.every((r) => r.priority && (r.presence ?? 0) >= 0.3)).toBe(true);
    expect(sortForView(rows, "all")).toBe(rows);
    expect(sortForView(rows, "blind")).toEqual([]); // nothing classified without the engine
  });
});

describe("progressive recommendations", () => {
  const meta = metaFor([...ROLES]);
  it("with picks locked, pro meta never moves a row: the order of shared rows is the same with or without it", () => {
    for (const draft of [{ BOT: "jhin" }, { JUNGLE: "vi" }, { TOP: "rumble", MID: "ryze" }]) {
      const plain = draftCandidates(draft, {}, data, sources).unified;
      const withMeta = draftCandidates(draft, {}, data, sources, meta).unified;
      for (const role of ROLES.filter((r) => !(r in draft))) {
        const a = plain[role]!.map((c) => c.champion);
        const b = withMeta[role]!.map((c) => c.champion).filter((id) => a.includes(id));
        expect(b, `${JSON.stringify(draft)} ${role}`).toEqual(a);
      }
    }
  });

  it("keeps pro meta as its own label after a pick, and brings in meta champions the draft-fit read allows", () => {
    const list = draftCandidates({ JUNGLE: "vi" }, {}, data, sources, meta).unified.MID!;
    const ryze = list.find((c) => c.champion === "ryze")!;
    expect(ryze.meta?.rolePicks).toBeGreaterThan(0);
    expect(ryze.signals).not.toContain("meta" as never);
    expect(hasSignal(ryze, "rotation")).toBe(ryze.meta!.firstRotation > 0);
    for (const c of list.filter((x) => x.meta)) expect(c.fit.eligible).toBe(true);
  });

  it("introduces Synergy and comp fit with one ally locked", () => {
    const list = draftCandidates({ BOT: "ezreal" }, {}, data, sources, meta).unified.SUPPORT!;
    expect(list[0].champion).toBe("karma"); // alan's saved default still leads
    expect(list.some((c) => c.signals.includes("synergy"))).toBe(true);
    expect(list.some((c) => c.compFit !== 0)).toBe(true);
  });

  it("with a saved bot locked, presence never brings in a support outside its saved supports", () => {
    const list = draftCandidates({ BOT: "ziggs" }, {}, data, sources, meta).unified.SUPPORT!;
    const allowed = savedSupports({ BOT: "ziggs" }, data.botPairings)!;
    expect(allowed).toContain("nautilus");
    for (const c of list.filter((x) => x.meta && !x.pro)) expect(allowed, c.champion).toContain(c.champion);
  });

  it("an enemy lane opponent brings in counters next to the meta labels", () => {
    const enemyTop = startOf("TOP").rows[0].champion;
    const res = draftCandidates({}, { TOP: enemyTop }, data, sources, meta);
    expect(res.counters.TOP).toBeDefined();
    expect(res.unified.TOP!.length).toBeGreaterThan(0);
    expect(res.unified.TOP!.some((c) => c.meta)).toBe(true);
  });
});

describe("patch and tournament scope", () => {
  it("defaults to the newest patch with usable evidence and never combines patches", () => {
    expect(defaultPatch(prio)).toBe(PATCH);
    const old = startingPicks(prio, pool, "TOP", "16.16");
    expect(old.scope.events).toEqual([LCK]);
    expect(old.rows.every((r) => r.patch === "16.16" && r.games.length === 0 && r.ordered === 0)).toBe(true);
    expect(startOf("TOP").scope.events).toEqual([DEMACIA]);
  });

  it("accepts Riot's spelling and filters by tournament", () => {
    expect(startingPicks(prio, pool, "TOP", "26.18").rows.map((r) => r.champion)).toEqual(startOf("TOP").rows.map((r) => r.champion));
    expect(startingPicks(prio, pool, "TOP", PATCH, { tournaments: [LCK] }).rows).toEqual([]);
  });

  it("the Pro priority label follows the chosen patch", () => {
    const marks = priorityMarks(prio, "16.16");
    expect(Object.values(marks).every((m) => m.patch === "16.16")).toBe(true);
    const r = startOf("TOP").rows.find((x) => x.priority) as StartingPick;
    expect(hasStart(r, "priority")).toBe(true);
  });
});

describe("saved synergy unchanged", () => {
  it("building starting picks and candidates edits no saved record", () => {
    const before = JSON.stringify([data.botPairings, data.midJungle, data.topPicks, data.pool]);
    draftCandidates({ BOT: "corki" }, {}, data, sources, metaFor([...ROLES]));
    for (const role of ROLES) startOf(role);
    expect(JSON.stringify([data.botPairings, data.midJungle, data.topPicks, data.pool])).toBe(before);
    expect(data.botPairings.find((b) => b.champion === "corki")!.clashDefault).toEqual(["nami"]);
  });
});

describe("pick-order engine (lib/top-draft.ts)", () => {
  const records = prio.contributions.flatMap((c) => c.records);
  const reader = engineReader(records, data.champions);
  it("Top blind / response come from the engine's First Pick reconstruction, never the side", () => {
    const rows = startingPicks(prio, pool, "TOP", PATCH, { reader }).rows;
    const sel = topSelections(records.filter((g) => g.patch === PATCH), roleBook(data.champions, records));
    for (const r of rows) {
      const mine = sel.filter((s) => s.champion === r.champion);
      const blind = mine.filter((s) => s.usage === "blind").length, resp = mine.filter((s) => s.usage === "response").length;
      expect(r.blind ?? 0, r.champion).toBe(blind);
      expect(r.response ?? 0, r.champion).toBe(resp);
    }
    expect(rows.some((r) => (r.blind ?? 0) > 0)).toBe(true);
  });

  it("first overall is turn 1 of the team marked First Pick, whichever side it is on", () => {
    const g = records.find((x) => x.firstPick === "red" && x.red.pickOrder)!;
    const id = g.red.pickOrder![0], role = ROLES.find((r) => g.red.picks[r] === id)!;
    expect(reader(g, "red", role)!.firstOverall).toBe(true);
    const blueFirst = ROLES.find((r) => g.blue.picks[r] === g.blue.pickOrder![0])!;
    expect(reader(g, "blue", blueFirst)!.firstOverall).toBe(false);
    const unmarked: ProGame = { ...g, firstPick: undefined };
    expect(reader(unmarked, "blue", "JUNGLE")?.firstOverall).toBeUndefined();
  });

  it("Jungle, Mid, Bot and Support blind / response come from the same engine", () => {
    const book = roleBook(data.champions, records);
    for (const role of ["JUNGLE", "MID", "BOT", "SUPPORT"] as const) {
      const rows = startingPicks(prio, pool, role, PATCH, { reader }).rows;
      const sel = laneSelections(records.filter((g) => g.patch === PATCH), book, role);
      for (const r of rows) {
        const mine = sel.filter((s) => s.champion === r.champion);
        expect(r.blind ?? 0, `${role} ${r.champion}`).toBe(mine.filter((s) => s.usage === "blind").length);
        expect(r.response ?? 0, `${role} ${r.champion}`).toBe(mine.filter((s) => s.usage === "response").length);
      }
      expect(rows.some((r) => (r.blind ?? 0) > 0), role).toBe(true);
    }
  });
});
