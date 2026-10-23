// Counter kit read (lib/matchup-read.ts, lib/matchup-kits.ts): General Draft Logic over the stored kit values, shown in
// the Counter card after the DPM statistic and apart from it. It never reads the win rate, never scores, never orders.
// The fixture book below is test data, not a claim about any real champion.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { counterPicks, DPM_MIN_GAMES, DPM_MIN_WIN_RATE, DPM_STRONG_WIN_RATE, laneOpponent, type Counter } from "@/lib/counters";
import { KITS } from "@/lib/model-v2/kits";
import { recommend } from "@/lib/recommend";
import { getBotPairings, getChampions, getCounters, getDraftData, getMatchupBook, getPool } from "@/lib/data";
import { matchupBook } from "@/lib/matchup-kits";
import { AGAINST_LIMIT, factOf, matchupRead, NO_READ_TEXT, READ_DISCLAIMER, READ_LIMIT, type MatchupBook, type MatchupFacts } from "@/lib/matchup-read";
import type { Role } from "@/lib/schema";

const quiet: MatchupFacts = { range: 0, poke: 0, waveclear: 1, lanePressure: 1, early: 2, late: 2, reach: 0, disengage: 1, counterEngage: 1, start: "follow-up", frontline: 1, tankDamage: 1, burst: 1 };
const f = (over: Partial<MatchupFacts>): MatchupFacts => ({ ...quiet, ...over });
const bookOf = (entries: Record<string, Partial<Record<Role, MatchupFacts>>>): MatchupBook => entries;
const kinds = (book: MatchupBook, a: string, b: string, role: Role = "TOP") => matchupRead(book, a, b, role).lines.map((l) => l.kind);

describe("each rule reads one stored difference and names it", () => {
  it("range, poke, waveclear and lane pressure in a lane", () => {
    const book = bookOf({ art: { TOP: f({ range: 3, poke: 3, waveclear: 3, lanePressure: 3 }) }, brawler: { TOP: f({ range: 0 }) } });
    const r = matchupRead(book, "art", "brawler", "TOP", (id) => id.toUpperCase());
    expect(r.status).toBe("read");
    // At most READ_LIMIT lines, in the fixed order (never ranked by any score): specific interactions before the curves.
    expect(r.lines.map((l) => l.kind)).toEqual(["range", "poke", "wave"]);
    expect(r.lines[0]).toMatchObject({ text: expect.stringContaining("ART trades from further out"), values: "range 3 vs 0" });
    expect(kinds(book, "art", "brawler").length).toBeLessThanOrEqual(READ_LIMIT);
    const early = matchupRead(bookOf({ a: { TOP: f({ lanePressure: 3 }) }, b: { TOP: f({}) } }), "a", "b", "TOP").lines;
    expect(early.map((l) => l.kind)).toEqual(["early"]);
    expect(early[0].text).toMatch(/lane pressure is the stronger/);
    expect(early[0].values).toBe("early 2 vs 2, lane pressure 3 vs 1");
    expect(kinds(bookOf({ a: { TOP: f({ waveclear: 3 }) }, b: { TOP: f({}) } }), "a", "b")).toEqual(["wave"]);
  });
  it("range, poke and waveclear are not read in the jungle; early skirmishes are", () => {
    const book = bookOf({ a: { JUNGLE: f({ range: 3, poke: 3, waveclear: 3, early: 3 }) }, b: { JUNGLE: f({ early: 1 }) } });
    const r = matchupRead(book, "a", "b", "JUNGLE");
    expect(r.lines.map((l) => l.kind)).toEqual(["early"]);
    expect(r.lines[0].text).toMatch(/Early skirmishes/);
  });
  it("reach against a kit with no disengage or counter-engage; crowd control and burst only against a stored low self-peel", () => {
    const book = bookOf({
      diver: { TOP: f({ reach: 2, start: "catch", burst: 3 }) },
      open: { TOP: f({ disengage: 0, counterEngage: 0 }) }, // no self-peel stored: a tank's or enchanter's 0 is "not stored"
      squishy: { TOP: f({ frontline: 0, mobility: 1 }) },
    });
    expect(kinds(book, "diver", "open")).toEqual(["allin"]);
    expect(kinds(book, "diver", "squishy")).toEqual(["cc", "burst"]);
    expect(kinds(bookOf({ a: { TOP: f({ reach: 2, early: 3, late: 3 }) }, b: { TOP: f({ disengage: 0, counterEngage: 0, early: 1, late: 1 }) } }), "a", "b")).toEqual(["allin", "early", "scaling"]);
    expect(matchupRead(book, "diver", "squishy", "TOP").lines[0].values).toBe("catch start; squishy self-peel 1");
  });
  it("mobility against a catch, tank damage against a frontliner, an answer to an on-demand start, late scaling", () => {
    const book = bookOf({
      slippery: { MID: f({ mobility: 2, late: 3 }) },
      catcher: { MID: f({ start: "primary", late: 2 }) },
      shredder: { TOP: f({ tankDamage: 3 }), SUPPORT: f({ tankDamage: 3 }) },
      wall: { TOP: f({ frontline: 3 }), SUPPORT: f({ frontline: 3 }) },
      peeler: { SUPPORT: f({ disengage: 3 }) },
      engager: { SUPPORT: f({ start: "primary" }) },
    });
    expect(kinds(book, "slippery", "catcher", "MID")).toEqual(["mobility", "scaling"]);
    expect(kinds(book, "shredder", "wall")).toEqual(["tank"]);
    expect(kinds(book, "shredder", "wall", "SUPPORT")).toEqual([]); // tank damage is not a support lane read
    expect(kinds(book, "peeler", "engager", "SUPPORT")).toEqual(["answer"]);
  });
});

