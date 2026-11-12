import { Suspense } from "react";
import { PageLoading } from "@/components/ui";
import { DraftInsightsView } from "@/components/views/DraftInsightsView";
import { getDraftInsights, getDrawerData } from "@/lib/data";
import { nameMap } from "@/lib/lookup";

// Each section names itself in the tab and in history, so a route change is announced (layout template adds the site).
export const metadata = { title: "Draft Insights" };

export default function Insights() {
  return (
    <Suspense fallback={<PageLoading title="Draft Insights" />}>
      <DraftInsightsView data={getDraftInsights()} names={nameMap()} drawerData={getDrawerData()} />
    </Suspense>
  );
}
