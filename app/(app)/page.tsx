import { Suspense } from "react";
import { PageLoading } from "@/components/ui";
import { DraftRoomView } from "@/components/views/DraftRoomView";
import { getDraftData, getDrawerData, getMeta } from "@/lib/data";
import { sourceMap } from "@/lib/lookup";

export default function DraftRoomPage() {
  const metaPicks = Object.fromEntries(getMeta().stats.map((s) => [s.champion, { picks: s.picks, winRate: s.winRate, lowSample: s.lowSample }]));
  return (
    <Suspense fallback={<PageLoading title="Draft Room" />}>
      <DraftRoomView data={getDraftData()} sources={sourceMap()} drawerData={getDrawerData()} metaPicks={metaPicks} />
    </Suspense>
  );
}
