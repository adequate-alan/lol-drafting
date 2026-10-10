import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageLoading } from "@/components/ui";
import { SynergiesView } from "@/components/views/SynergiesView";
import { TABS, type Tab } from "@/components/views/synergy-tabs";
import { getBotPairings, getDrawerData, getMeta, getMidJungle, getPool, getProDrafts, getTopPicks } from "@/lib/data";
import { eventMap, nameMap, sourceMap } from "@/lib/lookup";

export const metadata: Metadata = { title: "Champion Synergies" };
export const dynamicParams = false;
export function generateStaticParams() {
  return Object.keys(TABS).map((tab) => ({ tab }));
}

export default async function Synergies({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  if (!(tab in TABS)) notFound();
  const stats = Object.fromEntries(getMeta().stats.filter((s) => s.winRate != null).map((s) => [s.champion, { ...s, winRate: s.winRate! }]));
  const draftLabels = Object.fromEntries(getProDrafts().map((d) => [d.id, `${d.team} ${d.seriesGame}`]));
  return (
    <Suspense fallback={<PageLoading title="Champion Synergies" />}>
      <SynergiesView tab={tab as Tab} names={nameMap()} sources={sourceMap()} events={eventMap()} stats={stats} draftLabels={draftLabels}
        bot={getBotPairings()} midJungle={getMidJungle()} top={getTopPicks()} pool={getPool()} drawerData={getDrawerData()} />
    </Suspense>
  );
}
