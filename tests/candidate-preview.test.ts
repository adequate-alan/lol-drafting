// Candidate preview and comparison (alan, 2026-10-19; lib/candidate-preview.ts, components/CandidateCompare.tsx): the
// plan read of the board with a candidate in the open role, compared with the board's own read. It never changes the
// board, never reaches a score and never enters the stored draft; the comparison is per tab and Clear draft empties it.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getDraftData } from "@/lib/data";
import type { Draft } from "@/lib/model-v2/analyze";
import { convertKits } from "@/lib/model-v2/kits";
import { analyzePlan } from "@/lib/model-v2/plan";
import {
  COMPARE_KEY, COMPARE_MAX, compareGaps, effectLine, improvements, previewEffect, pruneCompare, readCompare, sanitizeCompare, toggleCompare,
  withCandidate, writeCompare, type PreviewEffect,
} from "@/lib/candidate-preview";
import { DRAFT_BOARD_KEY } from "@/lib/draft-persist";
import { ROLES } from "@/lib/schema";
import { lineups as allLineups } from "../scripts/diagnostics/load";

const data = getDraftData();
const kits = convertKits(data.champions);
const lineups = allLineups.filter((l) => Object.values(l.picks).every((p) => kits.some((k) => k.id === p))).slice(0, 80);
const real = (p: ReturnType<typeof analyzePlan>) => [...p.weaknesses, ...p.more].filter((x) => x.tier !== "accepted" && !(x.tier === "weakness" && x.severity === "minor"));

