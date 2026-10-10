"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChampIcon } from "@/components/ChampIcon";
import { ChampionProvider } from "@/components/ChampionInteraction";
import type { CardRecord } from "@/components/PairingCard";
import { ScoutingReport } from "@/components/ScoutingReport";
import type { DrawerData } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import type { EventMap } from "@/lib/evidence";
import { TABS, type Tab } from "./first-pick-tabs";
import { sortBotPicks, sortMidJunglePicks } from "@/lib/first-pick-order";
import type { BotPairing, MetaStat, MidJunglePairing, PoolEntry, Role, Source, TopPick } from "@/lib/schema";

const GRADE_ORDER = ["A", "A-", "B+", "B", "B-", "C+", "C"];

export function FirstPickView({ tab, names, sources, events, stats, draftLabels, bot, midJungle, top, pool, drawerData }: {
  drawerData: DrawerData; tab: Tab; names: Record<string, string>; sources: Record<string, Source>; events: EventMap; stats: Record<string, MetaStat & { winRate: number }>;
  draftLabels: Record<string, string>; bot: BotPairing[]; midJungle: MidJunglePairing[]; top: TopPick[]; pool: PoolEntry[];
}) {
  const params = useSearchParams();
  const champ = params.get("champ") || undefined;
  const role = params.get("role") || undefined;
  const [query, setQuery] = useState("");
  const rail = useRef<HTMLUListElement>(null);
  let list: { id: string; label: string; sub: string; role?: string }[] = [];
  let selected: CardRecord | undefined;
  if (tab === "bot") {
    const rows = sortBotPicks(bot, pool, names);
    list = rows.map((r) => ({ id: r.champion, label: names[r.champion], sub: r.clashDefault.map((s) => names[s]).join(" / ") }));
    const r = rows.find((x) => x.champion === (champ ?? rows[0].champion));
    if (r) selected = { kind: "bot", record: r };
  } else if (tab === "mid-jungle") {
    const rows = sortMidJunglePicks(midJungle, pool, names);
    list = rows.map((r) => ({ id: r.anchor, role: r.role, label: names[r.anchor], sub: `${r.role === "MID" ? "Mid" : "Jungle"} · ${r.clashDefault.map((s) => names[s]).join(" / ")}${r.status === "downgraded" ? " · downgraded" : ""}` }));
    const r = rows.find((x) => x.anchor === (champ ?? rows[0].anchor) && (!role || x.role === role));
    if (r) selected = { kind: "mid-jungle", record: r };
  } else {
    const rows = [...top].sort((a, b) => GRADE_ORDER.indexOf(a.blindGrade) - GRADE_ORDER.indexOf(b.blindGrade));
    list = rows.map((r) => ({ id: r.champion, label: names[r.champion], sub: `Blind ${r.blindGrade}${stats[r.champion] ? ` · ${stats[r.champion].picks} picks` : ""}` }));
    const r = rows.find((x) => x.champion === (champ ?? rows[0].champion));
    if (r) selected = { kind: "top", record: r, stats: stats[r.champion] };
  }
  const selectedId = selected ? ("champion" in selected.record ? selected.record.champion : selected.record.anchor) : undefined;

  const selectedRole: Role | undefined = selected && (selected.kind === "bot" ? "BOT" : selected.kind === "top" ? "TOP" : selected.record.role);
  const listRole = (x: { role?: string }): Role => (tab === "bot" ? "BOT" : tab === "top" ? "TOP" : (x.role as Role));
  const isSelected = (x: { id: string; role?: string }) =>
    x.id === selectedId && (!x.role || selected?.kind !== "mid-jungle" || selected.record.role === x.role);
  const q = query.trim().toLowerCase();
  const shown = q ? list.filter((x) => `${x.label} ${x.sub}`.toLowerCase().includes(q)) : list;
  // Keep the selected pick in view inside the rail (without scrolling the page) when arriving from a link.
  useEffect(() => {
    const ul = rail.current, el = ul?.querySelector<HTMLElement>("a.active");
    if (ul && el && (el.offsetTop < ul.scrollTop || el.offsetTop + el.offsetHeight > ul.scrollTop + ul.clientHeight)) ul.scrollTop = el.offsetTop - ul.clientHeight / 3;
  }, [selectedId, tab]);
  const draftHref = selected && selectedId
    ? `/?${selected.kind === "bot" ? "bot" : selected.kind === "top" ? "top" : (selected.record as { role: string }).role.toLowerCase()}=${selectedId}` : undefined;

  return (
    <>
      <PageHeader title="First Pick"
        actions={draftHref && <Link className="btn primary sm" href={draftHref}>Open in Draft Room →</Link>} />
      <nav className="tabs">
        {(Object.keys(TABS) as Tab[]).map((t) => <Link key={t} href={`/first-pick/${t}`} className={t === tab ? "active" : undefined}>{TABS[t]}</Link>)}
      </nav>
      <div className="split scout-split">
        <nav className="pick-rail" aria-label={`${TABS[tab]} first picks`}>
          <input type="search" placeholder="Search picks or partners" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search picks" />
          <ul ref={rail}>
            {shown.map((x) => {
              const active = isSelected(x);
              return (
                <li key={x.id + (x.role ?? "")}>
                  <Link href={`/first-pick/${tab}?champ=${x.id}${x.role ? `&role=${x.role}` : ""}`} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}>
                    <ChampIcon id={x.id} name={x.label} role={listRole(x)} size="md" />
                    <span className="rail-text"><span className="rail-name">{x.label}</span><span className="rail-sub">{x.sub}</span></span>
                  </Link>
                </li>
              );
            })}
            {!shown.length && <li className="rail-empty">No picks match “{query}”.</li>}
          </ul>
        </nav>
        <div>
          {selected && selectedId && (
            // Champions in the report: hover for the quick card (relation to the selected pick), click for the drawer.
            <ChampionProvider data={drawerData} focus={{ id: selectedId, role: selectedRole! }}>
              <ScoutingReport item={selected} names={names} sources={sources} events={events} draftLabels={draftLabels} />
            </ChampionProvider>
          )}
        </div>
      </div>
    </>
  );
}
