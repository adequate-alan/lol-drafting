// Comp analysis proposal (lib/model-v2/analyze.ts): kit schema, the ten validation archetypes, early reads,
// enemy-aware reads and best fix. Comp Check in the Draft Room renders it (alan approved checkpoint 2).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getBotPairings, getChampions } from "@/lib/data";
import { analyze, bestFix, candidatesFor, economyBurden, slotsOf, type Draft, type Insight } from "@/lib/model-v2/analyze";
import { ARCHETYPES, EXTRA } from "@/lib/model-v2/archetypes";
import { convertKits, KITS } from "@/lib/model-v2/kits";
import { ChampionV2, Kit } from "@/lib/model-v2/schema";

const kits = convertKits(getChampions());
const extra = (id: string) => EXTRA.find((e) => e.id === id)!;
const ids = (xs: Insight[]) => xs.flatMap((x) => [x.id, ...(x.covers ?? [])]);

describe("kit schema", () => {
  it("every conversion is a valid, unreviewed v2 champion with a valid kit", () => {
    expect(kits.length).toBe(Object.keys(KITS).length);
    for (const c of kits) {
      expect(ChampionV2.safeParse(c).success, c.id).toBe(true);
      expect(Kit.safeParse(c.kit).success, c.id).toBe(true);
      expect(c.reviewed).toBe(false);
    }
  });

  it("covers every archetype champion and only real roster ids", () => {
    const have = new Set(kits.map((c) => c.id));
    for (const a of [...ARCHETYPES, ...EXTRA]) for (const id of [...Object.values(a.draft), ...(("enemy" in a && a.enemy) || [])]) expect(have.has(id!), id).toBe(true);
  });

  it("needs-setup champions have setupDependency 2 or more", () => {
    for (const c of kits.filter((k) => k.flags.includes("needs-setup"))) expect(c.kit.setupDependency, c.id).toBeGreaterThanOrEqual(2);
  });
});

describe("the ten validation archetypes", () => {
  it.each(ARCHETYPES.map((a) => [a.name, a] as const))("%s", (_name, a) => {
    const r = analyze(a.draft, kits);
    expect(r.confidence).toBe("full");
    if (a.expect.primary) expect(r.identity.primary?.id).toBe(a.expect.primary);
    if (a.expect.secondary) expect(r.identity.secondary?.id).toBe(a.expect.secondary);
    const all = ids([...r.weakPoints, ...r.more]);
    if (a.expect.clean) expect(all).toEqual([]);
    for (const w of a.expect.weak ?? []) expect(all).toContain(w);
    for (const w of a.expect.notWeak ?? []) expect(all).not.toContain(w);
    expect(r.winCondition).toBeTruthy();
    expect(r.weakPoints.length).toBeLessThanOrEqual(3);
  });

  it("weak points are ranked major before moderate before minor", () => {
    const order = { major: 3, moderate: 2, minor: 1 };
    for (const a of ARCHETYPES) {
      const r = analyze(a.draft, kits);
      const sev = [...r.weakPoints, ...r.more].map((w) => order[w.severity]);
      expect(sev).toEqual([...sev].sort((x, y) => y - x));
    }
  });

  it("one trait on one champion is not an identity", () => {
    // Fiora is the only side-laner in the dive comp's neighbourhood; Jayce alone is not a poke comp.
    expect(analyze({ TOP: "jayce", JUNGLE: "vi" }, kits).identity.all.map((i) => i.id)).not.toContain("poke");
  });
});

describe("confidence follows draft completion", () => {
  it("no read under two picks", () => {
    const r = analyze({ BOT: "ziggs" }, kits);
    expect(r.confidence).toBe("none");
    expect(r.identity.primary).toBeNull();
  });

  it("two picks give an early read that names what is still missing", () => {
    const r = analyze(extra("early").draft, kits);
    expect(r.confidence).toBe("early");
    expect(r.headline).toMatch(/^Early read: trending toward poke/);
    expect(r.headline).toMatch(/fight starter/);
    expect(r.headline).toMatch(/frontline/);
    // Team-wide weaknesses wait for four picks.
    expect(ids([...r.weakPoints, ...r.more])).not.toContain("no-frontline");
  });
});

