"use client";
import { useSearchParams } from "next/navigation";
import { Fragment, useMemo, useState } from "react";
import { ChampionRow, ChipList, LayerBlock, PageHeader, SourceLinks, pct } from "@/components/ui";
import { describeLine, groupObserved, shortDate, type EventMap } from "@/lib/evidence";
import { PARTNER_ROLE, SORTS, TIERS, poolRows, sortRows, type PoolInput, type PoolRow, type SortKey, type Tier } from "@/lib/pool-stats";
import { ROLES, type BotPairing, type MidJunglePairing, type ObservedPairing, type Role, type TopPick } from "@/lib/schema";

const TIER_LABEL = Object.fromEntries(TIERS) as Record<Tier, string>;
const DASH = <span className="faint">—</span>;

export function PoolView({ names, data, bot, midJungle, top }: {
  names: Record<string, string>; data: PoolInput; bot: BotPairing[]; midJungle: MidJunglePairing[]; top: TopPick[];
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
  const [open, setOpen] = useState<string | undefined>(undefined);

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
    <>
      <PageHeader title="Champion Pool" desc="Tiers are my calls. Pro stats are context and never change a tier." />
      <div className="toolbar pool-tools">
        <nav className="seg" aria-label="Role">
          <button className={!role ? "active" : undefined} onClick={() => set("role", undefined)}>All</button>
          {ROLES.map((r) => <button key={r} className={role === r ? "active" : undefined} onClick={() => set("role", r)}>{r}</button>)}
        </nav>
        <select aria-label="Pool tier" value={tier ?? ""} onChange={(e) => set("tier", e.target.value || undefined)}>
          <option value="">All tiers</option>
          {TIERS.map(([t, l]) => <option key={t} value={t}>{l}</option>)}
        </select>
        <select aria-label="Tournament" value={event ?? ""} onChange={(e) => set("event", e.target.value || undefined)}>
          <option value="">All tournaments</option>
          {events.map((e) => <option key={e.id} value={e.id}>{e.short}{e.status === "ongoing" ? " (ongoing)" : ""}</option>)}
        </select>
        <select aria-label="Patch" value={patch ?? ""} onChange={(e) => set("patch", e.target.value || undefined)}>
          <option value="">All patches</option>
          {patches.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <input type="search" placeholder="Search" aria-label="Search champions" value={get("q") ?? ""} onChange={(e) => set("q", e.target.value || undefined)} />
        <span className="count">{rows.length} champions</span>
      </div>
      <div className="table-wrap tall pool-table">
        <table>
          <thead><tr>
            <th>Champion</th><th className="hide-sm">Role</th>{sortHead("tier", "Tier", false)}
            {sortHead("picks", "Picks")}{sortHead("bans", "Bans", true, "hide-sm")}{sortHead("presence", "Presence", true, "hide-sm")}{sortHead("winRate", "Win rate")}
            {sortHead("recency", "Latest", false)}<th className="hide-sm">Patch</th><th className="hide-sm">Last played</th><th className="hide-sm">Top partner</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const key = r.role + r.id;
              const s = r.stat?.stat;
              const isOpen = open === key;
              return (
                <Fragment key={key}>
                  <tr className={`role-${r.role} pool-row ${isOpen ? "open" : ""}`} onClick={() => setOpen(isOpen ? undefined : key)}
                    tabIndex={0} aria-expanded={isOpen} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(isOpen ? undefined : key); } }}>
                    <td><ChampionRow id={r.id} name={names[r.id] ?? r.id} role={r.role} size="md" /></td>
                    <td className="hide-sm"><span className="role-tag">{r.role}</span></td>
                    <td><span className={`tier ${r.tier}`}>{TIER_LABEL[r.tier]}</span></td>
                    <td className="num">{s ? <>{s.picks}{s.lowSample && <span className="low" title="Fewer than 5 picks">*</span>}</> : DASH}</td>
                    <td className="num hide-sm">{s?.bans ?? DASH}</td>
                    <td className="num hide-sm">{s?.presence != null ? <span className={`heat ${s.presence >= 0.3 ? "hi" : ""}`}>{pct(s.presence)}</span> : DASH}</td>
                    <td className="num">{s ? pct(s.winRate) : DASH}</td>
                    <td className="nowrap">{r.latest ? <>{r.latest.eventName}{r.latest.event?.status === "ongoing" && <span className="badge pro ongoing" title="Event still running; numbers are not final">Ongoing</span>}</> : <span className="xs faint">No verified data</span>}</td>
                    <td className="num hide-sm">{r.latest?.patch ?? DASH}</td>
                    <td className="num hide-sm">{shortDate(r.latest?.date) ?? DASH}</td>
                    <td className="hide-sm">{r.partner ? <span className="nowrap">{names[r.partner.id] ?? r.partner.id} <span className="xs muted tnum">{r.partner.games}×</span></span> : DASH}</td>
                  </tr>
                  {isOpen && (
                    <tr className="pool-detail"><td colSpan={11}>
                      <Detail row={r} names={names} data={data} eventMap={eventMap} bot={bot} midJungle={midJungle} top={top} />
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="xs muted" style={{ marginTop: 6 }}>
        Picks, bans, presence and win rate are tournament stats for the role they are recorded under; * is fewer than 5 picks.
        {ongoing.length > 0 && ` ${ongoing.map((e) => e.short).join(", ")} is ongoing, so its numbers are not final.`}
      </p>

      <section className="panel" style={{ marginTop: 12 }}>
        <div className="panel-head"><h2>What changed, by role</h2></div>
        <div className="pool-changes">
          {data.pool.filter((p) => !role || p.role === role).map((p) => (
            <div key={p.role} className={`pattern role-${p.role}`}>
              <span className="role-tag">{p.role}</span>
              <p className="small" style={{ marginTop: 2 }}>{p.changed}</p>
              <SourceLinks ids={p.sources} sources={data.sources} />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function Detail({ row: r, names, data, eventMap, bot, midJungle, top }: {
  row: PoolRow; names: Record<string, string>; data: PoolInput; eventMap: EventMap; bot: BotPairing[]; midJungle: MidJunglePairing[]; top: TopPick[];
}) {
  const partnerRole = PARTNER_ROLE[r.role];
  // alan's saved pairings for this champion in this role (Synergy layer).
  let saved: { label: string; ids: string[]; role: Role }[] = [];
  let observed: ObservedPairing[] = [];
  if (r.role === "BOT") {
    const b = bot.find((x) => x.champion === r.id);
    if (b) { saved = [{ label: "Preferred", ids: b.clashDefault, role: "SUPPORT" }, { label: "Alternatives", ids: b.alternatives, role: "SUPPORT" }]; observed = b.observedProPairings; }
  } else if (r.role === "SUPPORT") {
    saved = [{ label: "Preferred with", ids: bot.filter((b) => b.clashDefault.includes(r.id)).map((b) => b.champion), role: "BOT" },
      { label: "Alternative for", ids: bot.filter((b) => b.alternatives.includes(r.id)).map((b) => b.champion), role: "BOT" }];
    observed = bot.flatMap((b) => b.observedProPairings.filter((o) => o.champion === r.id).map((o) => ({ ...o, champion: b.champion })));
  } else if (r.role === "TOP") {
    const t = top.find((x) => x.champion === r.id);
    if (t) { saved = [{ label: "Jungle", ids: t.surrounding.jungle, role: "JUNGLE" }, { label: "Mid", ids: t.surrounding.mid, role: "MID" }]; observed = t.observedProPairings; }
  } else {
    const m = midJungle.find((x) => x.anchor === r.id && x.role === r.role);
    if (m) { saved = [{ label: "Primary", ids: m.clashDefault, role: partnerRole }, { label: "Secondary", ids: m.alternatives, role: partnerRole }]; observed = m.observedProPairings; }
  }
  const withGames = r.stats.map((s) => s.event.id);
  const gameEvents = [...new Set(r.games.map((g) => g.event?.id).filter((x): x is string => !!x && !withGames.includes(x)))];
  return (
    <div className="pool-detail-grid">
      <LayerBlock layer="clash" title="My pool">
        <dl className="kv">
          <dt>Tier</dt><dd className="small">{TIER_LABEL[r.tier]}{r.reason && <span className="muted"> · {r.reason}</span>}</dd>
          {saved.map((s) => <Fragment key={s.label}><dt>{s.label}</dt><dd><ChipList ids={s.ids} names={names} role={s.role} empty="none saved" /></dd></Fragment>)}
          {!saved.length && <><dt>Synergy</dt><dd className="small muted">No saved pairing record for this role.</dd></>}
        </dl>
      </LayerBlock>
      <LayerBlock layer="pro" title="Pro evidence">
        {r.stats.length + gameEvents.length === 0 && !r.games.length ? <p className="xs muted">No verified data for {names[r.id]} {r.role.toLowerCase()}.</p> : (
          <table className="mini">
            <thead><tr><th>Tournament</th><th className="num">Patch</th><th className="num">Picks</th><th className="num">Bans</th><th className="num">Pres.</th><th className="num">WR</th><th className="num">Games</th><th>Source</th></tr></thead>
            <tbody>
              {r.stats.map(({ event: e, stat: s }) => (
                <tr key={e.id}>
                  <td className="nowrap">{e.short}{e.status === "ongoing" && <span className="badge pro ongoing">Ongoing</span>}</td>
                  <td className="num">{e.patch}</td><td className="num">{s.picks}</td><td className="num">{s.bans ?? "—"}</td>
                  <td className="num">{s.presence != null ? pct(s.presence) : "—"}</td><td className="num">{pct(s.winRate)}</td>
                  <td className="num">{r.games.filter((g) => g.event?.id === e.id).length}</td>
                  <td>{s.sources.length ? <SourceLinks ids={s.sources} sources={data.sources} /> : <span className="xs faint" title={s.note}>provided, no page yet</span>}</td>
                </tr>
              ))}
              {gameEvents.map((id) => { const e = eventMap[id]; return (
                <tr key={id}>
                  <td className="nowrap">{e.short}{e.status === "ongoing" && <span className="badge pro ongoing">Ongoing</span>}</td>
                  <td className="num">{e.patch}</td><td className="num">—</td><td className="num">—</td><td className="num">—</td><td className="num">—</td>
                  <td className="num">{r.games.filter((g) => g.event?.id === id).length}</td><td className="xs faint">games only</td>
                </tr>
              ); })}
            </tbody>
          </table>
        )}
        {r.games.length > 0 && (
          <>
            <div className="xs muted detail-label">Recent games ({r.role.toLowerCase()})</div>
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
