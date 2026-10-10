// Draft-fit recommendations (lib/recommend.ts): every champion is scored on saved pairings, synergy, team needs and
// matchups. Saved pairings lead when the draft has no bigger hole; pro evidence never moves a score.
import { describe, expect, it } from "vitest";
import { getCounters, getDraftData } from "@/lib/data";
import type { Draft } from "@/lib/evaluate";
import { counterPicks } from "@/lib/counters";
import { bestFix } from "@/lib/model-v2/analyze";
import { convertKits } from "@/lib/model-v2/kits";
import { recommend, savedSupports, teamNeeds, winConditions } from "@/lib/recommend";

const data = getDraftData();
const byId = new Map(data.champions.map((c) => [c.id, c]));
const top = (d: Draft, role: "TOP" | "JUNGLE" | "MID" | "BOT" | "SUPPORT", enemy: string[] = [], limit = 5) =>
  (recommend(d, enemy, data, limit)[role] ?? []).map((r) => r.champion);
const others: Draft[] = [{}, ...data.midJungle.map((m) => ({ [m.role]: m.anchor })), ...data.topPicks.map((t) => ({ TOP: t.champion }))];

describe("saved pairings lead an early draft", () => {
  it("Sivir → Lulu, Ezreal → Karma, Corki → Nami, Yunara → Lulu, Xayah → Rakan, Kalista → Renata, Zeri → Yuumi", () => {
    expect(top({ BOT: "sivir" }, "SUPPORT")[0]).toBe("lulu");
    expect(top({ BOT: "ezreal" }, "SUPPORT")[0]).toBe("karma");
    expect(top({ BOT: "corki" }, "SUPPORT")[0]).toBe("nami");
    expect(top({ BOT: "yunara" }, "SUPPORT")[0]).toBe("lulu");
    expect(top({ BOT: "xayah" }, "SUPPORT")[0]).toBe("rakan");
    expect(top({ BOT: "kalista" }, "SUPPORT")[0]).toBe("renata-glasc");
    expect(top({ BOT: "zeri" }, "SUPPORT")[0]).toBe("yuumi");
  });

  it("every bot alone gets one of its saved defaults first", () => {
    for (const b of data.botPairings) expect(b.clashDefault, b.champion).toContain(top({ BOT: b.champion }, "SUPPORT")[0]);
  });

  it("Ziggs: Nautilus / Leona lead with any one other pick, and Bard / Karma never outrank them", () => {
    for (const o of others) {
      const list = top({ ...o, BOT: "ziggs" }, "SUPPORT");
      expect(list.slice(0, 2).sort(), JSON.stringify(o)).toEqual(["leona", "nautilus"]);
    }
    expect(top({ BOT: "ziggs" }, "SUPPORT")).not.toContain("karma");
  });

  it("Skarner + Locke is the saved pairing, not Azir", () => {
    expect(top({ MID: "locke" }, "JUNGLE")[0]).toBe("skarner");
  });

  it("LeBlanc shows as a saved Lee Sin synergy, and Lee Sin leads for LeBlanc", () => {
    const mid = recommend({ JUNGLE: "lee-sin" }, [], data, Infinity).MID!;
    const lb = mid.find((r) => r.champion === "leblanc")!;
    expect(lb.parts.some((p) => p.kind === "saved" && /Lee Sin/.test(p.text))).toBe(true);
    expect(mid.findIndex((r) => r.champion === "leblanc")).toBeLessThan(6);
    expect(top({ MID: "leblanc" }, "JUNGLE")[0]).toBe("lee-sin");
  });

  it("Yone ↔ Maokai / Sejuani lead an early draft", () => {
    expect(top({ MID: "yone" }, "JUNGLE").slice(0, 2).sort()).toEqual(["maokai", "sejuani"]);
    expect(top({ JUNGLE: "maokai" }, "MID")[0]).toBe("yone");
    expect(top({ JUNGLE: "sejuani" }, "MID")[0]).toBe("yone");
  });
});

