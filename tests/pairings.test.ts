// Pairing Explorer (alan, 2026-11-13): the shared pairing layer in lib/pairings.ts. Recorded games are counted from the
// games themselves; alan's saved Synergy, observed pro pairings and kit-based proposals stay in separate groups; a pro
// pairing never becomes saved; nothing that scores or orders reads the explorer; "Use in Draft Room" keeps the board.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getBotPairings, getChampions, getPairingData, getProposed } from "@/lib/data";
import { withPair } from "@/lib/draft-persist";
import { convertKits } from "@/lib/model-v2/kits";
import { duoRead, explorerHref, noteFor, pairEvidence, pairLessons, partnerOptions, savedLink } from "@/lib/pairings";
import { Files } from "@/lib/schema";

const data = getPairingData();
const champions = getChampions();
const bots = getBotPairings();
const proposed = getProposed().records;
const byId = new Map(champions.map((c) => [c.id, c]));
const playable = (id: string, role: "BOT" | "SUPPORT") => !!byId.get(id)?.roles.includes(role) && !byId.get(id)?.rosterOnly;
const kits = new Map(convertKits(champions).map((k) => [k.id, k]));
const src = (f: string) => readFileSync(join(process.cwd(), f), "utf8");

describe("recorded games", () => {
  it("lists each team draft once, keyed by Gol.gg game and team", () => {
    const keys = data.rows.map((r) => `${r.game}:${r.team}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const r of data.rows) {
      expect(r.patch, `${r.game}`).toBeTruthy();
      expect(r.series, `${r.game}`).toMatch(/:/);
    }
  });

  it("counts a pairing from the games, never from the workbook's stored counts", () => {
    const yunara = pairEvidence(data.rows, "yunara", "BOT", "SUPPORT", data.newestPatch).get("lulu")!;
    // Synergies used to show 3 (the LCK-era list); the recorded games hold many more, from many teams.
    expect(yunara.games.length).toBeGreaterThan(20);
    expect(yunara.teams.length).toBeGreaterThan(10);
    expect(yunara.wins + yunara.losses).toBeLessThanOrEqual(yunara.games.length);
    // Fearless: a pairing appears once per series per team.
    const perSeries = new Set(yunara.games.map((g) => `${g.series}:${g.team}`));
    expect(perSeries.size).toBe(yunara.games.length);
  });

  it("keeps the LCK archive and labels it", () => {
    expect(data.rows.some((r) => r.archive)).toBe(true);
    expect(data.rows.filter((r) => r.archive).every((r) => r.patch.endsWith("16"))).toBe(true);
  });
});

describe("partner groups", () => {
  it("keeps saved, observed and proposed apart, each champion once", () => {
    for (const b of bots) {
      const g = partnerOptions({ id: b.champion, role: "BOT" }, { botPairings: bots, proposed, rows: data.rows, playable, newestPatch: data.newestPatch });
      const ids = [...g.saved, ...g.observed, ...g.proposed].map((o) => o.id);
      expect(new Set(ids).size, b.champion).toBe(ids.length);
      expect(g.saved.map((o) => o.id).sort(), b.champion).toEqual([...new Set([...b.clashDefault, ...b.alternatives])].sort());
      for (const o of g.observed) expect(o.saved, `${b.champion}+${o.id}`).toBeUndefined();
      for (const o of g.observed) expect(o.evidence?.games.length, `${b.champion}+${o.id}`).toBeGreaterThan(0);
    }
  });

  it("puts a saved default first", () => {
    const g = partnerOptions({ id: "ezreal", role: "BOT" }, { botPairings: bots, proposed, rows: data.rows, playable, newestPatch: data.newestPatch });
    expect(g.saved[0].id).toBe("karma");
    expect(g.saved[0].saved?.kind).toBe("default");
  });

  it("never makes Ziggs + Karma saved", () => {
    expect(savedLink("ziggs", "karma", bots)).toBeUndefined();
    const g = partnerOptions({ id: "ziggs", role: "BOT" }, { botPairings: bots, proposed, rows: data.rows, playable, newestPatch: data.newestPatch });
    expect(g.saved.some((o) => o.id === "karma")).toBe(false);
  });

  it("labels a pro-derived alternative as such", () => {
    expect(savedLink("corki", "alistar", bots)?.kind).toBe("pro");
    expect(savedLink("corki", "nami", bots)?.kind).toBe("default");
  });
});

describe("reads", () => {
  it("validates the written notes and keeps them champion-specific", () => {
    const notes = Files["pairing-notes.json"].parse(JSON.parse(src("data/pairing-notes.json"))).notes;
    expect(notes.length).toBeGreaterThanOrEqual(20);
    for (const n of notes) {
      expect(byId.get(n.a)?.roles, n.a).toContain("BOT");
      expect(byId.get(n.b)?.roles, n.b).toContain("SUPPORT");
      expect(n.why.length, `${n.a}+${n.b}`).toBeGreaterThan(0);
      expect(n.weaknesses.length, `${n.a}+${n.b}`).toBeGreaterThan(0);
      // Pro frequency belongs to the Pro evidence layer, never a written read.
      expect(JSON.stringify(n), `${n.a}+${n.b}`).not.toMatch(/\b(pro games?|played \d+|win rate)\b/i);
    }
    for (const pair of [["ezreal", "karma"], ["draven", "leona"], ["lucian", "milio"], ["kalista", "renata-glasc"], ["yunara", "braum"], ["xayah", "rakan"], ["caitlyn", "bard"], ["sivir", "lulu"], ["ziggs", "nautilus"]])
      expect(noteFor(notes, pair[0], pair[1]), pair.join("+")).toBeDefined();
  });

  it("does not call every engage support an all-in for every ADC", () => {
    const ziggs = duoRead(kits.get("ziggs"), kits.get("nautilus"), { bot: "Ziggs", sup: "Nautilus" })!;
    const draven = duoRead(kits.get("draven"), kits.get("nautilus"), { bot: "Draven", sup: "Nautilus" })!;
    expect(draven.plan.label).not.toBe(ziggs.plan.label);
    for (const l of [ziggs.plan, ...ziggs.works, ...ziggs.weaknesses, ziggs.curve]) expect(l.basis, l.text).toBeTruthy();
  });

  it("names creator lessons as solo queue with their patch", () => {
    const list = pairLessons(data.lessons, "ezreal", "nautilus");
    expect(list.some((l) => l.kind === "pair")).toBe(true);
    for (const l of list) if (l.stat) expect(l.stat.patch, l.text).toMatch(/\d/);
  });
});

describe("separation and the board", () => {
  it("nothing that scores, orders or picks candidates reads the explorer", () => {
    for (const f of ["lib/recommend.ts", "lib/candidates.ts", "lib/counters.ts", "lib/model-v2/analyze.ts", "lib/model-v2/plan.ts", "lib/pro-alternatives.ts"])
      expect(src(f), f).not.toMatch(/pairings"|pairing-notes|PairingExplorer/);
  });

  it("Use in Draft Room adds the pair and keeps every other pick", () => {
    const board = { ally: { TOP: "aatrox", SUPPORT: "nautilus" }, enemy: { BOT: "ezreal", MID: "ahri" } };
    const out = withPair(board as never, { BOT: "ezreal", SUPPORT: "karma" });
    expect(out.ally).toMatchObject({ TOP: "aatrox", BOT: "ezreal", SUPPORT: "karma" });
    expect(out.enemy.BOT).toBeUndefined(); // the same champion is never on both teams
    expect(out.enemy.MID).toBe("ahri");
  });

  it("links into the explorer", () => {
    expect(explorerHref("ezreal", "karma")).toBe("/insights/?view=pairings&bot=ezreal&support=karma");
  });
});
