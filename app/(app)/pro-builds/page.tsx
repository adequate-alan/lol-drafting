import { Suspense } from "react";
import { PageLoading } from "@/components/ui";
import { ProBuildsView } from "@/components/views/ProBuildsView";
import { getBuildIndex, getDrawerData, getMeta } from "@/lib/data";
import { nameMap } from "@/lib/lookup";

// Each section names itself in the tab and in history, so a route change is announced (layout template adds the site).
export const metadata = { title: "Pro Builds" };

export default function ProBuilds() {
  const events = Object.fromEntries(getMeta().events.map((e) => [e.id, e.short]));
  return (
    <Suspense fallback={<PageLoading title="Pro Builds" />}>
      <ProBuildsView index={getBuildIndex()} names={nameMap()} events={events} drawerData={getDrawerData()} />
    </Suspense>
  );
}
