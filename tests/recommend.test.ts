// Draft-fit recommendations (lib/recommend.ts): every champion is scored on saved pairings, synergy, team needs and
// matchups. Saved pairings lead when the draft has no bigger hole; pro evidence never moves a score.
import { describe, expect, it } from "vitest";
import { getDraftData } from "@/lib/data";
import type { Draft } from "@/lib/evaluate";
import { recommend, teamNeeds, winConditions } from "@/lib/recommend";

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

  it("Yone ↔ Maokai / Sejuani lead an early draft", () => {
    expect(top({ MID: "yone" }, "JUNGLE").slice(0, 2).sort()).toEqual(["maokai", "sejuani"]);
    expect(top({ JUNGLE: "maokai" }, "MID")[0]).toBe("yone");
    expect(top({ JUNGLE: "sejuani" }, "MID")[0]).toBe("yone");
  });
});

describe("ranking is by overall draft fit", () => {
  it("a saved support loses to a pick that fixes the last hole", () => {
    const d = { TOP: "jayce", JUNGLE: "nidalee", MID: "azir", BOT: "sivir" };
    const list = recommend(d, [], data, 50).SUPPORT!;
    expect(list[0].champion).not.toBe("lulu");
    expect(byId.get(list[0].champion)!.attrs.frontline).toBeGreaterThanOrEqual(2);
    const lulu = list.find((r) => r.champion === "lulu")!;
    expect(lulu.parts.some((p) => p.kind === "risk")).toBe(true);
  });

  it("a carry that needs setup pulls engage supports up even without a saved pairing", () => {
    const list = recommend({ BOT: "ziggs" }, [], data, 50).SUPPORT!;
    const rell = list.find((r) => r.champion === "rell")!;
    expect(rell.saved).toBeNull();
    expect(rell.parts.some((p) => p.kind === "need" && /fight starter/.test(p.text))).toBe(true);
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
  });

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
