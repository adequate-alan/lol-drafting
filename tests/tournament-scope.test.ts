// Tournament scopes (alan, 2026-10-23): Worlds Swiss, Knockouts, Play-In and All Worlds next to every other tournament,
// each counting only its own games, and Pro priority never taking a whole-tournament table into a stage.
import { describe, expect, it } from "vitest";
import { bucket, priorityData, priorityScopes } from "@/lib/pro-priority";
import { familyOf, inTournament, phaseOf, resolveScope, scopeChoices, scopeKey, scopeLabel } from "@/lib/tournament-scope";
import type { Meta, ProGame, ProGames } from "@/lib/schema";

const events = [
  { id: "worlds-2026", short: "Worlds 2026 Main Event", status: "ongoing" as const },
  { id: "worlds-2026-play-in", short: "Worlds 2026 Play-In", status: "complete" as const },
  { id: "demacia-cup-2026", short: "Demacia Cup", status: "complete" as const },
];

describe("tournament scopes", () => {
  it("split only the Worlds main event by stage, from Gol.gg's stage names", () => {
    expect(phaseOf("worlds-2026", "ROUND1")).toBe("swiss");
    expect(phaseOf("worlds-2026", "Round 3")).toBe("swiss");
    for (const s of ["QUARTERFINALS", "Semifinals", "FINAL", "Knockout Stage"]) expect(phaseOf("worlds-2026", s)).toBe("knockouts");
    expect(phaseOf("worlds-2026-play-in", "ROUND1")).toBeUndefined();
    expect(phaseOf("demacia-cup-2026", "FINAL")).toBeUndefined();
    expect(scopeKey("worlds-2026", "ROUND2")).toBe("worlds-2026:swiss");
    expect(scopeKey("demacia-cup-2026", "ROUND2")).toBe("demacia-cup-2026");
  });

  it("All Worlds holds every Worlds stage, a stage only its own games, the main event both stages", () => {
    expect(familyOf("worlds-2026-play-in")).toBe("worlds-2026-all");
    expect(familyOf("worlds-2026-knockout-stage")).toBe("worlds-2026-all");
    expect(familyOf("demacia-cup-2026")).toBeUndefined();
    expect(inTournament("worlds-2026-all", "worlds-2026:swiss")).toBe(true);
    expect(inTournament("worlds-2026-all", "worlds-2026-play-in")).toBe(true);
    expect(inTournament("worlds-2026-all", "demacia-cup-2026")).toBe(false);
    expect(inTournament("worlds-2026:swiss", "worlds-2026:knockouts")).toBe(false);
    expect(inTournament("worlds-2026:swiss", "worlds-2026-play-in")).toBe(false);
    expect(inTournament("worlds-2026", "worlds-2026:knockouts")).toBe(true);
    // A whole-tournament table (key = the event) is never inside one of its stages.
    expect(inTournament("worlds-2026:swiss", "worlds-2026")).toBe(false);
    expect(inTournament(undefined, "demacia-cup-2026")).toBe(true);
  });

  it("menus offer All Worlds, Worlds Swiss and Worlds Play-In with their own counts, and the main event only with two stages", () => {
    const swiss = scopeChoices([{ key: "worlds-2026:swiss", games: 16 }, { key: "worlds-2026-play-in", games: 22 }, { key: "demacia-cup-2026", games: 70 }], events);
    expect(swiss.map((c) => [c.label, c.games])).toEqual([["All Worlds", 38], ["Worlds Swiss", 16], ["Worlds Play-In", 22], ["Demacia Cup", 70]]);
    expect(swiss[1]).toMatchObject({ value: "worlds-2026:swiss", ongoing: true });
    const ko = scopeChoices([{ key: "worlds-2026:swiss", games: 40 }, { key: "worlds-2026:knockouts", games: 7 }, { key: "worlds-2026-play-in", games: 22 }], events);
    expect(ko.map((c) => [c.label, c.games])).toEqual([["All Worlds", 69], ["Worlds Knockouts", 7], ["Worlds Swiss", 40], ["Worlds Main Event", 47], ["Worlds Play-In", 22]]);
    // A lone Worlds stage has no All Worlds choice to repeat it.
    expect(scopeChoices([{ key: "worlds-2026-play-in", games: 22 }], events).map((c) => c.label)).toEqual(["Worlds Play-In"]);
    expect(scopeLabel("worlds-2026-knockout-stage", [{ id: "worlds-2026-knockout-stage", short: "Worlds 2026 Knockout Stage" }])).toBe("Worlds 2026 Knockout Stage");
  });

  it("an old ?event=worlds-2026 link opens the one stage the menu offers, anything unknown no scope", () => {
    const choices = [{ value: "worlds-2026-all" }, { value: "worlds-2026:swiss" }, { value: "worlds-2026-play-in" }];
    expect(resolveScope("worlds-2026", choices)).toBe("worlds-2026:swiss");
    expect(resolveScope("worlds-2026-all", choices)).toBe("worlds-2026-all");
    expect(resolveScope("lck-2027", choices)).toBeUndefined();
    expect(resolveScope(undefined, choices)).toBeUndefined();
  });
});

