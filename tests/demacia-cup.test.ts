// Demacia Cup 2026 (patch 16.18) as a separate current-meta evidence set, supplied by alan on 2026-10-10.
// Supplied links stay externally provided and pending until the daily refresh (scripts/refresh-pro-data.mjs) records
// their game from Gol.gg and the game shows the claim. From 2026-10-11 the event's games and totals are imported daily,
// so counts here are checked as relationships, not fixed numbers.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getBotPairings, getChampions, getGenG, getMeta, getProDrafts, getProGames, getSources } from "@/lib/data";
import { describeLine, groupObserved } from "@/lib/evidence";
import { proSuggestions } from "@/lib/suggest";

const DEMACIA = "Demacia Cup Global Invitational 2026";
const sources = Object.fromEntries(getSources().map((s) => [s.id, s]));
// Draft Room checks are scoped to the two events they were written for, so Worlds 2026 imports cannot move them.
const knownDrafts = () => getProDrafts().filter((d) => d.tournament === DEMACIA || d.tournament === getMeta().tournament.name);
const events = Object.fromEntries(getMeta().events.map((e) => [e.id, e]));
const bot = (id: string) => getBotPairings().find((b) => b.champion === id)!;

describe("Demacia Cup evidence", () => {
  it("is its own ongoing current-meta event on 16.18", () => {
    const e = events["demacia-cup-2026"];
    expect(e).toMatchObject({ name: DEMACIA, kind: "current-meta", patch: "16.18", startDate: "2026-10-03" });
    // Ongoing until the refresh sees every series played and the final in.
    const state = getProGames().tournaments.find((t) => t.event === "demacia-cup-2026");
    expect(e.status).toBe(state?.status === "complete" ? "complete" : "ongoing");
    expect(events["lck-2026-playoffs"]).toMatchObject({ patch: "16.16", status: "complete" });
  });

  it("a supplied source stays pending until its game is recorded and shows the claim", () => {
    const recorded = new Set(getProDrafts().flatMap((d) => d.sources));
    for (const id of ["golgg-game-83452", "golgg-game-83460", "golgg-game-83459", "golgg-game-83462", "golgg-champion-13"]) {
      const s = sources[id];
      expect(s, id).toBeDefined();
      if (s.pendingClaim) {
        expect(s).toMatchObject({ origin: "externally-provided", refreshStatus: "not-refreshed", lastChecked: null });
        expect(s.pendingClaim.providedBy).toBe("alan");
      } else {
        expect(s, id).toMatchObject({ origin: "golgg-refresh", refreshStatus: "verified" });
        expect(recorded.has(id), id).toBe(true);
      }
    }
    expect(sources["golgg-champion-13"].pendingClaim).toBeDefined(); // a champion page, never a recorded game
    for (const s of getSources().filter((s) => s.tournament === DEMACIA)) expect(s.patch, s.id).toMatch(/^\d+\.\d+$/);
  });

  it("adds the four duos as pro evidence only, never as saved pairings", () => {
    const duos: [string, string, string][] = [["ezreal", "karma", "83452"], ["yunara", "lulu", "83460"], ["sivir", "karma", "83459"], ["jhin", "bard", "83462"]];
    for (const [b, s, game] of duos) {
      const o = bot(b).observedProPairings.find((o) => o.event === "demacia-cup-2026" && o.champion === s);
      expect(o, `${b}+${s}`).toMatchObject({ era: "current-meta", backedByGame: false, proDraftIds: [], sources: [`golgg-game-${game}`] });
    }
    // Saved pairings are untouched (alan decides these).
    expect(bot("sivir").clashDefault).toEqual(["lulu"]);
    expect(bot("ezreal").clashDefault).toEqual(["karma"]);
    expect(bot("yunara").clashDefault).toEqual(["lulu"]);
    expect(bot("jhin").clashDefault).toEqual(["alistar", "karma"]);
    expect(bot("jhin").alternatives.filter((a) => !bot("jhin").proAlternatives?.includes(a))).toEqual(["bard", "neeko", "nautilus"]);
    // No Demacia duo was new, so the Demacia Cup added no pro-derived alternative.
    for (const [b, s] of duos) expect(bot(b).proAlternatives ?? [], `${b}+${s}`).not.toContain(s);
    expect(bot("corki").clashDefault).toEqual(["nami"]);
    expect(bot("ziggs").clashDefault).toEqual(["nautilus", "leona"]);
  });

  it("stays off the Gen.G page and out of the recorded LCK drafts", () => {
    const demaciaIds = new Set(getSources().filter((s) => s.tournament === DEMACIA).map((s) => s.id));
    for (const p of getGenG()) for (const s of p.sources) expect(demaciaIds.has(s), p.title).toBe(false);
    // Hand-recorded drafts are the LCK sample; Demacia games come only from the daily import.
    const handDrafts = JSON.parse(readFileSync(join(process.cwd(), "data/pro-drafts.json"), "utf8")) as { tournament: string }[];
    for (const d of handDrafts) expect(d.tournament).not.toBe(DEMACIA);
    for (const d of getProDrafts().filter((d) => d.tournament === DEMACIA)) expect(d.id).toMatch(/^golgg-\d+-(blue|red)$/);
  });

  it("event notes and stats cite only known sources and mark small samples", () => {
    for (const e of getMeta().events) {
      for (const id of [...e.sources, ...e.notes.flatMap((n) => n.sources), ...e.stats.flatMap((s) => s.sources)]) expect(sources[id], id).toBeDefined();
      for (const s of e.stats) expect(s.lowSample).toBe(s.picks < 5);
    }
  });

  it("Locke is an established pro mid; only his attributes are unreviewed", () => {
    const locke = getChampions().find((c) => c.id === "locke")!;
    expect(locke.roles).toEqual(["MID"]);
    expect(locke.reviewed).toBe(false);
    expect(locke.note).not.toMatch(/placeholder|not enough reference/i);
    // Gol.gg's champion list (Oct 10: 5 picks, 4 bans) superseded alan's earlier 3 picks / 1 ban report; the daily
    // refresh only adds games, and keeps the role the source named.
    const stat = events["demacia-cup-2026"].stats.find((s) => s.champion === "locke")!;
    expect(stat).toMatchObject({ role: "MID" });
    expect(stat.picks).toBeGreaterThanOrEqual(5);
    expect(stat.bans).toBeGreaterThanOrEqual(4);
  });
});

