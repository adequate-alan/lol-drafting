import { Suspense } from "react";
import { PageLoading } from "@/components/ui";
import { MetaView } from "@/components/views/MetaView";
import { getBotPairings, getDrawerData, getMeta, getProDrafts, getProFreshness, getRules } from "@/lib/data";
import { nameMap, sourceMap } from "@/lib/lookup";

// Each section names itself in the tab and in history, so a route change is announced (layout template adds the site).
export const metadata = { title: "Meta / Research" };

export default function Meta() {
  const sources = sourceMap();
  const input = { meta: getMeta(), proDrafts: getProDrafts(), botPairings: getBotPairings(), sources };
  return (
    <Suspense fallback={<PageLoading title="Meta / Research" />}>
      <MetaView names={nameMap()} sources={sources} input={input} rules={getRules()} drawerData={getDrawerData()} freshness={getProFreshness()} />
    </Suspense>
  );
}
