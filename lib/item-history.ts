// Item history for historical Pro Builds (alan, 2026-11-10): which items of a recorded build Riot changed after the game
// was played, read from Riot's official patch notes. Pure functions; nothing here scores, ranks or edits a build, and an
// old item is never replaced by a "better" one.
//
//   itemHistoryFrom(notes, assets, kept)   the generated part of data/item-changes.json (scripts/item-history.ts)
//   checkBuild(history, game, items)       one game: its changed items, the patches checked and any missing notes
//   commonMarks(rows)                      a Common build: each item against the games in scope that bought it
//
// A change counts for a game when its patch is after the game's patch and no later than the newest stored patch notes
// (the current live patch), or when it is a mid-patch update of the game's own patch dated after the game. Patches order
// numerically through lib/patch.ts. An item recorded in a game played on or after its own removal (or before it was
// added) is a data-quality flag on that record, never an "old build" warning.
import { comparePatch, parsePatch, patchKey } from "./patch";
import type { ItemChange, ItemChanges, ItemChangeType, PatchAssets, PatchNotes, ProBuild } from "./schema";

export const MODE = "summoners-rift" as const;

// ---------- generating the history from the patch notes ----------

/** Lower case, letters and digits only: "Doran's Bow" and "Dorans Bow" are one name. */
export const itemKey = (name: string) => name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "");

/** Every item id the build assets name, by normalized name (a name two ids share in one patch is left out). */
export function assetIds(assets: Record<string, PatchAssets>): Map<string, string> {
  const ids = new Map<string, Set<string>>();
  for (const a of Object.values(assets)) for (const [id, it] of Object.entries(a.items)) {
    if (!it.name || it.kind === undefined) continue;
    const k = itemKey(it.name);
    if (!ids.has(k)) ids.set(k, new Set());
    ids.get(k)!.add(id);
  }
  return new Map([...ids].filter(([, s]) => s.size === 1).map(([k, s]) => [k, [...s][0]]));
}

// Riot's first-person intent, as the champion verdicts read it (scripts/riot/normalize.mjs), with curly apostrophes read
// as straight ones. A shift of power between users or stats ("shifting", "in favor of", "delineating", "net buff for most
// other users") is mixed: "changed".
const BUFF = /\bwe(?:'re| are| will be|'ll)? (?:\w+ ){0,2}(?:buffing|tuning (?:him|her|them|it) up)|\bgiv(?:e|ing) (?:him|her|them|it) (?:a |some )?(?:\w+ )?(?:buff|bump|boost|helping hand|love)\b|\b(?:moderate|small|slight|light|minor|another) buff\b|\bspace for a buff\b|\bright time to buff\b|\bcompensat(?:e|ion|ing)\b|\binject (?:a bit )?more power\b/i;
const NERF = /\bwe(?:'re| are| will be|'ll)? (?:\w+ ){0,3}(?:nerfing|toning|tapping|pulling back|hitting|going after|putting some restraints)|\bwith a nerf\b|\bto nerf\b|\bnerf down\b|\b(?:moderate|small|slight|light|minor) nerf\b|\bdue a (?:\w+ )?nerf\b|\btoo (?:strong|reliable|performant)\b|\boverbuffed\b|\bconstrain/i;
const MIXED = /\bshift(?:s|ed|ing)? (?:its|the|their)\b|\bin favou?r of\b|\bdelineat|\bnet buff\b|\bwhile (?:also )?(?:nerf|buff)/i;
const REWORK = /\brework|\bvisual and gameplay update\b/i;
// Lines where more is better for the holder, and lines where more costs the holder.
const STAT = /^(?:t\d\s+)?(?:base\s+)?(?:bonus\s+)?(?:attack damage|ability power|attack speed|health|mana|armor|magic resist(?:ance)?|ability haste|move(?:ment)? speed|critical strike(?: chance)?|lethality|armor penetration|magic penetration|omnivamp|life ?steal|health regen(?:eration)?|mana regen(?:eration)?|tenacity|heal and shield power)$/i;
const COST = /^(?:total )?cost$|^recipe$/i;
const oneNumber = (s?: string) => { const m = s?.match(/-?\d+(?:\.\d+)?/g); return m && m.length === 1 ? Number(m[0]) : undefined; };

