import { DraftRoom } from "@/components/DraftRoom";
import { EvidenceBadge } from "@/components/ui";
import { getChampions, getCompShells, getDraftData, getMeta } from "@/lib/data";
import { sourceMap } from "@/lib/lookup";
import { ROLES, type Role } from "@/lib/schema";

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function DraftRoomPage({ searchParams }: { searchParams: Search }) {
  const q = await searchParams;
  const ids = new Set(getChampions().map((c) => c.id));
  const initial: Partial<Record<Role, string>> = {};
  const shell = typeof q.shell === "string" ? getCompShells().find((s) => s.id === q.shell) : undefined;
  for (const role of ROLES) {
    const v = shell ? shell.slots[role].champion : q[role.toLowerCase()];
    if (typeof v === "string" && ids.has(v)) initial[role] = v;
  }
  const metaPicks = Object.fromEntries(getMeta().stats.map((s) => [s.champion, { picks: s.picks, winRate: s.winRate, lowSample: s.lowSample }]));
  const unreviewed = getChampions().filter((c) => !c.reviewed).length;
  return (
    <>
      <div className="page-head">
        <h1>Draft Room</h1>
        <span className="row small muted">
          <EvidenceBadge layer="clash" /> my Clash recommendation <EvidenceBadge layer="pro" /> observed pro evidence <EvidenceBadge layer="logic" /> general draft logic
        </span>
      </div>
      {unreviewed > 0 && <p className="small muted" style={{ marginTop: -6 }}>Champion attributes behind the profile and warnings are a first draft ({unreviewed} not yet reviewed).</p>}
      <DraftRoom key={JSON.stringify(initial)} data={getDraftData()} sources={sourceMap()} initial={initial} metaPicks={metaPicks} />
    </>
  );
}
