// Persistent Draft Room (alan, 2026-10-18): the draft survives navigation, refresh and reopening the site; Clear draft
// empties it; a URL that names a board (a shared draft, a Pro Drafts or Comp Library link) always wins over storage.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DRAFT_BOARD_KEY, explicitBoard, openingBoard, readBoard, sanitizeBoard, writeBoard, type StoredBoard } from "@/lib/draft-persist";
import { MY_ROLE_KEY } from "@/lib/my-role";
import { getDraftData } from "@/lib/data";

const ids = new Set(getDraftData().champions.map((c) => c.id));
const FILTERS = ["all", "synergy", "pro", "fit", "counter", "priority", "rotation", "blind"];
// One browser's localStorage, kept across "page loads" in a test.
const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};
const url = (q = "") => new URLSearchParams(q);
const board: StoredBoard = { ally: { TOP: "aatrox", BOT: "jhin", SUPPORT: "bard" }, enemy: { MID: "ahri", BOT: "kaisa" }, focus: "MID", filter: "pro" };
// What the room opens with for a URL, given what this browser stored.
const open = (store: ReturnType<typeof memory>, q = "") => openingBoard(url(q), readBoard(store, ids, FILTERS));

describe("Draft Room keeps its board", () => {
  it("returns from another section with every slot, the highlighted role and the filter", () => {
    const store = memory();
    writeBoard(store, board);
    // The sidebar's Draft Room link is the bare room URL.
    const back = open(store);
    expect(back.restored).toBe(true);
    expect(back.stored).toEqual(board);
  });

  it("survives a refresh and reopening the site (localStorage, not this tab's session)", () => {
    const store = memory();
    writeBoard(store, board);
    expect(store.m.has(DRAFT_BOARD_KEY)).toBe(true);
    // A new tab or a reopened browser reads the same storage.
    expect(open(store, "").stored?.ally).toEqual(board.ally);
    expect(open(store, "").stored?.enemy).toEqual(board.enemy);
  });

  it("keeps the chosen pro meta patch, and the URL's own focus, filter or patch take precedence", () => {
    const store = memory();
    writeBoard(store, { ...board, patch: "16.20" });
    expect(open(store).stored?.patch).toBe("16.20");
    const withQuery = open(store, "focus=jungle&filter=synergy&legacy=1").stored!;
    expect(withQuery.focus).toBe("JUNGLE");
    expect(withQuery.filter).toBe("synergy");
    expect(withQuery.ally).toEqual(board.ally);
  });

  it("never stores My Role: the highlighted role and \"I'm playing\" stay independent", () => {
    const store = memory();
    store.setItem(MY_ROLE_KEY, "BOT");
    writeBoard(store, board);
    expect(JSON.parse(store.getItem(DRAFT_BOARD_KEY)!)).not.toHaveProperty("myRole");
    expect(store.getItem(MY_ROLE_KEY)).toBe("BOT");
    expect(open(store).stored?.focus).toBe("MID");
  });
});

describe("Clear draft", () => {
  it("empties the stored picks, so the next visit opens an empty board", () => {
    const store = memory();
    writeBoard(store, board);
    writeBoard(store, { ally: {}, enemy: {} });
    expect(store.m.has(DRAFT_BOARD_KEY)).toBe(false);
    expect(open(store).restored).toBe(false);
  });

  it("keeps settings but no champions when a filter or patch stays chosen", () => {
    const store = memory();
    writeBoard(store, board);
    writeBoard(store, { ally: {}, enemy: {}, filter: "pro", patch: "16.20" });
    const next = open(store);
    expect(next.restored).toBe(false);
    expect(next.stored?.ally).toEqual({});
    expect(next.stored?.enemy).toEqual({});
  });
});

describe("Explicit draft links win over storage", () => {
  it("a shared draft, Pro Drafts or Comp Library link opens its own board, never the stored one", () => {
    const store = memory();
    writeBoard(store, board);
    for (const q of ["support=nautilus", "bot=caitlyn&vs=mid:ahri", "vs=top:aatrox", "shell=dive-kalista", "top="]) {
      expect(explicitBoard(url(q))).toBe(true);
      expect(open(store, q)).toEqual({ restored: false });
    }
  });

  it("a bare URL, or one with only settings, restores", () => {
    for (const q of ["", "focus=mid", "filter=pro", "patch=26.20", "legacy=1"]) expect(explicitBoard(url(q))).toBe(false);
  });

  it("the room writes the loaded draft back, replacing what was stored", () => {
    const store = memory();
    writeBoard(store, board);
    writeBoard(store, { ally: { BOT: "caitlyn" }, enemy: { MID: "ahri" } });
    expect(open(store).stored).toEqual({ ally: { BOT: "caitlyn" }, enemy: { MID: "ahri" } });
  });
});

describe("Stored data is checked before it is loaded", () => {
  it("drops unknown or outdated champion ids", () => {
    const b = sanitizeBoard({ ally: { TOP: "aatrox", MID: "not-a-champion", JUNGLE: 42 }, enemy: { BOT: "old-id" } }, ids, FILTERS);
    expect(b).toEqual({ ally: { TOP: "aatrox" }, enemy: {} });
  });

  it("keeps each champion once across both teams, allies first", () => {
    const b = sanitizeBoard({ ally: { TOP: "aatrox", MID: "aatrox" }, enemy: { TOP: "aatrox", MID: "ahri" } }, ids, FILTERS);
    expect(b).toEqual({ ally: { TOP: "aatrox" }, enemy: { MID: "ahri" } });
  });

  it("ignores unknown roles, a focus on a locked role, unknown filters and odd patch strings", () => {
    const b = sanitizeBoard({ ally: { TOP: "aatrox", FLEX: "ahri" }, enemy: [], focus: "TOP", filter: "<script>", patch: "16.20<x>" }, ids, FILTERS);
    expect(b).toEqual({ ally: { TOP: "aatrox" }, enemy: {} });
    expect(sanitizeBoard({ ally: {}, enemy: {}, focus: "feet" }, ids, FILTERS)?.focus).toBeUndefined();
  });

  it("treats corrupted JSON, wrong shapes or blocked storage as nothing stored", () => {
    for (const raw of ["{", "null", "[]", "\"x\"", "42"]) {
      const store = memory();
      store.setItem(DRAFT_BOARD_KEY, raw);
      expect(readBoard(store, ids, FILTERS)).toBeUndefined();
    }
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
    expect(readBoard(blocked, ids, FILTERS)).toBeUndefined();
    expect(() => writeBoard(blocked, board)).not.toThrow();
    expect(readBoard(undefined, ids, FILTERS)).toBeUndefined();
  });
});

describe("Wiring", () => {
  const view = readFileSync(join(process.cwd(), "components/views/DraftRoomView.tsx"), "utf8");
  const room = readFileSync(join(process.cwd(), "components/DraftRoom.tsx"), "utf8");
  it("the page restores through openingBoard and the room saves every board change", () => {
    expect(view).toMatch(/openingBoard\(q, /);
    expect(room).toMatch(/writeBoard\(localStore\(\), \{ ally: draft, enemy: enemyDraftOf\(enemy\), focus, filter, patch: chosenPatch \}\)/);
    expect(room).toMatch(/\[draft, enemy, focus, filter, chosenPatch\]/);
  });
  it("the board is not tied to scoring: nothing in lib/recommend or lib/candidates reads storage", () => {
    for (const f of ["lib/recommend.ts", "lib/candidates.ts"]) expect(readFileSync(join(process.cwd(), f), "utf8")).not.toMatch(/draft-persist|localStorage/);
  });
});
