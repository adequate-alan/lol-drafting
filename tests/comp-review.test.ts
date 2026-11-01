// alan's reviewed Comp Library decisions (data/comp-review.json, 2026-10-16): pro swaps, supporting lineups and
// historical marks. Observed Pro Evidence only: every cited game is recorded and shows the claim, a pro swap needs two
// independent series, and nothing in the review changes a comp's own lineup, its General Draft Logic swaps or any other
// layer.
import { describe, expect, it } from "vitest";
import { buildLibrary, jobReads, plainVariations } from "@/lib/comp-library";
import { lineupKey, shellPicks, type Picks } from "@/lib/comp-discovery";
import { getBuildGameRecords, getCompReview, getCompShells, getLibrary, getProGames, getSources } from "@/lib/data";
import { comparePatch } from "@/lib/patch";
import { Files, ROLES } from "@/lib/schema";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const review = getCompReview();
const library = getLibrary();
const records = new Map(getBuildGameRecords().map((g) => [g.id, g]));
const shellOf = (id: string) => library.shells.find((s) => s.id === id);
const discovered = Files["discovered-comps.json"].parse(JSON.parse(readFileSync(join(process.cwd(), "data", "discovered-comps.json"), "utf8")));

describe("pro swaps", () => {
  it.each(review.proSwaps.map((p) => [`${p.comp} ${p.role} ${p.champion}`, p] as const))("%s: recorded games show the champion in that slot", (_, p) => {
    const shell = shellOf(p.comp);
    expect(shell, "comp exists").toBeDefined();
    expect(shell!.slots[p.role].champion).not.toBe(p.champion);
    const series = new Set<number>();
    for (const r of p.games) {
      const g = records.get(r.game);
      expect(g, `game ${r.game} recorded`).toBeDefined();
      expect(g![r.side].picks[p.role]).toBe(p.champion);
      // The rest of the lineup is the comp: at least two of the other four slots match.
      expect(ROLES.filter((x) => x !== p.role && g![r.side].picks[x] === shell!.slots[x].champion).length).toBeGreaterThanOrEqual(2);
      series.add(g!.seriesId);
    }
    expect(series.size, "two independent series").toBeGreaterThanOrEqual(2);
  });

  it("show their games, series, teams and patches, newest patch first", () => {
    for (const p of review.proSwaps) {
      const row = library.extras[p.comp]?.proSwaps?.[p.role]?.find((x) => x.champion === p.champion);
      expect(row).toBeDefined();
      expect(row!.games).toHaveLength(p.games.length);
      expect(row!.series).toBeGreaterThanOrEqual(2);
      expect(row!.teams).toBeGreaterThanOrEqual(1);
      expect([...row!.patches].sort((a, b) => comparePatch(b, a))).toEqual(row!.patches);
    }
  });

  it("never change a comp's lineup or its general-logic swaps", () => {
    const plain = buildLibrary(getCompShells(), discovered, getProGames().games);
    // Only an approved comp's own win condition (alan's words) replaces the comp check's on its card.
    const own = new Map(review.approvedComps.flatMap((a) => a.winCondition ? [[a.comp, a.winCondition]] : []));
    expect(library.shells).toEqual(plain.shells.map((s) => own.has(s.id) ? { ...s, winCondition: own.get(s.id) } : s));
  });
});