describe("ranking is by overall draft fit", () => {
  it("a saved default loses to a saved alternative that fixes the last hole", () => {
    const d = { TOP: "jayce", JUNGLE: "nidalee", MID: "azir", BOT: "ezreal" };
    const list = recommend(d, [], data, 50).SUPPORT!;
    expect(list[0].champion).not.toBe("karma");
    expect(byId.get(list[0].champion)!.attrs.frontline).toBeGreaterThanOrEqual(2);
    const karma = list.find((r) => r.champion === "karma")!;
    expect(karma.parts.some((p) => p.kind === "risk")).toBe(true);
  });

  it("a carry that needs setup pulls engage supports up", () => {
    const list = recommend({ BOT: "ziggs" }, [], data, 50).SUPPORT!;
    for (const id of ["nautilus", "leona"]) expect(list.find((r) => r.champion === id)!.parts.some((p) => p.kind === "need" && /fight starter/.test(p.text)), id).toBe(true);
  });

  it("enemy picks add matchup reasons", () => {
    const vs = recommend({ BOT: "jinx" }, ["ornn", "jarvan-iv"], data, 50).SUPPORT!;
    const peel = vs.filter((r) => r.parts.some((p) => p.kind === "matchup" && /Jarvan IV/.test(p.text)));
    expect(peel.length).toBeGreaterThan(0);
    for (const r of peel) expect(byId.get(r.champion)!.attrs.peel >= 2 || byId.get(r.champion)!.flags.includes("disengage")).toBe(true);
  });

  it("every recommendation explains itself, and scores add up", () => {
    for (const o of others.slice(0, 20)) for (const [, list] of Object.entries(recommend({ ...o, BOT: "sivir" }, ["orianna"], data))) {
      for (const r of list!) {
        expect(r.parts.length).toBeGreaterThan(0);
        for (const p of r.parts) expect(p.text.length).toBeGreaterThan(0);
        expect(r.score).toBeCloseTo(r.parts.reduce((s, p) => s + p.points, 0), 5);
      }
    }
  });

  it("locked and enemy picks are never recommended", () => {
    const d = { BOT: "sivir", SUPPORT: "lulu" };
    for (const list of Object.values(recommend(d, ["nautilus", "orianna"], data, 50))) {
      const ids = list!.map((r) => r.champion);
      for (const x of ["sivir", "lulu", "nautilus", "orianna"]) expect(ids).not.toContain(x);
    }
  });

  it("an empty draft has no recommendations", () => {
    for (const list of Object.values(recommend({}, [], data))) expect(list).toEqual([]);
  });
});

describe("pro evidence never moves a score", () => {
  it("scores and order are identical with every pro draft removed", () => {
    const noPro = { ...data, proDrafts: [] };
    for (const o of others) for (const d of [{ ...o, BOT: "corki" }, { ...o, BOT: "ziggs" }, o]) {
      const a = recommend(d, [], data, 50), b = recommend(d, [], noPro, 50);
      for (const role of Object.keys(a) as (keyof typeof a)[]) {
        expect(a[role]!.map((r) => [r.champion, r.score])).toEqual(b[role]!.map((r) => [r.champion, r.score]));
      }
    }
    }, 30_000); // ~75 full drafts ranked twice; slower than vitest's 5s default on CI runners

  it("observed-only partners get no saved-pairing bonus", () => {
    const corki = recommend({ BOT: "corki" }, [], data, 50).SUPPORT!.find((r) => r.champion === "alistar");
    expect(corki?.saved ?? null).toBeNull();
    for (const s of ["pyke", "camille"]) {
      const r = recommend({ BOT: "ziggs" }, [], data, 50).SUPPORT!.find((x) => x.champion === s);
      expect(r?.saved ?? null, s).toBeNull();
      expect(r?.parts.some((p) => p.kind === "saved") ?? false, s).toBe(false);
    }
  });
});

