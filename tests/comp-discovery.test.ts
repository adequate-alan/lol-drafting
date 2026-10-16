// Weekly Comp Library discovery (lib/comp-discovery.ts, scripts/discover-comps.ts, .github/workflows/discover-comps.yml).
// Deterministic, idempotent, selective: only verified lineups from tracked tournaments, never a duplicate, never a comp
// the engine cannot explain or flags with a major weak point, and nothing outside data/discovered-comps.json changes.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { discover, lineupKey, readLineup, refKey, relation, shellPicks, weeklyReport, type DiscoveredFile, type DiscoveryInput, type Picks } from "@/lib/comp-discovery";
import { buildLibrary } from "@/lib/comp-library";
import { getChampions, getCompReview, getCompShells, getDraftData, getLibrary, getProDrafts, getProGames, getSources } from "@/lib/data";
import { convertKits } from "@/lib/model-v2/kits";
import { Files, ROLES, type ProGame } from "@/lib/schema";

const champions = getChampions();
const kits = convertKits(champions);
const names = new Map(champions.map((c) => [c.id, c.name]));
const nameOf = (id: string) => names.get(id) ?? id;
const pro = getProGames();
const shells = getCompShells();
const events = pro.tracked.map((t) => t.event);
const empty: DiscoveredFile = { lastAddition: null, comps: [], variations: [] };
const stored = Files["discovered-comps.json"].parse(JSON.parse(readFileSync(join(process.cwd(), "data", "discovered-comps.json"), "utf8")));
const base: DiscoveryInput = { games: pro.games, events, shells, kits, nameOf, previous: empty, today: "2026-10-12" };
const games = new Map(pro.games.map((g) => [g.id, g]));
const picksOf = (r: { game: number; side: "blue" | "red" }) => games.get(r.game)?.[r.side].picks;

// A synthetic game: blue plays `picks`, red a fixed lineup nobody reuses.
let nextId = 900000;
const RED: Picks = { TOP: "sion", JUNGLE: "maokai", MID: "galio", BOT: "sivir", SUPPORT: "braum" };
const game = (picks: Picks, team: string, o: Partial<ProGame> = {}): ProGame => {
  const id = nextId++;
  return {
    id, event: "worlds-2026", tournament: "Worlds 2026", seriesId: id, series: `${team} vs Other`, game: 1, date: "2026-10-20", patch: "16.20",
    blue: { team, picks, bans: [] }, red: { team: "Other", picks: RED, bans: [] }, winner: "blue",
    url: `https://gol.gg/game/stats/${id}/page-game/`, rolesUrl: `https://gol.gg/game/stats/${id}/page-fullstats/`, checkedOn: "2026-10-20", ...o,
  };
};
const onlyBlue = (gs: ProGame[]) => gs.map((g) => ({ ...g, red: { ...g.red, picks: { TOP: "aatrox", JUNGLE: "sejuani", MID: "azir", BOT: "jinx", SUPPORT: "thresh" } as Picks } }));

