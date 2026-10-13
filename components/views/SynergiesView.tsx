"use client";
import { ProFreshness } from "@/components/ProFreshness";
import type { Freshness } from "@/lib/pro-games";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChampIcon } from "@/components/ChampIcon";
import { ChampionProvider } from "@/components/ChampionInteraction";
import type { DrawerContext } from "@/lib/drawer";
const SYNERGIES: DrawerContext = { page: "synergies" };
import type { CardRecord } from "@/components/PairingCard";
import { ScoutingReport } from "@/components/ScoutingReport";
import type { DrawerData } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import type { EventMap } from "@/lib/evidence";
import { TAB_ROLE, TABS, type Tab } from "./synergy-tabs";
import { noteSynergiesRole } from "@/lib/synergy-nav";
import { poolTierRank, sortBotPicks, sortMidJunglePicks } from "@/lib/synergy-order";
import { proGames } from "@/lib/pool-stats";
import { proposedCard, proposedPartners, shownPartners } from "@/lib/proposed";
import { buildsHref } from "@/lib/pro-builds";
import { TopUsageReport } from "@/components/TopDraft";
import { TopRailTools, topRail, useTopScope } from "@/components/TopRail";
import { poolTier, tierLabel } from "@/lib/counters";
import type { TopDraftBundle } from "@/lib/top-draft";
import type { BotPairing, CompShell, MetaStat, MidJunglePairing, PoolEntry, Role, Source, TopPick } from "@/lib/schema";

const GRADE_ORDER = ["A", "A-", "B+", "B", "B-", "C+", "C"];
const tierOf = (pool: PoolEntry[], id: string) => { const t = poolTier(pool, id, "TOP"); return t ? `${tierLabel(t)} tier` : undefined; };

