import { Suspense } from "react";
import { PageLoading } from "@/components/ui";
import { MetaView } from "@/components/views/MetaView";
import { getMeta, getRules, getSources } from "@/lib/data";
import { nameMap, sourceMap } from "@/lib/lookup";

export default function Meta() {
  const allSources = getSources();
  const checked = allSources.map((s) => s.lastChecked).filter(Boolean).sort().at(-1) ?? undefined;
  const notRefreshed = allSources.filter((s) => s.refreshStatus === "not-refreshed").length;
  return (
    <Suspense fallback={<PageLoading title="Meta / Research" />}>
      <MetaView names={nameMap()} sources={sourceMap()} meta={getMeta()} rules={getRules()}
        checked={checked} notRefreshed={notRefreshed} sourceCount={allSources.length} />
    </Suspense>
  );
}