describe("preview read", () => {
  it("reads a copy of the board: the board itself never changes", () => {
    const draft: Draft = { TOP: "ksante", MID: "cassiopeia", BOT: "lucian", SUPPORT: "milio" };
    const before = JSON.stringify(draft);
    const e = previewEffect(analyzePlan(draft, kits), draft, "JUNGLE", "jarvan-iv", kits);
    expect(JSON.stringify(draft)).toBe(before);
    expect(withCandidate(draft, "JUNGLE", "vi")).not.toBe(draft);
    expect(e.read).toEqual(analyzePlan({ ...draft, JUNGLE: "jarvan-iv" }, kits));
  });

  it("names the plan kept and the job the candidate adds (K'Sante, Cassiopeia, Lucian, Milio + Jarvan IV)", () => {
    const draft: Draft = { TOP: "ksante", MID: "cassiopeia", BOT: "lucian", SUPPORT: "milio" };
    const before = analyzePlan(draft, kits);
    const j4 = previewEffect(before, draft, "JUNGLE", "jarvan-iv", kits);
    expect(j4.plan.kind).toBe("keeps");
    expect(effectLine(j4)).toMatch(/^Keeps /);
  });

  it("every gap on the board is fixed, still open or dropped with a plan change, never two of them; nothing is invented", () => {
    let checked = 0;
    for (const l of lineups) for (const role of ROLES) {
      const draft: Draft = Object.fromEntries(ROLES.filter((r) => r !== role).map((r) => [r, l.picks[r]]));
      const before = analyzePlan(draft, kits);
      const e = previewEffect(before, draft, role, l.picks[role], kits);
      const ids = (gs: { id: string }[]) => gs.map((g) => g.id);
      const all = [...ids(e.fixed), ...ids(e.open), ...ids(e.dropped)];
      expect(new Set(all).size, l.key).toBe(all.length);
      expect(all.sort(), l.key).toEqual(real(before).map((x) => x.id).sort());
      if (e.plan.kind !== "shifts") expect(e.dropped, l.key).toEqual([]);
      if (e.plan.kind !== "keeps") expect(e.adds, l.key).toEqual([]);
      const had = new Set(real(before).flatMap((x) => [x.id, ...(x.replaces ?? [])]));
      for (const g of e.created) expect(had.has(g.id), `${l.key} ${g.id}`).toBe(false);
      for (const g of e.created) expect(real(e.read).some((x) => x.id === g.id), `${l.key} ${g.id}`).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("a board too small to read says so instead of naming a plan", () => {
    const e = previewEffect(analyzePlan({}, kits), {}, "TOP", "aatrox", kits);
    expect(e.plan.kind).toBe("none");
    expect(effectLine(e)).toBe("No comp read yet");
  });
});

describe("comparison", () => {
  const fake = (champion: string, adds: string[], fixed: string[]): PreviewEffect => ({
    champion, role: "JUNGLE", read: analyzePlan({}, kits), plan: { kind: "keeps", from: "Dive", to: "Dive" }, adds, missing: [],
    fixed: fixed.map((label) => ({ id: label, label, tier: "weakness", severity: "moderate", source: "general" })), open: [], created: [], dropped: [],
  });

  it("names what only one candidate improves and what choosing each gives up", () => {
    const g = compareGaps([fake("sejuani", [], ["No frontline", "No engage"]), fake("vi", [], ["No engage"]), fake("jarvan-iv", ["Wombo"], ["No engage"])]);
    expect(g.sejuani.only).toEqual(["No frontline"]);
    expect(g.vi.only).toEqual([]);
    expect(g["jarvan-iv"].only).toEqual(["Wombo"]);
    expect(g.vi.givesUp.sort()).toEqual(["No frontline", "Wombo"]);
    expect(improvements(fake("x", ["A"], ["A", "B"]))).toEqual(["A", "B"]);
    expect(compareGaps([fake("solo", [], ["No engage"])]).solo.only).toEqual([]);
  });

  it("holds at most three per role; a fourth replaces the oldest; a second toggle removes", () => {
    let s = {};
    for (const id of ["a", "b", "c", "d"]) s = toggleCompare(s, "JUNGLE", id);
    expect(s).toEqual({ JUNGLE: ["b", "c", "d"] });
    expect(COMPARE_MAX).toBe(3);
    expect(toggleCompare(toggleCompare({}, "MID", "ahri"), "MID", "ahri")).toEqual({});
  });

  it("follows the real board: locked champions leave, a locked role's list closes", () => {
    const s = { JUNGLE: ["vi", "sejuani"], MID: ["ahri", "syndra"], TOP: ["aatrox"] };
    expect(pruneCompare(s, { MID: "orianna" }, ["orianna", "vi"])).toEqual({ JUNGLE: ["sejuani"], TOP: ["aatrox"] });
    expect(pruneCompare(s, {}, ["aatrox"])).toEqual({ JUNGLE: ["vi", "sejuani"], MID: ["ahri", "syndra"] });
  });

  it("is kept per tab under its own key, checked against the roster, never inside the stored board", () => {
    expect(COMPARE_KEY).not.toBe(DRAFT_BOARD_KEY);
    const ids = new Set(data.champions.map((c) => c.id));
    expect(sanitizeCompare({ JUNGLE: ["vi", "vi", "nobody", 4, "sejuani", "lee-sin", "nocturne"], BAD: ["vi"] }, ids)).toEqual({ JUNGLE: ["vi", "sejuani", "lee-sin"] });
    expect(sanitizeCompare("junk", ids)).toEqual({});
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    writeCompare(store, { MID: ["ahri"] });
    expect(readCompare(store, ids)).toEqual({ MID: ["ahri"] });
    writeCompare(store, {});
    expect(mem.has(COMPARE_KEY)).toBe(false);
    expect(readFileSync("lib/draft-persist.ts", "utf8")).not.toMatch(/compare/i);
  });
});

describe("separation", () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(p) ? [p] : [];
  });

  it("only the Draft Room and its Comp Check read previews: no scoring, ranking, synergy, counter or pool module does", () => {
    const allowed = ["lib/candidate-preview.ts", "components/CompCheck.tsx", "components/DraftRoom.tsx", "components/CandidateCompare.tsx"];
    for (const f of [...files("lib"), ...files("components"), ...files("app")].filter((f) => !allowed.includes(f)))
      expect(readFileSync(f, "utf8"), f).not.toMatch(/candidate-preview|CandidateCompare/);
  });

  it("the list locks only through a Lock button, Shift+Enter or the slot picker; a row click previews", () => {
    const room = readFileSync("components/DraftRoom.tsx", "utf8");
    expect(room).toMatch(/className="name fit-lock" onClick=\{onPreview\}/);
    expect(room).toMatch(/e\.key === "Enter" && e\.shiftKey\) \{ e\.preventDefault\(\); onPick\(\); \}/);
    expect(room).toMatch(/fit-lock-btn" onClick=\{onPick\}/);
  });
});
