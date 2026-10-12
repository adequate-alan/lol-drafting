// The daily patch-notes check: reads Riot's patch-notes index, fetches each tracked patch page that is new or whose
// revision changed, and rebuilds its record. Earlier patches are never removed. Returns what changed; writes nothing.
import { buildPatch, isTracked } from "./normalize.mjs";
import { parseArticle, parseIndex } from "./parse.mjs";

export const INDEX_URL = "https://www.leagueoflegends.com/en-us/news/tags/patch-notes/";

// Content without timestamps, keys sorted: a re-read that finds the same facts is not a change.
const canon = (v) => Array.isArray(v) ? v.map(canon) : v && typeof v === "object"
  ? Object.fromEntries(Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => [k, canon(v[k])])) : v;
const facts = (p) => JSON.stringify(canon({ ...p, updatedAt: undefined, rev: undefined, entries: p.entries.map((e) => ({ ...e, updatedAt: undefined })) }));

/** `get(url)` returns the page HTML or throws. `force` re-reads every tracked patch even when its revision is unchanged. */
export async function refresh(data, get, { now = new Date().toISOString(), force = false } = {}) {
  const notes = structuredClone(data.patchNotes);
  const report = [], warnings = [], changed = [];
  const listed = parseIndex(await get(INDEX_URL)).filter((x) => isTracked(x.patch, notes.firstPatch));
  if (!listed.length) throw new Error("The patch-notes index lists no tracked patch; the page layout may have changed. Nothing written.");
  for (const item of listed.sort((a, b) => a.patch.localeCompare(b.patch, undefined, { numeric: true }))) {
    const i = notes.patches.findIndex((p) => p.patch === item.patch);
    const stored = i >= 0 ? notes.patches[i] : undefined;
    if (stored && stored.rev === item.rev && !force) { report.push(`${item.patch}: unchanged (revision ${item.rev}).`); continue; }
    const article = parseArticle(await get(item.url));
    const built = buildPatch(item.patch, article, data.champions, { now, previous: stored });
    warnings.push(...built.warnings);
    const next = { ...built.patch, updatedAt: now };
    if (stored && facts(stored) === facts(next)) { report.push(`${item.patch}: ${stored.rev === item.rev ? "re-read" : "page revision changed"}, no Summoner's Rift change.`); continue; }
    if (!next.entries.length) { warnings.push(`${item.patch}: no Summoner's Rift changes could be read; not stored.`); continue; }
    if (stored) notes.patches[i] = next; else notes.patches.push(next);
    const corrected = next.entries.filter((e) => e.corrected && !stored?.entries.find((x) => x.id === e.id)?.corrected).length;
    report.push(`${item.patch}: ${stored ? "updated" : "added"}, ${next.entries.length} entries${next.midPatch.length ? `, mid-patch: ${next.midPatch.map((m) => m.title).join("; ")}` : ""}${corrected ? `, ${corrected} corrected by Riot` : ""}.`);
    changed.push(item.patch);
  }
  notes.patches.sort((a, b) => b.patch.localeCompare(a.patch, undefined, { numeric: true }));
  return { patchNotes: notes, changed, report, warnings };
}
