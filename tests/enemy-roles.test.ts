// Enemy flex picks (alan, 2026-11-10; lib/enemy-roles.ts): the whole enemy lineup is placed at once, a confirmed role is
// never moved, uncertainty is shown instead of invented, links and stored boards keep how each role was set, and the
// placement never scores a candidate.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyRole, cleanPicks, counterClaim, enemyPicksParam, parseEnemyPicks, placeInSlot, readEnemy, roleWeights, sanitizePicks, type EnemyPick, type RoleBook } from "@/lib/enemy-roles";
import { foesOf, openingBoard, sanitizeBoard, writeBoard } from "@/lib/draft-persist";
import { recommend } from "@/lib/recommend";
import { getChampions, getDraftData, getEnemyRoleBook } from "@/lib/data";
import type { Champion, Role } from "@/lib/schema";

// Synthetic roster and evidence, so new pro games can never break these cases.
const champ = (id: string, roles: Role[]): Champion => ({ ...getChampions()[0], id, name: id[0].toUpperCase() + id.slice(1), aliases: [], roles });
const ROSTER = [
  champ("poppy", ["JUNGLE", "SUPPORT"]), champ("vi", ["JUNGLE"]), champ("gragas", ["TOP", "JUNGLE"]), champ("ornn", ["TOP"]),
  champ("sion", ["TOP"]), champ("ahri", ["MID"]), champ("jinx", ["BOT"]), champ("lulu", ["SUPPORT"]), champ("jayce", ["TOP", "MID"]),
];
const BOOK: RoleBook = { jayce: { recent: { TOP: 2, JUNGLE: 8 }, all: { TOP: 2, JUNGLE: 8 } }, gragas: { recent: { JUNGLE: 1 } } };
const read = (picks: EnemyPick[], book: RoleBook = {}) => readEnemy(picks, ROSTER, book, "16.20");
const at = (r: ReturnType<typeof read>, id: string) => r.placements.find((p) => p.id === id)!;

describe("Placement of the whole enemy lineup", () => {
  it("places a flex champion in its main role and shows the other as possible, never as certain", () => {
    const r = read([{ id: "poppy" }]);
    expect(at(r, "poppy")).toMatchObject({ role: "JUNGLE", status: "uncertain", alternatives: ["SUPPORT"] });
    expect(r.possible.SUPPORT).toEqual(["poppy"]);
    expect(r.alt.poppy.SUPPORT).toEqual({ SUPPORT: "poppy" });
  });
  it("re-reads the lineup when another champion is revealed: Poppy moves to support once an only-jungle pick arrives", () => {
    const r = read([{ id: "poppy" }, { id: "vi" }]);
    expect(r.byRole).toEqual({ JUNGLE: "vi", SUPPORT: "poppy" });
    expect(at(r, "poppy").status).toBe("likely");
    // removing Vi puts Poppy back
    expect(read([{ id: "poppy" }]).byRole).toEqual({ JUNGLE: "poppy" });
  });
  it("never moves a confirmed role, whatever is added", () => {
    const r = read([{ id: "poppy", role: "TOP" }, { id: "vi" }, { id: "gragas" }]);
    expect(at(r, "poppy")).toMatchObject({ role: "TOP", status: "confirmed" });
    expect(r.byRole.JUNGLE).toBe("vi");
    expect(at(r, "gragas").role).toBeUndefined(); // top and jungle are taken: left unresolved, not guessed off-role
    expect(at(r, "gragas").status).toBe("unresolved");
  });
  it("leaves a champion unresolved when no open role it plays is left", () => {
    const r = read([{ id: "ornn" }, { id: "sion", role: "TOP" }]);
    expect(at(r, "ornn")).toMatchObject({ status: "unresolved", role: undefined });
    expect(Object.values(r.byRole)).toEqual(["sion"]);
  });
  it("reads recorded pro role picks: Jayce mostly jungled in pro games goes jungle beside a top-only champion", () => {
    const w = roleWeights(ROSTER.find((c) => c.id === "jayce")!, BOOK, "16.20").map((x) => x.role);
    expect(w).toContain("JUNGLE"); // a pro-only role with 2+ recorded picks is admitted
    expect(read([{ id: "jayce" }, { id: "ornn" }], BOOK).byRole).toEqual({ TOP: "ornn", JUNGLE: "jayce" });
    // a sample under three picks is ignored: Gragas stays on the roster's order
    expect(roleWeights(ROSTER.find((c) => c.id === "gragas")!, BOOK)[0].role).toBe("TOP");
  });
  it("a flexible champion stays unconfirmed between the user's roles", () => {
    const r = read([{ id: "poppy", flex: ["JUNGLE", "SUPPORT"] }]);
    expect(at(r, "poppy")).toMatchObject({ role: "JUNGLE", status: "flex", alternatives: ["SUPPORT"], flex: ["JUNGLE", "SUPPORT"] });
    expect(at(read([{ id: "poppy", flex: ["JUNGLE", "SUPPORT"] }, { id: "vi" }]), "poppy").role).toBe("SUPPORT");
  });
  it("one-role champions in free roles are likely, with no invented alternatives", () => {
    const r = read([{ id: "ahri" }, { id: "jinx" }, { id: "lulu" }]);
    expect(r.placements.map((p) => [p.role, p.status, p.alternatives.length])).toEqual([["MID", "likely", 0], ["BOT", "likely", 0], ["SUPPORT", "likely", 0]]);
  });
  it("works on the real roster and evidence: every enemy is placed in a role it plays or left unresolved", () => {
    const { book, patch } = getEnemyRoleBook();
    const champions = getChampions();
    const r = readEnemy([{ id: "poppy" }, { id: "vi" }, { id: "ornn" }, { id: "ahri" }, { id: "jinx" }], champions, book, patch);
    for (const p of r.placements) if (p.role) expect([...p.roster, ...Object.keys(book[p.id]?.all ?? {})]).toContain(p.role);
    expect(new Set(Object.values(r.byRole)).size).toBe(Object.values(r.byRole).length);
  });
});

