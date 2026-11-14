import Link from "next/link";
import { Suspense } from "react";
import { PageLoading } from "@/components/ui";
import { DraftRoomView } from "@/components/views/DraftRoomView";
import { getDraftData, getDrawerData, getMeta, getProGames } from "@/lib/data";
import { FINAL_INFO, finalRead } from "@/lib/finals";
import { sourceMap } from "@/lib/lookup";

export default function DraftRoomPage() {
  const metaPicks = Object.fromEntries(getMeta().stats.filter((s) => s.winRate != null).map((s) => [s.champion, { picks: s.picks, winRate: s.winRate!, lowSample: s.lowSample }]));
  // While the Worlds final is ahead or being recorded, one quiet line points to the Gen.G Finals hub (alan, 2026-11-14).
  // It retires on its own with the build that carries the verified result.
  const final = finalRead(getProGames().games);
  return (
    <>
    {final.status !== "complete" && (
      <p className="finals-notice"><b>{FINAL_INFO.title}</b><span>Gen.G vs Bilibili Gaming · Nov 14, 2:00 PM ET</span><Link href="/geng">Finals hub →</Link></p>
    )}
    <Suspense fallback={<PageLoading title="Draft Room" />}>
      <DraftRoomView data={getDraftData()} sources={sourceMap()} drawerData={getDrawerData()} metaPicks={metaPicks} />
    </Suspense>
    </>
  );
}
