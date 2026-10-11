"use client";
import { useSearchParams } from "next/navigation";
import { Fragment, useMemo, useState } from "react";
import type { DrawerData } from "@/lib/data";
import { ChampionProvider, InteractiveChampion } from "@/components/ChampionInteraction";
import { Disclosure } from "@/components/Disclosure";
import { Select } from "@/components/Select";
import { ChampIcon, LayerBlock, PageHeader, SectionHeader, SourceBadge, SourceLinks, pct } from "@/components/ui";
import { shortDate } from "@/lib/evidence";
import {
  HUB_SORTS, comparison, eventSummary, hubData, pairings, recentDrafts, roleRows, sortRoleRows, trending,
  type HubInput, type HubSort, type Pairing, type RoleRow, type RoleTab,
} from "@/lib/meta-hub";
import { allRoles, presenceOf, roleShare } from "@/lib/pool-stats";
import { ROLES, type PoolEntry, type Role, type Rule, type Source } from "@/lib/schema";

const DASH = <span className="faint">—</span>;

export function MetaView({ names, sources, input, pool, rules, drawerData }: {
  names: Record<string, string>; sources: Record<string, Source>; input: HubInput; pool: PoolEntry[]; rules: Rule[]; drawerData: DrawerData;
}) {
  // View state lives in the URL so it can be shared; window.location keeps the GitHub Pages base path.
  const initial = useSearchParams();
  const [params, setParams] = useState(() => new URLSearchParams(initial.toString()));
  const get = (k: string) => params.get(k) || undefined;
  const set = (k: string, v: string | undefined) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next);
    window.history.replaceState(null, "", `${window.location.pathname}${next.size ? `?${next}` : ""}`);
  };
  const hub = useMemo(() => hubData(input), [input]);
  // Scope: one tournament at a time, newest by default, so 16.16 and 16.18 numbers are never mixed silently.
  // "All tournaments" is an explicit choice (?event=all); each row then names the tournament its stats come from.
  const allMode = get("event") === "all";
  const eventId = allMode ? undefined : hub.events.find((e) => e.id === get("event"))?.id ?? hub.events[0]?.id;
  // ALL lists every champion in scope, including those no source or recorded game places in a role.
  const rawRole = get("role");
  const role: RoleTab = rawRole === "ALL" || (ROLES as readonly string[]).includes(rawRole ?? "") ? (rawRole as RoleTab) : "MID";
  const tabRole = role === "ALL" ? undefined : role;
  const selected = eventId ? hub.events.filter((e) => e.id === eventId) : hub.events;
  // Presence is the useful default where the event has it; otherwise newest evidence first.
  const hasPresence = hub.stats.some((s) => (!eventId || s.event.id === eventId) && presenceOf(s) != null);
  const rawSort = get("sort");
  const sort: HubSort = rawSort && rawSort in HUB_SORTS ? (rawSort as HubSort) : hasPresence ? "presence" : "recency";
  const [openKey, setOpenKey] = useState<string>();
  const toggle = (k: string) => setOpenKey((o) => (o === k ? undefined : k));

  const rows = sortRoleRows(roleRows(hub, role, eventId), sort);
  const trend = trending(hub);
  const compare = comparison(hub, tabRole);
  const bot = pairings(hub, "BOT", "SUPPORT", eventId);
  const midJg = pairings(hub, "MID", "JUNGLE", eventId);
  const drafts = recentDrafts(hub, eventId);

  const Champ = ({ id, r, size = "sm" }: { id: string; r?: Role; size?: "xs" | "sm" | "md" }) => (
    <InteractiveChampion id={id} role={r} className="champ-link">
      <ChampIcon id={id} name={names[id] ?? id} role={r} size={size} /><span>{names[id] ?? id}</span>
    </InteractiveChampion>
  );
  const sortHead = (k: HubSort, cls = "") => (
    <th className={`num ${cls}`.trim()}><button className={`sort ${sort === k ? "active" : ""}`} aria-sort={sort === k ? "descending" : undefined}
      onClick={() => set("sort", k)}>{HUB_SORTS[k]}{sort === k ? " ↓" : ""}</button></th>
  );

  return (
    <ChampionProvider data={drawerData}>
    <div className="meta-hub">
      <PageHeader title="Meta / Research" />

      {/* 1. Current meta */}
      <div className="toolbar hub-tools">
        <Select label="Tournament" value={allMode ? "all" : eventId ?? ""} onChange={(v) => set("event", v === hub.events[0]?.id ? undefined : v)}
          options={[...hub.events.map((e, i) => ({ value: e.id, label: `${e.name}${i === 0 ? " (current)" : ""}` })), { value: "all", label: "All tournaments" }]} />
      </div>
      <div className="table-wrap hub-events">
        <table>
          <thead><tr><th>Tournament</th><th className="num">Patch</th><th className="hide-sm">Dates</th><th>Status</th><th className="num" title="Total games played in the tournament">Games</th><th className="num" title="Games stored in this repo">Recorded</th><th className="num hide-sm">Champions</th><th className="hide-sm">Freshness</th></tr></thead>
          <tbody>
            {hub.events.map((e) => {
              const s = eventSummary(hub, e, sources);
              return (
                <tr key={e.id} className={e.id === eventId ? "selected" : undefined}>
                  <td className="nowrap"><b>{e.short}</b> <span className="xs muted hide-sm">{e.name}</span></td>
                  <td className="num">{e.patch}</td>
                  <td className="hide-sm nowrap">{e.startDate ? `${shortDate(e.startDate)}–${shortDate(e.endDate)}` : DASH}</td>
                  <td>{e.status === "ongoing" ? <span className="badge pro">Ongoing</span> : <span className="xs muted">Completed</span>}</td>
                  <td className="num">{e.games ?? DASH}</td>
                  <td className="num">{s.recordedGames}</td>
                  <td className="num hide-sm">{s.champions}</td>
                  <td className="xs muted hide-sm nowrap" title={s.refreshed ? "Source pages re-read" : s.providedOn ? `Totals provided ${shortDate(s.providedOn)}; source pages not re-read yet` : "Source pages not re-read since import"}>{s.refreshed ? "Refreshed" : s.providedOn ? `Provided ${shortDate(s.providedOn)}` : "Not refreshed"} <SourceLinks ids={e.sources.slice(0, 1)} sources={sources} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {selected.some((e) => e.notes.length) && (
        <Disclosure summary={`Tournament notes (${selected.reduce((n, e) => n + e.notes.length, 0)})`}>
          <ul className="hub-notes">
            {selected.flatMap((e) => e.notes.map((n) => (
              <li key={e.id + n.topic} className="small"><b>{n.topic}</b> <span className="xs faint">{e.short}</span> {n.note} <SourceLinks ids={n.sources} sources={sources} /></li>
            )))}
          </ul>
        </Disclosure>
      )}

      {/* 2. Role table */}
      <SectionHeader title="By role" meta={eventId ? `${selected[0].short} ${selected[0].patch} only` : "All tournaments: each row's stats name their tournament"} />
      <div className="toolbar">
        <nav className="seg scroll" aria-label="Role">
          {ROLES.map((r) => <button key={r} className={role === r ? "active" : undefined} onClick={() => set("role", r)}><span className={`role-tag role-${r}`}>{r}</span></button>)}
          <button className={role === "ALL" ? "active" : undefined} onClick={() => set("role", "ALL")} title="Every champion in this scope, with or without role evidence">ALL</button>
        </nav>
        <span className="count">{rows.length} champions</span>
      </div>
      <Disclosure summary="How these numbers work">
        <p>Picks, bans, presence and win rate are full-tournament stats; Recorded counts the games stored here and never feeds them. Presence is priority, not win rate, computed as (picks + bans) / tournament games. Picks, bans and win rate are champion-wide totals across all roles; a champion appears under a role only when its source or a recorded game shows that role{role === "ALL" ? "" : "; ALL lists everyone"}. * is fewer than 5 picks. Pro evidence only; it never changes saved pairings.</p>
      </Disclosure>
      <div className="table-wrap tall hub-table">
        <table>
          <thead><tr>
            <th>Champion</th>{role === "ALL" && <th className="hide-sm" title="Roles named by the source or shown in recorded games">Roles</th>}{sortHead("picks")}{sortHead("bans", "hide-sm")}{sortHead("presence")}{sortHead("winRate")}
            <th className="num hide-sm" title={`Games stored in this repo with this champion${role === "ALL" ? "" : " in this role"} (not a tournament count)`}>Recorded</th>
            <th className="hide-sm" title="Verified tournament picks per role">Role share</th>
            {allMode && <th className="hide-sm">Stats from</th>}
            <th><button className={`sort ${sort === "recency" ? "active" : ""}`} onClick={() => set("sort", "recency")}>Latest{sort === "recency" ? " ↓" : ""}</button></th>
            <th className="num hide-sm">Patch</th><th className="num hide-sm">Last played</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const s = r.stat?.stat, pres = r.stat ? presenceOf(r.stat) : null;
              const k = `role-${r.role ?? "ALL"}-${r.id}`, open = openKey === k;
              const flex = r.role && r.stat && allRoles(r.stat);
              return (
                <Fragment key={r.id}>
                  <tr className={`${r.role ? `role-${r.role} ` : ""}click-row ${open ? "open" : ""}`} onClick={() => toggle(k)} tabIndex={0} aria-expanded={open}
                    onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggle(k); } }}>
                    <td><Champ id={r.id} r={r.role ?? r.roles[0]} /></td>
                    {role === "ALL" && <td className="hide-sm nowrap">{r.roles.length ? r.roles.map((x, i) => <Fragment key={x}>{i > 0 && " "}<span className={`role-tag role-${x}`}>{x}</span></Fragment>) : <span className="faint" title="Neither the source nor a recorded game shows a role">—</span>}</td>}
                    <td className="num">{s ? <>{s.picks}{s.lowSample && <span className="low" title="Fewer than 5 picks">*</span>}{flex && <span className="xs faint" title={`Champion-wide: played as ${r.stat!.roles.join(" / ")}; picks are not split by role`}> all roles</span>}</> : DASH}</td>
                    <td className="num hide-sm" title="Champion-wide: a ban has no role">{s?.bans ?? DASH}</td>
                    <td className="num">{pres != null ? <span className={pres >= 0.3 ? "heat-hi" : undefined}>{pct(pres)}</span> : DASH}</td>
                    <td className="num">{s?.winRate != null ? pct(s.winRate) : DASH}</td>
                    <td className="num hide-sm">{r.games.length || DASH}</td>
                    <td className="hide-sm nowrap tnum">{s ? roleShare(s) ?? DASH : DASH}</td>
                    {allMode && <td className="hide-sm nowrap">{r.stat ? `${r.stat.event.short} ${r.stat.event.patch}` : DASH}</td>}
                    <td className="nowrap">{r.latest ? <>{r.latest.eventName}{r.latest.event?.status === "ongoing" && <span className="badge pro ongoing">Ongoing</span>}</> : DASH}</td>
                    <td className="num hide-sm">{r.latest?.patch ?? DASH}</td>
                    <td className="num hide-sm">{shortDate(r.latest?.date) ?? DASH}</td>
                  </tr>
                  {open && <tr className="hub-detail"><td colSpan={10 + Number(allMode) + Number(role === "ALL")}><RowDetail r={r} names={names} sources={sources} /></td></tr>}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 3. Trending */}
      <SectionHeader title="Trending" meta={trend.newer && trend.older ? `${trend.older.short} ${trend.older.patch} → ${trend.newer.short} ${trend.newer.patch}` : undefined} />
      {trend.blocked ? <p className="xs muted">Not enough comparable data: {trend.blocked}</p> : (
        <div className="trend-grid">
          <div><div className="xs muted">Rising</div>{trend.rising.length ? trend.rising.map((t) => <div key={t.id + t.role} className="small tnum">↑ <Champ id={t.id} r={t.role} size="xs" /> {t.role} <span className="muted">{pct(t.from)} → {pct(t.to)}</span></div>) : <p className="xs faint">None</p>}</div>
          <div><div className="xs muted">Falling</div>{trend.falling.length ? trend.falling.map((t) => <div key={t.id + t.role} className="small tnum">↓ <Champ id={t.id} r={t.role} size="xs" /> {t.role} <span className="muted">{pct(t.from)} → {pct(t.to)}</span></div>) : <p className="xs faint">None</p>}</div>
        </div>
      )}

      {/* 4. Tournament comparison */}
      <SectionHeader title="Tournament comparison" meta={`${role} · tournament picks · recorded games`} />
      <div className="table-wrap hub-table mid">
        <table>
          <thead><tr><th>Champion</th>{hub.events.map((e) => <th key={e.id} className="num">{e.short} {e.patch}</th>)}<th>Seen in</th></tr></thead>
          <tbody>
            {compare.map((c) => (
              <tr key={c.id + c.role} className={`role-${c.role}`}>
                <td><Champ id={c.id} r={c.role} /></td>
                {hub.events.map((e) => {
                  const x = c.cells[e.id];
                  return <td key={e.id} className="num">{x ? <>{x.picks != null ? `${x.picks} picks` : "—"}{x.presence != null ? <span className="xs muted"> · {pct(x.presence)}</span> : ""}<span className="faint"> · {x.games} rec.</span></> : DASH}</td>;
                })}
                <td className="xs">{c.seenIn.length === hub.events.length ? <b>Both</b> : <span className="muted">{c.seenIn.map((id) => hub.events.find((e) => e.id === id)?.short).join(", ")} only</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 5–6. Pairings */}
      <PairingTable title="Bot lane pairings" a="BOT" b="SUPPORT" list={bot} openKey={openKey} toggle={toggle} Champ={Champ} sources={sources} />
      <PairingTable title="Mid + jungle pairings" a="MID" b="JUNGLE" list={midJg} openKey={openKey} toggle={toggle} Champ={Champ} sources={sources} />

      {/* 7. Recent drafts */}
      <SectionHeader title="Recent drafts" meta={`${drafts.length} games`} />
      <div className="table-wrap hub-table mid">
        <table>
          <thead><tr><th>Teams</th><th className="hide-sm">Date</th><th>Tournament</th><th className="num hide-sm">Patch</th><th>Picks</th></tr></thead>
          <tbody>
            {drafts.map((g) => {
              const k = `draft-${g.key}`, open = openKey === k;
              return (
                <Fragment key={g.key}>
                  <tr className={`click-row ${open ? "open" : ""}`} onClick={() => toggle(k)} tabIndex={0} aria-expanded={open}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(k); } }}>
                    <td className="nowrap">{g.sides[0].team && g.sides[0].opponent ? <>{g.sides[0].team} <span className="faint">vs</span> {g.sides[0].opponent}</> : g.sides[0].label}</td>
                    <td className="hide-sm nowrap">{shortDate(g.date) ?? DASH}</td>
                    <td className="nowrap">{g.eventName}{g.event?.status === "ongoing" && <span className="badge pro ongoing">Ongoing</span>}</td>
                    <td className="num hide-sm">{g.patch ?? DASH}</td>
                    <td>
                      {g.sides.map((s) => (
                        <span key={s.key} className="draft-icons" title={s.team}>
                          {ROLES.filter((r) => s.picks[r]).map((r) => <ChampIcon key={r} id={s.picks[r]} name={names[s.picks[r]!] ?? s.picks[r]!} role={r} size="xs" />)}
                        </span>
                      ))}
                      {g.partial && <span className="xs faint"> bot lane only</span>}
                    </td>
                  </tr>
                  {open && (
                    <tr className="hub-detail"><td colSpan={5}>
                      {g.sides.map((s) => (
                        <div key={s.key} className="obs-row">
                          <span className="small nowrap"><b>{s.team ?? s.label}</b></span>
                          {ROLES.filter((r) => s.picks[r]).map((r) => <span key={r} className="xs nowrap"><span className={`role-tag role-${r}`}>{r}</span> <Champ id={s.picks[r]!} r={r} size="xs" /></span>)}
                          {s.pending && <span className="badge plain">pending refresh</span>}
                        </div>
                      ))}
                      <SourceLinks ids={g.sources} sources={sources} />
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid cols-2">
        <section>
          <SectionHeader title="What changed (LCK playoffs)" />
          {input.meta.changes.map((c) => <p key={c.topic} className="small"><b>{c.topic}:</b> {c.note}</p>)}
        </section>
        <section>
          <SectionHeader title="Rules" />
          {rules.map((r) => <p key={r.id} className="small rule-line"><SourceBadge layer={r.layer} /> <span>{r.text}</span></p>)}
        </section>
      </div>

    </div>
    </ChampionProvider>
  );
}

function PairingTable({ title, a, b, list, openKey, toggle, Champ, sources }: {
  title: string; a: Role; b: Role; list: Pairing[]; openKey?: string; toggle: (k: string) => void;
  Champ: (p: { id: string; r?: Role; size?: "xs" | "sm" | "md" }) => React.ReactNode; sources: Record<string, Source>;
}) {
  return (
    <>
      <SectionHeader title={title} meta={`${list.length} duos · observed pro evidence`} />
      {!list.length ? <p className="xs muted">No recorded game in this scope shows one.</p> : (
      <div className="table-wrap hub-table mid">
        <table>
          <thead><tr><th>{a === "BOT" ? "Bot" : "Mid"}</th><th>{b === "SUPPORT" ? "Support" : "Jungle"}</th><th className="num" title="Games stored in this repo">Recorded</th><th>Tournament</th><th className="num hide-sm">Patch</th><th className="num hide-sm">Latest</th></tr></thead>
          <tbody>
            {list.map((p) => {
              const k = `${a}-${p.a}-${p.b}`, open = openKey === k;
              return (
                <Fragment key={k}>
                  <tr className={`click-row ${open ? "open" : ""}`} onClick={() => toggle(k)} tabIndex={0} aria-expanded={open}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(k); } }}>
                    <td><Champ id={p.a} r={a} /></td>
                    <td><Champ id={p.b} r={b} /></td>
                    <td className="num">{p.games.length}</td>
                    <td className="nowrap">{p.events.join(", ")}{p.latest.event?.status === "ongoing" && <span className="badge pro ongoing">Ongoing</span>}</td>
                    <td className="num hide-sm">{p.latest.patch ?? "—"}</td>
                    <td className="num hide-sm">{shortDate(p.latest.date) ?? "—"}</td>
                  </tr>
                  {open && (
                    <tr className="hub-detail"><td colSpan={6}>
                      {p.games.map((g) => (
                        <div key={g.key} className="obs-row">
                          <span className="small nowrap">{g.label}</span>
                          <span className="ctx">{[g.eventName, g.patch, shortDate(g.date)].filter(Boolean).join(" · ")}</span>
                          {g.pending && <span className="badge plain">pending refresh</span>}
                          <SourceLinks ids={g.sources} sources={sources} />
                        </div>
                      ))}
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
    </>
  );
}

/** Row detail: where each number comes from. Tournament aggregates and recorded games are listed apart. */
function RowDetail({ r, names, sources }: { r: RoleRow; names: Record<string, string>; sources: Record<string, Source> }) {
  return (
    <div className="hub-detail-grid">
      <LayerBlock layer="pro" title="Tournament stats">
        {r.stats.length ? r.stats.map((x) => {
          const { event: e, stat: s } = x, pres = presenceOf(x);
          return (
            <div key={e.id} className="small tnum hub-scope">
              <b>{e.name}</b> <span className="muted">· {e.patch} · {e.games ? `${e.games} games` : "total games unknown"}</span>
              <div>{s.picks} pick{s.picks === 1 ? "" : "s"}{s.lowSample ? " (low sample)" : ""} · {s.bans ?? "—"} ban{s.bans === 1 ? "" : "s"} (champion-wide) · presence {pres != null ? `${pct(pres)}, computed = (${s.picks} + ${s.bans}) / ${e.games}` : "— (needs bans and total games)"} · {s.winRate != null ? `${pct(s.winRate)} WR` : "no WR (banned only)"} · role share {roleShare(s) ?? "not verified"}</div>
              <div className="xs muted">Tournament aggregate, not counted from recorded games. {s.sources.length ? <SourceLinks ids={s.sources} sources={sources} /> : <span title={s.note}>Reported by alan, no stats page yet.</span>}</div>
            </div>
          );
        }) : <p className="xs muted">No tournament aggregate for {names[r.id] ?? r.id}{r.role ? ` ${r.role.toLowerCase()}` : ""} in this scope, so picks, bans, presence and win rate show —.</p>}
      </LayerBlock>
      <LayerBlock layer="pro" title={`Recorded games · ${r.games.length}`}>
        {r.games.length ? r.games.slice(0, 8).map((g) => (
          <div key={g.key} className="obs-row">
            <span className="small nowrap">{g.label}</span>
            <span className="ctx">{[g.eventName, g.patch, shortDate(g.date)].filter(Boolean).join(" · ")}</span>
            {g.pending && <span className="badge plain">pending refresh</span>}
            <SourceLinks ids={g.sources} sources={sources} />
          </div>
        )) : <p className="xs muted">No games stored for {names[r.id] ?? r.id}{r.role ? ` ${r.role.toLowerCase()}` : ""} in this scope.</p>}
        {r.games.length > 8 && <p className="xs faint">+{r.games.length - 8} older</p>}
      </LayerBlock>
    </div>
  );
}
