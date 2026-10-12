import { Suspense } from "react";
import { PageLoading } from "@/components/ui";
import { PoolView } from "@/components/views/PoolView";
import { getBotPairings, getDrawerData, getMeta, getMidJungle, getPool, getProDrafts, getProFreshness, getProposed, getTopPicks } from "@/lib/data";
import { nameMap, sourceMap } from "@/lib/lookup";

// Each section names itself in the tab and in history, so a route change is announced (layout template adds the site).
export const metadata = { title: "Champion Pool" };

export default function Pool() {
  const data = { pool: getPool(), meta: getMeta(), proDrafts: getProDrafts(), botPairings: getBotPairings(), sources: sourceMap() };
  return (
    <Suspense fallback={<PageLoading title="Champion Pool" />}>
      <PoolView names={nameMap()} data={data} bot={getBotPairings()} midJungle={getMidJungle()} top={getTopPicks()} proposed={getProposed().records} freshness={getProFreshness()} drawerData={getDrawerData()} />
    </Suspense>
  );
}