describe("freshness display", () => {
  it("shows 16.18 evidence above 16.16 for the same duo, with event, patch and date", () => {
    const [karma] = groupObserved(bot("ezreal").observedProPairings, events, sources).filter((g) => g.champion === "karma");
    expect(karma.lines.map((l) => l.patch)).toEqual(["16.18", "16.16"]);
    expect(describeLine(karma.lines[0])).toBe("1 game · Demacia Cup · 16.18 · Oct 3");
    expect(karma.lines[0].ongoing).toBe(true);
  });

  it("Draft Room pro pairings rank the 16.18 game first and keep older evidence", () => {
    const s = proSuggestions({ BOT: "sivir" }, knownDrafts(), { botPairings: getBotPairings(), events: getMeta().events, sources });
    const karma = s.SUPPORT!.find((x) => x.champion === "karma")!;
    expect(s.SUPPORT![0].lines[0]).toMatchObject({ event: "Demacia Cup", patch: "16.18" });
    expect(karma.lines[0]).toMatchObject({ event: "Demacia Cup", patch: "16.18" });
    expect(karma.lines[0].date! >= "2026-10-04").toBe(true);
    expect(karma.lines[0].games).toBeGreaterThanOrEqual(1);
    expect(karma.lines.slice(1).map((l) => l.event)).toContain("LCK Playoffs");
    const byLulu = proSuggestions({ SUPPORT: "lulu" }, knownDrafts(), { botPairings: getBotPairings(), events: getMeta().events, sources });
    expect(byLulu.BOT!.find((x) => x.champion === "yunara")?.lines[0]).toMatchObject({ event: "Demacia Cup", patch: "16.18" });
  });
});
