// Champion Synergies has one tab per role (alan, 2026-10-12); the retired Mid / Jungle tab forwards by role.
import { describe, expect, it } from "vitest";
import { LEGACY_MID_JUNGLE, TAB_ROLE, TABS } from "@/components/views/synergy-tabs";
import { getMidJungle, jungleOnlyIds } from "@/lib/data";
import { generateStaticParams as synergyParams } from "@/app/(app)/synergies/[tab]/page";
import { generateStaticParams as firstPickParams } from "@/app/(app)/first-pick/[tab]/page";

describe("synergy role tabs", () => {
  it("reads Top | Jungle | Mid | Bot | Support, no combined tab", () => {
    expect(Object.values(TABS)).toEqual(["Top", "Jungle", "Mid", "Bot", "Support"]);
    expect(Object.keys(TABS)).not.toContain(LEGACY_MID_JUNGLE);
    expect(Object.values(TAB_ROLE)).toEqual(["TOP", "JUNGLE", "MID", "BOT", "SUPPORT"]);
  });

  it("still builds the old combined routes so their links forward", () => {
    for (const params of [synergyParams(), firstPickParams()]) {
      expect(params.map((p) => p.tab)).toEqual([...Object.keys(TABS), LEGACY_MID_JUNGLE]);
    }
  });

  it("keeps each mid/jungle record on its own role's page", () => {
    const mj = getMidJungle();
    expect(mj.find((r) => r.anchor === "akali")?.role).toBe("MID");
    expect(mj.find((r) => r.anchor === "jarvan-iv")?.role).toBe("JUNGLE");
  });

  it("sends a role-less old link to Jungle only when the champion has no mid profile", () => {
    const j = jungleOnlyIds();
    expect(j).toContain("jarvan-iv");
    expect(j).toContain("sejuani");
    expect(j).not.toContain("ahri");
    expect(j).not.toContain("akali");
  });
});
