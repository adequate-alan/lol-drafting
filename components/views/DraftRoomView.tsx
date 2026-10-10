"use client";
import { useSearchParams } from "next/navigation";
import { DraftRoom } from "@/components/DraftRoom";
import { PageHeader, SourceBadge } from "@/components/ui";
import type { DraftData } from "@/lib/data";
import { ROLES, type Role, type Source } from "@/lib/schema";

export function DraftRoomView({ data, sources, metaPicks, unreviewed }: {
  data: DraftData; sources: Record<string, Source>; unreviewed: number;
  metaPicks: Record<string, { picks: number; winRate: number; lowSample: boolean }>;
}) {
  const q = useSearchParams();
  const ids = new Set(data.champions.map((c) => c.id));
  const initial: Partial<Record<Role, string>> = {};
  const shellId = q.get("shell");
  const shell = shellId ? data.shells.find((s) => s.id === shellId) : undefined;
  for (const role of ROLES) {
    const v = shell ? shell.slots[role].champion : q.get(role.toLowerCase());
    if (typeof v === "string" && ids.has(v)) initial[role] = v;
  }
  return (
    <>
      <PageHeader title="Draft Room"
        desc={unreviewed > 0 ? `Lock picks by role. Champion attributes behind the profile and warnings are a first draft (${unreviewed} not yet reviewed).` : "Lock picks by role."}
        actions={<span className="row tight"><SourceBadge layer="clash" label="Clash: my recommendation" /><SourceBadge layer="pro" label="Pro: observed evidence" /><SourceBadge layer="logic" label="Logic: general draft logic" /></span>} />
      <DraftRoom key={JSON.stringify(initial)} data={data} sources={sources} initial={initial} metaPicks={metaPicks} />
    </>
  );
}
