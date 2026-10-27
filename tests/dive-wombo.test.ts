// Dive vs wombo and who starts a fight (alan, 2026-10-27): dive is reaching and collapsing on priority targets, wombo is
// overlapping AoE that wins a grouped fight. The strategy read (Comp Check text, Comp Library, discovery) keeps a catch
// diver's crowd control out of the wombo layers; the ranking's default read is unchanged.
import { describe, expect, it } from "vitest";
import { getChampions } from "@/lib/data";
import { readLineup } from "@/lib/comp-discovery";
import { analyze, fightRoles, identities, slotsOf, type Draft } from "@/lib/model-v2/analyze";
import { analyzePlan } from "@/lib/model-v2/plan";
import { convertKits } from "@/lib/model-v2/kits";

const champions = getChampions();
const kits = convertKits(champions);
const nameOf = (id: string) => champions.find((c) => c.id === id)?.name ?? id;
const lineup = (TOP: string, JUNGLE: string, MID: string, BOT: string, SUPPORT: string): Draft => ({ TOP, JUNGLE, MID, BOT, SUPPORT });
const ids = (d: Draft, strategy: boolean) => analyze(d, kits, [], { strategy }).identity.all.map((i) => i.id);
const pair = (d: Draft) => { const p = analyzePlan(d, kits).identity; return [p.primary?.id, p.secondary?.id]; };

// Recorded Worlds 2026 drafts (Gol.gg game and side).
const KC_XAYAH = lineup("renekton", "qiyana", "orianna", "xayah", "rakan"); // 83601 red, Dive · Xayah
const KC_KENNEN = lineup("kennen", "jarvan-iv", "viktor", "xayah", "rakan"); // 83630 red
const DK = lineup("ornn", "lee-sin", "cassiopeia", "kaisa", "nautilus"); // 83656 red
const VIT = lineup("rumble", "qiyana", "orianna", "xayah", "rakan"); // 83563 blue
const RED = lineup("rumble", "wukong", "orianna", "xayah", "rakan"); // 83537 blue

describe("dive vs wombo", () => {
  it("Dive · Xayah reads as a dive, not a wombo: Qiyana's crowd control goes into reaching her target", () => {
    expect(pair(KC_XAYAH)).toEqual(["dive", undefined]);
    const r = readLineup(KC_XAYAH, kits, nameOf);
    expect(r.ok && r.read.tags).toEqual(["dive"]);
  });

  it("dives that also layer AoE engage keep both", () => {
    expect(pair(KC_KENNEN)).toEqual(["dive", "wombo"]);
    expect(pair(DK)).toEqual(["dive", "wombo"]);
  });

  it("wombo comps without a dive are untouched", () => {
    expect(ids(VIT, true)).toEqual(ids(VIT, false));
    expect(ids(RED, true)).toEqual(ids(RED, false));
    expect(pair(VIT)[0]).toBe("wombo");
    expect(pair(RED)[0]).toBe("wombo");
  });

  it("the default read (used by the ranking) still counts every AoE source", () => {
    expect(ids(KC_XAYAH, false)).toContain("wombo");
    expect(identities(slotsOf(KC_XAYAH, kits)).map((i) => i.id)).toContain("wombo");
  });
});

describe("fight roles", () => {
  it("keeps primary initiation, secondary initiation and follow-up apart", () => {
    const name = (xs: { c: { id: string } }[]) => xs.map((s) => s.c.id);
    const f = fightRoles(slotsOf(KC_XAYAH, kits));
    expect(name(f.primary)).toEqual(["rakan"]);
    expect(name(f.secondary)).toEqual(["qiyana"]);
    expect(name(f.followUp)).toContain("orianna");
    const tl = fightRoles(slotsOf(lineup("kled", "pantheon", "akali", "xayah", "rakan"), kits));
    expect(name(tl.secondary)).toEqual(["pantheon"]);
    expect(name(tl.primary)).not.toContain("pantheon");
  });

  it("the comp read names each level", () => {
    const r = readLineup(KC_XAYAH, kits, nameOf);
    expect(r.ok && r.read.strengths[0]).toBe("Fight start: Rakan; secondary start (catch or dive): Qiyana; follow-up: Renekton, Orianna and Xayah");
  });
});
