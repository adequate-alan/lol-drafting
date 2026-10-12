import { Suspense } from "react";
import { PageLoading } from "@/components/ui";
import { PinnedPlayersView } from "@/components/views/PinnedPlayersView";
import { getDrawerData, getMeta } from "@/lib/data";
import { nameMap } from "@/lib/lookup";

export default function PinnedPlayers() {
  const events = Object.fromEntries(getMeta().events.map((e) => [e.id, e.short]));
  return (
    <Suspense fallback={<PageLoading title="Pro Builds" />}>
      <PinnedPlayersView names={nameMap()} events={events} drawerData={getDrawerData()} />
    </Suspense>
  );
}