describe("How a counter is claimed (alan, 2026-11-10)", () => {
  const SUP: Role[] = ["BOT", "SUPPORT"];
  const N = { poppy: "Poppy", vi: "Vi", ornn: "Ornn" };
  it("Poppy alone in jungle, support still possible: Conditional counter, If Poppy plays JG", () => {
    expect(counterClaim(read([{ id: "poppy" }]), ["JUNGLE"], N)).toEqual({ kind: "conditional", label: "Conditional counter", detail: "If Poppy plays JG" });
  });
  it("once Vi is revealed Poppy is placed support: Potential counter, Poppy likely SUP", () => {
    expect(counterClaim(read([{ id: "poppy" }, { id: "vi" }]), SUP, N)).toEqual({ kind: "potential", label: "Potential counter", detail: "Poppy likely SUP" });
    // and the jungle lane, Vi a one-role champion placed automatically, is a potential counter too
    expect(counterClaim(read([{ id: "poppy" }, { id: "vi" }]), ["JUNGLE"], N)?.kind).toBe("potential");
  });
  it("a role the user confirms is a Counter, with no uncertainty line", () => {
    expect(counterClaim(read([{ id: "poppy", role: "SUPPORT" }, { id: "vi" }]), SUP, N)).toEqual({ kind: "confirmed", label: "Counter" });
  });
  it("a flexible champion stays conditional between its roles", () => {
    expect(counterClaim(read([{ id: "poppy", flex: ["JUNGLE", "SUPPORT"] }]), ["JUNGLE"], N)?.kind).toBe("conditional");
  });
  it("an enemy with no supported role assignment never produces a lane claim", () => {
    const r = read([{ id: "ornn" }, { id: "sion", role: "TOP" }]);
    expect(counterClaim(r, ["TOP"], N)?.kind).toBe("confirmed"); // Sion, not Ornn
    expect(counterClaim(r, ["JUNGLE"], N)).toBeUndefined();
    expect(counterClaim(read([]), ["MID"], N)).toBeUndefined();
  });
});

describe("Editing roles", () => {
  const base: EnemyPick[] = [{ id: "poppy" }, { id: "vi", role: "JUNGLE" }];
  it("confirming a role a confirmed champion holds swaps them", () => {
    const next = applyRole([{ id: "poppy", role: "SUPPORT" }, { id: "vi", role: "JUNGLE" }], "poppy", { kind: "confirm", role: "JUNGLE" }, "SUPPORT");
    expect(next).toEqual([{ id: "poppy", role: "JUNGLE" }, { id: "vi", role: "SUPPORT" }]);
    // with no current role the other one goes back to automatic placement
    expect(applyRole(base, "poppy", { kind: "confirm", role: "JUNGLE" })).toEqual([{ id: "poppy", role: "JUNGLE" }, { id: "vi" }]);
  });
  it("releases, marks flexible and removes", () => {
    expect(applyRole(base, "vi", { kind: "auto" })).toEqual([{ id: "poppy" }, { id: "vi" }]);
    expect(applyRole(base, "poppy", { kind: "flex", roles: ["SUPPORT", "TOP"] })).toEqual([{ id: "poppy", flex: ["TOP", "SUPPORT"] }, { id: "vi", role: "JUNGLE" }]);
    expect(applyRole(base, "poppy", { kind: "flex", roles: ["TOP"] })).toEqual([{ id: "poppy" }, { id: "vi", role: "JUNGLE" }]); // flex needs two roles
    expect(applyRole(base, "vi", { kind: "remove" })).toEqual([{ id: "poppy" }]);
  });
  it("a champion typed into a role slot is confirmed there and replaces the one shown", () => {
    expect(placeInSlot(base, "SUPPORT", undefined, "lulu")).toEqual([{ id: "poppy" }, { id: "vi", role: "JUNGLE" }, { id: "lulu", role: "SUPPORT" }]);
    expect(placeInSlot(base, "JUNGLE", "vi", "gragas")).toEqual([{ id: "poppy" }, { id: "gragas", role: "JUNGLE" }]);
    expect(placeInSlot(base, "JUNGLE", "vi", undefined)).toEqual([{ id: "poppy" }]);
  });
  it("keeps one champion once, one confirmation per role and five picks at most", () => {
    expect(cleanPicks([{ id: "a", role: "TOP" }, { id: "a" }, { id: "b", role: "TOP" }])).toEqual([{ id: "a", role: "TOP" }, { id: "b" }]);
    expect(cleanPicks(["a", "b", "c", "d", "e", "f"].map((id) => ({ id })))).toHaveLength(5);
  });
});

