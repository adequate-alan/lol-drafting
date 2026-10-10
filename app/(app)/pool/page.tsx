import { Suspense } from "react";
import { PageLoading } from "@/components/ui";
import { PoolView } from "@/components/views/PoolView";
import { getMeta, getPool } from "@/lib/data";
import { nameMap, sourceMap } from "@/lib/lookup";

export default function Pool() {
  const stats = Object.fromEntries(getMeta().stats.map((s) => [s.champion, s]));
  return (
    <Suspense fallback={<PageLoading title="Champion Pool" />}>
      <PoolView names={nameMap()} sources={sourceMap()} stats={stats} entries={getPool()} />
    </Suspense>
  );
}
