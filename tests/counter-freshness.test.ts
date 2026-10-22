// Counter freshness and empty states (alan, 2026-10-22): DPM rows from a patch older than the newest recognised one are
// marked historical, with the Riot changes since; an empty Counters list says why (no data, small sample, below the
// threshold, or taken) and never that no counter exists. Both are labels only: strength, the draft-fit score and the
// order of every list stay as they were. Fixture rows below are test data, not claims about real matchups.
import { describe, expect, it } from "vitest";
import { counterPicks, describeEvidence, DPM_MIN_GAMES, emptyText, laneCoverage, preliminaryText, type CounterInput, type EnemyDraft } from "@/lib/counters";
import { counterFreshness, newestPatch } from "@/lib/counter-freshness";
import { getCounterFreshness, getCounters, getDraftData, getPatchIndex } from "@/lib/data";
import type { Draft } from "@/lib/evaluate";
import { recommend } from "@/lib/recommend";
import { comparePatch } from "@/lib/patch";
import type { Counters, DpmMatchup, Role } from "@/lib/schema";

const data = getDraftData();
const fits = (d: Draft, enemy: EnemyDraft) => recommend(d, Object.values(enemy) as string[], data, Infinity);
const empty: Counters = { updated: "2026-10-10", dpmStatus: { reachable: true, checkedOn: "2026-10-10", note: "" }, proResults: [], dpm: [], dpmDuos: [] };
const row = (role: Role, enemy: string, champion: string, winRate: number, games = 2000, patch = "16.20"): DpmMatchup =>
  ({ role, enemy, champion, winRate, games, patch, url: "https://dpm.lol/", updated: "2026-10-10", origin: "externally-provided" });
const input = (dpm: DpmMatchup[], newestPatch?: string): CounterInput =>
  ({ champions: data.champions, pool: data.pool, proDrafts: [], counters: { ...empty, dpm }, newestPatch });
const run = (d: Draft, enemy: EnemyDraft, inp: CounterInput) => counterPicks(d, enemy, inp, fits(d, enemy));

describe("stale DPM data", () => {
  it("rows older than the newest patch are marked, keeping their strength", () => {
    const rows = [row("TOP", "aatrox", "jayce", 0.56)];
    const now = run({}, { TOP: "aatrox" }, input(rows, "26.20")).TOP!.counters[0];
    const later = run({}, { TOP: "aatrox" }, input(rows, "26.21")).TOP!.counters[0];
    expect(now.evidence.stale).toBeFalsy();
    expect(later.evidence.stale).toBe(true);
    expect(later.strength).toBe(now.strength);
    expect(describeEvidence(later.evidence)).toMatch(/older patch$/);
    expect(describeEvidence(now.evidence)).not.toMatch(/older patch/);
  });
  it("the newest patch reads both spellings and picks the highest", () => {
    expect(newestPatch(["16.18", "26.20"], ["16.19", undefined])).toBe("26.20");
    expect(newestPatch([])).toBeNull();
  });
  it("lists Riot's changes since the data patch only when stale", () => {
    const index = getPatchIndex();
    const oldest = index.patches.at(-1)!.patch;
    const fresh = counterFreshness({ ...empty, dpm: [row("TOP", "aatrox", "jayce", 0.56, 2000, oldest)] }, index, index.patches[0].patch);
    expect(fresh.stale).toBe(index.patches.length > 1);
    for (const list of Object.values(fresh.changes)) for (const c of list) expect(comparePatch(c.patch, oldest)).toBeGreaterThan(0);
    const same = counterFreshness({ ...empty, dpm: [row("TOP", "aatrox", "jayce", 0.56, 2000, index.patches[0].patch)] }, index, index.patches[0].patch);
    expect(same.stale).toBe(false);
    expect(same.changes).toEqual({});
  });
  it("the stored data is compared with the newest recognised patch", () => {
    const f = getCounterFreshness();
    expect(f.patch).toBeTruthy();
    expect(f.newest).toBeTruthy();
    expect(f.stale).toBe(comparePatch(f.patch!, f.newest!) < 0);
    expect(data.newestPatch).toBe(f.newest);
    expect(f.collected).toBe(getCounters().dpm.map((r) => r.updated).sort().at(-1));
  });
});

describe("empty Counters lists say why", () => {
  const read = (rows: DpmMatchup[], d: Draft = {}) => run(d, { TOP: "aatrox" }, input(rows)).TOP!;
  it("no data", () => {
    const r = read([]);
    expect(r.coverage.reason).toBe("no-data");
    expect(emptyText(r.coverage, "Aatrox")).toMatch(/No DPM\.LOL matchup data.*not proof that Aatrox has no counters/);
  });
  it("rows exist but the sample is small; favourable ones show as preliminary, never as counters", () => {
    const r = read([row("TOP", "aatrox", "jayce", 0.6, 120), row("TOP", "aatrox", "gnar", 0.49, 90)]);
    expect(r.counters).toEqual([]);
    expect(r.coverage.reason).toBe("small-sample");
    expect(r.coverage.preliminary.map((p) => p.champion)).toEqual(["jayce"]);
    expect(preliminaryText(r.coverage, (id) => id)).toMatch(new RegExp(`^Preliminary, under ${DPM_MIN_GAMES} games: jayce 60\\.0% of 120`));
  });
  it("enough games but nothing favourable", () => {
    const r = read([row("TOP", "aatrox", "gnar", 0.5)]);
    expect(r.coverage.reason).toBe("below-threshold");
    expect(emptyText(r.coverage, "Aatrox")).toMatch(/none at a 52% win rate/);
  });
  it("favourable rows exist but the champion is taken", () => {
    const r = read([row("TOP", "aatrox", "jayce", 0.56)], { MID: "jayce" });
    expect(r.coverage.reason).toBe("unavailable");
  });
  it("an older patch is named in the explanation", () => {
    const r = run({}, { TOP: "aatrox" }, input([row("TOP", "aatrox", "gnar", 0.5)], "26.21")).TOP!;
    expect(r.coverage.stale).toBe(true);
    expect(emptyText(r.coverage, "Aatrox", "26.21")).toMatch(/patch 26\.20, older than 26\.21/);
  });
  it("a listed counter carries no empty reason; coverage counts match the rows", () => {
    const rows = [row("TOP", "aatrox", "jayce", 0.56), row("TOP", "aatrox", "gnar", 0.5), row("TOP", "aatrox", "ornn", 0.6, 100)];
    const r = read(rows);
    expect(r.coverage).toMatchObject({ rows: 3, sampled: 2, favorable: 1 });
    expect(r.coverage.reason).toBeUndefined();
    expect(laneCoverage(rows, "TOP", "aatrox", () => true).preliminary.map((p) => p.champion)).toEqual(["ornn"]);
  });
});

describe("freshness and empty states never touch the ranking", () => {
  it("draft fit is identical whatever the newest patch", () => {
    const d: Draft = { JUNGLE: "vi" };
    const enemy: EnemyDraft = { TOP: "aatrox", MID: "ahri" };
    const a = fits(d, enemy);
    const b = recommend(d, Object.values(enemy) as string[], { ...data, newestPatch: "26.99" } as typeof data, Infinity);
    expect(b).toEqual(a);
  });
});
