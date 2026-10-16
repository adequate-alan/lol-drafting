// The Pro evidence card (lib/pro-evidence.ts, components/EvidenceCards.tsx): one entry per game the "Pro · N games"
// label counted, newest first, with only what the game record shows. Results, sides and the opposing draft are never
// filled in; current enemy picks on the other team are an observed matchup, never a counter.
import { describe, expect, it } from "vitest";
import { getDraftData, getSources } from "@/lib/data";
import { draftCandidates } from "@/lib/candidates";
import { gameKey } from "@/lib/draft-side";
import { evidenceGames, newestFirst } from "@/lib/pro-evidence";
import type { Draft } from "@/lib/evaluate";

const data = getDraftData();
const sources = Object.fromEntries(getSources().map((s) => [s.id, s]));
const draft: Draft = { JUNGLE: "jarvan-iv", MID: "ahri" };
const enemy = { JUNGLE: "brand", MID: "akshan" };
const { unified } = draftCandidates(draft, enemy, data, sources);
const ctx = { drafts: data.proDrafts, sources, enemy };
const withPro = (unified.BOT ?? []).filter((c) => c.pro);

describe("Pro evidence games", () => {
  it("has rows to check in the screenshot scenario (Jarvan IV + Ahri, BOT open)", () => {
    expect(withPro.length).toBeGreaterThan(0);
  });

  it("lists exactly the games the label counts, newest first", () => {
    for (const c of withPro) {
      const games = evidenceGames(c.pro!, ctx);
      expect(games, c.champion).toHaveLength(c.pro!.score);
      expect(newestFirst(games), c.champion).toEqual(games);
    }
  });

  it("names the locked teammate in each game, on the same team and role as in the draft", () => {
    for (const c of withPro) {
      for (const g of evidenceGames(c.pro!, ctx)) {
        if (g.pending) continue;
        expect(g.picks!.BOT, c.champion).toBe(c.champion);
        expect(g.with.length, c.champion).toBeGreaterThan(0);
        for (const w of g.with) expect(g.picks![w.role!]).toBe(draft[w.role!]);
      }
    }
  });

  it("takes result, side and the opposing draft only from the records", () => {
    for (const c of withPro) {
      for (const g of evidenceGames(c.pro!, ctx)) {
        const d = data.proDrafts.find((x) => x.id === g.key);
        if (!d) continue;
        expect(g.won).toBe(d.won);
        expect(g.side).toBe(d.side);
        const other = data.proDrafts.find((x) => x.id !== d.id && gameKey(x) === gameKey(d) && x.team === d.opponent);
        expect(g.enemyPicks).toEqual(other?.picks);
        // Facing: only current enemy picks that the other recorded team actually played.
        for (const f of g.facing) expect(other!.picks[f.role!]).toBe(f.id);
        if (!other) expect(g.facing).toEqual([]);
      }
    }
  });
});
