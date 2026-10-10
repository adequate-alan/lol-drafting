// Schema validity and the separation of Clash Recommendation / Observed Pro Evidence / General Draft Logic.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getBotPairings, getChampions, getCompShells, getGenG, getMeta, getMidJungle, getPool, getProDrafts, getSources, getTopPicks,
} from "@/lib/data";
import { Files, ROLES } from "@/lib/schema";

const dataDir = join(process.cwd(), "data");
const champIds = new Set(getChampions().map((c) => c.id));
const sourceIds = new Set(getSources().map((s) => s.id));
const draftIds = new Set(getProDrafts().map((d) => d.id));

describe("data files", () => {
  it("every data file has a schema and parses", () => {
    const files = readdirSync(dataDir).filter((f) => f.endsWith(".json")).sort();
    expect(files).toEqual(Object.keys(Files).sort());
    for (const f of files) {
      const result = Files[f as keyof typeof Files].safeParse(JSON.parse(readFileSync(join(dataDir, f), "utf8")));
      expect(result.success, `${f}: ${result.success ? "" : result.error.message}`).toBe(true);
    }
  });

  it("every champion and source reference resolves", () => {
    const text = (f: string) => readFileSync(join(dataDir, f), "utf8");
    for (const d of getProDrafts()) {
      for (const r of ROLES) expect(champIds.has(d.picks[r]), `${d.id} ${r}`).toBe(true);
      for (const s of d.sources) expect(sourceIds.has(s), `${d.id} source ${s}`).toBe(true);
    }
    for (const b of getBotPairings()) {
      for (const id of [b.champion, ...b.clashDefault, ...b.alternatives, ...b.observedProPairings.map((o) => o.champion)])
        expect(champIds.has(id), `${b.champion}: ${id}`).toBe(true);
    }
    for (const id of text("sources.json").match(/"id": "([^"]+)"/g) ?? []) expect(id).toBeTruthy();
  });

  it("all sources point at Gol.gg and carry refresh metadata", () => {
    for (const s of getSources()) {
      expect(s.url).toMatch(/^https:\/\/gol\.gg\//);
      expect(["verified", "not-refreshed"]).toContain(s.refreshStatus);
      if (s.refreshStatus === "verified") expect(s.lastChecked).not.toBeNull();
      else expect(s.lastChecked).toBeNull();
    }
  });

  it("every pro draft has a Gol.gg game source", () => {
    const byId = new Map(getSources().map((s) => [s.id, s]));
    for (const d of getProDrafts()) expect(d.sources.some((s) => byId.get(s)?.type === "golgg-game"), d.id).toBe(true);
  });
});

describe("layer separation", () => {
  const records = () => [
    ...getBotPairings().map((r) => ({ name: r.champion, clash: [...r.clashDefault, ...r.alternatives], observed: r.observedProPairings })),
    ...getMidJungle().map((r) => ({ name: r.anchor, clash: [...r.clashDefault, ...r.alternatives], observed: r.observedProPairings })),
    ...getTopPicks().map((r) => ({ name: r.champion, clash: [] as string[], observed: r.observedProPairings })),
  ];

  it("observed pairings are stored apart from Clash picks and always cite a source", () => {
    for (const r of records()) {
      for (const o of r.observed) {
        expect(o.sources.length, `${r.name}+${o.champion}`).toBeGreaterThan(0);
        for (const s of o.sources) expect(sourceIds.has(s)).toBe(true);
      }
    }
  });

  it("game-backed observed pairings point at recorded drafts that contain both champions", () => {
    const drafts = new Map(getProDrafts().map((d) => [d.id, d]));
    for (const r of records()) {
      for (const o of r.observed) {
        if (!o.backedByGame) { expect(o.proDraftIds).toEqual([]); continue; }
        expect(o.proDraftIds.length, `${r.name}+${o.champion}`).toBeGreaterThan(0);
        for (const id of o.proDraftIds) {
          const picks = Object.values(drafts.get(id)!.picks);
          expect(picks, `${id}`).toEqual(expect.arrayContaining([r.name, o.champion]));
        }
      }
    }
  });

  it("observed-only pro pairings never appear as Clash picks unless alan listed them", () => {
    // Known pro-only pairings from the locked conclusions.
    const proOnly: Record<string, string[]> = { corki: ["alistar"], ziggs: ["pyke", "camille"] };
    for (const r of records()) for (const id of proOnly[r.name] ?? []) expect(r.clash).not.toContain(id);
  });

  it("pro evidence is kept even when it is not a Clash pick", () => {
    const observed = (id: string) => getBotPairings().find((b) => b.champion === id)!.observedProPairings.map((o) => o.champion);
    expect(observed("corki")).toContain("alistar");
    expect(observed("ziggs")).toEqual(expect.arrayContaining(["pyke", "camille"]));
  });

  it("observed comp shells link to a recorded draft; generalized ones do not", () => {
    for (const s of getCompShells()) {
      if (s.kind === "observed") expect(s.proDraftId && draftIds.has(s.proDraftId), s.id).toBeTruthy();
      else expect(s.proDraftId).toBeUndefined();
    }
  });

  it("Gen.G patterns only reference Gen.G drafts", () => {
    const drafts = new Map(getProDrafts().map((d) => [d.id, d]));
    for (const p of getGenG()) for (const id of p.proDraftIds) expect(drafts.get(id)?.team, `${p.title}: ${id}`).toBe("Gen.G");
  });
});

describe("champion pool", () => {
  it("a low-sample core pick has a written justification", () => {
    const stats = new Map(getMeta().stats.map((s) => [s.champion, s]));
    for (const p of getPool()) {
      for (const id of p.core) {
        if (stats.get(id)?.lowSample) expect(p.coreReasons[id], `${p.role} core ${id}`).toBeTruthy();
      }
    }
  });

  it("presence is computed from picks and bans and never confused with win rate", () => {
    const { games } = getMeta().tournament;
    for (const s of getMeta().stats) {
      if (s.bans == null) expect(s.presence).toBeNull();
      else expect(s.presence).toBeCloseTo((s.picks + s.bans) / games, 6);
      expect(s.lowSample).toBe(s.picks < 5);
    }
  });
});

describe("citations match the claims they back", () => {
  const drafts = getProDrafts();
  const byId = new Map(getSources().map((s) => [s.id, s]));
  const gameOf = (d: { sources: string[] }) => d.sources.find((s) => byId.get(s)?.type === "golgg-game");

  it("a bot/support pairing never cites a game where that bot played with a different support", () => {
    for (const b of getBotPairings()) {
      for (const o of b.observedProPairings) {
        for (const sid of o.sources) {
          for (const d of drafts.filter((d) => gameOf(d) === sid)) {
            if (d.picks.BOT === b.champion) expect(d.picks.SUPPORT, `${b.champion}+${o.champion} cites ${sid}`).toBe(o.champion);
          }
        }
      }
    }
  });

  it("the 2026-10-10 citation corrections are in place", () => {
    const ziggs = getBotPairings().find((b) => b.champion === "ziggs")!;
    const ezreal = getBotPairings().find((b) => b.champion === "ezreal")!;
    const obs = (r: typeof ziggs, c: string) => r.observedProPairings.find((o) => o.champion === c)!;
    expect(obs(ziggs, "pyke").sources).toEqual(["golgg-game-82627"]);
    expect(obs(ziggs, "camille").sources).toEqual(["golgg-game-82413"]);
    // Only games that directly show Ezreal + Nautilus; 82416 stays off until someone reads that page.
    expect(obs(ezreal, "nautilus").sources).toEqual(["golgg-game-82383"]);
    for (const id of ["golgg-game-82413", "golgg-game-82383", "golgg-game-82627"]) {
      expect(byId.get(id)?.pendingClaim, id).toBeDefined();
      expect(byId.get(id)?.refreshStatus, id).toBe("not-refreshed");
    }
  });

  it("an externally provided source is never marked refreshed and never attributed to a checker", () => {
    for (const s of getSources()) {
      if (s.origin === "externally-provided") expect(s.pendingClaim, s.id).toBeDefined();
      if (s.pendingClaim) { expect(s.refreshStatus).toBe("not-refreshed"); expect(s.lastChecked).toBeNull(); }
      expect(JSON.stringify(s)).not.toMatch(/checked by|verifiedBy|userVerified/i);
    }
  });
});

describe("bot-lane shapes", () => {
  const bots = new Map(getBotPairings().map((b) => [b.champion, b]));
  const records = () => [
    ...getMidJungle().map((m) => ({ name: m.anchor, role: m.role, clash: m.botShapes, observed: m.observedBotShapes })),
    ...getTopPicks().map((t) => ({ name: t.champion, role: "TOP" as const, clash: t.surrounding.botShapes, observed: t.observedBotShapes })),
  ];

  it("a Clash bot shape is always in that bot's Clash record", () => {
    for (const r of records()) for (const d of r.clash) {
      const b = bots.get(d.bot);
      if (b) expect([...b.clashDefault, ...b.alternatives], `${r.name}: ${d.bot}+${d.support}`).toContain(d.support);
    }
  });

  it("pro-only shapes are kept as observed evidence", () => {
    const has = (anchor: string, bot: string, support: string) =>
      records().some((r) => r.name === anchor && r.observed.some((o) => o.bot === bot && o.support === support));
    expect(has("ahri", "ziggs", "pyke")).toBe(true);
    for (const a of ["viktor", "locke", "skarner", "gwen"]) expect(has(a, "corki", "alistar"), a).toBe(true);
    for (const a of ["viktor", "annie", "locke"]) expect(has(a, "jhin", "rell"), a).toBe(true);
  });

  it("observed shapes cite only drafts that show the duo, and withAnchor is true only when the draft has the anchor", () => {
    const drafts = new Map(getProDrafts().map((d) => [d.id, d]));
    for (const r of records()) for (const o of r.observed) {
      for (const id of o.proDraftIds) {
        const d = drafts.get(id)!;
        expect([d.picks.BOT, d.picks.SUPPORT], `${r.name} ${id}`).toEqual([o.bot, o.support]);
        if (o.withAnchor) expect(d.picks[r.role], `${r.name} ${id}`).toBe(r.name);
      }
      if (!o.withAnchor) expect(o.proDraftIds.every((id) => drafts.get(id)!.picks[r.role] !== r.name)).toBe(true);
    }
  });
});
