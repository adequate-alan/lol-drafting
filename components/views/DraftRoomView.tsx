"use client";
import { useSearchParams } from "next/navigation";
import { DraftRoom } from "@/components/DraftRoom";
import { EvidenceBadge } from "@/components/ui";
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
      <div className="page-head">
        <h1>Draft Room</h1>
        <span className="row small muted">
          <EvidenceBadge layer="clash" /> my Clash recommendation <EvidenceBadge layer="pro" /> observed pro evidence <EvidenceBadge layer="logic" /> general draft logic
        </span>
      </div>
      {unreviewed > 0 && <p className="small muted" style={{ marginTop: -6 }}>Champion attributes behind the profile and warnings are a first draft ({unreviewed} not yet reviewed).</p>}
      <DraftRoom key={JSON.stringify(initial)} data={data} sources={sources} initial={initial} metaPicks={metaPicks} />
    </>
  );
}
