import { Suspense } from "react";
import { PageLoading } from "@/components/ui";
import { ProDraftsView } from "@/components/views/ProDraftsView";
import { getBuildGames, getDrawerData, getProDrafts, getProFreshness } from "@/lib/data";
import { nameMap, sourceMap } from "@/lib/lookup";

// Each section names itself in the tab and in history, so a route change is announced (layout template adds the site).
export const metadata = { title: "Pro Drafts" };

export default function ProDrafts() {
  return (
    <Suspense fallback={<PageLoading title="Pro Drafts" />}>
      <ProDraftsView names={nameMap()} sources={sourceMap()} all={getProDrafts()} freshness={getProFreshness()} drawerData={getDrawerData()} buildGames={getBuildGames()} />
    </Suspense>
  );
}
