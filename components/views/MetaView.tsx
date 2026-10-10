"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChampionRow, Metric, PageHeader, Panel, SourceBadge, SourceLinks, pct } from "@/components/ui";
import { ROLES, type Meta, type Rule, type Source } from "@/lib/schema";

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
      <PageHeader title="Meta / Research" badges={<SourceBadge layer="pro" label="Observed pro evidence" />}
        desc="Priority (how early and often a pick is taken or banned) is not the same as win rate. Small samples are marked." />
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
                <td><ChampionRow name={names[s.champion] ?? s.champion} role={s.role} size="sm" /></td>
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
        <Panel title="What changed in this read" end={<SourceBadge layer="pro" />}>
          {meta.changes.map((c) => <p key={c.topic} className="small"><b>{c.topic}:</b> {c.note}</p>)}
        </Panel>
        <Panel title="Drafting rules">
          {rules.map((r) => <p key={r.id} className="small row" style={{ flexWrap: "nowrap", alignItems: "baseline" }}><SourceBadge layer={r.layer} /> <span>{r.text}</span></p>)}
        </Panel>
      </div>
    </>
  );
}
