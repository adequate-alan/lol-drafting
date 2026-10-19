// The plan-aware comp read (alan, 2026-10-14; lib/model-v2/plan.ts): is the comp missing something its own win
// condition needs? A preview beside the live Comp Check (?plan=1), never part of any score.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getDraftData } from "@/lib/data";
import { analyze, type Draft } from "@/lib/model-v2/analyze";
import { ARCHETYPES } from "@/lib/model-v2/archetypes";
import { convertKits } from "@/lib/model-v2/kits";
import { analyzePlan, fifthPick, type PlanFinding } from "@/lib/model-v2/plan";
import { savedSupports } from "@/lib/recommend";
import { lineups as allLineups } from "../scripts/diagnostics/load";

const kits = convertKits(getDraftData().champions);
const lineups = allLineups.filter((l) => Object.values(l.picks).every((p) => kits.some((k) => k.id === p)));
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

  it("a split-push comp whose other four cannot stall is critical; one with map-wide ultimates and catches holds", () => {
    const r = plan({ TOP: "tryndamere", JUNGLE: "kindred", MID: "akali", BOT: "kaisa", SUPPORT: "blitzcrank" });
    expect(r.identity.primary!.id).toBe("split");
    expect(tierOf(r, "plan:stall")).toBe("critical");
    expect(tierOf(plan(arch("split")), "plan:stall")).toBeUndefined();
  });

  it("split: one side laner splits, a second side-lane champion is part of the four (Yorick, Cho'Gath, Ryze, Ezreal, Karma)", () => {
    const r = plan({ TOP: "yorick", JUNGLE: "chogath", MID: "ryze", BOT: "ezreal", SUPPORT: "karma" });
    expect(r.plan!.jobs.find((j) => j.id === "side")!.by).toBe("Yorick");
    expect(r.critical).toEqual([]);
  });

  it("front-to-back with one carry: missing damage from behind the frontline, single threat stays a weakness", () => {
    const r = plan(arch("one-carry"));
    expect(tierOf(r, "plan:backline-damage")).toBe("weakness");
    expect(tierOf(r, "frontline-no-damage")).toBe("critical");
    expect(tierOf(r, "single-threat")).toBe("weakness");
  });
});

