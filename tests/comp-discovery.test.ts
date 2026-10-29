// Weekly Comp Library discovery (lib/comp-discovery.ts, scripts/discover-comps.ts, .github/workflows/discover-comps.yml).
// Since 2026-10-17 discovery proposes and alan adds: a new comp needs his approval (comp-review.json approvedComps).
// Deterministic, idempotent, selective: only verified lineups from tracked tournaments, never a duplicate, never a comp
// the engine cannot explain or flags with a major weak point, and nothing outside data/discovered-comps.json changes.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compTitle, discover, lineupKey, readLineup, refKey, relation, reviewedLineups, shellPicks, weeklyReport, type DiscoveredFile, type DiscoveryInput, type Picks } from "@/lib/comp-discovery";
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
    // With alan's review decisions, as the weekly run reads them: which lineup opens a group depends on what he held.
    const review = getCompReview();
    const r = discover({ ...base, previous: stored, today: "2099-01-01", held: review.heldChampions, heldLineups: review.held, approved: review.approvedComps.map((a) => a.comp), names: Object.fromEntries(review.approvedComps.flatMap((a) => a.name ? [[a.comp, a.name]] : [])), pending: review.pendingComps.map((p) => p.comp), limited: review.approvedComps.flatMap((a) => a.limited ? [a.comp] : []), reviewed: reviewedLineups(review) });
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

  it("a title names only a champion every lineup behind it plays (alan, 2026-10-26: Top Esports' lineup had no Camille)", () => {
    const blg: Picks = { TOP: "camille", JUNGLE: "lee-sin", MID: "orianna", BOT: "jhin", SUPPORT: "nautilus" };
    const tes: Picks = { TOP: "ambessa", JUNGLE: "nocturne", MID: "orianna", BOT: "varus", SUPPORT: "nautilus" };
    const read = { primary: "dive", secondary: "pick", mainCarry: "camille" } as const;
    const name = (id: string) => id[0].toUpperCase() + id.slice(1);
    expect(compTitle(read, blg, [{ picks: blg }], name)).toBe("Dive + Pick · Camille");
    expect(compTitle(read, blg, [{ picks: blg }, { picks: tes }], name)).toBe("Dive + Pick · Orianna");
    const other: Picks = { TOP: "gnar", JUNGLE: "vi", MID: "ahri", BOT: "jinx", SUPPORT: "lulu" };
    expect(compTitle(read, blg, [{ picks: blg }, { picks: other }], name)).toBe("Dive + Pick");
    // The fix is in the title only: the stored game records keep their lineups.
    expect(games.get(83655)?.blue.picks.TOP).toBe("ambessa");
  });

  it("a shared bot lane alone never files a lineup under a comp; the plan in the other roles decides (alan, 2026-10-25)", () => {
    const read = (p: Picks) => { const r = readLineup(p, kits, nameOf); return r.ok ? r.read : null; };
    const picksOf = (id: string): Picks => {
      const shell = shells.find((x) => x.id === id);
      if (shell) return shellPicks(shell);
      const c = stored.comps.find((x) => x.id === id)!;
      return Object.fromEntries(ROLES.map((r) => [r, c.slots[r].champion])) as Picks;
    };
    const at = (id: string) => ({ id, picks: picksOf(id), read: read(picksOf(id)) });
    // Pick · Protected Yunara shares Yunara + Lulu with Protect · Yunara but is a pick plan: not a variation of it.
    const pick = picksOf("yunara-protect");
    expect(relation(pick, read(pick), at("pro-83521-blue"))).toBeNull();
    // K'Sante / Jarvan IV / Cassiopeia shares only Lucian + Milio with Objective Zone, but its own read is the same
    // skirmish + tempo plan with four of five roles doing the same job: it stays filed there.
    const ksante: Picks = { TOP: "ksante", JUNGLE: "jarvan-iv", MID: "cassiopeia", BOT: "lucian", SUPPORT: "milio" };
    expect(relation(ksante, read(ksante), at("objective-zone"))).toBe("variation");
    expect(stored.variations.some((v) => v.of === "objective-zone" && lineupKey(v.picks) === lineupKey(ksante))).toBe(true);
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
    // Passing every check makes a comp ready for approval, never a library comp by itself (alan, 2026-10-17).
    const gs = onlyBlue([game(clean, "A"), game(clean, "B")]);
    const twice = discover({ ...base, games: gs });
    expect(twice.file.comps).toHaveLength(0);
    const ready = twice.candidates.find((c) => c.ready)!;
    expect(lineupKey(ready.picks)).toBe(lineupKey(clean));
    const approved = discover({ ...base, games: gs, approved: [ready.id] });
    expect(approved.file.comps.map((c) => c.slots.MID.champion)).toEqual(["orianna"]);
    expect(approved.file.comps[0].games).toHaveLength(2);
    expect(approved.file.lastAddition).toBe("2026-10-12");
  });

  it("two teams are necessary, not sufficient: a fifth champion that changes the strategy is not the same comp's evidence", () => {
    // Team WE's Yorick split lineup and FURIA's Olaf skirmish lineup share four champions but read differently.
    const yorick: Picks = { TOP: "yorick", JUNGLE: "sejuani", MID: "akali", BOT: "yunara", SUPPORT: "lulu" };
    const olaf: Picks = { ...yorick, TOP: "olaf" };
    const a = readLineup(yorick, kits, nameOf), b = readLineup(olaf, kits, nameOf);
    expect(a.ok && b.ok && a.read.secondary !== b.read.secondary).toBe(true);
    const r = discover({ ...base, games: onlyBlue([game(yorick, "A"), game(olaf, "B")]) });
    const c = r.candidates.find((x) => lineupKey(x.picks) === lineupKey(yorick))!;
    expect(c.ready).toBeFalsy();
    expect(c.reason).toMatch(/1 game from A with this strategy \(1 more with a lineup that reads differently\)/);
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

  it("a held champion's lineups join existing comps as evidence but never open a new comp (alan, 2026-10-17)", () => {
    const held = [{ champion: "locke", reason: "kit added 2026-10-16" }];
    // Two teams with the same new Locke lineup: enough for a comp by the usual rule, but it waits for review.
    const clean: Picks = { TOP: "ornn", JUNGLE: "sejuani", MID: "locke", BOT: "jinx", SUPPORT: "lulu" };
    const fresh = discover({ ...base, held, games: onlyBlue([game(clean, "A"), game(clean, "B")]) });
    expect(fresh.file.comps).toHaveLength(0);
    expect(fresh.awaiting).toHaveLength(2);
    expect(fresh.awaiting[0].reason).toMatch(/Locke lineup: no existing comp matches/);
    // A Locke lineup one champion off a curated comp is filed under it.
    const speed = shellPicks(shells.find((x) => x.id === "speed-up-skirmish")!);
    const near = discover({ ...base, held, games: onlyBlue([game({ ...speed, BOT: "jinx" }, "A")]) });
    expect(near.file.variations.map((v) => v.of)).toContain("speed-up-skirmish");
    expect(near.awaiting).toHaveLength(0);
  });

  it("a lineup alan filed by review never opens a comp or waits for review again, but may still join one (2026-10-24)", () => {
    const picks: Picks = { TOP: "ornn", JUNGLE: "sejuani", MID: "orianna", BOT: "jinx", SUPPORT: "lulu" };
    const [a, b] = onlyBlue([game(picks, "A", { date: "2026-10-01" }), game(picks, "B", { date: "2026-10-02" })]);
    expect(discover({ ...base, games: [a, b] }).candidates.flatMap((c) => c.games).map(refKey)).toContain(`${a.id}-blue`);
    const r = discover({ ...base, games: [a, b], reviewed: [{ game: a.id, side: "blue" }, { game: b.id, side: "blue" }] });
    const mine = new Set([a.id, b.id].map((id) => `${id}-blue`));
    expect(r.file.comps.flatMap((c) => c.games).filter((g) => mine.has(refKey(g)))).toHaveLength(0);
    expect(r.candidates.flatMap((c) => c.games).filter((g) => mine.has(refKey(g)))).toHaveLength(0);
    const speed = shellPicks(shells.find((x) => x.id === "speed-up-skirmish")!);
    const [near] = onlyBlue([game({ ...speed, BOT: "jinx" }, "A")]);
    const joined = discover({ ...base, games: [near], reviewed: [{ game: near.id, side: "blue" }] });
    expect(joined.file.variations.map((v) => v.of)).toContain("speed-up-skirmish");
  });

  it("a held candidate's games join nothing, and later lineups closest to it are listed beside it, not filed", () => {
    const heldPicks: Picks = { TOP: "ornn", JUNGLE: "sejuani", MID: "orianna", BOT: "jinx", SUPPORT: "lulu" };
    const [first, later] = onlyBlue([game(heldPicks, "A", { date: "2026-10-01" }), game(heldPicks, "B", { date: "2026-10-02" })]);
    const r = discover({ ...base, games: [first, later], heldLineups: [{ name: "Test hold", note: "", games: [{ game: first.id, side: "blue" }] }] });
    expect(r.heldCandidates[0].games.map((o) => o.game)).toEqual([first.id]);
    expect(r.heldCandidates[0].closest.map((o) => o.game)).toEqual([later.id]);
    const filed = [...r.file.comps.flatMap((c) => c.games), ...r.file.variations.flatMap((v) => v.games), ...r.candidates.flatMap((c) => c.games)].map(refKey);
    expect(filed).not.toContain(`${first.id}-blue`);
    expect(filed).not.toContain(`${later.id}-blue`);
  });

  it("the stored library is exactly what discovery gives with alan's review inputs, and no comp grows from a held champion", () => {
    const review = getCompReview();
    const r = discover({ ...base, previous: stored, today: stored.lastAddition ?? "2026-10-17", held: review.heldChampions, heldLineups: review.held, approved: review.approvedComps.map((a) => a.comp), names: Object.fromEntries(review.approvedComps.flatMap((a) => a.name ? [[a.comp, a.name]] : [])), pending: review.pendingComps.map((p) => p.comp), limited: review.approvedComps.flatMap((a) => a.limited ? [a.comp] : []), reviewed: reviewedLineups(review) });
    expect(r.file).toEqual(stored);
    // Skirmish + Pick · Lucian was declined (2026-10-24): its two games are filed under other comps and open nothing.
    expect(r.candidates.some((c) => c.id === "pro-83451-blue")).toBe(false);
    expect(r.file.variations.some((v) => v.of === "objective-zone" && v.games.some((g) => refKey(g) === "83623-red"))).toBe(true);
    // A comp sent back to Ready for approval is proposed again with its games, never kept as a card.
    for (const p of review.pendingComps) {
      expect(r.file.comps.some((c) => c.id === p.comp), p.comp).toBe(false);
      expect(r.candidates.some((c) => c.id === p.comp), p.comp).toBe(true);
    }
    const curated = new Set(shells.map((x) => x.id));
    for (const c of r.file.comps) for (const role of ROLES) expect(review.heldChampions.map((h) => h.champion), c.id).not.toContain(c.slots[role].champion);
    // alan's holds stay unfiled; the approved LGD lineup is a Speed-Up Skirmish variation.
    const heldRefs = new Set(review.held.flatMap((h) => h.games.map(refKey)));
    for (const v of r.file.variations) for (const g of v.games) expect(heldRefs.has(refKey(g)), `${v.of} ${refKey(g)}`).toBe(false);
    expect(r.file.variations.some((v) => v.of === "speed-up-skirmish" && v.games.some((g) => refKey(g) === "83454-red"))).toBe(true);
    expect(curated.has("speed-up-skirmish")).toBe(true);
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
  const review = getCompReview();
  const fresh = discover({ ...base, previous: stored, held: review.heldChampions, heldLineups: review.held, approved: review.approvedComps.map((a) => a.comp), names: Object.fromEntries(review.approvedComps.flatMap((a) => a.name ? [[a.comp, a.name]] : [])), pending: review.pendingComps.map((p) => p.comp), limited: review.approvedComps.flatMap((a) => a.limited ? [a.comp] : []), reviewed: reviewedLineups(review) }).file;
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
