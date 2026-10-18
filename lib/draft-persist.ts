// Persistent Draft Room (alan, 2026-10-18): the room is a workspace, not a page that resets when you leave it. The board
// (five ally slots, five enemy slots), the highlighted role tab, the list filter and a chosen pro meta patch are kept in
// this browser's localStorage, so going to another section, refreshing or reopening the site brings the draft back.
// "I'm playing" keeps its own key (lib/my-role.ts) and is never stored here.
//
// Precedence: a URL that names a board (any role slot, ?vs= or ?shell=: a shared draft, a Pro Drafts or Comp Library
// link, Back to Draft Room) always wins and replaces what was stored; only a bare room URL restores. Clear draft empties
// the stored picks. Stored ids are checked against the roster: unknown ids are dropped, a champion appears once.
import { ROLES, type Role } from "./schema";

export const DRAFT_BOARD_KEY = "draft-room:board";

export type StoredBoard = {
  ally: Partial<Record<Role, string>>;
  enemy: Partial<Record<Role, string>>;
  focus?: Role; // the role tab chosen, only while that role is open
  filter?: string; // the list filter, when not "all"
  patch?: string; // a chosen pro meta patch, as the room keeps it
};

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const safe = <T,>(f: () => T): T | undefined => { try { return f(); } catch { return undefined; } };
const roleOf = (v: unknown): Role | undefined => (typeof v === "string" ? ROLES.find((r) => r === v.toUpperCase()) : undefined);
const BOARD_KEYS = [...ROLES.map((r) => r.toLowerCase()), "vs", "shell"];
const PLAIN = /^[a-z0-9._ -]{1,40}$/i;

/** Whether the URL brings its own board, which then wins over anything stored. */
export const explicitBoard = (q: Pick<URLSearchParams, "has">) => BOARD_KEYS.some((k) => q.has(k));

const isEmpty = (b: StoredBoard) => !ROLES.some((r) => b.ally[r] || b.enemy[r]);

/**
 * A stored board made safe to load: only known champions, each at most once (ally slots first, in role order), a focus
 * only on an open ally role, a filter from `filters`, a plain patch string. Anything unreadable gives undefined.
 */
export function sanitizeBoard(value: unknown, championIds: ReadonlySet<string>, filters: readonly string[]): StoredBoard | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>;
  const seen = new Set<string>();
  const side = (raw: unknown) => {
    const out: Partial<Record<Role, string>> = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    for (const r of ROLES) {
      const id = (raw as Record<string, unknown>)[r];
      if (typeof id === "string" && championIds.has(id) && !seen.has(id)) { out[r] = id; seen.add(id); }
    }
    return out;
  };
  const ally = side(v.ally), enemy = side(v.enemy);
  const focus = roleOf(v.focus);
  const board: StoredBoard = { ally, enemy };
  if (focus && !ally[focus]) board.focus = focus;
  if (typeof v.filter === "string" && v.filter !== "all" && filters.includes(v.filter)) board.filter = v.filter;
  if (typeof v.patch === "string" && PLAIN.test(v.patch)) board.patch = v.patch;
  return board;
}

/** The stored board, sanitized; undefined when nothing usable is stored or storage is blocked. */
export function readBoard(store: Store | undefined, championIds: ReadonlySet<string>, filters: readonly string[]): StoredBoard | undefined {
  const raw = store ? safe(() => store.getItem(DRAFT_BOARD_KEY)) : undefined;
  if (!raw) return undefined;
  return sanitizeBoard(safe(() => JSON.parse(raw)), championIds, filters);
}

/** Saves the board. An empty board with no settings removes the key, so Clear draft leaves no picks behind. */
export function writeBoard(store: Store | undefined, board: StoredBoard): void {
  if (!store) return;
  const clean: StoredBoard = { ally: {}, enemy: {} };
  for (const r of ROLES) { if (board.ally[r]) clean.ally[r] = board.ally[r]; if (board.enemy[r]) clean.enemy[r] = board.enemy[r]; }
  if (board.focus && !board.ally[board.focus]) clean.focus = board.focus;
  if (board.filter && board.filter !== "all") clean.filter = board.filter;
  if (board.patch) clean.patch = board.patch;
  if (isEmpty(clean) && !clean.focus && !clean.filter && !clean.patch) { safe(() => store.removeItem(DRAFT_BOARD_KEY)); return; }
  safe(() => store.setItem(DRAFT_BOARD_KEY, JSON.stringify(clean)));
}

/**
 * The board the room opens with: the URL's when it names one; otherwise the stored board, with any focus, filter or
 * patch the URL does give taking precedence. `restored` says whether stored picks were brought back.
 */
export function openingBoard(q: Pick<URLSearchParams, "has" | "get">, stored: StoredBoard | undefined): { stored?: StoredBoard; restored: boolean } {
  if (explicitBoard(q) || !stored) return { restored: false };
  const board: StoredBoard = { ...stored };
  const focus = roleOf(q.get("focus"));
  if (focus) board.focus = board.ally[focus] ? undefined : focus;
  if (q.get("filter")) board.filter = q.get("filter")!;
  if (q.get("patch")) board.patch = q.get("patch")!;
  return { stored: board, restored: !isEmpty(stored) };
}

/** Browser helper (client only). */
export const localStore = (): Store | undefined => safe(() => window.localStorage);
