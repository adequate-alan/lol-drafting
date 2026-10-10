"use client";
import { useSearchParams } from "next/navigation";
import { DraftRoom } from "@/components/DraftRoom";
import { parseEnemy } from "@/lib/counters";
import type { DraftData, DrawerData } from "@/lib/data";
import { ROLES, type Role, type Source } from "@/lib/schema";

export function DraftRoomView({ data, sources, drawerData, metaPicks }: {
  data: DraftData; sources: Record<string, Source>; drawerData: DrawerData;
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
  const initialEnemy = parseEnemy(q.get("vs"), data.champions, Object.values(initial) as string[]);
  return (
    <DraftRoom key={JSON.stringify(initial) + JSON.stringify(initialEnemy)} data={data} sources={sources} drawerData={drawerData}
      initial={initial} initialEnemy={initialEnemy} metaPicks={metaPicks} />
  );
}
