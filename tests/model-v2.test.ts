// Proposed v2 model: schema rules and the five review comps. The site does not use v2 yet.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getChampions } from "@/lib/data";
import { damageProfile, picksV2, warningsV2, type DraftV2 } from "@/lib/model-v2/evaluate";
import { convert, EXAMPLE_COMPS, EXAMPLE_ONLY, REPRESENTATIVE } from "@/lib/model-v2/samples";
import { ChampionV2, DamageSplit } from "@/lib/model-v2/schema";
import { THRESHOLDS } from "@/lib/model-v2/thresholds";

const v2 = convert(getChampions(), { ...REPRESENTATIVE, ...EXAMPLE_ONLY });
const labels = (d: DraftV2) => warningsV2(d, v2).map((w) => w.label);

describe("v2 schema", () => {
  it("all sample conversions are valid and unreviewed", () => {
    expect(Object.keys(REPRESENTATIVE)).toHaveLength(10);
    for (const c of v2) {
      expect(ChampionV2.safeParse(c).success, c.id).toBe(true);
      expect(c.reviewed).toBe(false);
      expect("engage" in c.attrs).toBe(false);
    }
  });

  it("a damage split must total 1", () => {
    expect(DamageSplit.safeParse({ physical: 0.5, magic: 0.5, true: 0 }).success).toBe(true);
    expect(DamageSplit.safeParse({ physical: 0.5, magic: 0.4, true: 0 }).success).toBe(false);
  });

  it("damageByRole needs one entry per role the champion plays", () => {
    const camille = v2.find((c) => c.id === "camille")!;
    expect(ChampionV2.safeParse({ ...camille, damageByRole: { TOP: camille.damageByRole.TOP } }).success).toBe(false);
  });

  it("damage threat is role-aware", () => {
    const camille = v2.find((c) => c.id === "camille")!;
    expect(camille.damageByRole.TOP!.damageThreat).toBeGreaterThan(camille.damageByRole.SUPPORT!.damageThreat);
  });
});

describe("v2 warnings on the five review comps", () => {
  const [ad, hybrid, pick, followUp, ziggs] = EXAMPLE_COMPS;

  it("four AD carries + support Karma is too much AD and relies on catch", () => {
    expect(labels(ad.draft)).toEqual(expect.arrayContaining(["Too much AD", "No hard engage — relies on picks/catch"]));
  });

  it("two moderate magic sources together count as meaningful magic", () => {
    const d = damageProfile(picksV2(hybrid.draft, v2));
    expect(d.bestMagic!.magic).toBeLessThan(THRESHOLDS.damage.strongIndividual);
    expect(d.magic).toBeGreaterThanOrEqual(THRESHOLDS.damage.meaningfulCombined);
    expect(labels(hybrid.draft)).not.toContain("Too much AD");
    expect(labels(hybrid.draft)).not.toContain("No meaningful magic threat");
  });

  it("a pick comp gets the softer engage caution, not the hard warning", () => {
    const w = warningsV2(pick.draft, v2);
    expect(w.find((x) => x.id === "no-hard-engage")?.severity).toBe("caution");
    expect(w.map((x) => x.id)).not.toContain("no-fight-starter");
    expect(w.map((x) => x.id)).not.toContain("needs-fight-starter"); // catch satisfies Jhin
  });

  it("follow-up never satisfies a fight-start requirement", () => {
    expect(labels(followUp.draft)).toEqual(expect.arrayContaining(["No reliable fight starter", "Needs a fight starter"]));
  });

  it("Ziggs with a primary starter gets no engage warnings", () => {
    const ids = warningsV2(ziggs.draft, v2).map((w) => w.id);
    for (const id of ["no-hard-engage", "no-fight-starter", "needs-fight-starter"]) expect(ids).not.toContain(id);
  });

  it("Ziggs is satisfied by catch as well as primary", () => {
    expect(warningsV2({ BOT: "ziggs", SUPPORT: "thresh" }, v2).map((w) => w.id)).not.toContain("needs-fight-starter");
    expect(warningsV2({ BOT: "ziggs", SUPPORT: "lulu" }, v2).map((w) => w.id)).toContain("needs-fight-starter");
  });
});

describe("v2 reaches the site only through Comp Check", () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") || p.endsWith(".ts") ? [p] : [];
  });
  it("no page, component or active engine imports lib/model-v2 except Comp Check and the recommendation ranking", () => {
    for (const f of [...files("app"), ...files("components"), "lib/suggest.ts", "lib/evaluate.ts", "lib/data.ts"].filter((f) => !f.endsWith("CompCheck.tsx")))
      expect(readFileSync(f, "utf8"), f).not.toMatch(/model-v2/);
  });
});