type Line = ItemChange["lines"][number];
/** Riot's direction for one change; mixed or unstated is "changed". */
export function itemVerdict(context: string | undefined, lines: (Line & { tag?: string })[]): { type: ItemChangeType; basis: ItemChange["basis"] } {
  if (lines.length && lines.every((l) => l.tag === "removed" && !l.after) || /^\s*removed\b/i.test(context ?? "")) return { type: "removed", basis: "riot-tag" };
  if (lines.some((l) => l.tag === "new" && !l.label)) return { type: "new", basis: "riot-tag" };
  const c = (context ?? "").replace(/[’‘]/g, "'");
  if (REWORK.test(c)) return { type: "rework", basis: "riot-wording" };
  const b = BUFF.test(c), n = NERF.test(c), mixed = MIXED.test(c);
  if (mixed || (b && n)) return { type: "changed", basis: "mixed" };
  if (b) return { type: "buff", basis: "riot-wording" };
  if (n) return { type: "nerf", basis: "riot-wording" };
  // Riot silent: only when every line is one number on a plain stat or the cost, all moving the same way for the holder.
  const dirs = lines.map((l) => {
    const label = (l.label ?? "").replace(/\s*\(.*\)$/, "").trim(), x = oneNumber(l.before), y = oneNumber(l.after);
    if (x === undefined || y === undefined || x === y) return 0;
    if (STAT.test(label)) return y > x ? 1 : -1;
    if (COST.test(label)) return y > x ? -1 : 1;
    return 0;
  });
  if (dirs.length && dirs.every((d) => d === 1)) return { type: "buff", basis: "stat-lines" };
  if (dirs.length && dirs.every((d) => d === -1)) return { type: "nerf", basis: "stat-lines" };
  return { type: "changed", basis: dirs.some((d) => d !== 0) ? "mixed" : "unstated" };
}

const day = (iso: string) => iso.slice(0, 10);

/** The generated part of item-changes.json: every item entry of the stored patch notes, one record per item. */
export function itemHistoryFrom(notes: PatchNotes, assets: Record<string, PatchAssets>, kept: Pick<ItemChanges, "ids">): Pick<ItemChanges, "archive" | "changes"> {
  const byName = assetIds(assets);
  const idOf = (name: string, pageId?: string) => {
    const k = itemKey(name), known = byName.get(k) ?? Object.entries(kept.ids).find(([n]) => itemKey(n) === k)?.[1].id;
    // The page's icon id is kept only when it is the item's Summoner's Rift id (Riot's icons sometimes show Arena's).
    return known ?? (pageId && [...byName.values()].includes(pageId) ? pageId : null);
  };
  const patches = [...notes.patches].sort((a, b) => comparePatch(b.patch, a.patch));
  const changes: ItemChange[] = [];
  for (const p of patches) for (const e of p.entries) {
    if (e.kind !== "item") continue;
    const lines = e.groups.flatMap((g) => g.changes);
    const verdict = itemVerdict(e.context, lines);
    // One heading may name two items ("World Atlas and Runic Compass"): split only when the whole name is not an item.
    const names = idOf(e.subject, e.itemId) || !/ and /.test(e.subject) ? [e.subject] : e.subject.split(/ and /);
    for (const item of names) changes.push({
      id: `${p.patch}/${e.id}${names.length > 1 ? `/${itemKey(item)}` : ""}`, item, itemId: idOf(item, names.length > 1 ? undefined : e.itemId),
      patch: p.patch, ...(e.midPatch ? { midPatch: e.midPatch } : {}), ...verdict, mode: MODE,
      source: { url: p.url, ...(e.anchor ? { anchor: e.anchor } : {}), entry: e.id },
      lines: lines.map(({ label, before, after, text }) => (before || after ? { label, before, after } : { label, text })),
      ...(e.context ? { context: e.context } : {}),
      origin: "riot-patch-notes", refreshStatus: "verified", lastChecked: day(e.updatedAt),
    });
  }
  return {
    archive: { first: notes.firstPatch, latest: patches[0]?.patch ?? notes.firstPatch, patches: patches.map((p) => ({ patch: p.patch, url: p.url, published: p.published })) },
    changes,
  };
}

