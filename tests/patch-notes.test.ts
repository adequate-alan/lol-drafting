// Patch Notes (alan, 2026-10-12): Riot's official notes from 26.16 on, read by the daily check (scripts/refresh-patch-
// notes.mjs) from pages a GitHub runner saved on 2026-10-12 (tests/fixtures/riot). Checks the 26.xx ↔ 16.xx
// normalization, that values are copied exactly, that other modes and cosmetics stay out, the refresh's idempotence and
// archive rules, the shared lookups other pages use, and that nothing outside patch-notes.json can change.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPatch } from "@/scripts/riot/normalize.mjs";
import { blocks, parseArticle, parseIndex, sections, slug } from "@/scripts/riot/parse.mjs";
import { INDEX_URL, refresh } from "@/scripts/riot/refresh.mjs";
import { comparePatch, parsePatch, patchKey, samePatch, shortPatch } from "@/lib/patch";
import { buildPatchIndex, changedSince, changesFor, patchHref } from "@/lib/patch-changes";
import { implicationContext, implicationsFor } from "@/lib/patch-implications";
import { slugify } from "@/lib/slug";
import { Files, type PatchNotes } from "@/lib/schema";

const fixture = (f: string) => readFileSync(join(process.cwd(), "tests/fixtures/riot", f), "utf8");
const raw = <T,>(f: string): T => JSON.parse(readFileSync(join(process.cwd(), "data", f), "utf8"));
const champions = Files["champions.json"].parse(raw("champions.json"));
const stored = Files["patch-notes.json"].parse(raw("patch-notes.json"));
const article = (n: number) => parseArticle(fixture(`patch-26-${n}.html`));
const NOW = "2026-10-12T09:00:00.000Z";

describe("26.xx and 16.xx are one patch", () => {
  it("reads both notations and client versions to the same key", () => {
    for (const s of ["26.16", "16.16", "16.16.1", "V16.16", "Patch 26.16", "patch 16.16"]) expect(patchKey(s)).toBe("26.16");
    expect(parsePatch("16.18")).toEqual({ official: "26.18", short: "16.18", major: 26, minor: 18 });
    expect(shortPatch("26.20")).toBe("16.20");
    expect(samePatch("16.18", "26.18")).toBe(true);
    expect(samePatch("16.18", "26.17")).toBe(false);
    expect(comparePatch("16.19", "26.18")).toBeGreaterThan(0);
    expect(comparePatch("26.9", "16.10")).toBeLessThan(0); // numeric, not string order
    expect(parsePatch("14.13")).toBeUndefined(); // pre-2025 numbering is not this scheme
  });
  it("stores each patch in Riot's label with the pro-data spelling beside it", () => {
    for (const p of stored.patches) expect(p.short).toBe(shortPatch(p.patch));
  });
});

