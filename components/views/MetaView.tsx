"use client";
import { useSearchParams } from "next/navigation";
import { Fragment, useMemo, useState } from "react";
import { ChampionDrawer } from "@/components/ChampionDrawer";
import { ChampIcon, PageHeader, SectionHeader, SourceBadge, SourceLinks, pct } from "@/components/ui";
import { shortDate } from "@/lib/evidence";
import {
  HUB_SORTS, comparison, eventSummary, hubData, pairings, recentDrafts, roleRows, sortRoleRows, trending,
  type HubInput, type HubSort, type Pairing,
} from "@/lib/meta-hub";
import { ROLES, type MetaEvent, type PoolEntry, type Role, type Rule, type Source } from "@/lib/schema";

const DASH = <span className="faint">—</span>;
const status = (e: MetaEvent) => (e.status === "ongoing" ? "Ongoing" : "Completed");

export function MetaView({ names, sources, input, pool, rules }: {
  names: Record<string, string>; sources: Record<string, Source>; input: HubInput; pool: PoolEntry[]; rules: Rule[];
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
  const eventId = hub.events.some((e) => e.id === get("event")) ? get("event") : undefined;
  const role = (ROLES as readonly string[]).includes(get("role") ?? "") ? (get("role") as Role) : "MID";
  const selected = eventId ? hub.events.filter((e) => e.id === eventId) : hub.events;
  // Presence is the useful default where the event has it; otherwise newest evidence first.
  const hasPresence = hub.stats.some((s) => (!eventId || s.event.id === eventId) && s.stat.presence != null);
  const rawSort = get("sort");
  const sort: HubSort = rawSort && rawSort in HUB_SORTS ? (rawSort as HubSort) : hasPresence ? "presence" : "recency";
  const [drawer, setDrawer] = useState<{ id: string; role?: Role }>();
  const [openKey, setOpenKey] = useState<string>();
  const toggle = (k: string) => setOpenKey((o) => (o === k ? undefined : k));

  const rows = sortRoleRows(roleRows(hub, role, eventId), sort);
  const trend = trending(hub);
  const compare = comparison(hub, role);
  const bot = pairings(hub, "BOT", "SUPPORT", eventId);
  const midJg = pairings(hub, "MID", "JUNGLE", eventId);
  const drafts = recentDrafts(hub, eventId);

  const Champ = ({ id, r, size = "sm" }: { id: string; r?: Role; size?: "xs" | "sm" | "md" }) => (
    <button className="champ-link" onClick={(e) => { e.stopPropagation(); setDrawer({ id, role: r }); }} title={`${names[id] ?? id} details`}>
      <ChampIcon id={id} name={names[id] ?? id} role={r} size={size} /><span>{names[id] ?? id}</span>
    </button>
  );
  const sortHead = (k: HubSort, cls = "") => (
    <th className={`num ${cls}`.trim()}><button className={`sort ${sort === k ? "active" : ""}`} aria-sort={sort === k ? "descending" : undefined}
      onClick={() => set("sort", k)}>{HUB_SORTS[k]}{sort === k ? " ↓" : ""}</button></th>
  );

  return (
    <div className="meta-hub">
      <PageHeader title="Meta / Research" desc="Pick/ban presence is priority, not win rate. * is fewer than 5 picks." />

      {/* 1. Current meta */}
      <div className="toolbar hub-tools">
        <select aria-label="Tournament" value={eventId ?? ""} onChange={(e) => set("event", e.target.value || undefined)}>
          <option value="">All tournaments</option>
          {hub.events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <span className="count">Pro evidence only · never changes saved pairings</span>
      </div>
      <div className="table-wrap hub-events">
        <table>
          <thead><tr><th>Tournament</th><th className="num">Patch</th><th className="hide-sm">Dates</th><th>Status</th><th className="num">Games</th><th className="num">Champions</th><th className="hide-sm">Freshness</th></tr></thead>
          <tbody>
            {selected.map((e) => {
              const s = eventSummary(hub, e, sources);
              return (
                <tr key={e.id}>
                  <td className="nowrap"><b>{e.short}</b> <span className="xs muted hide-sm">{e.name}</span></td>
                  <td className="num">{e.patch}</td>
                  <td className="hide-sm nowrap">{e.startDate ? `${shortDate(e.startDate)}–${shortDate(e.endDate)}` : DASH}</td>
                  <td>{e.status === "ongoing" ? <span className="badge pro">Ongoing</span> : <span className="xs muted">Completed</span>}</td>
                  <td className="num" title={e.games ? `${e.games} played; ${s.recordedGames} with recorded picks` : "Games with recorded picks"}>{s.recordedGames}{e.games ? <span className="faint"> / {e.games}</span> : ""}</td>
                  <td className="num">{s.champions}</td>
                  <td className="xs muted hide-sm">{[e.patch, status(e), s.refreshed ? "refreshed" : s.providedOn ? `updated ${shortDate(s.providedOn)} (provided, not refreshed)` : "not refreshed"].join(" · ")} <SourceLinks ids={e.sources.slice(0, 1)} sources={sources} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {selected.some((e) => e.notes.length) && (
        <ul className="hub-notes">
          {selected.flatMap((e) => e.notes.map((n) => (
            <li key={e.id + n.topic} className="small"><b>{n.topic}</b> <span className="xs faint">{e.short}</span> {n.note} <SourceLinks ids={n.sources} sources={sources} /></li>
          )))}
        </ul>
      )}

      {/* 2. Role table */}
      <SectionHeader title="By role" meta={eventId ? selected[0].short : "All tournaments, newest stats first"} />
      <div className="toolbar">
        <nav className="seg scroll" aria-label="Role">
          {ROLES.map((r) => <button key={r} className={role === r ? "active" : undefined} onClick={() => set("role", r)}>{r}</button>)}
        </nav>
        <span className="count">{rows.length} champions</span>
      </div>
      <div className="table-wrap tall hub-table">
        <table>
          <thead><tr>
            <th>Champion</th>{sortHead("picks")}{sortHead("bans", "hide-sm")}{sortHead("presence")}{sortHead("winRate")}
            <th className="num hide-sm" title="Recorded games in this role">Games</th>
            <th><button className={`sort ${sort === "recency" ? "active" : ""}`} onClick={() => set("sort", "recency")}>Latest{sort === "recency" ? " ↓" : ""}</button></th>
            <th className="num hide-sm">Patch</th><th className="num hide-sm">Last played</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const s = r.stat?.stat;
              return (
                <tr key={r.id} className={`role-${r.role}`}>
                  <td><Champ id={r.id} r={r.role} /></td>
                  <td className="num">{s ? <>{s.picks}{s.lowSample && <span className="low" title="Fewer than 5 picks">*</span>}</> : DASH}</td>
                  <td className="num hide-sm">{s?.bans ?? DASH}</td>
                  <td className="num">{s?.presence != null ? <span className={s.presence >= 0.3 ? "heat-hi" : undefined}>{pct(s.presence)}</span> : DASH}</td>
                  <td className="num">{s ? pct(s.winRate) : DASH}</td>
                  <td className="num hide-sm">{r.games.length || DASH}</td>
                  <td className="nowrap">{r.latest ? <>{r.latest.eventName}{r.latest.event?.status === "ongoing" && <span className="badge pro ongoing">Ongoing</span>}</> : DASH}</td>
                  <td className="num hide-sm">{r.latest?.patch ?? DASH}</td>
                  <td className="num hide-sm">{shortDate(r.latest?.date) ?? DASH}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 3. Trending */}
      <SectionHeader title="Trending" meta={trend.newer && trend.older ? `${trend.older.short} ${trend.older.patch} → ${trend.newer.short} ${trend.newer.patch}` : undefined} />
      {trend.blocked ? <p className="xs muted hub-line">Not enough comparable data: {trend.blocked}</p> : (
        <div className="trend-grid">
          <div><div className="xs muted">Rising</div>{trend.rising.length ? trend.rising.map((t) => <div key={t.id + t.role} className="small tnum">↑ <Champ id={t.id} r={t.role} size="xs" /> {t.role} <span className="muted">{pct(t.from)} → {pct(t.to)}</span></div>) : <p className="xs faint">None</p>}</div>
          <div><div className="xs muted">Falling</div>{trend.falling.length ? trend.falling.map((t) => <div key={t.id + t.role} className="small tnum">↓ <Champ id={t.id} r={t.role} size="xs" /> {t.role} <span className="muted">{pct(t.from)} → {pct(t.to)}</span></div>) : <p className="xs faint">None</p>}</div>
        </div>
      )}

      {/* 4. Tournament comparison */}
      <SectionHeader title="Tournament comparison" meta={`${role} · picks (stats) / recorded games`} />
      <div className="table-wrap hub-table mid">
        <table>
          <thead><tr><th>Champion</th>{hub.events.map((e) => <th key={e.id} className="num">{e.short} {e.patch}</th>)}<th>Seen in</th></tr></thead>
          <tbody>
            {compare.map((c) => (
              <tr key={c.id + c.role} className={`role-${c.role}`}>
                <td><Champ id={c.id} r={c.role} /></td>
                {hub.events.map((e) => {
                  const x = c.cells[e.id];
                  return <td key={e.id} className="num">{x ? <>{x.picks != null ? `${x.picks}p` : "—"}<span className="faint"> / {x.games}g</span>{x.presence != null ? <span className="xs muted"> · {pct(x.presence)}</span> : ""}</> : DASH}</td>;
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
                          {ROLES.filter((r) => s.picks[r]).map((r) => <span key={r} className="xs nowrap"><span className="role-tag">{r}</span> <Champ id={s.picks[r]!} r={r} size="xs" /></span>)}
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

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <section>
          <SectionHeader title="What changed (LCK playoffs)" />
          {input.meta.changes.map((c) => <p key={c.topic} className="small"><b>{c.topic}:</b> {c.note}</p>)}
        </section>
        <section>
          <SectionHeader title="Rules" />
          {rules.map((r) => <p key={r.id} className="small row" style={{ flexWrap: "nowrap", alignItems: "baseline" }}><SourceBadge layer={r.layer} /> <span>{r.text}</span></p>)}
        </section>
      </div>

      {drawer && <ChampionDrawer id={drawer.id} role={drawer.role} hub={hub} pool={pool} names={names} sources={sources} onClose={() => setDrawer(undefined)} />}
    </div>
  );
}

function PairingTable({ title, a, b, list, openKey, toggle, Champ, sources }: {
  title: string; a: Role; b: Role; list: Pairing[]; openKey?: string; toggle: (k: string) => void;
  Champ: (p: { id: string; r?: Role; size?: "xs" | "sm" | "md" }) => React.ReactNode; sources: Record<string, Source>;
}) {
  return (
    <>
      <SectionHeader title={title} meta={`${list.length} duos · observed pro evidence`} />
      <div className="table-wrap hub-table mid">
        <table>
          <thead><tr><th>{a === "BOT" ? "Bot" : "Mid"}</th><th>{b === "SUPPORT" ? "Support" : "Jungle"}</th><th className="num">Games</th><th>Tournament</th><th className="num hide-sm">Patch</th><th className="num hide-sm">Latest</th></tr></thead>
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
    </>
  );
}