describe("with a bot locked, only its saved supports are actionable (alan, 2026-10-10)", () => {
  const THEORETICAL = ["alistar", "maokai", "rell", "braum", "shen"];

  it("Ziggs: Alistar, Maokai, Rell, Braum and Shen never appear in the Draft Room ranking, whatever else is locked", () => {
    const drafts: Draft[] = [...others, { TOP: "jayce", JUNGLE: "lee-sin", MID: "viktor" }, { TOP: "fiora", JUNGLE: "nidalee", MID: "azir" }];
    for (const o of drafts) {
      const list = top({ ...o, BOT: "ziggs" }, "SUPPORT", ["vi", "galio"], Infinity);
      expect(list.length, JSON.stringify(o)).toBeGreaterThan(0);
      for (const id of THEORETICAL) expect(list, `${id} ${JSON.stringify(o)}`).not.toContain(id);
      expect(list.every((id) => id === "nautilus" || id === "leona"), JSON.stringify(o)).toBe(true);
    }
  });

  it("every bot with saved supports only gets its default and alternatives", () => {
    for (const b of data.botPairings) for (const o of others.slice(0, 12)) {
      const list = top({ ...o, BOT: b.champion }, "SUPPORT", [], Infinity);
      const allowed = [...b.clashDefault, ...b.alternatives];
      for (const id of list) expect(allowed, `${b.champion}: ${id}`).toContain(id);
    }
  }, 30_000); // 17 bots × 12 drafts: slow under a parallel run

  it("other roles and a draft with no bot are unchanged: any support can be ranked", () => {
    expect(savedSupports({ MID: "orianna" }, data.botPairings)).toBeNull();
    expect(top({ TOP: "jayce", JUNGLE: "lee-sin", MID: "viktor" }, "SUPPORT", [], Infinity)).toEqual(expect.arrayContaining(["rell", "alistar"]));
  });

  it("a support counter outside the locked bot's saved supports is marked theoretical and listed last", () => {
    const d: Draft = { TOP: "ornn", JUNGLE: "sejuani", MID: "orianna", BOT: "ziggs" };
    const enemy = { SUPPORT: "lulu" };
    const row = (champion: string, winRate: number) => ({ role: "SUPPORT" as const, enemy: "lulu", champion, winRate, games: 2000, patch: "16.20",
      url: "https://dpm.lol/", updated: "2026-10-10", origin: "externally-provided" as const });
    const counters = { ...getCounters(), proResults: [], dpmDuos: [], dpm: [row("alistar", 0.58), row("nautilus", 0.53)] };
    const fits = recommend(d, ["lulu"], data, Infinity);
    const res = counterPicks(d, enemy, { ...data, counters }, fits).SUPPORT!.counters;
    expect(res.map((c) => c.champion)).toEqual(["nautilus", "alistar"]);
    expect(res[1].theoretical).toBe(true);
    expect(res[1].fitRank).toBeNull();
    expect(res[1].cautions[0]).toMatch(/Not one of Ziggs's saved supports: theoretical, not recommended/);
    expect(res[0].theoretical).toBe(false);
  });
});

describe("Kai'Sa and Aphelios Synergy records (alan, 2026-10-10)", () => {
  it("Kai'Sa with SUPPORT open recommends only Nautilus and Rakan", () => {
    for (const o of others) {
      const list = top({ ...o, BOT: "kaisa" }, "SUPPORT", [], Infinity);
      expect(list.length, JSON.stringify(o)).toBeGreaterThan(0);
      expect(list.every((id) => id === "nautilus" || id === "rakan"), `${JSON.stringify(o)}: ${list}`).toBe(true);
    }
    expect(top({ BOT: "kaisa" }, "SUPPORT", [], Infinity).sort()).toEqual(["nautilus", "rakan"]);
    expect(top({ BOT: "kaisa" }, "SUPPORT", [], Infinity)).not.toContain("rell");
  });

  it("Aphelios with SUPPORT open recommends only Thresh and Lulu", () => {
    for (const o of others) {
      const list = top({ ...o, BOT: "aphelios" }, "SUPPORT", [], Infinity);
      expect(list.length, JSON.stringify(o)).toBeGreaterThan(0);
      expect(list.every((id) => id === "thresh" || id === "lulu"), `${JSON.stringify(o)}: ${list}`).toBe(true);
    }
    expect(top({ BOT: "aphelios" }, "SUPPORT", [], Infinity).sort()).toEqual(["lulu", "thresh"]);
  });

  it("both supports are joint preferred: each gets the full saved-default bonus", () => {
    for (const [bot, sups] of [["kaisa", ["nautilus", "rakan"]], ["aphelios", ["thresh", "lulu"]]] as const) {
      const list = recommend({ BOT: bot }, [], data, Infinity).SUPPORT!;
      for (const s of sups) expect(list.find((r) => r.champion === s)?.saved, `${bot} ${s}`).toBe("default");
    }
  });

  it("pro-only pairings never become Synergy automatically", () => {
    for (const b of data.botPairings) {
      const saved = [...b.clashDefault, ...b.alternatives];
      const proOnly = [...new Set(b.observedProPairings.map((o) => o.champion))].filter((id) => !saved.includes(id));
      const list = recommend({ BOT: b.champion }, [], data, Infinity).SUPPORT!;
      for (const id of proOnly) {
        expect(list.map((r) => r.champion), `${b.champion}: ${id}`).not.toContain(id);
        for (const r of list) expect(r.parts.some((p) => p.kind === "saved" && p.text.includes(byId.get(id)!.name)), `${b.champion}: ${id}`).toBe(false);
      }
    }
    // The two new records carry no pro evidence at all.
    for (const id of ["kaisa", "aphelios"]) {
      const b = data.botPairings.find((x) => x.champion === id)!;
      expect(b.observedProPairings).toEqual([]);
      expect(b.sources).toEqual([]);
    }
  });

  it("logic suggestions respect the bot/support eligibility rule", () => {
    const kits = convertKits(data.champions);
    for (const [bot, sups] of [["kaisa", ["nautilus", "rakan"]], ["aphelios", ["thresh", "lulu"]]] as const) {
      for (const d of [{ BOT: bot }, { TOP: "jayce", JUNGLE: "lee-sin", MID: "viktor", BOT: bot }] as Draft[]) {
        const r = bestFix("SUPPORT", d, kits, data.botPairings);
        expect(r.restricted).toBe(true);
        for (const c of r.fixes) expect(sups, `${bot}: ${c.champion}`).toContain(c.champion);
        for (const c of r.theoretical) expect(sups, `${bot}: ${c.champion}`).not.toContain(c.champion);
        const best = recommend(d, [], data, Infinity).SUPPORT!.filter((x) => x.bestFix).map((x) => x.champion);
        for (const id of best) expect(sups, `${bot} best fix ${id}`).toContain(id);
      }
    }
  });
});

describe("comp-analysis needs feed the ranking (alan's brief, items 8 and 10)", () => {
  it("Ziggs support: Nautilus is the best fix for frontline and engage, and only saved supports appear", () => {
    const list = recommend({ TOP: "jayce", JUNGLE: "lee-sin", MID: "viktor", BOT: "ziggs" }, [], data, Infinity).SUPPORT!;
    expect(list.map((r) => r.champion).sort()).toEqual(["leona", "nautilus"]);
    const naut = list.find((r) => r.champion === "nautilus")!;
    expect(naut.bestFix).toBe(true);
    expect(naut.fixes).toEqual(expect.arrayContaining(["Frontline", "Primary engage"]));
    expect(naut.parts.some((p) => p.kind === "need" && /^Fixes frontline/.test(p.text))).toBe(true);
  });

  it("a late top pick into a comp with no frontline ranks frontliners that also fix the engage's follow-up first", () => {
    const list = recommend({ JUNGLE: "vi", MID: "ahri", BOT: "sivir", SUPPORT: "lulu" }, [], data, 10).TOP!;
    for (const r of list.slice(0, 3)) expect(byId.get(r.champion)!.attrs.frontline, r.champion).toBeGreaterThanOrEqual(2);
    expect(list[0].fixes).toEqual(expect.arrayContaining(["Frontline"]));
  });

  it("each role has at most one best fix; every row carries fixes, also and tradeoff lists", () => {
    for (const o of others.slice(0, 15)) for (const [, list] of Object.entries(recommend({ ...o, BOT: "sivir" }, [], data, Infinity))) {
      expect(list!.filter((r) => r.bestFix).length).toBeLessThanOrEqual(1);
      for (const r of list!) for (const k of ["fixes", "also", "tradeoffs"] as const) expect(Array.isArray(r[k])).toBe(true);
    }
  });

  it("one weakness scores once, even when a pick covers two jobs it asks for", () => {
    const list = recommend({ JUNGLE: "vi", MID: "ahri", BOT: "sivir", SUPPORT: "lulu" }, [], data, Infinity).TOP!;
    for (const r of list) {
      const causes = r.parts.filter((p) => p.kind === "need" && p.text.startsWith("Fixes")).map((p) => p.text.split(": ")[1]);
      expect(new Set(causes).size, r.champion).toBe(causes.length);
    }
  });
});

describe("team needs and win conditions", () => {
  const champs = (...ids: string[]) => ids.map((id) => byId.get(id)!);
  it("Ziggs asks for a fight starter, Jinx for peel", () => {
    expect(teamNeeds(champs("ziggs")).map((n) => n.id)).toContain("setup");
    expect(teamNeeds(champs("jinx")).map((n) => n.id)).toContain("peel");
    expect(teamNeeds(champs("ziggs", "nautilus")).map((n) => n.id)).not.toContain("setup");
  });

  it("reads an engage teamfight comp", () => {
    const plans = winConditions(champs("ornn", "jarvan-iv", "orianna", "jinx", "leona"));
    expect(plans.map((p) => p.id)).toContain("teamfight");
    expect(plans.find((p) => p.id === "teamfight")!.text).toMatch(/Leona|Ornn|Jarvan/);
  });
});
