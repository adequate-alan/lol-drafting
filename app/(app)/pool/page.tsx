import Link from "next/link";
import { EvidenceBadge, SourceLinks, pct } from "@/components/ui";
import { getMeta, getPool } from "@/lib/data";
import { nameMap, sourceMap } from "@/lib/lookup";
import { ROLES } from "@/lib/schema";

export default async function Pool({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { role } = await searchParams;
  const names = nameMap();
  const sources = sourceMap();
  const stats = Object.fromEntries(getMeta().stats.map((s) => [s.champion, s]));
  const pool = getPool().filter((p) => !role || p.role === role);
  const tierCell = (ids: string[], reasons: Record<string, string> = {}) => (
    <div className="grid" style={{ gap: 3 }}>
      {ids.map((id) => {
        const s = stats[id];
        return (
          <div key={id} className="row">
            <span className="chip" title={reasons[id]}>{names[id]}</span>
            {s ? <span className="small muted">{s.picks}P{s.bans != null ? ` ${s.bans}B` : ""} · {pct(s.winRate)}{s.lowSample ? " · low sample" : ""}</span> : <span className="small muted">no stats</span>}
            {reasons[id] && <span className="small" title={reasons[id]}>· justified</span>}
          </div>
        );
      })}
    </div>
  );
  return (
    <>
      <div className="page-head">
        <h1>Champion Pool</h1>
        <span className="small muted">Tiers are my Clash calls; pick/ban numbers beside them are pro evidence. A low-sample pick only sits in core with a written reason.</span>
      </div>
      <nav className="tabs">
        <Link href="/pool" className={!role ? "active" : undefined}>All</Link>
        {ROLES.map((r) => <Link key={r} href={`/pool?role=${r}`} className={role === r ? "active" : undefined}>{r}</Link>)}
      </nav>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Role</th><th>Core <EvidenceBadge layer="clash" /></th><th>Depth <EvidenceBadge layer="clash" /></th><th>Prepared / flex <EvidenceBadge layer="clash" /></th><th>What changed</th></tr></thead>
          <tbody>
            {pool.map((p) => (
              <tr key={p.role} className={`role-${p.role}`}>
                <td><span className="role-tag">{p.role}</span></td>
                <td>{tierCell(p.core, p.coreReasons)}</td>
                <td>{tierCell(p.depth)}</td>
                <td>{tierCell(p.flex)}</td>
                <td className="small" style={{ minWidth: 200 }}>{p.changed}<div style={{ marginTop: 4 }}><SourceLinks ids={p.sources} sources={sources} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pool.some((p) => Object.keys(p.coreReasons).length) && (
        <div className="card" style={{ marginTop: 10 }}>
          <h3>Core picks with a small pro sample</h3>
          {pool.flatMap((p) => Object.entries(p.coreReasons).map(([id, why]) => <p key={id} className="small"><b>{names[id]}:</b> {why}</p>))}
        </div>
      )}
    </>
  );
}
