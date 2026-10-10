import { Suspense } from "react";
import { PageLoading } from "@/components/ui";
import { PoolView } from "@/components/views/PoolView";
import { getBotPairings, getMeta, getMidJungle, getPool, getProDrafts, getTopPicks } from "@/lib/data";
import { nameMap, sourceMap } from "@/lib/lookup";

export default function Pool() {
  const data = { pool: getPool(), meta: getMeta(), proDrafts: getProDrafts(), botPairings: getBotPairings(), sources: sourceMap() };
  return (
    <Suspense fallback={<PageLoading title="Champion Pool" />}>
      <PoolView names={nameMap()} data={data} bot={getBotPairings()} midJungle={getMidJungle()} top={getTopPicks()} />
    </Suspense>
  );
}
