// What changed in which patch, for any page that shows a champion, item or rune: the champion drawer, Pro Builds
// ("Changed since this game"), Meta priority history. Pure functions over a compact index of data/patch-notes.json
// (official Riot facts); they never score anything or touch saved pairings, pool tiers or the draft-fit ranking.
//
//   getPatchIndex()                        lib/data.ts: the compact index, built once at build time (server)
//   changesFor(index, subject, from?, to?) one champion / item / rune: changes in patches after `from` up to `to`
//   changedSince(index, gamePatch, picks)  every change to a game's champions, items and runes since its patch
//   patchHref(patch, entryId?)             the Patch Notes page, scrolled to one entry
//
// Patches may be given in either notation ("26.16" or "16.16", lib/patch.ts); results use Riot's ("26.16").
import { comparePatch, parsePatch, patchKey } from "./patch";
import type { PatchEntry, PatchNotes } from "./schema";
import { slugify } from "./slug";

export type ChangeKind = "champion" | "item" | "rune" | "system";
export type ChangeCategory = NonNullable<PatchEntry["category"]>;

export interface PatchMeta {
  patch: string; // "26.20"
  short: string; // "16.20", as the pro data writes it
  published: string | null;
  url: string; // Riot's article
  midPatch: string[]; // titles of mid-patch updates, empty when none
}
export interface ChangeLine { label?: string; before?: string; after?: string; text?: string }
export interface Change {
  patch: string;
  id: string; // entry id on the Patch Notes page (also its anchor)
  kind: ChangeKind;
  subject: string;
  ref?: string;
  itemId?: string;
  category?: ChangeCategory;
  categories?: NonNullable<PatchEntry["categories"]>;
  reviewed: boolean; // a champion's buff / nerf call was checked by a person, not only read from Riot's wording
  lines: ChangeLine[]; // the first few lines, values exactly as Riot wrote them
  more: number; // lines not included
  affects?: string[];
  midPatch?: string;
  /** "system": a system change or bug fix that names this champion, rather than an entry of its own. */
  via?: "system";
}
export interface PatchIndex { first: string; patches: PatchMeta[]; changes: Change[] }

const LINES = 3;

/** The compact index (a few KB per patch) the browser gets. Built from the full file in lib/data.ts. */
export function buildPatchIndex(notes: PatchNotes): PatchIndex {
  const patches = [...notes.patches].sort((a, b) => comparePatch(b.patch, a.patch));
  return {
    first: notes.firstPatch,
    patches: patches.map((p) => ({ patch: p.patch, short: p.short, published: p.published, url: p.url, midPatch: p.midPatch.map((m) => m.title) })),
    changes: patches.flatMap((p) => p.entries.map((e) => {
      const all = e.groups.flatMap((g) => g.changes.map((c) => ({ ...c, label: g.title && c.label ? `${abilityKey(g.title)}${c.label}` : c.label ?? g.title })));
      const lines = all.slice(0, LINES).map(({ label, before, after, text }) => (before || after ? { label, before, after } : { label, text }));
      return {
        patch: p.patch, id: e.id, kind: e.kind, subject: e.subject, ref: e.ref, itemId: e.itemId, category: e.category, categories: e.categories,
        reviewed: e.categoryBasis === "reviewed", lines, more: Math.max(0, all.length - LINES), affects: e.affects, midPatch: e.midPatch?.title,
      };
    })),
  };
}

/** "Q - Conquering Sands" → "Q ", "Passive - Soul Eater" → "Passive ", "Base Stats" → "" : a short prefix for a line. */
export function abilityKey(title: string): string {
  const m = title.match(/^(Passive|[QWER]\d?|R[QWE])\s+-\s+/);
  return m ? `${m[1]} ` : "";
}

export const patchHref = (patch: string, entryId?: string) =>
  `/patch-notes/?patch=${patchKey(patch)}${entryId ? `#${entryId}` : ""}`;

/** Patches in the archive strictly after `from` and up to `to` (inclusive), newest first. Either bound may be omitted. */
export function patchesBetween(index: PatchIndex, from?: string, to?: string): PatchMeta[] {
  return index.patches.filter((p) => (!from || comparePatch(p.patch, from) > 0) && (!to || comparePatch(p.patch, to) <= 0));
}

/** True when an item reference (name, name slug or Data Dragon id) points at this change. */
const itemMatches = (c: Change, ref: string) => c.ref === slugify(ref) || (!!c.itemId && c.itemId === ref);

/**
 * Changes to one champion, item or rune in patches after `from` (exclusive) up to `to` (inclusive), newest first.
 * `from` omitted: from the first archived patch. For a champion, system changes and bug fixes that name it are included,
 * marked `via: "system"`.
 */
export function changesFor(index: PatchIndex, subject: { kind: "champion" | "item" | "rune"; ref: string }, from?: string, to?: string): Change[] {
  const inRange = new Set(patchesBetween(index, from, to).map((p) => p.patch));
  const out: Change[] = [];
  for (const c of index.changes) {
    if (!inRange.has(c.patch)) continue;
    if (subject.kind === "champion") {
      if (c.kind === "champion" && c.ref === subject.ref) out.push(c);
      else if (c.kind === "system" && c.affects?.includes(subject.ref)) out.push({ ...c, via: "system" });
    } else if (c.kind === subject.kind && (subject.kind === "item" ? itemMatches(c, subject.ref) : c.ref === slugify(subject.ref))) out.push(c);
  }
  return out;
}

/**
 * Everything that changed for a recorded game's picks since the patch it was played on: the game's champions, items
 * (names or Data Dragon ids) and runes (names). A game on a patch newer than the archive, or with no readable patch,
 * returns nothing. Used by "Changed since this game"; it never says an old build is still current or optimal.
 */
export function changedSince(index: PatchIndex, gamePatch: string | undefined | null, picks: { champions?: string[]; items?: string[]; runes?: string[] }) {
  if (!gamePatch || !parsePatch(gamePatch)) return { since: undefined, patches: [] as PatchMeta[], changes: [] as Change[] };
  const since = patchKey(gamePatch);
  const patches = patchesBetween(index, since);
  const changes = [
    ...(picks.champions ?? []).flatMap((ref) => changesFor(index, { kind: "champion", ref }, since)),
    ...(picks.items ?? []).flatMap((ref) => changesFor(index, { kind: "item", ref }, since)),
    ...(picks.runes ?? []).flatMap((ref) => changesFor(index, { kind: "rune", ref }, since)),
  ];
  const seen = new Set<string>();
  return { since, patches, changes: changes.filter((c) => !seen.has(`${c.patch}/${c.id}`) && !!seen.add(`${c.patch}/${c.id}`)) };
}

export const CATEGORY_LABEL: Record<string, string> = {
  buff: "Buff", nerf: "Nerf", adjustment: "Adjustment", rework: "Rework",
  keystone: "Keystone", minor: "Minor rune", shard: "Stat shard",
  jungle: "Jungle", objectives: "Objectives", minions: "Minions and waves", turrets: "Turrets", summoners: "Summoner spells",
  "role-quests": "Role quests", "map-economy": "Map and economy", other: "Other", bugfix: "Bug fixes",
  new: "New", removed: "Removed", stats: "Stats", cost: "Cost", effect: "Passive / active",
};
