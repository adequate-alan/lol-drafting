import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LegacyMidJungle } from "@/components/Forward";
import { PageLoading } from "@/components/ui";
import { SynergiesView } from "@/components/views/SynergiesView";
import { LEGACY_MID_JUNGLE, TABS, type Tab } from "@/components/views/synergy-tabs";
import { getBotPairings, getCompShells, getDrawerData, getMeta, getMidJungle, getPool, getProDrafts, getProFreshness, getTopDraft, getTopPicks, jungleOnlyIds } from "@/lib/data";
import { eventMap, nameMap, sourceMap } from "@/lib/lookup";

export const dynamicParams = false;
export function generateStaticParams() {
  return [...Object.keys(TABS), LEGACY_MID_JUNGLE].map((tab) => ({ tab }));
}

export async function generateMetadata({ params }: { params: Promise<{ tab: string }> }): Promise<Metadata> {
  const { tab } = await params;
  return { title: tab in TABS ? `${TABS[tab as Tab]} · Champion Synergies` : "Champion Synergies" };
}

export default async function Synergies({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  if (tab === LEGACY_MID_JUNGLE) return <LegacyMidJungle jungleOnly={jungleOnlyIds()} />;
  if (!(tab in TABS)) notFound();
  const stats = Object.fromEntries(getMeta().stats.filter((s) => s.winRate != null).map((s) => [s.champion, { ...s, winRate: s.winRate! }]));
  const draftLabels = Object.fromEntries(getProDrafts().map((d) => [d.id, `${d.team} ${d.seriesGame}`]));
  return (
    <Suspense fallback={<PageLoading title="Champion Synergies" />}>
      <SynergiesView tab={tab as Tab} names={nameMap()} sources={sourceMap()} events={eventMap()} stats={stats} draftLabels={draftLabels}
        bot={getBotPairings()} midJungle={getMidJungle()} top={getTopPicks()} pool={getPool()} drawerData={getDrawerData()} freshness={getProFreshness()} shells={getCompShells()}
        topDraft={tab === "top" ? getTopDraft() : undefined} />
    </Suspense>
  );
}
