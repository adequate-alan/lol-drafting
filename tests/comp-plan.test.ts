// The plan-aware comp read (alan, 2026-10-14; lib/model-v2/plan.ts): is the comp missing something its own win
// condition needs? A preview beside the live Comp Check (?plan=1), never part of any score.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getDraftData } from "@/lib/data";
import { analyze, type Draft } from "@/lib/model-v2/analyze";
import { ARCHETYPES } from "@/lib/model-v2/archetypes";
import { convertKits } from "@/lib/model-v2/kits";
import { analyzePlan, type PlanFinding } from "@/lib/model-v2/plan";

const kits = convertKits(getDraftData().champions);
const plan = (d: Draft) => analyzePlan(d, kits);
const arch = (id: string) => ARCHETYPES.find((a) => a.id === id)!.draft;
const all = (r: ReturnType<typeof plan>): PlanFinding[] => [...r.weaknesses, ...r.more, ...r.accepted];
const tierOf = (r: ReturnType<typeof plan>, id: string) => all(r).find((w) => w.id === id)?.tier;
const real = (r: ReturnType<typeof plan>) => [...r.weaknesses, ...r.more].map((w) => w.id);

describe("plan jobs", () => {
  it("a clean front-to-back and a clean protect comp have every job and nothing real", () => {
    for (const id of ["front-to-back", "protect"]) {
      const r = plan(arch(id));
      expect(r.plan!.jobs.every((j) => j.met)).toBe(true);
      expect(real(r)).toEqual([]);
    }
  });

  it("a siege without anti-engage is critical, and names the job", () => {
    const r = plan(arch("no-engage"));
    expect(r.identity.primary!.id).toBe("poke");
    expect(tierOf(r, "plan:anti-engage")).toBe("critical");
    expect(r.headline).toMatch(/but missing anti-engage/);
  });

  it("a split-push comp whose other four cannot stall is critical", () => {
    expect(tierOf(plan(arch("split")), "plan:stall")).toBe("critical");
  });

  it("front-to-back with one carry: missing damage from behind the frontline, single threat stays a weakness", () => {
    const r = plan(arch("one-carry"));
    expect(tierOf(r, "plan:backline-damage")).toBe("weakness");
    expect(tierOf(r, "frontline-no-damage")).toBe("critical");
    expect(tierOf(r, "single-threat")).toBe("weakness");
  });
});

describe("intentional tradeoffs are accepted with a reason, real weaknesses stay", () => {
  it("a bruiser dive / skirmish comp with no tank accepts No frontline", () => {
    const r = plan({ TOP: "riven", JUNGLE: "lee-sin", MID: "sylas", BOT: "kalista", SUPPORT: "renata-glasc" });
    expect(r.identity.primary!.id).toBe("dive");
    expect(tierOf(r, "no-frontline")).toBe("accepted");
    expect(r.critical).toEqual([]);
  });

  it("a pick comp accepts No on-demand engage but keeps No frontline as a weakness, not critical", () => {
    const r = plan(arch("pick"));
    expect(r.identity.primary!.id).toBe("pick");
    expect(tierOf(r, "no-frontline")).toBe("weakness");
    expect(real(r)).not.toContain("no-fight-start");
  });

  it("a full dive accepts short range but keeps the short-range carry without a protector", () => {
    const r = plan(arch("dive"));
    expect(tierOf(r, "short-range")).toBe("accepted");
    expect(tierOf(r, "duo-short-no-peel")).toBe("weakness");
  });

  it("a protect comp accepts a single main carry", () => {
    const r = plan({ TOP: "ksante", JUNGLE: "sejuani", MID: "orianna", BOT: "jinx", SUPPORT: "milio" });
    expect(real(r)).not.toContain("single-threat");
  });

  it("engage with no follow-up is kept", () => {
    expect(tierOf(plan(arch("engage-alone")), "engage-no-follow-up")).toBe("weakness");
  });

  it("all-AD into armor stays critical whatever the plan", () => {
    expect(tierOf(plan(arch("all-ad")), "armor-frontline")).toBe("critical");
  });

  it("every accepted tradeoff carries its reason", () => {
    for (const a of ARCHETYPES) for (const w of plan(a.draft).accepted) expect(w.why.length).toBeGreaterThan(20);
  });
});

describe("nothing is silently dropped", () => {
  it("every current Comp Check weak point is kept, accepted, or reported by a missing plan job", () => {
    for (const a of ARCHETYPES) {
      const cur = analyze(a.draft, kits);
      const r = plan(a.draft);
      const ids = new Set(all(r).flatMap((w) => [w.id, ...(w.replaces ?? [])]));
      const missingJobs = r.plan ? r.plan.jobs.filter((j) => !j.met).length : 0;
      for (const w of [...cur.weakPoints, ...cur.more]) {
        if (ids.has(w.id)) continue;
        // merged into a plan job: only allowed when that job is reported as missing
        expect(missingJobs, `${a.id}: ${w.id}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("early reads", () => {
  it("two picks is a preliminary read: the plan's missing jobs are needs, not critical findings", () => {
    const r = plan({ TOP: "jayce", BOT: "ziggs" });
    expect(r.confidence).toBe("early");
    expect(r.headline).toMatch(/^Early read/);
    expect(r.critical).toEqual([]);
    expect(real(r).some((id) => id.startsWith("plan:"))).toBe(false);
  });

  it("one pick has no read", () => {
    expect(plan({ TOP: "jayce" }).confidence).toBe("none");
  });
});

describe("separation", () => {
  it("recommendation scoring never reads the plan", () => {
    for (const f of ["lib/recommend.ts", "lib/candidates.ts", "lib/model-v2/analyze.ts"])
      expect(readFileSync(f, "utf8")).not.toMatch(/model-v2\/plan|from "\.\/plan"/);
  });
});