describe("needs and best fix", () => {
  it("support needs come from the comp: frontline and engage around Ziggs", () => {
    const r = analyze(extra("support-open").draft, kits);
    expect(r.roleNeeds.SUPPORT!.map((n) => n.id).slice(0, 2)).toEqual(["frontline", "engage"]);
  });

  it("with Ziggs locked, best fix is only Nautilus or Leona; other fixes are theoretical", () => {
    const r = bestFix("SUPPORT", extra("support-open").draft, kits, getBotPairings());
    expect(r.restricted).toBe(true);
    expect(r.fixes.map((c) => c.champion).sort()).toEqual(["leona", "nautilus"]);
    expect(r.theoretical.map((c) => c.champion)).toEqual(expect.arrayContaining(["alistar", "maokai", "rell"]));
  });

  it("Nautilus fixes engage and frontline; a pure enchanter fixes neither", () => {
    const cs = candidatesFor("SUPPORT", extra("support-open").draft, kits);
    const naut = cs.find((c) => c.champion === "nautilus")!;
    expect(naut.fixes.map((f) => f.id).sort()).toEqual(["engage", "frontline"]);
    expect(cs[0].fixScore).toBe(naut.fixScore);
    expect(cs.find((c) => c.champion === "milio")!.fixes).toHaveLength(0);
  });

  it("a fix can carry a downside without being rejected", () => {
    const leona = candidatesFor("SUPPORT", extra("support-open").draft, kits).find((c) => c.champion === "leona")!;
    expect(leona.fixes.length).toBe(2);
    expect(leona.tradeoffs.length).toBeGreaterThan(0);
  });
});

describe("second-checkpoint corrections (alan, 2026-10-10)", () => {
  it("Trundle is a catch, so Gwen/Trundle/Viktor/Ezreal/Karma relies on catch instead of having no starter", () => {
    expect(kits.find((c) => c.id === "trundle")!.fightStart).toBe("catch");
  });

  it("three hungry carries in the three carry roles is not a resource conflict; a hungry support is", () => {
    const r = analyze({ TOP: "gwen", JUNGLE: "trundle", MID: "viktor", BOT: "ezreal", SUPPORT: "karma" }, kits);
    expect(ids([...r.weakPoints, ...r.more])).not.toContain("resource-conflict");
  });

  it("Sejuani, Vi, Ornn, Leona, Nautilus, Rell, Maokai, Alistar and Jarvan IV are primary; Lee Sin, Syndra, Thresh, Trundle and Qiyana are catch", () => {
    const fs = (id: string) => kits.find((c) => c.id === id)!.fightStart;
    for (const id of ["sejuani", "vi", "ornn", "leona", "nautilus", "rell", "maokai", "alistar", "jarvan-iv"]) expect(fs(id), id).toBe("primary");
    for (const id of ["lee-sin", "syndra", "thresh", "trundle", "qiyana"]) expect(fs(id), id).toBe("catch");
  });

  it("AD imbalance and no tank damage with one cause show as one weak point", () => {
    const r = analyze(ARCHETYPES.find((a) => a.id === "all-ad")!.draft, kits);
    expect(r.weakPoints[0].id).toBe("armor-frontline");
    expect(r.weakPoints.map((w) => w.id)).not.toContain("low-tank-damage");
  });

  it("a support's poke counts less than a carry's", () => {
    const r = analyze(ARCHETYPES.find((a) => a.id === "poke")!.draft, kits);
    expect(r.identity.primary!.because).toMatch(/Karma adds utility poke/);
  });
});