describe("parsing Riot's pages", () => {
  it("lists the patch-notes articles from the index", () => {
    const list = parseIndex(fixture("index.html"));
    const p16 = list.find((x) => x.patch === "26.16")!;
    expect(p16.url).toBe("https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-16-notes/");
    expect(p16.published).toBe("2026-08-11T18:00:00.000Z");
    expect(list.map((x) => x.patch)).toEqual(expect.arrayContaining(["26.16", "26.17", "26.18", "26.19", "26.20"]));
  });

  it("copies values exactly as Riot wrote them", () => {
    const { patch } = buildPatch("26.16", article(16), champions, { now: NOW });
    const azir = patch.entries.find((e) => e.id === "champion-azir")!;
    expect(azir.ref).toBe("azir");
    expect(azir.groups[0].title).toBe("Q - Conquering Sands");
    expect(azir.groups[0].changes[0]).toMatchObject({
      label: "Damage", before: "60 / 80 / 100 / 120 / 140 (+35 / 40 / 45 / 50 / 55% AP)", after: "75 / 95 / 115 / 135 / 155 (+35 / 40 / 45 / 50 / 55% AP)",
    });
    const hob = patch.entries.find((e) => e.id === "rune-hail-of-blades")!;
    expect(hob.category).toBe("keystone");
    expect(hob.groups[0].changes[0]).toMatchObject({ label: "Attack Speed", before: "120% Melee || 60% Ranged", after: "90% Melee || 60% Ranged" });
    expect(patch.published).toBe("2026-08-11");
  });

  it("keeps Summoner's Rift sections and leaves other modes, skins and client notes out", () => {
    const { patch } = buildPatch("26.16", article(16), champions, { now: NOW });
    expect(patch.excluded).toEqual(expect.arrayContaining(["Classic", "ARAM: Mayhem", "Arena", "Upcoming Skins & Chromas"]));
    expect(new Set(patch.entries.map((e) => e.kind))).toEqual(new Set(["champion", "item", "rune", "system"]));
    const mr = patch.entries.find((e) => e.id === "system-adc-magic-resistance")!;
    expect(mr.affects).toContain("kaisa");
    expect(mr.affects).toHaveLength(27);
    // Client, cosmetic and audio fixes stay out; gameplay ones stay in.
    const fixes = patch.entries.find((e) => e.category === "bugfix")!.groups[0].changes.map((c) => c.text);
    expect(fixes.some((t) => /Maw of Malmortius/.test(t))).toBe(true);
    expect(fixes.some((t) => /spectators|VFX would stretch|volume/.test(t))).toBe(false);

    const p20 = buildPatch("26.20", article(20), champions, { now: NOW }).patch;
    expect(p20.entries.filter((e) => e.kind === "item").map((e) => e.subject)).toEqual(["Experimental Hexplate", "Hextech Rocketbelt", "Runaan's Hurricane"]);
    expect(p20.excluded).toEqual(expect.arrayContaining(["ARAM", "Ranked 5s", "Private Replays"]));
  });

  it("reads system and item headings without a champion-style title (26.19)", () => {
    const { patch } = buildPatch("26.19", article(19), champions, { now: NOW });
    expect(patch.entries.find((e) => e.kind === "system" && e.subject === "Teleport Cooldown")?.category).toBe("summoners");
    expect(patch.entries.find((e) => e.kind === "item")?.subject).toBe("World Atlas and Runic Compass");
    const aphelios = patch.entries.find((e) => e.ref === "aphelios")!;
    expect(aphelios.groups.map((g) => g.title)).toEqual(["Calibrum", "Severum", "Gravitum", "Infernum", "Crescendum"]);
  });

  it("splits sections at their headings", () => {
    const titles = sections(article(16).body).map((s) => s.title);
    expect(titles).toEqual(expect.arrayContaining(["Champions", "Items", "Runes", "Systems", "Bugfixes & QoL Changes"]));
    expect(blocks(sections(article(16).body).find((s) => s.title === "Champions")!.html, { champions: true })).toHaveLength(7);
  });
});

