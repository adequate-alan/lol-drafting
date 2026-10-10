// Champion Pool stats: role-aware pro evidence beside alan's tiers, from recorded or supplied evidence only.
import { describe, expect, it } from "vitest";
import { getBotPairings, getMeta, getPool, getProDrafts, getSources } from "@/lib/data";
import { poolRows, sortRows } from "@/lib/pool-stats";

const input = {
  pool: getPool(), meta: getMeta(), proDrafts: getProDrafts(), botPairings: getBotPairings(),
  sources: Object.fromEntries(getSources().map((s) => [s.id, s])),
};
const find = (rows: ReturnType<typeof poolRows>, id: string, role: string) => rows.find((r) => r.id === id && r.role === role)!;

describe("pool stats", () => {
  const rows = poolRows(input);

  it("never changes alan's tiers", () => {
    for (const p of getPool()) for (const t of ["core", "depth", "flex"] as const) for (const id of p[t])
      expect(find(rows, id, p.role).tier, `${p.role} ${id}`).toBe(t);
  });

  it("is role-aware: a stat recorded for one role never shows on another", () => {
    for (const r of rows) for (const s of r.stats) expect(s.stat.role).toBe(r.role);
    for (const r of rows) for (const g of r.games) expect(g.picks[r.role]).toBe(r.id);
    // Galio is pooled at TOP and MID; neither row borrows the other's games.
    const top = find(rows, "galio", "TOP"), mid = find(rows, "galio", "MID");
    expect(top.games.every((g) => g.picks.TOP === "galio")).toBe(true);
    expect(mid.games.every((g) => g.picks.MID === "galio")).toBe(true);
  });

  it("shows nothing rather than guessing when there is no evidence", () => {
    for (const r of rows) if (!r.stats.length && !r.games.length) { expect(r.latest).toBeUndefined(); expect(r.partner).toBeUndefined(); }
  });

  it("uses the newest event first and marks the ongoing one", () => {
    const locke = find(rows, "locke", "MID");
    expect(locke.stat?.event.id).toBe("demacia-cup-2026");
    expect(locke.latest?.eventName).toBe("Demacia Cup");
    expect(locke.stats.map((s) => s.event.id)).toEqual(["demacia-cup-2026", "lck-2026-playoffs"]);
    const yunara = find(rows, "yunara", "BOT");
    expect(yunara.latest).toMatchObject({ eventName: "Demacia Cup", patch: "16.18", date: "2026-10-04" });
    expect(yunara.latest?.event?.status).toBe("ongoing");
    expect(yunara.partner?.id).toBe("lulu");
  });

  it("filters by tournament and patch", () => {
    const lck = poolRows(input, { event: "lck-2026-playoffs" });
    expect(find(lck, "locke", "MID").stat?.stat).toMatchObject({ picks: 3, bans: 5 });
    for (const r of lck) for (const g of r.games) expect(g.patch).toBe("16.16");
    for (const r of poolRows(input, { patch: "16.18" })) for (const g of r.games) expect(g.patch).toBe("16.18");
  });

  it("sorts by pool tier by default, with missing stats last on number sorts", () => {
    const tiers = sortRows(rows, "tier").map((r) => r.tier);
    expect(tiers.indexOf("depth")).toBeGreaterThan(tiers.lastIndexOf("core"));
    const byPicks = sortRows(rows, "picks");
    const firstMissing = byPicks.findIndex((r) => !r.stat);
    expect(byPicks.slice(firstMissing).every((r) => !r.stat)).toBe(true);
  });
});