// Synthetic records: four Swiss and two knockout games of the main event, three Play-In games, all on one patch.
const game = (id: number, event: string, stage: string, champ: string): ProGame => ({
  id, event, tournament: event, seriesId: id, series: `A vs B`, game: 1, stage, date: `2026-10-${String(10 + (id % 20)).padStart(2, "0")}`, patch: "16.20",
  blue: { team: "A", picks: { TOP: champ, JUNGLE: "vi", MID: "ahri", BOT: "jhin", SUPPORT: "nami" }, bans: ["a1", "a2", "a3", "a4", "a5"] },
  red: { team: "B", picks: { TOP: "gnar", JUNGLE: "sejuani", MID: "azir", BOT: "xayah", SUPPORT: "rakan" }, bans: ["b1", "b2", "b3", "b4", "b5"] },
  winner: "blue", url: `https://gol.gg/game/stats/${id}/page-game/`, rolesUrl: `https://gol.gg/game/stats/${id}/page-fullstats/`, checkedOn: "2026-10-23",
});
const records = [
  ...[1, 2, 3, 4].map((i) => game(i, "worlds-2026", "ROUND1", "jax")),
  ...[5, 6].map((i) => game(i, "worlds-2026", "QUARTERFINALS", "ksante")),
  ...[7, 8, 9].map((i) => game(i, "worlds-2026-play-in", "ROUND1", "olaf")),
];
const ev = (id: string, name: string, games: number) => ({ id, name, short: name, kind: "current-meta", patch: "16.20", draftMode: "Fearless Draft", status: "ongoing",
  scope: "", statsComplete: true, stats: [], notes: [], sources: [], games });
const meta = { tournament: { name: "LCK 2026 Season Playoffs" }, stats: [], events: [ev("worlds-2026", "Worlds 2026 Main Event", 6), ev("worlds-2026-play-in", "Worlds 2026 Play-In", 3)] } as unknown as Meta;
const file = { tracked: [], games: records, tournaments: [
  { event: "worlds-2026", golgg: "Worlds 2026 Main Event", status: "ongoing", series: 6, seriesPlayed: 6, games: 6, recorded: 6, matchlist: "https://gol.gg/x/", lastUpdate: null, lastCheck: null },
  { event: "worlds-2026-play-in", golgg: "Worlds 2026 Play-In", status: "complete", series: 3, seriesPlayed: 3, games: 3, recorded: 3, matchlist: "https://gol.gg/y/", lastUpdate: null, lastCheck: null },
] } as unknown as ProGames;

describe("Pro priority by tournament scope", () => {
  const d = priorityData(meta, file);
  it("counts each scope over its own games only", () => {
    const n = (t?: string) => bucket(d, { patch: "16.20", tournaments: t ? [t] : undefined }).games;
    expect(n("worlds-2026:swiss")).toBe(4);
    expect(n("worlds-2026:knockouts")).toBe(2);
    expect(n("worlds-2026")).toBe(6);
    expect(n("worlds-2026-play-in")).toBe(3);
    expect(n("worlds-2026-all")).toBe(9);
    expect(n()).toBe(9);
    const jax = bucket(d, { patch: "16.20", tournaments: ["worlds-2026:swiss"] }).rows.find((r) => r.id === "jax")!;
    expect([jax.picks, jax.pickRate]).toEqual([4, 1]); // 4 of the 4 Swiss games, never over the 9 Worlds games
    expect(bucket(d, { patch: "16.20", tournaments: ["worlds-2026:swiss"] }).rows.find((r) => r.id === "ksante")).toBeUndefined();
  });
  it("lists the scopes in the menu with the same counts", () => {
    expect(priorityScopes(d).map((c) => [c.value, c.games])).toEqual([
      ["worlds-2026-all", 9], ["worlds-2026:knockouts", 2], ["worlds-2026:swiss", 4], ["worlds-2026", 6], ["worlds-2026-play-in", 3]]);
  });
});
