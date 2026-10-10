"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { EvidenceBadge, SourceLinks, pct } from "@/components/ui";
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

  return (
    <>
      <div className="page-head">
        <h1>Meta / Research</h1>
        <EvidenceBadge layer="pro" />
        <span className="small muted">Priority (how early and often a pick is taken or banned) is not the same as win rate. Small samples are marked.</span>
      </div>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>{meta.tournament.name}</h2>
          <SourceLinks ids={meta.tournament.sources} sources={sources} />
        </div>
        <p className="small">{meta.tournament.games} games · {meta.tournament.draftMode} · patch {meta.tournament.patch} · final {meta.tournament.final} · {meta.tournament.recordedGames} games recorded as exact drafts</p>
        <p className={`small ${checked ? "" : "muted"}`}>
          {checked ? `Last checked against Gol.gg: ${checked}.` : "Not refreshed: no Gol.gg page has been re-checked since the workbook import."}
          {notRefreshed > 0 && ` ${notRefreshed} of ${sourceCount} sources not refreshed.`}
        </p>
      </div>

      <nav className="tabs" style={{ marginTop: 12 }}>
        <Link href={q({ role: undefined })} className={!role ? "active" : undefined}>All</Link>
        {ROLES.map((r) => <Link key={r} href={q({ role: r })} className={role === r ? "active" : undefined}>{r}</Link>)}
        <span style={{ flex: 1 }} />
        {Object.entries(SORTS).map(([k, l]) => <Link key={k} href={q({ sort: k })} className={sort === k ? "active" : undefined}>Sort: {l}</Link>)}
      </nav>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Champion</th><th>Role</th><th>Picks</th><th>Bans</th><th>Presence</th><th>Win rate</th><th>Role usage</th><th>Priority read</th><th>Source</th></tr></thead>
          <tbody>
            {stats.map((s) => (
              <tr key={`${s.champion}-${s.role}`} className={`role-${s.role}`}>
                <td><b>{names[s.champion] ?? s.champion}</b></td>
                <td><span className="role-tag">{s.role}</span>{s.flexRole && <span className="small muted"> / {s.flexRole}</span>}</td>
                <td>{s.picks}</td>
                <td>{s.bans ?? <span className="muted">–</span>}</td>
                <td>{pct(s.presence)}</td>
                <td>{pct(s.winRate)}{s.lowSample && <span className="badge warn" style={{ marginLeft: 4 }} title="Fewer than 5 picks">low sample</span>}</td>
                <td className="small">{Object.entries(s.roleUsage).map(([r, n]) => `${r} ${n}`).join(", ") || "–"}</td>
                <td className="small">{s.priorityRead}{s.note && <div className="muted">{s.note}</div>}</td>
                <td><SourceLinks ids={s.sources} sources={sources} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ marginTop: 4 }}>Presence = (picks + bans) / {meta.tournament.games} games. Bans are blank where the workbook did not record them.</p>

      <div className="grid cols-2" style={{ marginTop: 12 }}>
        <div className="card" style={{ marginTop: 0 }}>
          <h2>What changed in this read</h2>
          {meta.changes.map((c) => <p key={c.topic} className="small"><b>{c.topic}:</b> {c.note}</p>)}
        </div>
        <div className="card" style={{ marginTop: 0 }}>
          <h2>Drafting rules</h2>
          {rules.map((r) => <p key={r.id} className="small"><EvidenceBadge layer={r.layer} /> {r.text}</p>)}
        </div>
      </div>
    </>
  );
}