describe("accuracy pass (alan, 2026-10-14): critical means the plan cannot be executed", () => {
  it("front-to-back: no frontline is critical, one frontliner is a frontline, missing depth is a weakness unless disengage covers it", () => {
    const covered = plan({ TOP: "jayce", JUNGLE: "jarvan-iv", MID: "ahri", BOT: "ashe", SUPPORT: "seraphine" });
    expect(covered.identity.primary!.id).toBe("front-to-back");
    expect(covered.plan!.jobs.find((j) => j.id === "depth")!.met).toBe(true);
    expect(covered.critical).toEqual([]);
    const bare = plan({ TOP: "jayce", JUNGLE: "qiyana", MID: "ryze", BOT: "jhin", SUPPORT: "alistar" });
    expect(tierOf(bare, "plan:depth")).toBe("weakness");
    expect(bare.critical).toEqual([]);
  });

  it("protect: one strong protector plus an engage that also protects (Thresh + Galio) is enough; a lone protector is not", () => {
    const r = plan({ TOP: "galio", JUNGLE: "qiyana", MID: "ahri", BOT: "aphelios", SUPPORT: "thresh" });
    expect(r.identity.primary!.id).toBe("protect");
    expect(r.plan!.jobs.find((j) => j.id === "protectors")!.met).toBe(true);
    expect(r.critical).toEqual([]);
  });

  it("a carry who stops a dive alone (Anivia's wall) is an exposed carry, not a critical one; Aphelios with nobody stays critical", () => {
    expect(tierOf(plan({ TOP: "gwen", JUNGLE: "qiyana", MID: "anivia", BOT: "jhin", SUPPORT: "blitzcrank" }), "carry-unprotected")).toBe("weakness");
    expect(tierOf(plan({ TOP: "varus", JUNGLE: "aatrox", MID: "akali", BOT: "aphelios", SUPPORT: "blitzcrank" }), "carry-unprotected")).toBe("critical");
  });

  it("skirmish: a lone bruiser kept up by an enchanter is thin, not missing", () => {
    const r = plan({ TOP: "rumble", JUNGLE: "naafiri", MID: "ryze", BOT: "lucian", SUPPORT: "milio" });
    expect(tierOf(r, "plan:durable")).toBe("weakness");
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

  it("a full dive accepts short range, and a diving carry is not asked for a protector", () => {
    const r = plan(arch("dive"));
    expect(tierOf(r, "short-range")).toBe("accepted");
    expect(tierOf(r, "duo-short-no-peel")).toBeUndefined();
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
  // Every recorded pro lineup plus the archetypes.
  const drafts: [string, Draft][] = [...ARCHETYPES.map((a) => [a.id, a.draft] as [string, Draft]), ...lineups.map((l) => [l.key, l.picks] as [string, Draft])];
  it("every current Comp Check weak point is kept, accepted, or reported by the specific plan job it merged into", () => {
    let checked = 0;
    for (const [key, d] of drafts) {
      const cur = analyze(d, kits);
      const r = plan(d);
      const ids = new Set(all(r).flatMap((w) => [w.id, ...(w.replaces ?? [])]));
      const shown = new Set(all(r).map((w) => w.id));
      for (const w of [...cur.weakPoints, ...cur.more]) {
        checked++;
        if (ids.has(w.id)) continue;
        const m = r.merged.find((x) => x.rule === w.id);
        expect(m, `${key}: ${w.id} is neither shown nor merged`).toBeDefined();
        // the job it merged into is missing and reported as its own finding
        expect(r.plan!.jobs.find((j) => `plan:${j.id}` === m!.job)?.met, `${key}: ${w.id} → ${m!.job}`).toBe(false);
        expect(shown.has(m!.job), `${key}: ${m!.job} not reported`).toBe(true);
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});

describe("following an engage (alan's review: four different things)", () => {
  it("Leona + Ezreal: ranged follow-up, not an all-in; a minor point, not \"cannot follow\"", () => {
    const r = plan(arch("engage-no-follow-up"));
    expect(tierOf(r, "duo-engage-no-follow")).toBeUndefined();
    const w = all(r).find((x) => x.id === "duo-engage-ranged-follow")!;
    expect(w.severity).toBe("minor");
    expect(w.why).toMatch(/Ezreal adds damage from range/);
  });

  it("carries with crowd control or burst of their own (Jhin, Xayah, Miss Fortune) follow an engage without a note", () => {
    for (const bot of ["jhin", "xayah", "miss-fortune", "varus"]) {
      const r = plan({ TOP: "ornn", JUNGLE: "sejuani", MID: "orianna", BOT: bot, SUPPORT: "leona" });
      expect(all(r).map((w) => w.id), bot).not.toContain("duo-engage-ranged-follow");
      expect(all(r).map((w) => w.id), bot).not.toContain("duo-engage-no-follow");
    }
  });

  it("Kai'Sa + Nautilus: a diving carry is not a short-range carry without a protector", () => {
    const r = plan({ TOP: "ksante", JUNGLE: "vi", MID: "ahri", BOT: "kaisa", SUPPORT: "nautilus" });
    expect(all(r).map((w) => w.id)).not.toContain("duo-short-no-peel");
  });
});

describe("four picks: missing essentials are needs for the last pick", () => {
  const four: Draft = { TOP: "jayce", JUNGLE: "lee-sin", MID: "viktor", BOT: "caitlyn" };
  it("the siege's missing anti-engage is needed from the support, with the supports that close it", () => {
    const r = plan(four);
    expect(r.open).toBe("SUPPORT");
    expect(r.critical).toEqual([]);
    const w = r.needed.find((x) => x.id === "plan:anti-engage")!;
    expect(w.tier).toBe("needed");
    expect(w.fixers!.length).toBeGreaterThan(0);
    expect(r.headline).toMatch(/the support must bring anti-engage/);
  });

  it("each named fixer really closes it, and the finished comp without one keeps the real severity", () => {
    const r = plan(four);
    const w = r.needed.find((x) => x.id === "plan:anti-engage")!;
    const id = (name: string) => kits.find((k) => k.name === name)!.id;
    expect(tierOf(plan({ ...four, SUPPORT: id(w.fixers![0]) }), "plan:anti-engage")).not.toBe("critical");
    expect(tierOf(plan({ ...four, SUPPORT: "pyke" }), "plan:anti-engage")).toBe("critical");
  });

  it("a fix keeps the plan: every named fixer fixes it within the plan, a pick that only changes the plan is named apart", () => {
    let fixers = 0, switches = 0;
    for (const l of lineups.slice(0, 60)) for (const drop of ["TOP", "JUNGLE", "MID", "BOT", "SUPPORT"] as const) {
      const d = { ...l.picks }; delete d[drop];
      const r = plan(d);
      for (const w of [...r.needed, ...r.critical]) {
        for (const n of w.fixers ?? []) { fixers++; expect(fifthPick(d, w.id, { ...d, [drop]: kits.find((k) => k.name === n)!.id }, kits), `${l.key} ${n}`).toBe("fixes"); }
        for (const n of w.switches ?? []) { switches++; expect(fifthPick(d, w.id, { ...d, [drop]: kits.find((k) => k.name === n)!.id }, kits), `${l.key} ${n}`).toBe("switches"); }
      }
    }
    expect(fixers).toBeGreaterThan(50);
    expect(switches).toBeGreaterThan(0);
  });
});

describe("named fixes follow the saved-bot support rule", () => {
  it("with Ziggs locked, only Ziggs's saved supports are named; others are theoretical", () => {
    const data = getDraftData();
    const r = analyzePlan({ TOP: "jayce", JUNGLE: "kindred", MID: "viktor", BOT: "ziggs" }, kits, [], data.botPairings);
    const w = r.needed.find((x) => x.id === "plan:anti-engage")!;
    const saved = (savedSupports({ BOT: "ziggs" }, data.botPairings) ?? []).map((id) => kits.find((k) => k.id === id)!.name);
    expect(w.fixers!.length).toBeGreaterThan(0);
    for (const n of w.fixers!) expect(saved).toContain(n);
    for (const n of w.theoretical ?? []) expect(saved).not.toContain(n);
  });
});

describe("structural read, enemy exposure as tags only", () => {
  const poke: Draft = { TOP: "jayce", JUNGLE: "nidalee", MID: "viktor", BOT: "ezreal", SUPPORT: "karma" };
  it("without enemy picks every finding is structural", () => {
    const r = plan(poke);
    expect(r.enemyRead).toBe("none");
    expect(all(r).every((w) => w.exposure === "structural")).toBe(true);
  });

  it("a hard-engage enemy exploits the missing anti-engage; a no-engage enemy makes it matter less; the tier never moves", () => {
    const vsEngage = analyzePlan(poke, kits, ["malphite", "sejuani", "orianna", "jinx", "leona"]);
    const vsNone = analyzePlan(poke, kits, ["gwen", "kindred", "azir", "jinx", "lulu"]);
    expect(all(vsEngage).find((w) => w.id === "plan:anti-engage")!.exposure).toBe("exploited");
    expect(all(vsNone).find((w) => w.id === "plan:anti-engage")!.exposure).toBe("less-relevant");
    expect(tierOf(vsEngage, "plan:anti-engage")).toBe(tierOf(plan(poke), "plan:anti-engage"));
    expect(tierOf(vsNone, "plan:anti-engage")).toBe(tierOf(plan(poke), "plan:anti-engage"));
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

describe("default Comp Check states (alan, 2026-10-14 rollout)", () => {
  it("zero through five allied picks: none, none, early, early, read with the open role, full", () => {
    const order = ["TOP", "JUNGLE", "MID", "BOT", "SUPPORT"] as const;
    const five: Draft = { TOP: "ornn", JUNGLE: "sejuani", MID: "orianna", BOT: "jinx", SUPPORT: "lulu" };
    const want = ["none", "none", "early", "early", "read", "full"];
    for (let n = 0; n <= 5; n++) {
      const d: Draft = Object.fromEntries(order.slice(0, n).map((r) => [r, five[r]]));
      const r = plan(d);
      expect(r.confidence, `${n} picks`).toBe(want[n]);
      expect(r.picks).toBe(n);
      expect(r.open).toBe(n === 4 ? "SUPPORT" : null);
    }
  });

  it("a champion without a kit is not counted and never breaks the read", () => {
    // Every champion has a kit since 2026-10-16; a made-up id stands in for one without.
    const r = plan({ TOP: "not-a-kit", JUNGLE: "sejuani", MID: "orianna" });
    expect(r.picks).toBe(2);
    expect(r.confidence).toBe("early");
  });

  it("known limitation, not suppressed: Gen.G Gwen / Aatrox / Akali / Ashe / Seraphine reads as split (shared identity engine) and keeps its critical stall gap", () => {
    // The shared identity read counts three side laners as a split comp; the team drafted it to skirmish. The fix
    // belongs in a plan-local reading of ambiguous identities, never in a lineup exception.
    const r = plan({ TOP: "gwen", JUNGLE: "aatrox", MID: "akali", BOT: "ashe", SUPPORT: "seraphine" });
    expect(r.identity.primary!.id).toBe("split");
    expect(r.critical.map((c) => c.id)).toContain("plan:stall");
    expect(readFileSync("lib/model-v2/plan.ts", "utf8")).not.toMatch(/gwen|aatrox|akali/i);
  });
});

describe("separation", () => {
  it("recommendation scoring never reads the plan", () => {
    for (const f of ["lib/recommend.ts", "lib/candidates.ts", "lib/model-v2/analyze.ts"])
      expect(readFileSync(f, "utf8")).not.toMatch(/model-v2\/plan|from "\.\/plan"/);
  });

  it("only the Comp Check surfaces read the plan: no other lib module, engine file or component imports it", () => {
    // The plan read is the default Comp Check (alan, 2026-10-14) and explanatory only; scoring, ranking, synergy,
    // counters, pool tiers and saved data never see it.
    const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(p) ? [p] : [];
    });
    // lib/candidate-preview.ts: the Comp Check read of a previewed candidate (alan, 2026-10-19), never a score.
    const allowed = ["lib/model-v2/plan.ts", "lib/comp-summary.ts", "lib/candidate-preview.ts", "components/CompCheck.tsx"];
    for (const f of [...files("lib"), ...files("components"), ...files("app")].filter((f) => !allowed.includes(f)))
      expect(readFileSync(f, "utf8"), f).not.toMatch(/model-v2\/plan|from "\.\/plan"|analyzePlan/);
  });
});
