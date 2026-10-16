// Proposed synergy (alan, 2026-10-10: "Complete Champion Synergy Expansion"): kit-based partners for every
// champion and role, kept apart from alan's Confirmed records. These tests hold the separation and the coverage.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getDraftData, getProposed } from "@/lib/data";
import { confirmedLink, proposedCard, proposedLink, proposedPartners, withoutConfirmed } from "@/lib/proposed";
import { recommend, savedSupports } from "@/lib/recommend";
import { ProposedSynergy, type Role } from "@/lib/schema";

const data = getDraftData();
const raw = ProposedSynergy.parse(JSON.parse(readFileSync(join(process.cwd(), "data", "proposed-synergy.json"), "utf8")));
const records = getProposed().records;
const champ = new Map(data.champions.map((c) => [c.id, c]));
const playable = data.champions.filter((c) => !c.rosterOnly);
// The partner role each role's profile must cover first (bot ↔ support, mid ↔ jungle, top → jungle).
const FIRST: Record<Role, Role> = { BOT: "SUPPORT", SUPPORT: "BOT", MID: "JUNGLE", JUNGLE: "MID", TOP: "JUNGLE" };

describe("proposed synergy records", () => {
  it("one record per champion and role, in a role the champion plays, with partners who play the partner role", () => {
    const seen = new Set<string>();
    for (const r of raw.records) {
      const key = `${r.champion} ${r.role}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
      expect(champ.get(r.champion)?.roles, key).toContain(r.role);
      for (const g of r.partners) {
        const ids = [...g.preferred, ...g.alternatives].map((p) => p.id);
        expect(new Set(ids).size, `${key} ${g.role} duplicates`).toBe(ids.length);
        expect(g.preferred.length, `${key} ${g.role}`).toBeGreaterThan(0);
        for (const id of ids) {
          const p = champ.get(id);
          expect(p, `${key}: ${id}`).toBeDefined();
          expect(p!.roles, `${key}: ${id} as ${g.role}`).toContain(g.role);
          expect(p!.rosterOnly, `${key}: ${id} is roster-only`).toBeUndefined();
          expect(id, key).not.toBe(r.champion);
        }
      }
    }
  });

  it("every playable champion has partners in every role it plays", () => {
    const missing: string[] = [];
    for (const c of playable) for (const role of c.roles) {
      const confirmed = role === "BOT" ? data.botPairings.some((b) => b.champion === c.id)
        : role === "TOP" ? data.topPicks.some((t) => t.champion === c.id)
        : role === "SUPPORT" ? false
        : data.midJungle.some((m) => m.anchor === c.id && m.role === role);
      const proposed = proposedPartners(records, c.id, role, FIRST[role]).length > 0;
      if (!confirmed && !proposed) missing.push(`${c.id} ${role}`);
    }
    expect(missing).toEqual([]);
  });

  it("covers the champions pro play leaves empty", () => {
    for (const [id, role, partner] of [["fizz", "MID", "JUNGLE"], ["nunu-willump", "JUNGLE", "MID"], ["nunu-willump", "JUNGLE", "TOP"], ["shaco", "JUNGLE", "MID"],
      ["master-yi", "JUNGLE", "MID"], ["katarina", "MID", "JUNGLE"], ["rammus", "JUNGLE", "TOP"], ["teemo", "TOP", "JUNGLE"], ["soraka", "SUPPORT", "BOT"]] as const) {
      expect(proposedPartners(records, id, role, partner).filter((l) => l.tier === "preferred").length, `${id} ${role}`).toBeGreaterThan(0);
    }
  });

  it("never repeats a pairing alan confirmed, and never one his records rule out", () => {
    const ctx = { botPairings: data.botPairings, midJungle: data.midJungle, topPicks: data.topPicks };
    expect(withoutConfirmed(raw, ctx)).toEqual(raw);
    for (const r of raw.records) for (const g of r.partners) for (const p of [...g.preferred, ...g.alternatives]) {
      expect(confirmedLink(r.champion, r.role, p.id, g.role, ctx), `${r.champion} + ${p.id}`).toBe(false);
    }
    for (const [a, ra, b, rb] of [["ziggs", "BOT", "bard", "SUPPORT"], ["ziggs", "BOT", "karma", "SUPPORT"], ["kaisa", "BOT", "rell", "SUPPORT"], ["azir", "MID", "skarner", "JUNGLE"]] as const) {
      expect(proposedLink(records, a, ra, b, rb), `${a} + ${b}`).toBeUndefined();
    }
  });

  it("reasons are specific, not generic", () => {
    for (const r of raw.records) for (const g of r.partners) for (const p of [...g.preferred, ...g.alternatives]) {
      expect(p.reason, `${r.champion} + ${p.id}`).not.toMatch(/excellent synergy|great synergy|strong teamfight potential|works well together/i);
      expect(p.reason, `${r.champion} + ${p.id}`).not.toMatch(/[—–]/);
    }
  });
});

describe("proposed synergy in the draft engine", () => {
  it("never loosens a bot's saved supports: Ziggs still recommends only his saved supports", () => {
    const allowed = savedSupports({ BOT: "ziggs" }, data.botPairings)!;
    const recs = recommend({ BOT: "ziggs" }, [], data, Infinity).SUPPORT ?? [];
    expect(recs.length).toBeGreaterThan(0);
    for (const r of recs) expect(allowed, r.champion).toContain(r.champion);
  });

  it("gives an uncommon pick useful partners, labelled Proposed", () => {
    const jg = recommend({ MID: "fizz" }, [], data, 10).JUNGLE ?? [];
    const proposed = jg.filter((r) => r.proposed);
    expect(proposed.length).toBeGreaterThan(0);
    for (const r of proposed) expect(r.parts.some((p) => p.kind === "proposed" && /Proposed .*kit-based, not saved/.test(p.text)), r.champion).toBe(true);
  });

  it("a proposed partner scores below the matching saved link, so saved defaults still lead", () => {
    const vi = recommend({ JUNGLE: "vi" }, [], data, 5).MID ?? [];
    expect(vi[0].champion).toBe("ahri");
    for (const r of [vi, recommend({ MID: "fizz" }, [], data, Infinity).JUNGLE ?? []]) {
      for (const rec of r) for (const p of rec.parts) if (p.kind === "proposed") expect(p.points).toBeLessThan(1.5);
    }
  });

  it("a support with no saved record gets a profile with proposed bots and its saved links", () => {
    const card = proposedCard("soraka", "SUPPORT", records, data);
    expect(card.links.some((l) => l.role === "BOT")).toBe(true);
    const nami = proposedCard("nami", "SUPPORT", records, data);
    expect(nami.confirmed.find((g) => g.label === "Preferred with")?.ids).toContain("corki");
  });
});

describe("user-facing copy", () => {
  it("never names Claude or AI outside code comments (alan, 2026-10-10)", async () => {
    const { readdirSync, statSync } = await import("node:fs");
    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f.endsWith(".tsx") ? [join(d, f)] : []));
    for (const f of [...walk("components"), ...walk("app")]) {
      const code = readFileSync(f, "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).map((l) => l.replace(/\/\/ .*$/, ""));
      for (const l of code) expect(l, f).not.toMatch(/\bClaude\b|\bAI\b/);
    }
  });
});
