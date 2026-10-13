// My Role (alan, 2026-10-12): the role the user personally plays in Draft Room, linked to Pro Builds. A per-browser
// preference (localStorage, the site has no accounts), separate from the open-role recommendation tabs. Nothing here
// touches recommendations, saved pairings, pro evidence or Comp Check: it only builds links and decides when a confirmed
// lock opens Pro Builds.
import { buildsHref, type ChampionBuilds } from "./pro-builds";
import { ROLES, type Role } from "./schema";

export const MY_ROLE_KEY = "draft-room:my-role";
export const AUTO_BUILDS_KEY = "draft-room:auto-builds";

export const parseRole = (v: string | null | undefined): Role | undefined => ROLES.find((r) => r === v?.toUpperCase());

// The Draft Room state a return link may carry: one champion per role, the enemy row, the role being picked and the
// list filter. Anything else in `from` is dropped, and values are plain ids.
const FROM_KEYS = new Set([...ROLES.map((r) => r.toLowerCase()), "vs", "focus", "filter"]);
const SAFE = /^[a-z0-9:,'._ -]{1,200}$/i;

/** The Draft Room query (without "?") for the current draft, enemy row, picked role and filter. */
export function draftQuery({ draft, vs, focus, filter }: { draft: Partial<Record<Role, string>>; vs?: string; focus?: Role; filter?: string }): string {
  const q = new URLSearchParams();
  for (const r of ROLES) if (draft[r]) q.set(r.toLowerCase(), draft[r]!);
  if (vs) q.set("vs", vs);
  if (focus && !draft[focus]) q.set("focus", focus.toLowerCase());
  if (filter && filter !== "all") q.set("filter", filter);
  return q.toString().replace(/%2C/g, ",").replace(/%3A/g, ":");
}

/** Keeps only Draft Room keys with plain values; returns the query without "?" ("" when nothing is left). */
export function cleanFrom(from: string | null | undefined): string {
  if (!from) return "";
  const out = new URLSearchParams();
  for (const [k, v] of new URLSearchParams(from)) if (FROM_KEYS.has(k) && SAFE.test(v)) out.set(k, v);
  return out.toString().replace(/%2C/g, ",").replace(/%3A/g, ":");
}

/** Back to Draft Room with the draft a Pro Builds visit came from. */
export const draftHref = (from: string | null | undefined) => { const q = cleanFrom(from); return q ? `/?${q}` : "/"; };

/** The recorded-builds entry for a champion in a role, if any. */
export const buildsEntry = (index: ChampionBuilds[], champion: string, role: Role) => index.find((e) => e.champion === champion && e.role === role);

/**
 * Pro Builds for my locked champion in my role: preselects the champion and role on every patch (alan, 2026-10-13: never
 * silently the newest patch only) and carries the draft so "Back to Draft Room" restores it.
 */
export function myBuildsHref(_index: ChampionBuilds[], champion: string, role: Role, from: string): string {
  return `${buildsHref(champion, role)}${from ? `&from=${encodeURIComponent(from)}` : ""}`;
}

/**
 * Whether a lock should open Pro Builds: only a confirmed lock of a new champion into my own role, with the preference
 * on and recorded builds to show. Teammates' slots, removals and re-locking the same champion never navigate.
 */
export function opensBuilds({ myRole, auto, role, champion, previous, hasBuilds }: {
  myRole?: Role; auto: boolean; role: Role; champion?: string; previous?: string; hasBuilds: boolean;
}): boolean {
  return auto && !!myRole && role === myRole && !!champion && champion !== previous && hasBuilds;
}

// The query string Draft Room wrote itself (history.replaceState on every lock), so the page can tell its own URL
// updates from a navigation that brings a new board. Compared as parsed parameters, whatever the comma encoding.
let written: string | undefined;
const norm = (q: string) => { const p = new URLSearchParams(q); p.sort(); return p.toString(); };
export const markOwnQuery = (q: string) => { written = norm(q); };
export const ownQuery = (q: string) => written !== undefined && norm(q) === written;
