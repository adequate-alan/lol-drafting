import { Suspense } from "react";
import { PageLoading } from "@/components/ui";
import { CompsView } from "@/components/views/CompsView";
import { getCompShells, getDrawerData, getProDrafts } from "@/lib/data";
import { nameMap, sourceMap } from "@/lib/lookup";

export default function Comps() {
  const drafts = Object.fromEntries(getProDrafts().map((d) => [d.id, d]));
  return (
    <Suspense fallback={<PageLoading title="Comp Library" />}>
      <CompsView names={nameMap()} sources={sourceMap()} drafts={drafts} allShells={getCompShells()} data={getDrawerData()} />
    </Suspense>
  );
}