// ---------- one game ----------

export interface ItemMark {
  id: number;
  name: string;
  verdict: ItemChangeType;
  changes: ItemChange[]; // after the game, newest first
  /** A data-quality flag: the item is recorded where its own history says it could not be bought. */
  quality?: string;
  /** Common builds only: the games in scope that bought the item, and how many of them predate a change. */
  games?: { changed: number; of: number; patches: string[] };
}
export interface ItemCheck {
  played: string; // Riot's label of the game's patch
  current: string; // the newest stored patch notes: the live patch
  checked: string[]; // patches after the game whose notes are stored, oldest first
  missing: string[]; // patches after the game whose notes are not stored
  complete: boolean;
  marks: ItemMark[]; // changed items, in first-purchase order
  quality: ItemMark[];
  byId: Record<number, ItemMark>;
}

const RANK: ItemChangeType[] = ["removed", "rework", "new", "nerf", "buff", "changed"];
/** One word for several changes to one item: removed or reworked wins, all one way stays that way, else "changed". */
export function combined(changes: ItemChange[]): ItemChangeType {
  const types = new Set(changes.map((c) => c.type));
  if (types.has("removed")) return "removed";
  if (types.has("rework")) return "rework";
  return types.size === 1 ? [...types][0] : "changed";
}
export const VERDICT_LABEL: Record<ItemChangeType, string> = { removed: "Removed", rework: "Reworked", nerf: "Nerfed", buff: "Buffed", changed: "Changed", new: "New" };

/** Patches strictly after `from` up to `to`, in order; within one year label every minor, across years what is known. */
export function patchSpan(from: string, to: string, known: string[]): string[] {
  const a = parsePatch(from), b = parsePatch(to);
  if (!a || !b || comparePatch(from, to) >= 0) return [];
  const out: string[] = [];
  for (let major = a.major; major <= b.major; major++) {
    const last = major === b.major ? b.minor : Math.max(a.minor, ...known.map(parsePatch).filter((p) => p?.major === major).map((p) => p!.minor));
    for (let minor = major === a.major ? a.minor + 1 : 1; minor <= last; minor++) out.push(`${major}.${minor}`);
  }
  return out;
}

const matches = (c: ItemChange, id: number, name: string) => c.itemId === String(id) || itemKey(c.item) === itemKey(name);

/** Every item a build bought or ended with, in first-purchase order. */
export function buildItems(b: Pick<ProBuild, "final" | "purchases" | "trinket">): number[] {
  const ids = [...(b.purchases ?? []).filter(([, , e]) => e === "buy").map(([, id]) => id), ...(b.final ?? []), ...(b.trinket ? [b.trinket] : [])].filter((x) => x > 0);
  return [...new Set(ids)];
}

