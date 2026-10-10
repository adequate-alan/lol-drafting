// Roster-only champions (added from Data Dragon by scripts/sync-champions.mjs) can be locked and searched, but carry no
// reviewed attributes: they are never recommended and never part of alan's pool or saved pairings.
import { describe, expect, it } from "vitest";
import { getDraftData } from "@/lib/data";
import { recommend } from "@/lib/recommend";
import { ATTRS, ROLES, type Champion } from "@/lib/schema";

const data = getDraftData();
const rosterOnly = data.champions.filter((c) => c.rosterOnly);
const ids = new Set(rosterOnly.map((c) => c.id));

describe("roster-only champions", () => {
  it("have every attribute at 0, no flags and are unreviewed", () => {
    for (const c of rosterOnly) {
      expect(ATTRS.every((a) => c.attrs[a] === 0), c.id).toBe(true);
      expect(c.flags, c.id).toEqual([]);
      expect(c.reviewed, c.id).toBe(false);
    }
  });

  it("are not in the pool or any saved pairing", () => {
    for (const p of data.pool) for (const id of [...p.core, ...p.depth, ...p.flex]) expect(ids.has(id), `${p.role} ${id}`).toBe(false);
    for (const b of data.botPairings) for (const id of [b.champion, ...b.clashDefault, ...b.alternatives]) expect(ids.has(id), id).toBe(false);
    for (const m of data.midJungle) for (const id of [m.anchor, ...m.clashDefault, ...m.alternatives]) expect(ids.has(id), id).toBe(false);
  });

  it("are never recommended, even when they are the only champion for a role", () => {
    const stub: Champion = { ...data.champions.find((c) => c.id === "ornn")!, id: "stub-champ", name: "Stub", roles: ["TOP"], rosterOnly: true };
    const withStub = { ...data, champions: [...data.champions, stub] };
    const recs = recommend({ BOT: "sivir" }, ["ahri"], withStub, Infinity);
    for (const r of ROLES) expect((recs[r] ?? []).some((x) => x.champion === "stub-champ" || ids.has(x.champion)), r).toBe(false);
  });

  it("can be locked as an ally or an enemy without breaking the engine", () => {
    for (const c of rosterOnly.slice(0, 10)) {
      const role = c.roles[0];
      const draft = role === "BOT" ? { BOT: c.id } : { BOT: "sivir", [role]: c.id };
      expect(() => recommend(draft, [c.id === "sivir" ? "ahri" : c.id], data, 5)).not.toThrow();
    }
  });
});
