// Comp analysis proposal (lib/model-v2/analyze.ts): kit schema, the ten validation archetypes, early reads,
// enemy-aware reads and best fix. Not wired into the site until alan approves the example diagnoses.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getChampions } from "@/lib/data";
import { analyze, candidatesFor } from "@/lib/model-v2/analyze";
import { ARCHETYPES, EXTRA } from "@/lib/model-v2/archetypes";
import { convertKits, KITS } from "@/lib/model-v2/kits";
import { ChampionV2, Kit } from "@/lib/model-v2/schema";

const kits = convertKits(getChampions());
const extra = (id: string) => EXTRA.find((e) => e.id === id)!;
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

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
    const all = ids([...r.weakPoints, ...r.more]);
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

describe("enemy-aware reads", () => {
  it("an immobile main carry into Vi + Galio dive is flagged and asks for peel", () => {
    const e = extra("vs-dive");
    const r = analyze(e.draft, kits, e.enemy);
    expect(ids(r.versus)).toContain("vulnerable-to-dive");
    expect(r.versus.find((v) => v.id === "vulnerable-to-dive")!.text).toMatch(/Sivir/);
    expect(r.roleNeeds.SUPPORT![0].id).toBe("peel");
  });

  it("the same comp without enemies has no enemy insights", () => {
    expect(analyze(extra("vs-dive").draft, kits).versus).toEqual([]);
  });
});

describe("comp analysis is not wired into the site yet", () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") || p.endsWith(".ts") ? [p] : [];
  });
  it("no page, component or active engine imports it", () => {
    for (const f of [...files("app"), ...files("components"), "lib/recommend.ts", "lib/evaluate.ts", "lib/data.ts"])
      expect(readFileSync(f, "utf8"), f).not.toMatch(/model-v2/);
  });
});
