// Comp Library drawer links: saved links come only from alan's records, pro links only from games that show both picks.
import { describe, expect, it } from "vitest";
import { proLinks, savedLinks, type Slots } from "@/lib/comp-links";
import { getBotPairings, getCompShells, getMeta, getMidJungle, getProDrafts, getSources, getTopPicks } from "@/lib/data";
import { proGames } from "@/lib/pool-stats";
import { ROLES } from "@/lib/schema";

const data = { botPairings: getBotPairings(), midJungle: getMidJungle(), topPicks: getTopPicks() };
const games = proGames({ meta: getMeta(), proDrafts: getProDrafts(), botPairings: getBotPairings(), sources: Object.fromEntries(getSources().map((s) => [s.id, s])) });
const slotsOf = (id: string) => {
  const s = getCompShells().find((x) => x.id === id)!;
  return Object.fromEntries(ROLES.map((r) => [r, s.slots[r].champion])) as Slots;
};
const name = (id: string) => id;

describe("comp links", () => {
  it("links Ziggs and Nautilus as a saved default, from both sides", () => {
    const slots = slotsOf("mage-bot-siege");
    expect(savedLinks("SUPPORT", slots, data, name).find((l) => l.role === "BOT")?.kind).toBe("default");
    expect(savedLinks("BOT", slots, data, name).find((l) => l.role === "SUPPORT")?.kind).toBe("default");
  });

  it("links Skarner and Locke as a saved pairing", () => {
    const slots = slotsOf("speed-up-skirmish");
    expect(savedLinks("JUNGLE", slots, data, name).some((l) => l.role === "MID")).toBe(true);
  });

  it("pro links only cite games with both champions in those roles, and skip the comp's own game", () => {
    for (const s of getCompShells()) {
      const slots = slotsOf(s.id);
      for (const role of ROLES) for (const l of proLinks(role, slots, games, data, s.proDraftId)) {
        for (const g of l.games) {
          expect(g.picks[role]).toBe(slots[role]);
          expect(g.picks[l.role]).toBe(slots[l.role]);
          expect(g.draftId === undefined || g.draftId !== s.proDraftId).toBe(true);
        }
        for (const o of l.observed) expect(o.champion).toBe(slots[l.role]);
      }
    }
  });

  it("a shared pro game alone never creates a saved link", () => {
    // Kai'Sa + Rell is observed only, never saved.
    const slots = { ...slotsOf("classic-front-to-back"), BOT: "kaisa", SUPPORT: "rell" };
    expect(savedLinks("BOT", slots, data, name).some((l) => l.role === "SUPPORT")).toBe(false);
  });
});