describe("weekly comp discovery", () => {
  it("is deterministic and idempotent: a second run on its own output changes nothing", () => {
    const a = discover(base), b = discover(base);
    expect(JSON.stringify(a.file)).toBe(JSON.stringify(b.file));
    const again = discover({ ...base, previous: a.file, today: "2026-10-19" });
    expect(again.file).toEqual(a.file);
  });

  it("a run with the stored library as its previous state keeps every stored comp and its added date", () => {
    const r = discover({ ...base, previous: stored, today: "2099-01-01" });
    for (const c of stored.comps) expect(r.file.comps.find((x) => x.id === c.id)?.addedOn, c.id).toBe(c.addedOn);
  });

  it("win or loss never decides anything", () => {
    const flipped = pro.games.map((g) => ({ ...g, winner: g.winner === "blue" ? "red" as const : "blue" as const }));
    expect(discover({ ...base, games: flipped }).file).toEqual(discover(base).file);
  });

  it("reads only tracked tournaments; the LCK archive is comparison only", () => {
    const lck = game(shellPicks(shells[0]), "T1", { event: "lck-2026-playoffs", tournament: "LCK 2026 Season Playoffs" });
    const r = discover({ ...base, games: [...pro.games, lck] });
    expect(r.observations.some((o) => o.game === lck.id)).toBe(false);
  });

  it("an exact replay is an existing comp, one changed pick is a variation, a different plan is a new group", () => {
    const shell = shells.find((s) => s.id === "objective-zone")!;
    const own = shellPicks(shell);
    const swap: Picks = { ...own, JUNGLE: "jarvan-iv" };
    const gs = onlyBlue([game(own, "A"), game(swap, "B")]);
    const r = discover({ ...base, games: gs });
    const vs = r.file.variations.filter((v) => v.of === "objective-zone");
    expect(vs.map((v) => lineupKey(v.picks)).sort()).toEqual([lineupKey(own), lineupKey(swap)].sort());
    const read = readLineup(own, kits, nameOf);
    expect(read.ok).toBe(true);
    const anchor = { id: "x", picks: own, read: read.ok ? read.read : null };
    expect(relation(own, anchor.read, anchor)).toBe("exact");
    const rs = readLineup(swap, kits, nameOf);
    expect(relation(swap, rs.ok ? rs.read : null, anchor)).toBe("variation");
    // Five different champions are not a variation, whatever the jobs.
    const other: Picks = { TOP: "gnar", JUNGLE: "sejuani", MID: "azir", BOT: "jinx", SUPPORT: "thresh" };
    const ro = readLineup(other, kits, nameOf);
    expect(relation(other, ro.ok ? ro.read : null, anchor)).toBeNull();
  });

  it("adds a new comp on repeated independent games, keeps one-off games of a known plan for review", () => {
    const clean: Picks = { TOP: "ornn", JUNGLE: "sejuani", MID: "orianna", BOT: "jinx", SUPPORT: "lulu" };
    const read = readLineup(clean, kits, nameOf);
    expect(read.ok && read.read.weaknesses.every((w) => w.severity !== "major")).toBe(true);
    const once = discover({ ...base, games: onlyBlue([game(clean, "A")]) });
    expect(once.file.comps).toHaveLength(0);
    expect(once.candidates.map((c) => lineupKey(c.picks))).toContain(lineupKey(clean));
    const sameTeam = discover({ ...base, games: onlyBlue([game(clean, "A"), game(clean, "A")]) });
    expect(sameTeam.file.comps).toHaveLength(0);
    const twice = discover({ ...base, games: onlyBlue([game(clean, "A"), game(clean, "B")]) });
    expect(twice.file.comps.map((c) => c.slots.MID.champion)).toEqual(["orianna"]);
    expect(twice.file.comps[0].games).toHaveLength(2);
    expect(twice.file.lastAddition).toBe("2026-10-12");
  });

  it("never adds a lineup the engine cannot read or flags with a major weak point", () => {
    // Every champion has a kit since 2026-10-16, so the unread case takes Locke's kit out of the input.
    const locke: Picks = { TOP: "ornn", JUNGLE: "sejuani", MID: "locke", BOT: "jinx", SUPPORT: "lulu" };
    const r = discover({ ...base, kits: kits.filter((k) => k.id !== "locke"), games: onlyBlue([game(locke, "A"), game(locke, "B")]) });
    expect(r.file.comps).toHaveLength(0);
    expect(r.unread.length).toBe(2);
    expect(r.unread[0].reason).toMatch(/Locke has no reviewed kit/);
    for (const c of discover(base).file.comps) expect(c.weaknesses.filter((w) => w.severity === "major"), c.id).toEqual([]);
  });

  it("a held champion's lineups never open or join a comp by their read until alan's review (comp-review.json)", () => {
    const clean: Picks = { TOP: "ornn", JUNGLE: "sejuani", MID: "locke", BOT: "jinx", SUPPORT: "lulu" };
    const held = [{ champion: "locke", reason: "kit added 2026-10-16" }];
    const r = discover({ ...base, held, games: onlyBlue([game(clean, "A"), game(clean, "B")]) });
    expect(r.file.comps).toHaveLength(0);
    expect(r.unread[0].reason).toMatch(/Locke is held for review/);
    const stored = getCompReview().heldChampions.map((h) => h.champion);
    const now = discover({ ...base, held: getCompReview().heldChampions });
    for (const c of now.file.comps) for (const role of ROLES) expect(stored, c.id).not.toContain(c.slots[role].champion);
  });

  it("adding comps never edits the previous ones' dates, and a quiet week keeps the last addition", () => {
    const first = discover(base).file;
    const later = discover({ ...base, previous: first, today: "2026-10-25" }).file;
    expect(later.lastAddition).toBe(first.lastAddition);
  });
});

describe("stored discovered comps", () => {
  const trackedGames = new Set(pro.games.filter((g) => events.includes(g.event)).map((g) => g.id));

  it("every lineup is a verified game from a tracked tournament, with the exact five champions", () => {
    for (const c of stored.comps) {
      for (const r of c.games) {
        expect(trackedGames.has(r.game), `${c.id} ${r.game}`).toBe(true);
        expect(lineupKey(picksOf(r)!), `${c.id} ${refKey(r)}`).toBe(lineupKey(Object.fromEntries(ROLES.map((x) => [x, c.slots[x].champion])) as Picks));
      }
    }
    for (const v of stored.variations) for (const r of v.games) {
      expect(trackedGames.has(r.game)).toBe(true);
      expect(lineupKey(picksOf(r)!)).toBe(lineupKey(v.picks));
    }
  });

  it("no duplicates: one entry per lineup, every variation under a comp that exists, names unique", () => {
    const comps = new Set([...shells.map((s) => s.id), ...stored.comps.map((c) => c.id)]);
    const lineups = [...shells.map((s) => lineupKey(shellPicks(s))), ...stored.comps.map((c) => lineupKey(Object.fromEntries(ROLES.map((r) => [r, c.slots[r].champion])) as Picks))];
    expect(new Set(lineups).size).toBe(lineups.length);
    for (const v of stored.variations) expect(comps.has(v.of), v.of).toBe(true);
    const keys = stored.variations.map((v) => `${v.of}#${lineupKey(v.picks)}`);
    expect(new Set(keys).size).toBe(keys.length);
    const refs = [...stored.comps.flatMap((c) => c.games), ...stored.variations.flatMap((v) => v.games)].map(refKey);
    expect(new Set(refs).size).toBe(refs.length);
    const all = [...shells.map((s) => s.name), ...stored.comps.map((c) => c.name)].map((n) => n.toLowerCase());
    expect(new Set(all).size).toBe(all.length);
  });

  it("observed lineups are never filed under a template", () => {
    const templates = new Set(shells.filter((s) => s.kind === "generalized").map((s) => s.id));
    for (const v of stored.variations) expect(templates.has(v.of), v.of).toBe(false);
  });
});