describe("honesty: nothing one-sided, nothing invented", () => {
  it("a comparison that holds both ways explains nothing and is dropped from both sides", () => {
    const book = bookOf({ a: { MID: f({ reach: 3, disengage: 0, counterEngage: 0, start: "catch" }) }, b: { MID: f({ reach: 2, disengage: 0, counterEngage: 0, mobility: 2, start: "catch" }) } });
    const r = matchupRead(book, "a", "b", "MID");
    expect(r.lines).toEqual([]);
    expect(r.status).toBe("none");
    expect(r.against.map((l) => l.kind)).toEqual(["mobility"]);
  });
  it("says so when the stored kits give no clear reason, and when a kit is missing", () => {
    const book = bookOf({ a: { TOP: f({}) }, b: { TOP: f({}) } });
    expect(matchupRead(book, "a", "b", "TOP")).toEqual({ lines: [], against: [], status: "none" });
    expect(matchupRead(book, "a", "nobody", "TOP").status).toBe("unread");
    expect(NO_READ_TEXT).toMatch(/no clear reason/);
    expect(NO_READ_TEXT).toMatch(/sustain/); // not a stored value, so never cited as a reason
    expect(READ_DISCLAIMER).toMatch(/not proof and not a score/);
  });
  it("what the kits give the opponent is listed too, capped", () => {
    const book = bookOf({ a: { BOT: f({ reach: 3, late: 3 }) }, b: { BOT: f({ range: 3, poke: 3, waveclear: 3, disengage: 0, counterEngage: 0, late: 2 }) } });
    const r = matchupRead(book, "a", "b", "BOT");
    expect(r.lines.map((l) => l.kind)).toEqual(["allin", "scaling"]);
    expect(r.against.map((l) => l.kind)).toEqual(["range", "poke"]);
    expect(r.against.length).toBeLessThanOrEqual(AGAINST_LIMIT);
  });
  it("the read takes no statistic: the same pair reads the same whatever DPM says", () => {
    expect(matchupRead.length).toBe(4); // book, mine, theirs, role (and an optional name function): no statistic
    const book = bookOf({ a: { TOP: f({ range: 3 }) }, b: { TOP: f({}) } });
    const once = JSON.stringify(matchupRead(book, "a", "b", "TOP"));
    expect(JSON.stringify(matchupRead(book, "a", "b", "TOP"))).toBe(once);
    for (const l of matchupRead(book, "a", "b", "TOP").lines) expect(l.text).not.toMatch(/%|win|games|DPM|counter/i);
  });
  it("a role the champion does not play falls back to its first stored role", () => {
    const book = bookOf({ a: { MID: f({ range: 3 }) }, b: { TOP: f({}) } });
    expect(factOf(book, "a", "TOP")).toEqual(f({ range: 3 }));
    expect(kinds(book, "a", "b")).toEqual(["range"]);
  });
});