describe("Caitlyn + Bard Pick", () => {
  const shell = shellOf("caitlyn-bard-pick")!;
  it("is Team Vitality's recorded lineup with sources that resolve", () => {
    expect(shellPicks(shell)).toEqual({ TOP: "jayce", JUNGLE: "qiyana", MID: "syndra", BOT: "caitlyn", SUPPORT: "bard" });
    const g = records.get(83523)!;
    expect(lineupKey(g.red.picks as Picks)).toBe(lineupKey(shellPicks(shell)));
    const sources = new Set(getSources().map((s) => s.id));
    for (const id of shell.sources) expect(sources.has(id), id).toBe(true);
  });
  it("lists its supporting lineups as observed variations", () => {
    for (const x of review.supporting) {
      const games = library.extras[x.comp].variations.flatMap((v) => v.games.map((g) => g.game));
      for (const r of x.games) expect(games, x.comp).toContain(r.game);
    }
  });
  it("supporting lineups share the comp's core (3+ champions)", () => {
    for (const x of review.supporting) {
      const s = shellOf(x.comp)!;
      for (const r of x.games) {
        const picks = records.get(r.game)![r.side].picks;
        expect(ROLES.filter((role) => picks[role] === s.slots[role].champion).length).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe("historical marks", () => {
  it("name only a patch older than the newest recorded one, and never remove the comp", () => {
    const newest = [...records.values()].map((g) => g.patch).sort((a, b) => comparePatch(b, a))[0];
    for (const h of review.historical) {
      expect(shellOf(h.comp)).toBeDefined();
      for (const [, p] of Object.entries(library.extras[h.comp]?.historical ?? {})) expect(comparePatch(p!, newest)).toBeLessThan(0);
    }
  });
  it("disappear once pros pick the champion on the newest patch", () => {
    const games = getProGames().games;
    const newest = games.reduce((a, g) => (comparePatch(g.patch, a.patch) > 0 ? g : a));
    const shells = getCompShells();
    const s = shells.find((x) => x.id === "protected-hypercarry")!;
    const fresh = { ...newest, id: 999001, blue: { ...newest.blue, picks: { ...newest.blue.picks, BOT: s.slots.BOT.champion } } };
    const lib = buildLibrary(shells, discovered, [...games, fresh], { proSwaps: [], supporting: [], historical: [{ comp: s.id, roles: ["BOT"], approvedOn: "2026-10-16" }], variants: [], heldChampions: [], approvedComps: [], pendingComps: [], namedVariations: [], held: [], families: [], archetypes: [] });
    expect(lib.extras[s.id]?.historical?.BOT).toBeUndefined();
  });
});

// alan's 2026-10-17 decisions on the comps Locke's and Zaahen's lineups unlocked: two named variations, four holds, and a
// light Yunara protection family. Nothing here changes a lineup, a saved pairing or a score.
describe("named variations, holds and families (2026-10-17)", () => {
  const library = getLibrary();
  const review = getCompReview();
  const key = (p: Record<string, string>) => ROLES.map((r) => p[r]).join("|");

  it("Shopify's Ornn + Jarvan IV lineup is a named variation of Protect + Front-to-back · Yunara, with FlyQuest's lineup beside it", () => {
    const v = library.extras["pro-83450-red"]?.variations.find((x) => x.named);
    expect(v?.named?.name).toMatch(/Shopify Rebellion/);
    expect(key(v!.picks)).toBe("ornn|jarvan-iv|locke|yunara|lulu");
    expect(v!.games.map((g) => `${g.game}-${g.side}`)).toEqual(["83468-red"]);
    expect(v!.named!.alike.map((a) => key(a.picks))).toEqual(["ornn|nocturne|syndra|yunara|lulu"]);
    expect(v!.named!.read?.identity).toBeTruthy();
    // FlyQuest's lineup is listed once, under the named variation only.
    expect(library.extras["pro-83450-red"].variations.filter((x) => key(x.picks) === "ornn|nocturne|syndra|yunara|lulu")).toHaveLength(0);
  });

  it("LGD's Jax + Aphelios lineup is a named variation of Speed-Up Skirmish, and the comp's own lineup is unchanged", () => {
    const x = library.extras["speed-up-skirmish"];
    const v = x?.variations[0];
    expect(v?.named?.name).toMatch(/LGD/);
    expect(key(v!.picks)).toBe("jax|skarner|locke|aphelios|karma");
    const s = library.shells.find((y) => y.id === "speed-up-skirmish")!;
    expect(ROLES.map((r) => s.slots[r].champion).join("|")).toBe("olaf|skarner|locke|sivir|karma");
  });

  it("a family links distinct comps' cards; Pick · Protected Yunara keeps its lineup", () => {
    const f = review.families.find((x) => x.id === "yunara-protection")!;
    // A comp shown inside an archetype is reached through its parent's card (2026-10-25).
    const card = (id: string) => library.extras[id]?.inArchetype?.parent ?? id;
    for (const id of f.comps) {
      expect(library.shells.some((s) => s.id === id), id).toBe(true);
      expect(library.extras[id]?.family?.others.map((o) => o.id).sort()).toEqual([...new Set(f.comps.map(card))].filter((c) => c !== card(id)).sort());
      expect(library.extras[id]?.variantOf, id).toBeUndefined();
    }
    const pick = library.shells.find((s) => s.id === "yunara-protect")!;
    expect(ROLES.map((r) => pick.slots[r].champion).join("|")).toBe("rumble|pantheon|syndra|yunara|lulu");
  });

  it("Front-to-back + Split · Yunara is held, not a card: Team WE's and FURIA's games stay recorded evidence", () => {
    expect(library.shells.some((s) => s.id === "pro-83460-blue")).toBe(false);
    const h = review.held.find((x) => x.name === "Front-to-back + Split · Yunara")!;
    expect(h.games.map((g) => `${g.game}-${g.side}`)).toEqual(["83460-blue", "83624-red"]);
    const games = new Map(getProGames().games.map((g) => [g.id, g]));
    for (const g of h.games) expect(games.get(g.game)?.[g.side].picks.JUNGLE).toBe("sejuani");
  });

  it("Skirmish + Pick · Lucian is not a comp (alan, 2026-10-24): Cloud9's game is an Objective Zone variation, Team WE's a named Stable Top + Carry Bot variation", () => {
    expect(review.pendingComps.map((p) => p.comp)).not.toContain("pro-83451-blue");
    expect(library.shells.some((s) => s.id === "pro-83451-blue")).toBe(false);
    const games = new Map(getProGames().games.map((g) => [g.id, g]));
    expect(games.get(83451)?.blue.picks.TOP).toBe("galio");
    expect(games.get(83623)?.red.picks.TOP).toBe("rumble");
    const zone = library.extras["objective-zone"].variations;
    expect(zone.some((v) => v.games.some((g) => g.game === 83623 && g.side === "red"))).toBe(true);
    const named = library.extras["stable-top-carry-bot"].variations.find((v) => v.named?.name === "Galio engage · Team WE");
    expect(named?.games.map((g) => g.game)).toEqual([83451]);
    expect(named?.picks.TOP).toBe("galio");
  });

  it("Swiss filings (alan, 2026-10-26): Viktor approved under his name, Movistar KOI's Diana lineup under Stable Top + Carry Bot, the rest held", () => {
    expect(review.approvedComps).toContainEqual(expect.objectContaining({ comp: "pro-83641-red", approvedOn: "2026-10-26", name: "Front-to-back + Zone Control · Viktor" }));
    const viktor = library.shells.find((s) => s.id === "pro-83641-red")!;
    expect(viktor.name).toBe("Front-to-back + Zone Control · Viktor");
    // Both teams' games stay, each with its own side and result: G2 lost, Dplus KIA won.
    const games = new Map(getProGames().games.map((g) => [g.id, g]));
    expect(games.get(83641)?.winner).toBe("blue");
    expect(games.get(83652)?.winner).toBe("blue");
    const diana = library.extras["stable-top-carry-bot"].variations.find((v) => v.named?.name === "Diana + Yunara · Movistar KOI")!;
    expect(diana.games.map((g) => `${g.game}-${g.side}`)).toEqual(["83657-red"]);
    expect(diana.picks.MID).toBe("diana");
    expect(library.extras["pro-83521-blue"].archetype!.members.some((m) => m.picks.MID === "diana")).toBe(false);
    // Held for their own reviews: no card for the Cassiopeia or Akali proposals.
    for (const id of ["pro-83647-blue", "pro-83640-red"]) expect(library.shells.some((s) => s.id === id), id).toBe(false);
  });

  it("Dive review (alan, 2026-10-26): Orianna follow-up dive approved, two Kalista + Renata variations, Akali and Xayah held", () => {
    const ori = library.shells.find((s) => s.id === "pro-83653-red")!;
    expect(ori.name).toBe("Dive · Orianna follow-up");
    const oriVars = library.extras["pro-83653-red"].variations;
    // Four teams: Bilibili's card, Top Esports' observed lineup, KT Rolster's and Cloud9's named variations.
    expect(oriVars.some((v) => v.games.some((g) => g.game === 83655 && g.side === "blue"))).toBe(true);
    for (const [name, game, mid] of [["Corki front-to-back · KT Rolster", 83605, "orianna"], ["Ezreal front-to-back · Cloud9", 83625, "orianna"]] as const) {
      const v = oriVars.find((x) => x.named?.name === name)!;
      expect(v.games.map((g) => g.game), name).toEqual([game]);
      expect(v.picks.MID).toBe(mid);
    }
    const kal = library.extras["pro-83469-blue"].variations;
    expect(kal.find((v) => v.named?.name === "Jarvan IV start · FURIA")?.games.map((g) => `${g.game}-${g.side}`)).toEqual(["83623-blue"]);
    expect(kal.find((v) => v.named?.name === "Wukong start · HANJIN BRION")?.games.map((g) => `${g.game}-${g.side}`)).toEqual(["83610-red"]);
    // Held, with their games kept as evidence: the Akali pair. No Dive archetype. (Dive · Xayah approved 2026-10-27.)
    const held = new Map(review.held.map((h) => [h.name, h.games.map((g) => `${g.game}-${g.side}`)]));
    expect(held.get("Dive + Skirmish · Akali")).toEqual(["83640-red", "83647-red"]);
    expect(library.shells.some((s) => s.id === "pro-83640-red")).toBe(false);
    expect(review.archetypes.map((a) => a.id)).toEqual(["protect-yunara"]);
  });

  it("Dive · Xayah (alan, 2026-10-27): Karmine Corp's card, Shopify Rebellion and JD Gaming as named variations, nothing else filed", () => {
    const x = library.shells.find((s) => s.id === "pro-83601-red")!;
    expect(x.name).toBe("Dive · Xayah");
    expect(review.held.some((h) => h.name === "Dive · Xayah")).toBe(false);
    expect([x.slots.TOP.champion, x.slots.JUNGLE.champion, x.slots.MID.champion, x.slots.BOT.champion, x.slots.SUPPORT.champion]).toEqual(["renekton", "qiyana", "orianna", "xayah", "rakan"]);
    const vars = library.extras["pro-83601-red"].variations;
    expect(vars.find((v) => v.named?.name === "Zaahen + Pantheon · Shopify Rebellion")?.games.map((g) => `${g.game}-${g.side}`)).toEqual(["83469-red"]);
    expect(vars.find((v) => v.named?.name === "Jax + Nocturne · JD Gaming")?.games.map((g) => `${g.game}-${g.side}`)).toEqual(["83542-blue"]);
    // Every game once, and only the three reviewed drafts (exact replays aside).
    const all = vars.flatMap((v) => v.games.map((g) => `${g.game}-${g.side}`));
    expect(new Set(all).size).toBe(all.length);
    expect(all.sort()).toEqual(["83469-red", "83542-blue"]);
    // Kept under review or held where they were: HANJIN BRION's Malphite, Karmine Corp's Kennen + Jarvan IV, JD Gaming's
    // K'Sante and FURIA's Ornn + Wukong drafts join no comp; RED Canids' and Team Vitality's wombo filings are unchanged.
    for (const [game, side] of [[83611, "blue"], [83630, "red"], [83568, "red"], [83594, "red"]] as const) {
      const filed = Object.entries(library.extras).filter(([, e]) => e.variations.some((v) => v.games.some((g) => g.game === game && g.side === side)));
      expect(filed.map(([id]) => id), `${game}`).toEqual([]);
      expect(library.shells.some((s) => s.id === `pro-${game}-${side}`), `${game}`).toBe(false);
    }
  });

  it("Protect · Cassiopeia is not a comp (alan, 2026-10-24): its three games are separate named variations of Protect · Yunara", () => {
    expect(library.shells.some((s) => s.id === "pro-83453-blue")).toBe(false);
    const named = library.extras["pro-83521-blue"].variations.filter((v) => v.named);
    const by = (name: string) => named.find((v) => v.named!.name === name)!;
    // Each keeps its own five champions and game: Cassiopeia only where she was played.
    expect(by("Peel + poke · BNK FearX").picks.MID).toBe("cassiopeia");
    expect(by("Peel + poke · BNK FearX").games.map((g) => g.game)).toEqual([83453]);
    expect(by("Ryze variation · BNK FearX").picks.MID).toBe("ryze");
    expect(by("Ryze variation · BNK FearX").games.map((g) => g.game)).toEqual([83618]);
    expect(by("Galio engage · Karmine Corp").picks.TOP).toBe("galio");
    expect(by("Galio engage · Karmine Corp").games.map((g) => g.game)).toEqual([83636]);
    for (const v of named) expect(v.named!.alike ?? []).toHaveLength(0);
  });

  it("held lineups are recorded games and filed under no comp", () => {
    const games = new Map(getProGames().games.map((g) => [g.id, g]));
    for (const h of review.held) for (const r of h.games) {
      expect(games.has(r.game), h.name).toBe(true);
      for (const x of Object.values(library.extras)) for (const v of x.variations) expect(v.games.some((g) => g.game === r.game && g.side === r.side), h.name).toBe(false);
    }
  });
});

describe("archetypes (alan, 2026-10-25: Protect · Yunara pilot)", () => {
  const library = getLibrary();
  const arch = library.extras["pro-83521-blue"].archetype!;
  const rows = [arch.core, ...arch.members, ...arch.review];

  it("Protect · Yunara is the only archetype, its parent is the Protect · Yunara card, defined by its win condition", () => {
    expect(review.archetypes.map((a) => a.id)).toEqual(["protect-yunara"]);
    expect(arch.name).toBe("Protect · Yunara");
    expect(arch.winCondition).toMatch(/Enable Yunara to carry teamfights/);
    expect(Object.values(library.extras).filter((x) => x.archetype)).toHaveLength(1);
  });

  it("holds the three approved BNK FearX and Karmine Corp filings and Team Vitality's comp, each with its own lineup and game", () => {
    const by = (name: string) => arch.members.find((m) => m.name === name)!;
    expect(by("Peel + poke · BNK FearX").games.map((g) => g.game)).toEqual([83453]);
    expect(by("Peel + poke · BNK FearX").picks.MID).toBe("cassiopeia");
    expect(by("Ryze variation · BNK FearX").picks.MID).toBe("ryze");
    expect(by("Galio engage · Karmine Corp").picks.TOP).toBe("galio");
    const vit = arch.members.find((m) => m.kind === "comp")!;
    expect(vit.id).toBe("pro-83450-red");
    expect(vit.games.map((g) => `${g.game}-${g.side}`)).toEqual(["83450-red"]);
    // The stored filings are untouched: the named variations stay under the core, the comp keeps its own variations.
    expect(review.namedVariations.filter((n) => n.comp === "pro-83521-blue").map((n) => n.name)).toEqual(expect.arrayContaining(["Peel + poke · BNK FearX", "Ryze variation · BNK FearX", "Galio engage · Karmine Corp"]));
    expect(library.extras["pro-83450-red"].variations.some((v) => v.named?.name.includes("Shopify"))).toBe(true);
  });

  it("LYON's Galio + Wukong lineup is a one-game named variation that keeps Yunara's protection (alan, 2026-10-26)", () => {
    const lyon = arch.members.find((m) => m.name === "Galio + Wukong engage · LYON")!;
    expect(lyon.kind).toBe("named");
    expect(lyon.games.map((g) => `${g.game}-${g.side}`)).toEqual(["83649-red"]);
    expect([lyon.picks.TOP, lyon.picks.JUNGLE, lyon.picks.MID, lyon.picks.BOT, lyon.picks.SUPPORT]).toEqual(["galio", "wukong", "syndra", "yunara", "lulu"]);
    expect(lyon.via).toEqual(expect.arrayContaining(["peel", "proactive engage", "frontline"]));
    expect(lyon.note).toMatch(/One game/);
  });

  it("a member comp keeps its id and Draft Room link but has no card of its own", () => {
    expect(library.shells.some((s) => s.id === "pro-83450-red")).toBe(true);
    expect(library.extras["pro-83450-red"].inArchetype).toEqual({ parent: "pro-83521-blue", id: "protect-yunara" });
    expect(library.extras["pro-83450-red"].variantOf).toBeUndefined();
  });

  it("Shopify's Ornn + Jarvan IV lineup is under review, shown apart and not counted as a variation", () => {
    expect(arch.members.some((m) => m.games.some((g) => g.game === 83468))).toBe(false);
    expect(arch.review.map((r) => r.id)).toEqual(["83468-red"]);
    expect(arch.review[0].why).toMatch(/not counted/);
    expect(arch.review[0].alike.flatMap((a) => a.games.map((g) => g.game))).toEqual([83537]);
    // Nor listed again under Team Vitality's row.
    expect(arch.members.find((m) => m.kind === "comp")!.observed.some((v) => v.games.some((g) => g.game === 83468))).toBe(false);
  });

  it("every game is listed once across the card, so the hierarchy never inflates a count", () => {
    const refs = [...rows.flatMap((r) => [...r.games, ...r.alike.flatMap((a) => a.games), ...r.observed.flatMap((v) => v.games)]),
      ...plainVariations(library.extras["pro-83521-blue"]).flatMap((v) => v.games), ...library.extras["pro-83521-blue"].games]
      .map((g) => `${g.game}-${g.side}`);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it("each row shows which typical jobs it keeps, replaces, shares or gives up, from the comp check", () => {
    for (const r of rows) expect(r.jobs?.map((j) => j.job), r.name).toEqual(["carry", "peel", "front", "start"]);
    const job = (r: (typeof rows)[number], j: string) => r.jobs!.find((x) => x.job === j)!;
    expect(job(arch.core, "front").state).toBe("keeps");
    // BNK's Ryze draft has no frontliner; the plan still runs through Yunara, and the cost is shown.
    const ryze = arch.members.find((m) => m.name === "Ryze variation · BNK FearX")!;
    expect(job(ryze, "front")).toEqual({ job: "front", state: "gives up", champions: [] });
    // Karmine Corp adds proactive engage: Galio replaces waiting for the enemy.
    const kc = arch.members.find((m) => m.name === "Galio engage · Karmine Corp")!;
    expect(job(kc, "start")).toEqual({ job: "start", state: "replaces", champions: ["galio"] });
    for (const r of rows) expect(r.via.length || r.why, r.name).toBeTruthy();
  });

  it("jobReads compares a lineup with the plan's typical jobs", () => {
    expect(jobReads({ main: "yunara", peel: ["lulu"], front: [], starts: ["galio"] }, "yunara").map((j) => j.state)).toEqual(["keeps", "gives up", "gives up", "replaces"]);
    expect(jobReads({ main: "ryze", peel: ["lulu", "orianna"], front: ["olaf"], starts: [] }, "yunara")[0]).toEqual({ job: "carry", state: "shares", champions: ["yunara", "ryze"] });
  });

  it("other comps keep their own cards: Objective Zone, Stable Top + Carry Bot, Jax Skirmish and Pick · Protected Yunara", () => {
    for (const id of ["objective-zone", "stable-top-carry-bot", "yunara-protect"]) {
      expect(library.extras[id]?.inArchetype, id).toBeUndefined();
      expect(library.extras[id]?.archetype, id).toBeUndefined();
    }
    for (const s of library.shells.filter((x) => /Jax/.test(x.name))) expect(library.extras[s.id]?.inArchetype, s.id).toBeUndefined();
  });
});