describe("Comp Library integration", () => {
  // A run on today's data, so these checks hold for real discoveries even before the stored file has any.
  const fresh = discover(base).file;
  const lib = buildLibrary(shells, fresh, pro.games);

  it("the site reads the stored library, Draft Room included", () => {
    const site = getLibrary();
    const ids = new Set(getDraftData().shells.map((s) => s.id));
    for (const s of site.shells) expect(ids.has(s.id), s.id).toBe(true);
  });

  it("discovered comps are Pro comps with their recorded draft, game sources and a Draft Room link", () => {
    const drafts = new Set(getProDrafts().map((d) => d.id));
    const sources = new Set(getSources().map((s) => s.id));
    expect(fresh.comps.length).toBeGreaterThan(0);
    for (const c of fresh.comps) {
      const s = lib.shells.find((x) => x.id === c.id)!;
      expect(s.kind).toBe("observed");
      expect(drafts.has(s.proDraftId!), s.proDraftId).toBe(true);
      for (const id of s.sources) expect(sources.has(id), id).toBe(true);
      expect(ROLES.every((r) => s.slots[r].swaps.length === 0)).toBe(true);
      expect(lib.extras[c.id].discovered?.addedOn).toBe(c.addedOn);
    }
  });

  it("variations show other lineups; replays list the same lineup's other games, never the card's own source", () => {
    for (const [id, x] of Object.entries(lib.extras)) {
      const s = lib.shells.find((y) => y.id === id)!;
      for (const v of x.variations) expect(lineupKey(v.picks)).not.toBe(lineupKey(shellPicks(s)));
      for (const g of x.games) expect(s.proDraftId).not.toBe(`golgg-${g.game}-${g.side}`);
    }
  });

  it("an empty discovery file leaves the hand-written library as it was", () => {
    const l = buildLibrary(shells, empty, pro.games);
    expect(l.shells).toEqual(shells);
    expect(l.lastAddition).toBeNull();
  });
});

describe("weekly report and pipeline", () => {
  it("links every supporting game and names what needs a person", () => {
    const r = discover(base);
    const md = weeklyReport({ result: r, previous: empty, shells, lck: getProDrafts().filter((d) => d.tournament.startsWith("LCK")), nameOf, today: "2026-10-12", tournaments: [] });
    for (const c of r.file.comps) for (const g of c.games) expect(md).toContain(`https://gol.gg/game/stats/${g.game}/page-game/`);
    for (const h of ["New compositions", "New variations", "new professional play", "May be outdated", "Proposed comps for review", "Limits"]) expect(md).toContain(h);
    expect(md).not.toMatch(/\bAI\b|Claude|confidence/i);
  });

  it("the script writes only its own data file and the report", () => {
    const src = readFileSync(join(process.cwd(), "scripts", "discover-comps.ts"), "utf8");
    const targets = [...src.matchAll(/writeFileSync\(([^,]+),/g)].map((m) => m[1].trim());
    expect(targets).toEqual(["REPORT", "OUT"]);
    expect(src).toMatch(/const OUT = join\(root, "data", "discovered-comps.json"\)/);
    expect(src).toMatch(/const REPORT = join\(root, "reports", "comp-discovery.md"\)/);
  });

  it("the workflow runs weekly on Sunday morning Eastern (off the top of the hour), on demand, and commits only the library when it changed", () => {
    const wf = readFileSync(join(process.cwd(), ".github", "workflows", "discover-comps.yml"), "utf8");
    expect(wf).toMatch(/cron: "17 13 \* \* 0"/);
    expect(wf).toMatch(/cron: "17 14 \* \* 0"/);
    expect(wf).toMatch(/workflow_dispatch/);
    expect(wf).toMatch(/steps\.discover\.outputs\.changed == 'true'/);
    expect(wf).toMatch(/git add data\/discovered-comps\.json reports\/comp-discovery\.md\n/);
    expect(wf).not.toMatch(/gol\.gg|curl|refresh-pro-data\.mjs/);
  });
});