describe("the stored book", () => {
  const champions = getChampions();
  const book = matchupBook(champions);
  it("covers every champion with a kit, one fact set per role, and carries self-peel only where it means something", () => {
    for (const c of champions) {
      const entry = book[c.id];
      if (!entry) continue;
      for (const r of c.roles) expect(entry[r], `${c.id} ${r}`).toBeTruthy();
    }
    // A tank or enchanter not in the self-peel list has no mobility fact; a listed champion keeps its value.
    expect(book.braum?.SUPPORT?.mobility).toBeUndefined();
    expect(book.sivir?.BOT?.mobility).toBe(1);
    expect(getDraftData().matchupBook).toBe(getMatchupBook());
  });
  it("reads every qualifying DPM row without a win rate: read or none, never a throw", () => {
    const rows = getCounters().dpm.filter((r) => r.games >= 300 && r.winRate >= 0.52);
    const seen = { read: 0, none: 0, unread: 0 };
    for (const r of rows) seen[matchupRead(book, r.champion, r.enemy, r.role).status]++;
    if (rows.length) { expect(seen.unread).toBe(0); expect(seen.read + seen.none).toBe(rows.length); }
  });
  it("the opponent read is the champion in the counter's own role, for a lane row or a duo row", () => {
    const base = { champion: "x", strength: "favorable", pro: null, archive: null, tier: null, theoretical: false, fit: null, fitRank: null, cautions: [] as string[] } as const;
    const ev = { source: "dpm", strength: "favorable", games: 1000, winRate: 0.55, patch: "16.20", updated: "2026-10-22", url: "https://dpm.lol/" } as const;
    expect(laneOpponent({ ...base, role: "TOP", evidence: { ...ev, scope: "lane", vs: ["aatrox"] } } as Counter)).toBe("aatrox");
    expect(laneOpponent({ ...base, role: "BOT", evidence: { ...ev, scope: "duo", vs: ["sivir", "lulu"], with: "karma" } } as Counter)).toBe("sivir");
    expect(laneOpponent({ ...base, role: "SUPPORT", evidence: { ...ev, scope: "duo", vs: ["sivir", "lulu"], with: "ezreal" } } as Counter)).toBe("lulu");
  });
  it("the card never names the site's tooling and keeps the read apart from the statistic", () => {
    const src = readFileSync(join(process.cwd(), "components/EvidenceCards.tsx"), "utf8");
    const read = src.slice(src.indexOf("function KitRead"), src.indexOf("function StaleChanges"));
    expect(read).toMatch(/Kit read/);
    expect(read).toMatch(/analysis/);
    expect(read).not.toMatch(/winRate|\.games|describeEvidence/);
    expect(src).not.toMatch(/Claude|\bAI\b/);
  });
});

describe("scoring isolation (alan, 2026-10-23)", () => {
  const data = getDraftData();
  it("the draft-fit ranking, the counters and their thresholds are the same with or without the book", () => {
    const draft = { JUNGLE: "vi", MID: "ahri" } as const;
    const enemy = { TOP: "aatrox", BOT: "ezreal" } as const;
    const fits = recommend(draft, Object.values(enemy), data, Infinity);
    const { matchupBook: _book, ...without } = data;
    expect(recommend(draft, Object.values(enemy), without as typeof data, Infinity)).toEqual(fits);
    const counters = counterPicks(draft, enemy, data, fits);
    expect(counterPicks(draft, enemy, without as typeof data, fits)).toEqual(counters);
    // A counter carries no kit read field: the read lives in the card only, computed from the pair at render time.
    for (const rc of Object.values(counters)) for (const c of rc!.counters) expect(Object.keys(c)).not.toContain("read");
    expect([DPM_MIN_GAMES, DPM_MIN_WIN_RATE, DPM_STRONG_WIN_RATE]).toEqual([300, 0.52, 0.54]);
  });
  it("building and reading the book changes no kit, attribute, saved pairing or pool tier", () => {
    const kits = JSON.stringify(KITS), champs = JSON.stringify(getChampions()), bots = JSON.stringify(getBotPairings()), pool = JSON.stringify(getPool());
    const book = matchupBook(getChampions());
    for (const r of getCounters().dpm.slice(0, 200)) matchupRead(book, r.champion, r.enemy, r.role);
    expect(JSON.stringify(KITS)).toBe(kits);
    expect(JSON.stringify(getChampions())).toBe(champs);
    expect(JSON.stringify(getBotPairings())).toBe(bots);
    expect(JSON.stringify(getPool())).toBe(pool);
  });
  it("the book holds stored 0–3 values and fight starts only: no win rate, sample or score anywhere", () => {
    const allowed = new Set(["range", "poke", "waveclear", "lanePressure", "early", "late", "reach", "mobility", "disengage", "counterEngage", "start", "frontline", "tankDamage", "burst"]);
    for (const byRole of Object.values(getMatchupBook())) for (const facts of Object.values(byRole)) {
      for (const [k, v] of Object.entries(facts)) {
        expect(allowed.has(k), k).toBe(true);
        if (k === "start") expect(["primary", "catch", "follow-up", "none"]).toContain(v);
        else expect(Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 3, `${k}=${v}`).toBe(true);
      }
    }
    // A read line never carries a percentage, a game count or a verdict word: it describes stored values only.
    const book = getMatchupBook();
    for (const r of getCounters().dpm.filter((x) => x.games >= DPM_MIN_GAMES && x.winRate >= DPM_MIN_WIN_RATE)) {
      const x = matchupRead(book, r.champion, r.enemy, r.role);
      for (const l of [...x.lines, ...x.against]) expect(`${l.text} ${l.values}`).not.toMatch(/%|\bwin(s|ning)?\b|\bgames\b|favou?rable|\bcounters?\b(?!-)|proves?\b/i);
    }
  });
});
