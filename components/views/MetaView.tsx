"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChampionRow, Metric, PageHeader, Panel, SectionHeader, SourceBadge, SourceLinks, pct } from "@/components/ui";
import { comparePatchDesc, shortDate } from "@/lib/evidence";
import { ROLES, type Meta, type MetaEvent, type Rule, type Source } from "@/lib/schema";

const SORTS = { presence: "Presence", picks: "Picks", winRate: "Win rate" } as const;
type SortKey = keyof typeof SORTS;

export function MetaView({ names, sources, meta, rules, checked, notRefreshed, sourceCount }: {
  names: Record<string, string>; sources: Record<string, Source>; meta: Meta; rules: Rule[];
  checked: string | undefined; notRefreshed: number; sourceCount: number;
}) {
  const params = useSearchParams();
  const role = params.get("role") || undefined;
  const rawSort = params.get("sort") || undefined;
  const sort: SortKey = rawSort && rawSort in SORTS ? (rawSort as SortKey) : "presence";
  const stats = [...meta.stats]
    .filter((s) => !role || s.role === role || s.flexRole === role)
    .sort((a, b) => ((b[sort] ?? -1) as number) - ((a[sort] ?? -1) as number));
  const q = (o: Record<string, string | undefined>) => `/meta?${new URLSearchParams(Object.entries({ role, sort, ...o }).filter(([, v]) => v) as [string, string][])}`;

  const t = meta.tournament;
  const sortHead = (k: SortKey, label: string) => (
    <th className="num"><Link href={q({ sort: k })} className={`sort ${sort === k ? "active" : ""}`} aria-sort={sort === k ? "descending" : undefined}>{label}{sort === k ? " ↓" : ""}</Link></th>
  );

  return (
    <>
      <PageHeader title="Meta / Research"
        desc="Priority is pick/ban presence, not win rate. Fewer than 5 picks is marked low sample." />
      {[...meta.events].filter((e) => e.kind === "current-meta").sort((a, b) => comparePatchDesc(a.patch, b.patch))
        .map((e) => <CurrentEvent key={e.id} event={e} names={names} sources={sources} />)}

      <SectionHeader title={t.name} meta={`${t.patch} · main sample`} />
      <div className="stat-strip" style={{ marginBottom: 12 }}>
        <Metric label="Tournament" value={<span style={{ fontSize: 14 }}>{t.name}</span>} sub={<SourceLinks ids={t.sources} sources={sources} />} />
        <Metric label="Games" value={t.games} sub={`${t.recordedGames} recorded as exact drafts`} />
        <Metric label="Patch" value={t.patch} sub={t.draftMode} />
        <Metric label="Final" value={<span style={{ fontSize: 14 }}>{t.final}</span>} />
        <Metric label="Gol.gg refresh" value={checked ?? "Not refreshed"}
          sub={notRefreshed > 0 ? `${notRefreshed} of ${sourceCount} sources not refreshed` : "all sources verified"} />
      </div>

      <div className="toolbar" style={{ alignItems: "center" }}>
        <nav className="seg" aria-label="Role">
          <Link href={q({ role: undefined })} className={!role ? "active" : undefined}>All roles</Link>
          {ROLES.map((r) => <Link key={r} href={q({ role: r })} className={role === r ? "active" : undefined}>{r}</Link>)}
        </nav>
        <nav className="seg" aria-label="Sort">
          {Object.entries(SORTS).map(([k, l]) => <Link key={k} href={q({ sort: k })} className={sort === k ? "active" : undefined}>{l}</Link>)}
        </nav>
        <span className="count">{stats.length} champions · presence = (picks + bans) / {t.games} games</span>
      </div>
      <div className="table-wrap tall">
        <table>
          <thead><tr><th>Champion</th><th>Role</th>{sortHead("picks", "Picks")}<th className="num">Bans</th>{sortHead("presence", "Presence")}{sortHead("winRate", "Win rate")}<th>Sample</th><th>Role usage</th><th>Priority read</th><th>Source</th></tr></thead>
          <tbody>
            {stats.map((s) => (
              <tr key={`${s.champion}-${s.role}`} className={`role-${s.role}`}>
                <td><ChampionRow id={s.champion} name={names[s.champion] ?? s.champion} role={s.role} size="sm" /></td>
                <td style={{ whiteSpace: "nowrap" }}><span className="role-tag">{s.role}</span>{s.flexRole && <span className="xs muted"> / {s.flexRole}</span>}</td>
                <td className="num">{s.picks}</td>
                <td className="num">{s.bans ?? <span className="faint">–</span>}</td>
                <td className="num"><span className="presence"><span className="bar"><span style={{ width: `${Math.min(1, s.presence ?? 0) * 100}%` }} /></span>{pct(s.presence)}</span></td>
                <td className="num">{pct(s.winRate)}</td>
                <td>{s.lowSample ? <span className="badge caution" title="Fewer than 5 picks">low sample</span> : <span className="xs faint">ok</span>}</td>
                <td className="xs muted" style={{ whiteSpace: "nowrap" }}>{Object.entries(s.roleUsage).map(([r, n]) => `${r} ${n}`).join(", ") || "–"}</td>
                <td className="xs wrap">{s.priorityRead}{s.note && <div className="muted">{s.note}</div>}</td>
                <td><SourceLinks ids={s.sources} sources={sources} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="xs muted" style={{ marginTop: 6 }}>Bans are blank where the workbook did not record them.</p>

      <div className="grid cols-2" style={{ marginTop: 12 }}>
        <Panel title="What changed">
          {meta.changes.map((c) => <p key={c.topic} className="small"><b>{c.topic}:</b> {c.note}</p>)}
        </Panel>
        <Panel title="Rules">
          {rules.map((r) => <p key={r.id} className="small row" style={{ flexWrap: "nowrap", alignItems: "baseline" }}><SourceBadge layer={r.layer} /> <span>{r.text}</span></p>)}
        </Panel>
      </div>
    </>
  );
}

const span = (e: MetaEvent) => [shortDate(e.startDate), shortDate(e.endDate)].filter(Boolean).join("–");

// A newer, separate evidence set (e.g. Demacia Cup on 16.18). Shown above the LCK sample for what is played now; it never
// edits saved pairings and stays off the Gen.G page.
function CurrentEvent({ event: e, names, sources }: { event: MetaEvent; names: Record<string, string>; sources: Record<string, Source> }) {
  return (
    <Panel className="current-event"  title={<>Current meta · {e.short}</>}
      meta={[e.patch, span(e), e.draftMode].filter(Boolean).join(" · ")}
      end={e.status === "ongoing" && <span className="badge pro" title="Event still running; counts are not final">ONGOING</span>}>
      <p className="small muted" style={{ marginTop: 0 }}>{e.scope}</p>
      {e.provided && (
        <p className="xs faint">Dates and field: <a href={e.provided.url} target="_blank" rel="noopener noreferrer">{new URL(e.provided.url).hostname}</a>,
          provided by {e.provided.providedBy} on {e.provided.providedOn}, pending refresh.</p>
      )}
      <div className="grid cols-2" style={{ marginTop: 8 }}>
        <div>
          {e.notes.map((n) => (
            <p key={n.topic} className="small"><b>{n.topic}:</b> {n.note} <SourceLinks ids={n.sources} sources={sources} /></p>
          ))}
        </div>
        {e.stats.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Champion</th><th>Role</th><th className="num">Picks</th><th className="num">Bans</th><th className="num">Win rate</th><th>Sample</th><th>Read</th></tr></thead>
              <tbody>
                {e.stats.map((s) => (
                  <tr key={`${s.champion}-${s.role}`} className={`role-${s.role}`}>
                    <td><ChampionRow id={s.champion} name={names[s.champion] ?? s.champion} role={s.role} size="sm" /></td>
                    <td><span className="role-tag">{s.role}</span></td>
                    <td className="num">{s.picks}</td>
                    <td className="num">{s.bans ?? <span className="faint">–</span>}</td>
                    <td className="num">{pct(s.winRate)}</td>
                    <td>{s.lowSample ? <span className="badge caution" title="Fewer than 5 picks">low sample</span> : <span className="xs faint">ok</span>}</td>
                    <td className="xs wrap">{s.priorityRead}{s.note && <div className="muted">{s.note}</div>}<SourceLinks ids={s.sources} sources={sources} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Panel>
  );
}
