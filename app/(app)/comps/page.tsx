import { Suspense } from "react";
import { PageLoading } from "@/components/ui";
import { CompsView } from "@/components/views/CompsView";
import { getDrawerData, getLibrary, getProDrafts } from "@/lib/data";
import { nameMap, sourceMap } from "@/lib/lookup";

export default function Comps() {
  const drafts = Object.fromEntries(getProDrafts().map((d) => [d.id, d]));
  const library = getLibrary();
  return (
    <Suspense fallback={<PageLoading title="Comp Library" />}>
      <CompsView names={nameMap()} sources={sourceMap()} drafts={drafts} allShells={library.shells}
        extras={library.extras} lastAddition={library.lastAddition} data={getDrawerData()} />
    </Suspense>
  );
}