describe("Links and the stored board", () => {
  const ids = new Set(ROSTER.map((c) => c.id));
  it("writes and reads ?vs= in entry order with confirmed, flexible and automatic roles", () => {
    const picks: EnemyPick[] = [{ id: "poppy", flex: ["JUNGLE", "SUPPORT"] }, { id: "ornn", role: "TOP" }, { id: "ahri" }];
    const param = enemyPicksParam(picks);
    expect(param).toBe("jungle|support:poppy,top:ornn,ahri");
    expect(parseEnemyPicks(param, ROSTER)).toEqual(picks);
  });
  it("reads older links: roles kept as confirmed, bare ids placed automatically, unknown, repeated or allied ids dropped", () => {
    expect(parseEnemyPicks("top:ornn,mid:ahri", ROSTER)).toEqual([{ id: "ornn", role: "TOP" }, { id: "ahri", role: "MID" }]);
    expect(parseEnemyPicks("ornn,,,nope,ornn,jinx", ROSTER, ["jinx"])).toEqual([{ id: "ornn" }]);
  });
  it("stores the picks with their roles; an older stored board reads as confirmed roles", () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    const foes: EnemyPick[] = [{ id: "poppy", flex: ["JUNGLE", "SUPPORT"] }, { id: "vi", role: "JUNGLE" }, { id: "ornn" }];
    writeBoard(store, { ally: { MID: "ahri" }, enemy: { JUNGLE: "vi", SUPPORT: "poppy", TOP: "ornn" }, foes });
    const back = sanitizeBoard(JSON.parse(mem.get("draft-room:board")!), ids, ["all"])!;
    expect(foesOf(back)).toEqual(foes);
    expect(openingBoard(new URLSearchParams(""), back).stored?.foes).toEqual(foes);
    expect(foesOf(sanitizeBoard({ ally: {}, enemy: { TOP: "ornn", MID: "ahri" } }, ids, ["all"])!)).toEqual([{ id: "ornn", role: "TOP" }, { id: "ahri", role: "MID" }]);
    // allied, unknown and repeated ids are dropped from stored picks
    expect(sanitizePicks([{ id: "ahri" }, { id: "nope" }, { id: "vi" }, { id: "vi", role: "TOP" }, { id: "poppy", flex: ["TOP"] }], ids, new Set(["ahri"]))).toEqual([{ id: "vi" }, { id: "poppy" }]);
    // Clear draft leaves nothing behind
    writeBoard(store, { ally: {}, enemy: {}, foes: [] });
    expect(mem.has("draft-room:board")).toBe(false);
  });
});

describe("The placement never scores", () => {
  it("the draft-fit score reads the enemy champions, not their roles", () => {
    const data = getDraftData();
    const a = recommend({ BOT: "jinx" }, ["poppy", "vi"], data, Infinity);
    const b = recommend({ BOT: "jinx" }, ["vi", "poppy"], data, Infinity);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
  it("lib/recommend.ts, lib/candidates.ts and the Comp Check engine never import the placement", () => {
    for (const f of ["lib/recommend.ts", "lib/candidates.ts", "lib/model-v2/analyze.ts", "lib/model-v2/plan.ts", "lib/counters.ts"])
      expect(readFileSync(join(process.cwd(), f), "utf8")).not.toMatch(/enemy-roles/);
  });
  it("the Draft Room labels a lane opponent that is not confirmed", () => {
    const room = readFileSync(join(process.cwd(), "components/DraftRoom.tsx"), "utf8");
    expect(room).toMatch(/counterClaim\(dRead, LANE\[active\]/); // Potential / Conditional counter labels
    expect(room).toMatch(/\(likely\)/);
    expect(readFileSync(join(process.cwd(), "components/LaneMatchups.tsx"), "utf8")).toMatch(/likely opponent/);
  });
});
