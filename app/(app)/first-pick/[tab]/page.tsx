import { notFound } from "next/navigation";
import { Forward } from "@/components/Forward";
import { TABS } from "@/components/views/synergy-tabs";

// Old /first-pick/<tab>/ links forward to the same Champion Synergies tab, query included (see ../page.tsx).
export const dynamicParams = false;
export function generateStaticParams() {
  return Object.keys(TABS).map((tab) => ({ tab }));
}

export default async function FirstPickTab({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  if (!(tab in TABS)) notFound();
  return <Forward to={`/synergies/${tab}/`} label={`Champion Synergies: ${TABS[tab as keyof typeof TABS]}`} />;
}
