"use client";
import { useSearchParams } from "next/navigation";
import { useRef } from "react";
import { ownQuery } from "@/lib/my-role";
import { DraftRoom } from "@/components/DraftRoom";
import { parseEnemy } from "@/lib/counters";
import type { DraftData, DrawerData } from "@/lib/data";
import { ROLES, type Role, type Source } from "@/lib/schema";
import { parseRole } from "@/lib/my-role";
import type { Filter } from "@/lib/candidates";
import { localStore, openingBoard, readBoard } from "@/lib/draft-persist";

const FILTERS: Filter[] = ["all", "synergy", "pro", "fit", "counter", "priority", "rotation", "blind"];

export function DraftRoomView({ data, sources, drawerData, metaPicks }: {
  data: DraftData; sources: Record<string, Source>; drawerData: DrawerData;
  metaPicks: Record<string, { picks: number; winRate: number; lowSample: boolean }>;
}) {
  const q = useSearchParams();
  const ids = new Set(data.champions.map((c) => c.id));
  // A bare room URL reopens the draft this browser left (lib/draft-persist.ts); a URL naming a board always wins.
  const { stored, restored } = openingBoard(q, typeof window === "undefined" ? undefined : readBoard(localStore(), ids, FILTERS));
  const initial: Partial<Record<Role, string>> = {};
  const shellId = q.get("shell");
  const shell = shellId ? data.shells.find((s) => s.id === shellId) : undefined;
  for (const role of ROLES) {
    const v = stored ? stored.ally[role] : shell ? shell.slots[role].champion : q.get(role.toLowerCase());
    if (typeof v === "string" && ids.has(v)) initial[role] = v;
  }
  const initialEnemy = stored ? { ...stored.enemy } : parseEnemy(q.get("vs"), data.champions, Object.values(initial) as string[]);
  // Coming back from Pro Builds: the role being picked and the list filter the draft was left on.
  const focus = stored ? stored.focus : parseRole(q.get("focus"));
  const initialFocus = focus && !initial[focus] ? focus : undefined;
  const initialFilter = FILTERS.find((f) => f === (stored ? stored.filter : q.get("filter")));
  const patch = (stored ? stored.patch : q.get("patch")) ?? undefined;
  // A new board from outside (a link, Back to Draft Room, Use in Draft Room) starts a fresh room. The room's own URL
  // writes (every lock replaces the query so the draft can be shared) must not: Next.js echoes them through
  // useSearchParams, and re-keying there rebuilt the room on every lock, dropping the tab, filter, open rows, focus
  // and the Clear draft undo.
  const key = useRef<string>(undefined);
  if (key.current === undefined || !ownQuery(q.toString())) key.current = JSON.stringify(initial) + JSON.stringify(initialEnemy) + (patch ?? "");
  return (
    <DraftRoom key={key.current} data={data} sources={sources} drawerData={drawerData}
      initial={initial} initialEnemy={initialEnemy} initialFocus={initialFocus} initialFilter={initialFilter} initialPatch={patch} restored={restored} metaPicks={metaPicks}
      legacyCheck={q.get("legacy") === "1"} />
  );
}