/** What changed for one game's items since it was played. Undefined when the game's patch can't be read. */
export function checkBuild(history: Pick<ItemChanges, "archive" | "changes" | "external">, game: { patch: string; date?: string | null }, items: { id: number; name: string }[]): ItemCheck | undefined {
  const played = parsePatch(game.patch)?.official, current = history.archive.latest;
  if (!played) return undefined;
  const stored = new Set(history.archive.patches.map((p) => p.patch));
  const span = patchSpan(played, current, [...stored]);
  const all = [...history.changes, ...history.external];
  const after = (c: ItemChange) => {
    const d = comparePatch(c.patch, played);
    if (d > 0) return comparePatch(c.patch, current) <= 0;
    return d === 0 && !!c.midPatch?.date && !!game.date && c.midPatch.date > game.date;
  };
  const marks: ItemMark[] = [], quality: ItemMark[] = [];
  for (const { id, name } of items) {
    const own = all.filter((c) => matches(c, id, name));
    // Recorded on or after its removal, or before it existed: the record needs checking, not an old-build warning.
    const gone = own.find((c) => c.type === "removed" && !after(c) && comparePatch(c.patch, played) <= 0);
    const notYet = own.find((c) => c.type === "new" && after(c));
    if (gone || notYet) {
      const c = (gone ?? notYet)!;
      quality.push({ id, name, verdict: c.type, changes: [c],
        quality: gone ? `${name} is recorded in a ${played} game, but Riot's ${patchKey(c.patch)} notes removed it from Summoner's Rift.`
          : `${name} is recorded in a ${played} game, but it was added to Summoner's Rift in ${patchKey(c.patch)}.` });
      continue;
    }
    const since = own.filter(after).sort((x, y) => comparePatch(y.patch, x.patch) || RANK.indexOf(x.type) - RANK.indexOf(y.type));
    if (since.length) marks.push({ id, name, verdict: combined(since), changes: since });
  }
  const byId: Record<number, ItemMark> = {};
  for (const m of [...marks, ...quality]) byId[m.id] = m;
  const missing = span.filter((p) => !stored.has(p));
  return { played, current, checked: span.filter((p) => stored.has(p)), missing, complete: !missing.length, marks, quality, byId };
}

// ---------- common builds ----------

export interface CommonCheck {
  patches: string[]; // the games' patches, oldest first
  current: string;
  complete: boolean; // every game's span of patch notes is stored
  marks: ItemMark[];
  quality: number; // games with a data-quality flag
  byId: Record<number, ItemMark>;
}
/** A Common build mixes patches: each item is read against the games that bought it, each on its own patch. */
export function commonMarks(rows: { build: Pick<ProBuild, "final" | "purchases" | "trinket">; game: { patch: string }; itemCheck?: ItemCheck }[]): CommonCheck | undefined {
  const checked = rows.filter((r) => r.itemCheck);
  if (!checked.length) return undefined;
  type Tally = { name: string; of: number; changed: number; patches: Set<string>; changes: Map<string, ItemChange>; quality?: string };
  const byItem = new Map<number, Tally>();
  for (const r of checked) for (const id of buildItems(r.build)) {
    const m = r.itemCheck!.byId[id];
    const cur: Tally = byItem.get(id) ?? { name: m?.name ?? "", of: 0, changed: 0, patches: new Set<string>(), changes: new Map() };
    cur.of += 1;
    if (m) {
      cur.name = m.name;
      if (m.quality) cur.quality ??= m.quality;
      else { cur.changed += 1; cur.patches.add(r.itemCheck!.played); for (const c of m.changes) cur.changes.set(c.id, c); }
    }
    byItem.set(id, cur);
  }
  const marks: ItemMark[] = [];
  for (const [id, x] of byItem) {
    if (!x.changed && !x.quality) continue;
    const changes = [...x.changes.values()].sort((a, b) => comparePatch(b.patch, a.patch));
    marks.push({ id, name: x.name, verdict: changes.length ? combined(changes) : "changed", changes,
      ...(x.quality ? { quality: x.quality } : {}), games: { changed: x.changed, of: x.of, patches: [...x.patches].sort(comparePatch) } });
  }
  const byId: Record<number, ItemMark> = {};
  for (const m of marks) byId[m.id] = m;
  return {
    patches: [...new Set(checked.map((r) => r.itemCheck!.played))].sort(comparePatch), current: checked[0].itemCheck!.current,
    complete: checked.every((r) => r.itemCheck!.complete), marks, quality: checked.filter((r) => r.itemCheck!.quality.length).length, byId,
  };
}

/** Riot's page for a change, at the entry's heading when the page gave one. */
export const sourceHref = (c: ItemChange) => `${c.source.url}${c.source.anchor ? `#${c.source.anchor}` : ""}`;
