import { Suspense } from "react";
import { PageLoading } from "@/components/ui";
import { PatchNotesView } from "@/components/views/PatchNotesView";
import { getBotPairings, getDrawerData, getKitQueue, getMeta, getMidJungle, getPatchNotes, getPool, getProDrafts, getTopPicks } from "@/lib/data";
import { nameMap, sourceMap } from "@/lib/lookup";
import { implicationContext, implicationsFor, type Implications } from "@/lib/patch-implications";

// Each section names itself in the tab and in history, so a route change is announced (layout template adds the site).
export const metadata = { title: "Patch Notes" };

export default function PatchNotes() {
  const notes = getPatchNotes();
  const names = nameMap();
  // Draft implications (analysis) per champion change, computed at build time from the site's own data.
  const ctx = implicationContext({ pool: getPool(), meta: getMeta(), proDrafts: getProDrafts(), botPairings: getBotPairings(), sources: sourceMap(), midJungle: getMidJungle(), topPicks: getTopPicks() });
  const implications: Record<string, Implications> = {};
  for (const p of notes.patches) for (const e of p.entries)
    if (e.kind === "champion" && e.ref) implications[`${p.patch}/${e.id}`] = implicationsFor(e.ref, p.patch, ctx, (id) => names[id] ?? id);
  // Kit values to recheck (analysis): champion changes that touch crowd control, mobility, range, damage type or mechanics.
  const kitReview = Object.fromEntries(getKitQueue().map((k) => [`${k.patch}/${k.entryId}`, k]));
  return (
    <Suspense fallback={<PageLoading title="Patch Notes" />}>
      <PatchNotesView notes={notes} names={names} implications={implications} kitReview={kitReview} drawerData={getDrawerData()} />
    </Suspense>
  );
}
