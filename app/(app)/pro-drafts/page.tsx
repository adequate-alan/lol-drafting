import { Suspense } from "react";
import { PageLoading } from "@/components/ui";
import { ProDraftsView } from "@/components/views/ProDraftsView";
import { getBuildGames, getDrawerData, getMeta, getProDrafts, getProFreshness } from "@/lib/data";
import { nameMap, sourceMap } from "@/lib/lookup";

// Each section names itself in the tab and in history, so a route change is announced (layout template adds the site).
export const metadata = { title: "Pro Drafts" };

export default function ProDrafts() {
  const events = Object.fromEntries(getMeta().events.map((e) => [e.id, e.short]));
  const shortNames = Object.fromEntries(getMeta().events.map((e) => [e.name, e.short]));
  const eventIds = Object.fromEntries(getMeta().events.map((e) => [e.name, e.id]));
  return (
    <Suspense fallback={<PageLoading title="Pro Drafts" />}>
      <ProDraftsView names={nameMap()} sources={sourceMap()} all={getProDrafts()} freshness={getProFreshness()} drawerData={getDrawerData()} buildGames={getBuildGames()} events={events} shortNames={shortNames} eventIds={eventIds} />
    </Suspense>
  );
}
