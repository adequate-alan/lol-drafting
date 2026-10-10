// Demacia Cup 2026 (patch 16.18) as a separate current-meta evidence set, supplied by alan on 2026-10-10.
// Gol.gg could not be read from this environment, so every new source stays externally provided and pending refresh.
import { describe, expect, it } from "vitest";
import { getBotPairings, getChampions, getGenG, getMeta, getProDrafts, getSources } from "@/lib/data";
import { describeLine, groupObserved } from "@/lib/evidence";
import { proSuggestions } from "@/lib/suggest";

const DEMACIA = "Demacia Cup Global Invitational 2026";
const sources = Object.fromEntries(getSources().map((s) => [s.id, s]));
const events = Object.fromEntries(getMeta().events.map((e) => [e.id, e]));
const bot = (id: string) => getBotPairings().find((b) => b.champion === id)!;

describe("Demacia Cup evidence", () => {
  it("is its own ongoing current-meta event on 16.18", () => {
    const e = events["demacia-cup-2026"];
    expect(e).toMatchObject({ name: DEMACIA, kind: "current-meta", status: "ongoing", patch: "16.18", startDate: "2026-10-03", endDate: "2026-10-17" });
    expect(events["lck-2026-playoffs"]).toMatchObject({ patch: "16.16", status: "complete" });
  });

  it("every new source is externally provided by alan and pending refresh, never Claude-verified", () => {
    for (const id of ["golgg-game-83452", "golgg-game-83460", "golgg-game-83459", "golgg-game-83462", "golgg-champion-13"]) {
      const s = sources[id];
      expect(s, id).toBeDefined();
      expect(s).toMatchObject({ origin: "externally-provided", refreshStatus: "not-refreshed", lastChecked: null });
      expect(s.pendingClaim?.providedBy).toBe("alan");
    }
    for (const s of getSources().filter((s) => s.tournament === DEMACIA)) expect(s.patch).toBe("16.18");
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
    expect(bot("jhin").alternatives).toEqual(["bard", "neeko", "nautilus"]);
    expect(bot("corki").clashDefault).toEqual(["nami"]);
    expect(bot("ziggs").clashDefault).toEqual(["nautilus", "leona"]);
  });

  it("stays off the Gen.G page and out of the recorded LCK drafts", () => {
    const demaciaIds = new Set(getSources().filter((s) => s.tournament === DEMACIA).map((s) => s.id));
    for (const p of getGenG()) for (const s of p.sources) expect(demaciaIds.has(s), p.title).toBe(false);
    for (const d of getProDrafts()) expect(d.tournament).not.toBe(DEMACIA);
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
    expect(events["demacia-cup-2026"].stats.find((s) => s.champion === "locke")).toMatchObject({ picks: 3, bans: 1, role: "MID" });
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
    const s = proSuggestions({ BOT: "sivir" }, getProDrafts(), { botPairings: getBotPairings(), events: getMeta().events, sources });
    const karma = s.SUPPORT!.find((x) => x.champion === "karma")!;
    expect(s.SUPPORT![0].champion).toBe("karma");
    expect(karma.lines[0]).toMatchObject({ event: "Demacia Cup", patch: "16.18", date: "2026-10-04", games: 1 });
    expect(karma.lines.slice(1).map((l) => l.event)).toContain("LCK Playoffs");
    const byLulu = proSuggestions({ SUPPORT: "lulu" }, getProDrafts(), { botPairings: getBotPairings(), events: getMeta().events, sources });
    expect(byLulu.BOT![0].champion).toBe("yunara");
  });
});
