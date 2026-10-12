import { Suspense } from "react";
import { PageLoading } from "@/components/ui";
import { CompsView } from "@/components/views/CompsView";
import { getDrawerData, getLibrary, getProDrafts } from "@/lib/data";
import { nameMap, sourceMap } from "@/lib/lookup";

// Each section names itself in the tab and in history, so a route change is announced (layout template adds the site).
export const metadata = { title: "Comp Library" };

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