describe("data/patch-notes.json", () => {
  it("is valid, starts at 26.16 and has no gap", () => {
    expect(stored.firstPatch).toBe("26.16");
    const minors = stored.patches.map((p) => parsePatch(p.patch)!.minor).sort((a, b) => a - b);
    expect(minors[0]).toBe(16);
    minors.forEach((m, i) => expect(m).toBe(16 + i));
  });
  it("never states a value Riot's line doesn't contain", () => {
    for (const p of stored.patches) for (const e of p.entries) for (const g of e.groups) for (const c of g.changes) {
      if (c.before) expect(c.text, `${p.patch} ${e.subject}`).toContain(c.before);
      if (c.after) expect(c.text, `${p.patch} ${e.subject}`).toContain(c.after);
      if (c.before || c.after) expect(c.text).toContain("⇒");
    }
  });
  it("links every champion change to a roster champion and keeps other modes out", () => {
    const ids = new Set(champions.map((c) => c.id));
    for (const p of stored.patches) {
      expect(p.url).toMatch(/^https:\/\/www\.leagueoflegends\.com\/en-us\/news\/game-updates\//);
      for (const e of p.entries) {
        if (e.kind === "champion") { expect(ids.has(e.ref!), e.subject).toBe(true); expect(e.category).toMatch(/^(buff|nerf|adjustment|rework)$/); }
        for (const a of e.affects ?? []) expect(ids.has(a)).toBe(true);
        expect(e.subject).not.toMatch(/aram|arena|classic|skin|chroma|tft/i);
      }
    }
  });
  it("keeps the reviewed buff / nerf calls for 26.16 to 26.20", () => {
    const cat = (p: string, id: string) => stored.patches.find((x) => x.patch === p)!.entries.find((e) => e.ref === id)!;
    expect(cat("26.18", "nautilus")).toMatchObject({ category: "nerf", categoryBasis: "reviewed" });
    expect(cat("26.20", "yunara")).toMatchObject({ category: "nerf", categoryBasis: "reviewed" });
    expect(cat("26.16", "camille")).toMatchObject({ category: "adjustment", categoryBasis: "reviewed" });
  });
});

describe("the daily check", () => {
  const pages: Record<string, string> = { [INDEX_URL]: fixture("index.html") };
  for (const n of [16, 19, 20]) pages[`https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-${n}-notes/`] = fixture(`patch-26-${n}.html`);
  const requested: string[] = [];
  const get = async (url: string) => { requested.push(url); if (!(url in pages)) throw new Error(`not in fixtures: ${url}`); return pages[url]; };

  it("does nothing when every revision is unchanged", async () => {
    requested.length = 0;
    const out = await refresh({ patchNotes: structuredClone(stored), champions }, get, { now: NOW });
    expect(out.changed).toEqual([]);
    expect(requested).toEqual([INDEX_URL]);
    expect(out.patchNotes).toEqual(stored);
  });

  it("re-reads a patch whose revision changed and writes nothing when its facts are the same", async () => {
    const notes: PatchNotes = structuredClone(stored);
    notes.patches.find((p) => p.patch === "26.19")!.rev = "older-revision";
    const out = await refresh({ patchNotes: notes, champions }, get, { now: NOW });
    expect(out.changed).toEqual([]);
    expect(out.report.join("\n")).toMatch(/26\.19: page revision changed, no Summoner's Rift change/);
  });

  it("adds a new patch and never removes an archived one", async () => {
    const notes: PatchNotes = structuredClone(stored);
    notes.patches = notes.patches.filter((p) => p.patch !== "26.20");
    notes.patches.push({ ...structuredClone(stored.patches.find((p) => p.patch === "26.16")!), patch: "26.15" as never, short: "16.15" });
    const out = await refresh({ patchNotes: notes, champions }, get, { now: NOW });
    expect(out.changed).toEqual(["26.20"]);
    expect(out.patchNotes.patches.map((p) => p.patch)).toContain("26.15");
    const p20 = out.patchNotes.patches.find((p) => p.patch === "26.20")!;
    expect(p20.updatedAt).toBe(NOW);
    expect(Files["patch-notes.json"].safeParse(out.patchNotes).success).toBe(true);
  });

  it("marks an entry Riot edited after it was stored, and keeps untouched entries' timestamps", async () => {
    const notes: PatchNotes = structuredClone(stored);
    const p16 = notes.patches.find((p) => p.patch === "26.16")!;
    p16.rev = "older-revision";
    p16.entries.find((e) => e.ref === "azir")!.groups[0].changes[0].after = "70 / 90";
    const out = await refresh({ patchNotes: notes, champions }, get, { now: NOW });
    expect(out.changed).toEqual(["26.16"]);
    const next = out.patchNotes.patches.find((p) => p.patch === "26.16")!;
    expect(next.entries.find((e) => e.ref === "azir")).toMatchObject({ corrected: true, updatedAt: NOW });
    expect(next.entries.find((e) => e.ref === "gwen")!.updatedAt).toBe(stored.patches.find((p) => p.patch === "26.16")!.entries.find((e) => e.ref === "gwen")!.updatedAt);
  });

  it("stops on a refused page and returns nothing to write", async () => {
    const refuse = async () => { throw new Error("HTTP 403. Nothing written."); };
    await expect(refresh({ patchNotes: structuredClone(stored), champions }, refuse)).rejects.toThrow(/403/);
  });
});

describe("shared lookups (drawer, Pro Builds, Meta)", () => {
  const index = buildPatchIndex(stored);
  it("lists a champion's changes after a patch, in either notation", () => {
    const all = changesFor(index, { kind: "champion", ref: "nautilus" });
    expect(all.map((c) => `${c.patch} ${c.category}${c.via ? " via" : ""}`)).toEqual(["26.20 bugfix via", "26.18 nerf"]);
    expect(changesFor(index, { kind: "champion", ref: "nautilus" }, "16.18")).toHaveLength(1);
    expect(changesFor(index, { kind: "champion", ref: "nautilus" }, "26.16", "16.18").map((c) => c.patch)).toEqual(["26.18"]);
  });
  it("finds items by name, slug or Data Dragon id, and runes by name", () => {
    expect(changesFor(index, { kind: "item", ref: "Runaan's Hurricane" }).map((c) => c.patch)).toEqual(["26.20", "26.16"]);
    expect(changesFor(index, { kind: "item", ref: "runaans-hurricane" }, "26.16").map((c) => c.patch)).toEqual(["26.20"]);
    expect(changesFor(index, { kind: "item", ref: "3073" }).map((c) => c.subject)).toEqual(["Experimental Hexplate"]);
    expect(changesFor(index, { kind: "rune", ref: "Hail of Blades" }).map((c) => c.patch)).toEqual(["26.16"]);
  });
  it("answers 'changed since this game' for a game's champions, items and runes", () => {
    const r = changedSince(index, "16.16", { champions: ["camille"], items: ["Sundered Sky"], runes: ["Hail of Blades"] });
    expect(r.since).toBe("26.16");
    expect(r.changes.every((c) => comparePatch(c.patch, "26.16") > 0)).toBe(true); // the game's own patch is not "since"
    expect(r.changes.map((c) => `${c.patch} ${c.subject}`)).toContain("26.17 Sundered Sky");
    expect(changedSince(index, undefined, { champions: ["camille"] }).changes).toEqual([]);
    expect(patchHref("16.18", "champion-nautilus")).toBe("/patch-notes/?patch=26.18#champion-nautilus");
  });
  it("uses one slug rule in the updater and the site", () => {
    for (const n of ["Runaan's Hurricane", "Guinsoo's Rageblade", "Hail of Blades", "World Atlas and Runic Compass"]) expect(slugify(n)).toBe(slug(n));
  });
});

describe("patch notes never change saved data", () => {
  it("draft implications read saved pairings and pool tiers without changing them", () => {
    const input = {
      pool: Files["pool.json"].parse(raw("pool.json")), meta: Files["meta.json"].parse(raw("meta.json")),
      proDrafts: Files["pro-drafts.json"].parse(raw("pro-drafts.json")), botPairings: Files["bot-pairings.json"].parse(raw("bot-pairings.json")),
      sources: Object.fromEntries(Files["sources.json"].parse(raw("sources.json")).map((s) => [s.id, s])),
      midJungle: Files["mid-jungle.json"].parse(raw("mid-jungle.json")), topPicks: Files["top.json"].parse(raw("top.json")),
    };
    const before = JSON.stringify(input);
    const imp = implicationsFor("nautilus", "26.18", implicationContext(input), (id) => id);
    expect(JSON.stringify(input)).toBe(before);
    expect(imp.saved.join(" ")).toMatch(/Preferred support for .*ziggs/);
    expect(imp.pool.length).toBeGreaterThan(0);
  });
  it("the updater only writes patch-notes.json", () => {
    const script = readFileSync(join(process.cwd(), "scripts/refresh-patch-notes.mjs"), "utf8");
    expect([...script.matchAll(/writeFileSync\(join\(dataDir, "([^"]+)"\)/g)].map((m) => m[1])).toEqual(["patch-notes.json"]);
    const wf = readFileSync(join(process.cwd(), ".github/workflows/refresh-patch-notes.yml"), "utf8");
    expect(wf).toMatch(/git add data\/patch-notes\.json\n/);
  });
});
