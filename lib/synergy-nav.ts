// Synergies navigation (alan, 2026-10-13): the sidebar's Synergies link (and /synergies/ itself) opens the role you are
// researching, not the role you play. Draft Room's highlighted recommendation role writes it, and so does every
// Synergies tab you open; the latest write wins, so a direct URL or a tab switch inside Synergies is never undone.
// "I'm playing" (lib/my-role.ts) is a separate preference and is never read here. Explicit role URLs and
// champion-specific links (synergiesHref in lib/drawer.ts) don't go through this.
//
// Both values live in sessionStorage: this tab's browsing session, surviving refreshes and return navigation.
import type { Tab } from "@/components/views/synergy-tabs";
import { ROLES, type Role } from "./schema";

/** Where the generic Synergies link goes: the role last highlighted in Draft Room or last viewed in Synergies. */
export const SYNERGIES_ROLE_KEY = "synergies:role";
/** Draft Room's highlighted role, restored when the room opens again on an empty board in this tab. */
export const DRAFT_ACTIVE_KEY = "draft-room:active-role";
/** Fired on window when the Synergies role changes in this tab (storage events only reach other tabs). */
export const SYNERGIES_ROLE_EVENT = "synergies-role";
export const DEFAULT_SYNERGIES_ROLE: Role = "TOP";

type Store = Pick<Storage, "getItem" | "setItem">;

const ROLE_TAB: Record<Role, Tab> = { TOP: "top", JUNGLE: "jungle", MID: "mid", BOT: "bot", SUPPORT: "support" };
export const tabOf = (role: Role): Tab => ROLE_TAB[role];
const readRole = (v: string | null | undefined): Role | undefined => ROLES.find((r) => r === v?.toUpperCase());

/** The generic Synergies link: the stored role's tab, Top when nothing is stored. */
export const synergiesNavHref = (stored: string | null | undefined) => `/synergies/${tabOf(readRole(stored) ?? DEFAULT_SYNERGIES_ROLE)}/`;

const safe = <T,>(f: () => T): T | undefined => { try { return f(); } catch { return undefined; } };

/** Records the role being researched. Returns true when it changed. Blocked storage is ignored. */
export function rememberSynergiesRole(store: Store | undefined, role: Role): boolean {
  if (!store || safe(() => store.getItem(SYNERGIES_ROLE_KEY)) === role) return false;
  return safe(() => { store.setItem(SYNERGIES_ROLE_KEY, role); return true; }) ?? false;
}

export const storedSynergiesRole = (store: Store | undefined): Role | undefined => store ? readRole(safe(() => store.getItem(SYNERGIES_ROLE_KEY))) : undefined;

/** Draft Room's highlighted role: kept for its own return, and the Synergies link follows it. */
export function rememberDraftRole(store: Store | undefined, role: Role): boolean {
  if (!store) return false;
  safe(() => store.setItem(DRAFT_ACTIVE_KEY, role));
  return rememberSynergiesRole(store, role);
}

/**
 * The role Draft Room highlights on open: the URL's focus when it names an open role; else, only on an empty board
 * (no picks, no enemy row: the sidebar's Draft Room link), the role this tab last highlighted. A board from a link
 * keeps the room's own choice.
 */
export function restoredDraftRole(store: Store | undefined, { urlFocus, emptyBoard }: { urlFocus?: Role; emptyBoard: boolean }): Role | undefined {
  if (urlFocus) return urlFocus;
  if (!emptyBoard || !store) return undefined;
  return readRole(safe(() => store.getItem(DRAFT_ACTIVE_KEY)));
}

/** Browser helpers (client only). */
export const sessionStore = (): Store | undefined => safe(() => window.sessionStorage);
export function noteSynergiesRole(role: Role) {
  if (rememberSynergiesRole(sessionStore(), role)) window.dispatchEvent(new Event(SYNERGIES_ROLE_EVENT));
}
export function noteDraftRole(role: Role) {
  if (rememberDraftRole(sessionStore(), role)) window.dispatchEvent(new Event(SYNERGIES_ROLE_EVENT));
}
