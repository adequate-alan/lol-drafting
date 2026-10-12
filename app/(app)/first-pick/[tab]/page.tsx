import { notFound } from "next/navigation";
import { Forward, LegacyMidJungle } from "@/components/Forward";
import { LEGACY_MID_JUNGLE, TABS } from "@/components/views/synergy-tabs";
import { jungleOnlyIds } from "@/lib/data";

// Old /first-pick/<tab>/ links forward to the same Champion Synergies tab, query included (see ../page.tsx).
export const dynamicParams = false;
export function generateStaticParams() {
  return [...Object.keys(TABS), LEGACY_MID_JUNGLE].map((tab) => ({ tab }));
}

export default async function FirstPickTab({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  if (tab === LEGACY_MID_JUNGLE) return <LegacyMidJungle jungleOnly={jungleOnlyIds()} />;
  if (!(tab in TABS)) notFound();
  return <Forward to={`/synergies/${tab}/`} label={`Champion Synergies: ${TABS[tab as keyof typeof TABS]}`} />;
}
