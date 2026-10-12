import { Suspense } from "react";
import { PageLoading } from "@/components/ui";
import { ProDraftsView } from "@/components/views/ProDraftsView";
import { getBuildGames, getDrawerData, getProDrafts, getProFreshness } from "@/lib/data";
import { nameMap, sourceMap } from "@/lib/lookup";

export default function ProDrafts() {
  return (
    <Suspense fallback={<PageLoading title="Pro Drafts" />}>
      <ProDraftsView names={nameMap()} sources={sourceMap()} all={getProDrafts()} freshness={getProFreshness()} drawerData={getDrawerData()} buildGames={getBuildGames()} />
    </Suspense>
  );
}
