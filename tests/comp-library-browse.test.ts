// Comp Library comparison and discovery (alan, 2026-10-26): each archetype row keeps its own difficulty, every card names
// what its evidence stands on (games, series, teams, newest game; a lineup under review is never counted), the Strategy
// filter maps tags to the comp check's identities without reclassifying anything, and search finds a champion in any
// lineup filed under a card.
import { describe, expect, test } from "vitest";
import { championsOf, LEVEL, strategiesOf } from "@/lib/comp-library";
import { getLibrary } from "@/lib/data";

const library = getLibrary();
const arch = library.extras["pro-83521-blue"].archetype!;

describe("archetype rows", () => {
  test("every row carries its own difficulty: the core's comes from the core, a named row's from its own read", () => {
    expect(arch.core.difficulty).toBe(LEVEL[library.shells.find((s) => s.id === "pro-83521-blue")!.difficulty]);
    for (const r of arch.members) {
      expect(r.difficulty).toBeDefined();
      if (r.kind === "named") expect(r.difficulty).toBe(r.read!.difficulty);
    }
  });
});

describe("card evidence", () => {
  test("origin follows the comp's source: curated shells, discovered comps, templates", () => {
    for (const s of library.shells) {
      const e = library.evidence[s.id];
      expect(e.origin).toBe(s.kind === "generalized" ? "template" : library.extras[s.id]?.discovered ? "discovered" : "curated");
      if (e.origin === "template") expect(e.games).toBe(0);
      expect(e.series).toBeLessThanOrEqual(e.games);
      expect(e.teams).toBeLessThanOrEqual(e.games);
    }
  });
  test("every curated observed comp counts its own source game, even without a game record", () => {
    for (const s of library.shells.filter((x) => x.kind === "observed" && !library.extras[x.id]?.discovered)) {
      if (s.sources.some((id) => id.startsWith("golgg-game-"))) expect(library.evidence[s.id].lineup, s.id).toBeGreaterThanOrEqual(1);
    }
  });
  test("an archetype counts every named variation and never the lineup under review", () => {
    const e = library.evidence["pro-83521-blue"];
    const rows = [arch.core, ...arch.members].flatMap((r) => r.games.map((g) => `${g.game}-${g.side}`));
    expect(e.games).toBeGreaterThanOrEqual(new Set(rows).size);
    const reviewed = arch.review.flatMap((r) => r.games.map((g) => g.game));
    expect(reviewed.length).toBeGreaterThan(0);
    // Shopify's game is filed with a member comp but stays under review, out of the archetype's count.
    const counted = new Set([...arch.members.flatMap((r) => [...r.games, ...r.alike.flatMap((a) => a.games), ...r.observed.flatMap((o) => o.games)]), ...arch.core.games].map((g) => g.game));
    for (const g of reviewed) expect(counted.has(g)).toBe(false);
  });
  test("the newest game date is the newest filed game, never the date the comp was added", () => {
    const e = library.evidence["pro-83521-blue"];
    const dates = [arch.core, ...arch.members].flatMap((r) => r.games.map((g) => g.date));
    expect(e.latest! >= dates.sort().at(-1)!).toBe(true);
  });
});

describe("strategy filter", () => {
  test("a discovered comp is filed under its primary and secondary identity", () => {
    const vit = library.shells.find((s) => s.id === "pro-83450-red")!;
    expect(strategiesOf(vit, library.extras[vit.id].discovered)).toEqual(["protect", "front-to-back"]);
  });
  test("curated tags map to identities; tags with no clear identity map to none", () => {
    const s = library.shells.find((x) => x.id === "yunara-protect")!;
    expect(strategiesOf(s)).toEqual(["protect", "pick"]);
    expect(strategiesOf({ ...s, identities: ["hybrid", "weakside", "objective-control"] })).toEqual([]);
  });
  test("every card can be found by at least one strategy", () => {
    for (const s of library.shells.filter((x) => !library.extras[x.id]?.variantOf && !library.extras[x.id]?.inArchetype))
      expect(strategiesOf(s, library.extras[s.id]?.discovered).length, s.id).toBeGreaterThan(0);
  });
});

describe("champion search", () => {
  test("a champion in a named variation is found on its archetype's card, apart from the board", () => {
    const core = library.shells.find((s) => s.id === "pro-83521-blue")!;
    const { board, filed } = championsOf(core, library.extras[core.id], library.shells);
    expect([...board].sort()).toEqual(["lulu", "olaf", "orianna", "xin-zhao", "yunara"]);
    expect(filed.has("anivia")).toBe(true);
    expect(filed.has("cassiopeia")).toBe(true);
    expect(filed.has("yunara")).toBe(false);
  });
});