describe("economy is one team-wide income rule (alan, checkpoint 2 review)", () => {
  // Graves is a real hungry carry jungler; no support has resourceDemand 3, so a hungry Lulu is built from her kit.
  const hungry = (id: string, resourceDemand: 0 | 1 | 2 | 3) => {
    const c = kits.find((k) => k.id === id)!;
    return { ...c, id: `${id}-${resourceDemand}`, kit: { ...c.kit, resourceDemand } };
  };
  const pool = [...kits, hungry("lulu", 3)];
  const conflict = (draft: Draft) => ids((() => { const r = analyze(draft, pool); return [...r.weakPoints, ...r.more]; })()).includes("resource-conflict");

  it("a carry jungler beside two hungry laners is a normal carry-jungle comp, not a warning", () => {
    expect(conflict({ TOP: "ornn", JUNGLE: "graves", MID: "viktor", BOT: "jinx", SUPPORT: "lulu" })).toBe(false);
  });
  it("three hungry carries in TOP, MID and BOT is normal", () => {
    expect(conflict({ TOP: "gwen", JUNGLE: "sejuani", MID: "viktor", BOT: "jinx", SUPPORT: "lulu" })).toBe(false);
  });
  it("a hungry jungler warns only on top of an already resource-heavy team", () => {
    expect(conflict({ TOP: "gwen", JUNGLE: "graves", MID: "viktor", BOT: "jinx", SUPPORT: "lulu" })).toBe(true);
  });
  it("a truly hungry support weighs double", () => {
    expect(conflict({ TOP: "ornn", JUNGLE: "sejuani", MID: "viktor", BOT: "jinx", SUPPORT: "lulu-3" })).toBe(true);
    const b = economyBurden(slotsOf({ MID: "viktor", BOT: "jinx", SUPPORT: "lulu-3" }, pool));
    expect(b.base).toBe(4);
  });
  it("Gwen / Trundle / Viktor / Ezreal / Karma keeps no resource warning", () => {
    expect(conflict(ARCHETYPES.find((a) => a.id === "no-engage")!.draft)).toBe(false);
  });
});

describe("enemy-aware reads", () => {
  it("existing anti-dive structure keeps the Vi + Galio dive read minor, and support needs peel, disengage, lane priority", () => {
    const e = extra("vs-dive");
    const r = analyze(e.draft, kits, e.enemy);
    const dive = r.versus.find((v) => v.id === "vulnerable-to-dive")!;
    expect(dive.severity).toBe("minor");
    expect(dive.text).toMatch(/Sivir/);
    expect(r.headline).not.toMatch(/fragile/);
    expect(r.roleNeeds.SUPPORT!.map((n) => n.label)).toEqual(["Peel", "Disengage", "Bot lane priority"]);
  });

  it("the same comp with no protection at all is a major dive risk", () => {
    const r = analyze({ TOP: "jayce", MID: "viktor", BOT: "sivir", SUPPORT: "karma" }, kits, ["vi", "galio", "camille", "kaisa"]);
    expect(r.versus.find((v) => v.id === "vulnerable-to-dive")?.severity).toBe("major");
  });

  it("the same comp without enemies has no enemy insights", () => {
    expect(analyze(extra("vs-dive").draft, kits).versus).toEqual([]);
  });
});

describe("Comp Check reads the comp analysis engine", () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") || p.endsWith(".ts") ? [p] : [];
  });
  it("the Draft Room renders CompCheck, which runs analyze and bestFix", () => {
    expect(readFileSync("components/DraftRoom.tsx", "utf8")).toMatch(/<CompCheck /);
    const cc = readFileSync("components/CompCheck.tsx", "utf8");
    expect(cc).toMatch(/analyze\(/);
    expect(cc).toMatch(/bestFix\(/);
  });
  it("the engine never reads pro evidence", () => {
    for (const f of files("lib/model-v2")) expect(readFileSync(f, "utf8"), f).not.toMatch(/pro-drafts|proDrafts|observedProPairings|lib\/suggest|lib\/evidence/);
  });
});
