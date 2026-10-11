"use client";
import { ProFreshness } from "@/components/ProFreshness";
import type { Freshness } from "@/lib/pro-games";
import { useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import { ChampionProvider } from "@/components/ChampionInteraction";
import { Disclosure } from "@/components/Disclosure";
import { Select } from "@/components/Select";
import type { DrawerData } from "@/lib/data";
import { ChampionRow, ChipList, LayerBlock, PageHeader, SectionHeader, SourceLinks, pct } from "@/components/ui";
import { describeLine, groupObserved, shortDate, type EventMap } from "@/lib/evidence";
import { PARTNER_ROLE, SORTS, TIERS, allRoles, poolRows, presenceOf, roleShare, roleUnconfirmed, sortRows, type PoolInput, type PoolRow, type SortKey, type Tier } from "@/lib/pool-stats";
import { handAlts } from "@/lib/pro-alternatives";
import { shownPartners } from "@/lib/proposed";
import { ProposedGroups, ProposedTag } from "@/components/ProposedSynergy";
import { ROLES, type BotPairing, type MidJunglePairing, type ObservedPairing, type ProposedRecord, type Role, type TopPick } from "@/lib/schema";

const TIER_LABEL = Object.fromEntries(TIERS) as Record<Tier, string>;
const DASH = <span className="faint">—</span>;

export function PoolView({ names, data, bot, midJungle, top, proposed, freshness, drawerData }: {
  names: Record<string, string>; data: PoolInput; bot: BotPairing[]; midJungle: MidJunglePairing[]; top: TopPick[]; proposed: ProposedRecord[]; freshness: Freshness[]; drawerData: DrawerData;
}) {
  // Filters live in the URL so a view can be shared; window.location keeps the GitHub Pages base path.
  const initial = useSearchParams();
  const [params, setParams] = useState(() => new URLSearchParams(initial.toString()));
  const get = (k: string) => params.get(k) || undefined;
  const set = (k: string, v: string | undefined) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next);
    window.history.replaceState(null, "", `${window.location.pathname}${next.size ? `?${next}` : ""}`);
  };
  const role = get("role") as Role | undefined;
  const tier = get("tier") as Tier | undefined;
  const event = get("event");
  const patch = get("patch");
  const q = (get("q") ?? "").toLowerCase();
  const rawSort = get("sort");
  const sort: SortKey = rawSort && rawSort in SORTS ? (rawSort as SortKey) : "tier";
  // ?champ=id (with ?role=) opens that row, e.g. from the champion drawer's "View in Champion Pool".
  const focus = get("champ");
  const [open, setOpen] = useState<string | undefined>(focus && role ? role + focus : undefined);
  useEffect(() => {
    if (focus && role) document.getElementById(`pool-${role}-${focus}`)?.scrollIntoView({ block: "center" });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const events = data.meta.events;
  const eventMap: EventMap = useMemo(() => Object.fromEntries(events.map((e) => [e.id, e])), [events]);
  const patches = [...new Set(events.map((e) => e.patch))].sort().reverse();
  const all = useMemo(() => poolRows(data, { event, patch }), [data, event, patch]);
  const rows = sortRows(all.filter((r) => (!role || r.role === role) && (!tier || r.tier === tier)
    && (!q || (names[r.id] ?? r.id).toLowerCase().includes(q))), sort);
  const ongoing = events.filter((e) => e.status === "ongoing");

  const sortHead = (k: SortKey, label: string, num = true, cls = "") => (
    <th className={`${num ? "num" : ""} ${cls}`.trim() || undefined}><button className={`sort ${sort === k ? "active" : ""}`} aria-sort={sort === k ? "descending" : undefined}
      onClick={() => set("sort", k === "tier" ? undefined : k)}>{label}{sort === k ? " ↓" : ""}</button></th>
  );

  return (
    <ChampionProvider data={drawerData}>
      <PageHeader title="Champion Pool" />
      <ProFreshness items={freshness} />
      <div className="toolbar">
        <nav className="seg" aria-label="Role">
          <button className={!role ? "active" : undefined} onClick={() => set("role", undefined)}>All</button>
          {ROLES.map((r) => <button key={r} className={role === r ? "active" : undefined} onClick={() => set("role", r)}><span className={`role-tag role-${r}`}>{r}</span></button>)}
        </nav>
        <Select label="Pool tier" value={tier ?? ""} onChange={(v) => set("tier", v || undefined)}
          options={[{ value: "", label: "All tiers" }, ...TIERS.map(([t, l]) => ({ value: t, label: l }))]} />
        <Select label="Tournament" value={event ?? ""} onChange={(v) => set("event", v || undefined)}
          options={[{ value: "", label: "All tournaments" }, ...events.map((e) => ({ value: e.id, label: `${e.short}${e.status === "ongoing" ? " (ongoing)" : ""}` }))]} />
        <Select label="Patch" value={patch ?? ""} onChange={(v) => set("patch", v || undefined)}
          options={[{ value: "", label: "All patches" }, ...patches.map((p) => ({ value: p, label: p }))]} />
        <input type="search" placeholder="Search" aria-label="Search champions" value={get("q") ?? ""} onChange={(e) => set("q", e.target.value || undefined)} />
        <span className="count">{rows.length} champions</span>
      </div>
      <div className="table-wrap tall pool-table">
        <table>
          <thead><tr>
            <th>Champion</th><th className="hide-sm">Role</th>{sortHead("tier", "Tier", false)}
            {sortHead("picks", "Picks")}{sortHead("bans", "Bans", true, "hide-sm")}{sortHead("presence", "Presence", true, "hide-sm")}{sortHead("winRate", "Win rate")}
            <th className="num hide-sm" title="Games stored in this repo with this champion in this role (not a tournament count)">Recorded</th>
            {sortHead("recency", "Latest", false)}<th className="hide-sm">Patch</th><th className="hide-sm">Last played</th><th className="hide-sm">Top partner</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const key = r.role + r.id;
              const s = r.stat?.stat;
              const pres = r.stat ? presenceOf(r.stat) : null;
              const isOpen = open === key;
              return (
                <Fragment key={key}>
                  <tr id={`pool-${r.role}-${r.id}`} className={`role-${r.role} pool-row ${isOpen ? "open" : ""}`} onClick={() => setOpen(isOpen ? undefined : key)}
                    tabIndex={0} aria-expanded={isOpen} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(isOpen ? undefined : key); } }}>
                    <td><ChampionRow id={r.id} name={names[r.id] ?? r.id} role={r.role} /></td>
                    <td className="hide-sm"><span className={`role-tag role-${r.role}`}>{r.role}</span></td>
                    <td><span className={`tier ${r.tier}`}>{TIER_LABEL[r.tier]}</span></td>
                    <td className="num" title={r.stat && !event ? `${r.stat.event.short} ${r.stat.event.patch} tournament stats` : undefined}>{s ? <>{s.picks}{s.lowSample && <span className="low" title="Fewer than 5 picks">*</span>}{(roleUnconfirmed(r.stat!, r.role) || allRoles(r.stat!)) && <span className="xs faint" title="Champion-wide tournament total; the source does not split it by role"> all roles</span>}</> : DASH}</td>
                    <td className="num hide-sm">{s?.bans ?? DASH}</td>
                    <td className="num hide-sm">{pres != null ? <span className={`heat ${pres >= 0.3 ? "hi" : ""}`}>{pct(pres)}</span> : DASH}</td>
                    <td className="num">{s?.winRate != null ? pct(s.winRate) : DASH}</td>
                    <td className="num hide-sm">{r.games.length || DASH}</td>
                    <td className="nowrap">{r.latest ? <>{r.latest.eventName}{r.latest.event?.status === "ongoing" && <span className="badge pro ongoing" title="Event still running; numbers are not final">Ongoing</span>}</> : <span className="xs faint">No verified data</span>}</td>
                    <td className="num hide-sm">{r.latest?.patch ?? DASH}</td>
                    <td className="num hide-sm">{shortDate(r.latest?.date) ?? DASH}</td>
                    <td className="hide-sm">{r.partner ? <span className="nowrap">{names[r.partner.id] ?? r.partner.id} <span className="xs muted tnum">{r.partner.games}×</span></span> : DASH}</td>
                  </tr>
                  {isOpen && (
                    <tr className="pool-detail"><td colSpan={12}>
                      <Detail row={r} names={names} data={data} eventMap={eventMap} bot={bot} midJungle={midJungle} top={top} proposed={proposed} />
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <Disclosure summary="How these numbers work">
        <p>
          Picks, bans, presence and win rate are full-tournament stats (bans and presence are champion-wide), shown for the role
          the champion is listed under; with All tournaments each row uses its newest tournament. Recorded counts games stored
          here and never feeds those numbers. * is fewer than 5 picks.
          {ongoing.length > 0 && ` ${ongoing.map((e) => e.short).join(", ")} is ongoing, so its numbers are not final.`}
        </p>
      </Disclosure>

      <SectionHeader title="What changed, by role" />
      <div className="pool-changes">
        {data.pool.filter((p) => !role || p.role === role).map((p) => (
          <div key={p.role} className={`pattern role-${p.role}`}>
            <span className={`role-tag role-${p.role}`}>{p.role}</span>
            <p className="small">{p.changed}</p>
            <SourceLinks ids={p.sources} sources={data.sources} />
          </div>
        ))}
      </div>
    </ChampionProvider>
  );
}

function Detail({ row: r, names, data, eventMap, bot, midJungle, top, proposed }: {
  row: PoolRow; names: Record<string, string>; data: PoolInput; eventMap: EventMap; bot: BotPairing[]; midJungle: MidJunglePairing[]; top: TopPick[]; proposed: ProposedRecord[];
}) {
  const props = shownPartners(proposed, r.id, r.role, bot);
  const partnerRole = PARTNER_ROLE[r.role];
  // alan's saved pairings for this champion in this role (Synergy layer).
  let saved: { label: string; ids: string[]; role: Role }[] = [];
  let observed: ObservedPairing[] = [];
  if (r.role === "BOT") {
    const b = bot.find((x) => x.champion === r.id);
    if (b) { saved = [{ label: "Preferred", ids: b.clashDefault, role: "SUPPORT" }, { label: "Alternatives", ids: handAlts(b), role: "SUPPORT" }, { label: "From pro games", ids: b.proAlternatives ?? [], role: "SUPPORT" }]; observed = b.observedProPairings; }
  } else if (r.role === "SUPPORT") {
    saved = [{ label: "Preferred with", ids: bot.filter((b) => b.clashDefault.includes(r.id)).map((b) => b.champion), role: "BOT" },
      { label: "Alternative for", ids: bot.filter((b) => b.alternatives.includes(r.id)).map((b) => b.champion), role: "BOT" }];
    observed = bot.flatMap((b) => b.observedProPairings.filter((o) => o.champion === r.id).map((o) => ({ ...o, champion: b.champion })));
  } else if (r.role === "TOP") {
    const t = top.find((x) => x.champion === r.id);
    if (t) { saved = [{ label: "Jungle", ids: t.surrounding.jungle, role: "JUNGLE" }, { label: "Mid", ids: t.surrounding.mid, role: "MID" }]; observed = t.observedProPairings; }
  } else {
    const m = midJungle.find((x) => x.anchor === r.id && x.role === r.role);
    if (m) { saved = [{ label: "Primary", ids: m.clashDefault, role: partnerRole }, { label: "Secondary", ids: handAlts(m), role: partnerRole }, { label: "From pro games", ids: m.proAlternatives ?? [], role: partnerRole }]; observed = m.observedProPairings; }
  }
  const withGames = r.stats.map((s) => s.event.id);
  const gameEvents = [...new Set(r.games.map((g) => g.event?.id).filter((x): x is string => !!x && !withGames.includes(x)))];
  return (
    <div className="pool-detail-grid">
      <LayerBlock layer="clash" title="My pool">
        <dl className="kv">
          <dt>Tier</dt><dd className="small">{TIER_LABEL[r.tier]}{r.reason && <span className="muted"> · {r.reason}</span>}</dd>
          {saved.filter((s) => s.ids.length || s.label !== "From pro games").map((s) => <Fragment key={s.label}><dt>{s.label}</dt><dd><ChipList ids={s.ids} names={names} role={s.role} empty="none saved" /></dd></Fragment>)}
          {!saved.length && <><dt>Synergy</dt><dd className="small muted">No saved pairing record for this role.</dd></>}
        </dl>
        {props.length > 0 && (
          <div className="pool-proposed">
            <div className="xs muted detail-label">Proposed synergy <ProposedTag /></div>
            <ProposedGroups links={props} names={names} compact proCount={(p, pr) => r.games.filter((g) => g.picks[pr] === p).length} />
          </div>
        )}
      </LayerBlock>
      <LayerBlock layer="pro" title="Pro evidence">
        <div className="xs muted detail-label" title="Gol.gg tournament totals, not counted from the games stored here">Tournament stats</div>
        {r.stats.length ? (
          <table className="mini">
            <thead><tr><th>Tournament</th><th className="num">Patch</th><th className="num">Games</th><th className="num">Picks</th><th className="num" title="Champion-wide">Bans</th><th className="num" title="(picks + bans) / tournament games">Pres.</th><th className="num">WR</th><th>Roles</th><th>Source</th></tr></thead>
            <tbody>
              {r.stats.map((x) => { const { event: e, stat: s } = x, pres = presenceOf(x); return (
                <tr key={e.id}>
                  <td className="nowrap">{e.short}{e.status === "ongoing" && <span className="badge pro ongoing">Ongoing</span>}</td>
                  <td className="num">{e.patch}</td><td className="num">{e.games ?? "—"}</td><td className="num">{s.picks}</td><td className="num">{s.bans ?? "—"}</td>
                  <td className="num">{pres != null ? pct(pres) : "—"}</td><td className="num">{pct(s.winRate)}</td>
                  <td className="xs nowrap">{roleShare(s) ?? "—"}</td>
                  <td>{s.sources.length ? <SourceLinks ids={s.sources} sources={data.sources} /> : <span className="xs faint" title={s.note}>provided, no page yet</span>}</td>
                </tr>
              ); })}
            </tbody>
          </table>
        ) : <p className="xs muted">No tournament stats for {names[r.id]} {r.role.toLowerCase()}{gameEvents.length ? ` (${gameEvents.map((id) => eventMap[id].short).join(", ")} has recorded games only)` : ""}.</p>}
        {r.stats.length > 0 && gameEvents.length > 0 && <p className="xs faint">{gameEvents.map((id) => eventMap[id].short).join(", ")}: recorded games only, no tournament stats.</p>}
        {r.games.length > 0 && (
          <>
            <div className="xs muted detail-label" title="Drafts and game pages stored in this repo">Recorded games · {r.games.length} ({r.role.toLowerCase()})</div>
            {r.games.slice(0, 6).map((g) => {
              const p = g.picks[partnerRole];
              return (
                <div key={g.key} className="obs-row">
                  <span className="small nowrap">{g.label}</span>
                  <span className="badge pro tnum">{describeLine({ games: 0, label: g.eventName, patch: g.patch, date: g.date })}</span>
                  {p && <span className="ctx">with {names[p] ?? p}</span>}
                  {g.pending && <span className="badge plain">pending refresh</span>}
                  <SourceLinks ids={g.sources} sources={data.sources} />
                </div>
              );
            })}
            {r.games.length > 6 && <p className="xs faint">+{r.games.length - 6} older</p>}
          </>
        )}
        {observed.length > 0 && (
          <>
            <div className="xs muted detail-label">Observed pairings</div>
            {groupObserved(observed, eventMap, data.sources).slice(0, 5).map((g) => (
              <div key={g.champion} className="obs-row">
                <span className="small nowrap"><b>{names[g.champion] ?? g.champion}</b></span>
                {g.lines.map((l, i) => <span key={i} className={`badge ${i ? "plain" : "pro"} tnum`}>{describeLine(l)}</span>)}
              </div>
            ))}
          </>
        )}
      </LayerBlock>
    </div>
  );
}
