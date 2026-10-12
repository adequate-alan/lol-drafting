import { Suspense } from "react";
import { PageLoading } from "@/components/ui";
import { MetaView } from "@/components/views/MetaView";
import { getBotPairings, getDrawerData, getMeta, getProDrafts, getProFreshness, getRules } from "@/lib/data";
import { nameMap, sourceMap } from "@/lib/lookup";

export default function Meta() {
  const sources = sourceMap();
  const input = { meta: getMeta(), proDrafts: getProDrafts(), botPairings: getBotPairings(), sources };
  return (
    <Suspense fallback={<PageLoading title="Meta / Research" />}>
      <MetaView names={nameMap()} sources={sources} input={input} rules={getRules()} drawerData={getDrawerData()} freshness={getProFreshness()} />
    </Suspense>
  );
}
