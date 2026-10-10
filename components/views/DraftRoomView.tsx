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
  const initialEnemy = (q.get("vs") ?? "").split(",").filter((id, i, a) => ids.has(id) && a.indexOf(id) === i && !Object.values(initial).includes(id)).slice(0, 5);
  return (
    <>
      <PageHeader title="Draft Room"
        desc={`Lock your picks by role and, if you know them, the enemy's. Recommendations are ranked by how well each champion fits the whole draft.${unreviewed > 0 ? ` Champion attributes are a first draft (${unreviewed} not yet reviewed).` : ""}`}
        actions={<span className="row tight"><SourceBadge layer="clash" label="Synergy" /><SourceBadge layer="pro" label="Pro: observed evidence" /><SourceBadge layer="logic" label="Logic: general draft logic" /></span>} />
      <DraftRoom key={JSON.stringify(initial) + initialEnemy.join()} data={data} sources={sources} initial={initial} initialEnemy={initialEnemy} metaPicks={metaPicks} />
    </>
  );
}
