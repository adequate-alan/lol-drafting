// Site-wide reconciliation of the recorded pro games (alan, 2026-10-14: "no contradictions between pages"). Every check
// is a relationship between datasets, never a fixed number, so each daily import must keep it true. Pro Drafts, Meta /
// Pro Priority, Pro Builds and the Synergies draft-usage engine all read data/pro-games.json; tournament aggregates
// (meta.json stats) stay a separate dataset and are only compared where the rules say they must agree.
import { describe, expect, it } from "vitest";
import { getBuildGameRecords, getMeta, getPriority, getProDrafts, getProGames, getTopDraft } from "@/lib/data";
import { bucket, patchesOf } from "@/lib/pro-priority";
import { patchKey } from "@/lib/patch";
import proBuilds from "@/data/pro-builds.json";

const file = getProGames();
const games = file.games;

describe("recorded games", () => {
  it("holds each Gol.gg game once, and each tracked tournament's count matches its stored games", () => {
    expect(new Set(games.map((g) => g.id)).size).toBe(games.length);
    for (const t of file.tournaments) {
      expect(games.filter((g) => g.event === t.event).length, t.golgg).toBe(t.recorded);
      expect(t.recorded, t.golgg).toBeLessThanOrEqual(t.games);
    }
  });

  it("never stores a First Pick that Gol.gg did not mark, and keeps both teams' pick order with the lineup", () => {
    for (const g of games) {
      if (g.firstPick) expect(["blue", "red"]).toContain(g.firstPick);
      for (const side of [g.blue, g.red]) if (side.pickOrder) expect([...side.pickOrder].sort()).toEqual(Object.values(side.picks).sort());
    }
  });

  it("files every game under the tracked tournament whose Gol.gg name it carries (Worlds never as Demacia Cup)", () => {
    for (const g of games) {
      const t = file.tracked.find((x) => x.event === g.event);
      expect(t?.names, `game ${g.id}`).toContain(g.tournament);
      expect(file.tracked.filter((x) => x.names.includes(g.tournament)).map((x) => x.event), `game ${g.id}`).toEqual([g.event]);
    }
  });

  it("the LCK archive stays apart from the refresh: no LCK game in the refreshed file", () => {
    expect(games.some((g) => g.event === "lck-2026-playoffs")).toBe(false);
    expect(file.tracked.map((t) => t.event)).not.toContain("lck-2026-playoffs");
  });
});

describe("Pro Drafts", () => {
  it("lists every recorded game once per side, newest first", () => {
    const drafts = getProDrafts();
    for (const g of games) for (const side of ["blue", "red"] as const) {
      expect(drafts.filter((d) => d.id === `golgg-${g.id}-${side}`), `${g.id} ${side}`).toHaveLength(1);
    }
    const dated = drafts.filter((d) => d.date).map((d) => d.date!);
    expect(dated).toEqual([...dated].sort().reverse());
  });
});

describe("Meta / Pro Priority", () => {
  const data = getPriority();
  it("counts each patch's unique games, ten picks a game, and role picks that add up", () => {
    for (const patch of patchesOf(data)) {
      const b = bucket(data, { patch });
      const recordedHere = games.filter((g) => patchKey(g.patch) === patchKey(patch)).length;
      // Games come from complete game records or a one-patch tournament table, never both for one tournament.
      expect(b.games, patch).toBe(b.recorded + b.tableGames);
      expect(b.recorded, patch).toBeLessThanOrEqual(recordedHere);
      expect(b.rows.reduce((n, r) => n + r.picks, 0), patch).toBe(10 * b.games);
      for (const r of b.rows) {
        if (r.roleVerified) expect(Object.values(r.rolePicks).reduce((n, x) => n + (x ?? 0), 0), r.id).toBe(r.picks);
        if (r.presence != null) expect(r.presence, r.id).toBeLessThanOrEqual(1);
        expect(r.wins, r.id).toBeLessThanOrEqual(r.picks);
      }
    }
  });

  it("all patches is the sum of the patches, never one patch shown as current", () => {
    const all = bucket(data, {});
    expect(all.games).toBe(patchesOf(data).reduce((n, p) => n + bucket(data, { patch: p }).games, 0));
  });

  it("a tracked tournament with every game recorded is counted from its games, and its total matches the match list", () => {
    const meta = getMeta();
    for (const t of file.tournaments) {
      const e = meta.events.find((x) => x.id === t.event);
      if (e) expect(e.games, t.golgg).toBe(t.games);
      if (t.recorded === t.games) expect(data.contributions.filter((c) => c.event === t.event).every((c) => c.kind === "games")).toBe(true);
    }
  });
});

describe("Pro Builds", () => {
  const records = new Map(getBuildGameRecords().map((g) => [g.id, g]));
  it("every build names a recorded game, and its champion is the one that side played in that role", () => {
    for (const b of proBuilds.builds) {
      const g = records.get(b.game);
      expect(g, `build game ${b.game}`).toBeDefined();
      expect(g![b.side as "blue" | "red"].picks[b.role as "TOP"], `${b.game} ${b.side} ${b.role}`).toBe(b.champion);
    }
  });

  it("every refreshed game has its ten builds or is listed as not yet available", () => {
    const waiting = new Set((proBuilds.unavailable as { game: number }[]).map((u) => u.game));
    for (const g of games) {
      const n = proBuilds.builds.filter((b) => b.game === g.id).length;
      if (!waiting.has(g.id)) expect(n, `game ${g.id}`).toBe(10);
    }
  });
});

describe("Synergies draft usage", () => {
  it("classifies both tops of every recorded game exactly once", () => {
    const top = getTopDraft();
    const ids = new Set(games.map((g) => g.id));
    const counts = new Map<number, number>();
    for (const s of top.selections.filter((x) => ids.has(x.game))) counts.set(s.game, (counts.get(s.game) ?? 0) + 1);
    for (const g of games) expect(counts.get(g.id) ?? 0, `game ${g.id}`).toBe(2);
  });
});