export function SynergiesView({ tab, names, sources, events, stats, draftLabels, bot, midJungle, top, pool, drawerData, freshness, shells, topDraft }: {
  drawerData: DrawerData; tab: Tab; names: Record<string, string>; sources: Record<string, Source>; events: EventMap; stats: Record<string, MetaStat & { winRate: number }>;
  draftLabels: Record<string, string>; bot: BotPairing[]; midJungle: MidJunglePairing[]; top: TopPick[]; pool: PoolEntry[]; freshness: Freshness[]; shells: CompShell[];
  topDraft?: TopDraftBundle; // Top tab only: observed draft usage (lib/top-draft.ts)
}) {
  const params = useSearchParams();
  const router = useRouter();
  const champ = params.get("champ") || undefined;
  // Top tab scope and view, all in the URL: patch (26.xx or "all"), event, usage filter, sort, report view.
  const topScope = useTopScope(topDraft, params);
  const [query, setQuery] = useState("");
  const rail = useRef<HTMLUListElement>(null);
  let list: { id: string; label: string; sub: string; proposed?: boolean }[] = [];
  let selected: CardRecord | undefined;
  const records = drawerData.proposed;
  // Every champion who plays the tab's role and has no saved record gets a profile from the proposed layer (alan,
  // 2026-10-10: "select practically any League champion"). Saved records stay first, in their pool-tier order.
  const games = useMemo(() => proGames({ meta: drawerData.meta, proDrafts: drawerData.proDrafts, botPairings: drawerData.botPairings, sources: drawerData.sources }), [drawerData]);
  const proposedRows = (role: Role, has: (id: string) => boolean) => drawerData.champions
    .filter((c) => !c.rosterOnly && c.roles.includes(role) && !has(c.id))
    .sort((a, b) => poolTierRank(pool, role, a.id) - poolTierRank(pool, role, b.id) || a.name.localeCompare(b.name))
    .map((c) => {
      const pref = proposedPartners(records, c.id, role).filter((l) => !l.reverse && l.tier === "preferred");
      const first = pref.filter((l) => l.role === pref[0]?.role);
      return { id: c.id, label: names[c.id], proposed: true, sub: `Proposed${first.length ? ` · ${first.map((l) => names[l.id]).join(" / ")}` : ""}` };
    });
  const profile = (id: string, role: Role): CardRecord => proposedCard(id, role, records, drawerData);
  if (tab === "bot") {
    const rows = sortBotPicks(bot, pool, names);
    list = [...rows.map((r) => ({ id: r.champion, label: names[r.champion], sub: r.clashDefault.map((s) => names[s]).join(" / ") })),
      ...proposedRows("BOT", (id) => rows.some((r) => r.champion === id))];
    const id = champ ?? list[0].id;
    const r = rows.find((x) => x.champion === id);
    if (r) selected = { kind: "bot", record: r };
    else if (list.some((x) => x.id === id)) selected = profile(id, "BOT");
  } else if (tab === "support") {
    list = proposedRows("SUPPORT", () => false).map((x) => {
      const saved = bot.filter((b) => b.clashDefault.includes(x.id)).map((b) => names[b.champion]);
      return saved.length ? { ...x, sub: `Saved with ${saved.slice(0, 3).join(" / ")}${saved.length > 3 ? ` +${saved.length - 3}` : ""}` } : x;
    });
    const id = champ ?? list[0].id;
    if (list.some((x) => x.id === id)) selected = profile(id, "SUPPORT");
  } else if (tab === "mid" || tab === "jungle") {
    // Each role keeps its own records: a mid's profile lists jungle partners and the reverse (alan, 2026-10-12).
    const tabRole = TAB_ROLE[tab];
    const rows = sortMidJunglePicks(midJungle, pool, names).filter((r) => r.role === tabRole);
    list = [...rows.map((r) => ({ id: r.anchor, label: names[r.anchor], sub: `${r.clashDefault.map((s) => names[s]).join(" / ")}${r.status === "downgraded" ? " · downgraded" : ""}` })),
      ...proposedRows(tabRole, (id) => rows.some((r) => r.anchor === id))];
    const id = champ ?? list[0].id;
    const r = rows.find((x) => x.anchor === id);
    if (r) selected = { kind: "mid-jungle", record: r };
    else if (list.some((x) => x.id === id)) selected = profile(id, tabRole);
  } else {
    const rows = [...top].sort((a, b) => GRADE_ORDER.indexOf(a.blindGrade) - GRADE_ORDER.indexOf(b.blindGrade));
    // Saved records first (by saved grade), then every other top laner; observed usage replaces the old pick count.
    const base = [...rows.map((r) => ({ id: r.champion, label: names[r.champion], sub: "" })), ...proposedRows("TOP", (id) => rows.some((r) => r.champion === id))];
    const grade = (id: string) => rows.find((r) => r.champion === id)?.blindGrade;
    list = topScope ? topRail(base, topScope, grade) : base;
    const id = champ ?? list[0]?.id ?? base[0].id;
    const r = rows.find((x) => x.champion === id);
    if (r) selected = { kind: "top", record: r, stats: stats[r.champion] };
    else if (base.some((x) => x.id === id)) selected = profile(id, "TOP");
  }
  const selectedId = selected ? (selected.kind === "proposed" ? selected.id : "champion" in selected.record ? selected.record.champion : selected.record.anchor) : undefined;

  const selectedRole: Role | undefined = selected && TAB_ROLE[tab];
  const isSelected = (x: { id: string }) => x.id === selectedId;
  // Proposed partners shown under a saved record too (a jungler's top partners, for example), and pro games for the
  // proposed pairs (evidence only).
  const extra = selected && selected.kind !== "proposed" && selectedId && selectedRole ? shownPartners(records, selectedId, selectedRole, bot) : [];
  const myGames = selectedId && selectedRole ? games.filter((g) => g.picks[selectedRole] === selectedId) : [];
  const proCount = (partner: string, partnerRole: Role) => myGames.filter((g) => g.picks[partnerRole] === partner).length;
  // The tab on screen is the role being researched: the sidebar's Synergies link comes back here (lib/synergy-nav.ts).
  useEffect(() => { noteSynergiesRole(TAB_ROLE[tab]); }, [tab]);
  const q = query.trim().toLowerCase();
  const shown = q ? list.filter((x) => `${x.label} ${x.sub}`.toLowerCase().includes(q)) : list;
  // Keep the selected pick in view inside the rail (without scrolling the page) when arriving from a link.
  useEffect(() => {
    const ul = rail.current, el = ul?.querySelector<HTMLElement>("a.active");
    if (ul && el && (el.offsetTop < ul.scrollTop || el.offsetTop + el.offsetHeight > ul.scrollTop + ul.clientHeight)) ul.scrollTop = el.offsetTop - ul.clientHeight / 3;
  }, [selectedId, tab]);
  const buildsLink = selectedId && selectedRole && drawerData.builds.some((b) => b.champion === selectedId && b.role === selectedRole) ? buildsHref(selectedId, selectedRole) : undefined;
  const draftHref = selectedId && selectedRole ? `/?${selectedRole.toLowerCase()}=${selectedId}` : undefined;

  return (
    <>
      <PageHeader title="Champion Synergies"
        actions={draftHref && <>
          {buildsLink && <Link className="btn sm" href={buildsLink}>Pro builds →</Link>}
          <Link className="btn primary sm" href={draftHref}>Open in Draft Room →</Link>
        </>} />
      <ProFreshness items={freshness} />
      <nav className="tabs" aria-label="Roles">
        {(Object.keys(TABS) as Tab[]).map((t) => <Link key={t} href={`/synergies/${t}`} className={t === tab ? "active" : undefined} aria-current={t === tab ? "page" : undefined}>{TABS[t]}</Link>)}
      </nav>
      <div className="split">
        <nav className="pick-rail" aria-label={`${TABS[tab]} champions`}>
          <input type="search" placeholder="Search champions or partners" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search champions" />
          {topScope && <TopRailTools scope={topScope} set={(k, v) => router.replace(topScope.href({ [k]: v }), { scroll: false })} />}
          <ul ref={rail}>
            {shown.map((x) => {
              const active = isSelected(x);
              return (
                <li key={x.id} className={x.proposed ? "proposed" : undefined}>
                  <Link href={topScope ? topScope.href({ champ: x.id }) : `/synergies/${tab}?champ=${x.id}`} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}>
                    <ChampIcon id={x.id} name={x.label} role={TAB_ROLE[tab]} size="md" />
                    <span className="rail-text"><span className="rail-name">{x.label}</span><span className="rail-sub">{x.sub}</span></span>
                  </Link>
                </li>
              );
            })}
            {!shown.length && <li className="rail-empty">No champions match “{query}”.</li>}
          </ul>
        </nav>
        <div>
          {selected && selectedId && (
            // Champions in the report: hover for the quick card (relation to the selected pick), click for the drawer.
            <ChampionProvider data={drawerData} focus={{ id: selectedId, role: selectedRole! }} context={SYNERGIES}>
              {topScope && topDraft ? (
                <TopUsageReport id={selectedId} row={topScope.rows.find((r) => r.champion === selectedId)} prio={topScope.prio[selectedId]} bundle={topDraft} names={names}
                  view={topScope.view} setView={(v) => router.replace(topScope.href({ view: v === "overview" ? undefined : v }), { scroll: false })}
                  scopeLabel={topScope.label}
                  saved={selected.kind === "top" ? { grade: selected.record.blindGrade, tier: tierOf(pool, selectedId), gives: selected.record.logic.gives, avoid: selected.record.logic.avoid } : undefined}
                  logic={topDraft.blind[selectedId] ?? []}
                  synergies={<ScoutingReport item={selected} names={names} sources={sources} events={events} draftLabels={draftLabels} proposed={extra} proCount={proCount} games={myGames} bot={bot} shells={shells} only="synergy" />}
                  proEvidence={<ScoutingReport item={selected} names={names} sources={sources} events={events} draftLabels={draftLabels} proposed={extra} proCount={proCount} games={myGames} bot={bot} shells={shells} only="pro" />} />
              ) : (
                <ScoutingReport item={selected} names={names} sources={sources} events={events} draftLabels={draftLabels}
                  proposed={extra} proCount={proCount} games={myGames} bot={bot} shells={shells} />
              )}
            </ChampionProvider>
          )}
        </div>
      </div>
    </>
  );
}
