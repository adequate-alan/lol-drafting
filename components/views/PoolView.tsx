"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChampionRow, PageHeader, SourceBadge, SourceLinks, pct } from "@/components/ui";
import { ROLES, type MetaStat, type PoolEntry, type Source } from "@/lib/schema";

export function PoolView({ names, sources, stats, entries }: {
  names: Record<string, string>; sources: Record<string, Source>; stats: Record<string, MetaStat>; entries: PoolEntry[];
}) {
  const role = useSearchParams().get("role") ?? undefined;
  const pool = entries.filter((p) => !role || p.role === role);
  const TIERS = [["core", "Core"], ["depth", "Depth"], ["flex", "Prepared / flex"]] as const;
  const rows = pool.flatMap((p) => TIERS.flatMap(([tier, label]) => p[tier].map((id) => ({ role: p.role, id, tier, label, reason: tier === "core" ? p.coreReasons[id] : undefined }))));
  const href = (r?: string) => (r ? `/pool?role=${r}` : "/pool");
  return (
    <>
      <PageHeader title="Champion Pool" desc="Tiers are my pool calls; pick/ban numbers beside them are pro evidence. A low-sample pick only sits in core with a written reason."
        actions={<span className="row tight"><SourceBadge layer="clash" label="Tier: my pool call" /><SourceBadge layer="pro" label="Stats: LCK playoffs" /></span>} />
      <div className="row" style={{ marginBottom: 12 }}>
        <nav className="seg" aria-label="Role">
          <Link href={href()} className={!role ? "active" : undefined}>All roles</Link>
          {ROLES.map((r) => <Link key={r} href={href(r)} className={role === r ? "active" : undefined}>{r}</Link>)}
        </nav>
        <span className="xs muted tnum" style={{ marginLeft: "auto" }}>{rows.length} champions</span>
      </div>
      <div className="aside-layout">
        <div className="table-wrap tall">
          <table>
            <thead><tr><th>Role</th><th>Champion</th><th>Tier</th><th className="num">Picks</th><th className="num">Bans</th><th className="num">Win rate</th><th>Sample</th><th>Why core</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const st = stats[r.id];
                return (
                  <tr key={r.role + r.id} className={`role-${r.role}`}>
                    <td><span className="role-tag">{r.role}</span></td>
                    <td><ChampionRow id={r.id} name={names[r.id] ?? r.id} role={r.role} size="sm" /></td>
                    <td><span className={`badge ${r.tier === "core" ? "clash" : r.tier === "depth" ? "plain" : "outline"}`}>{r.label}</span></td>
                    <td className="num">{st ? st.picks : <span className="faint">–</span>}</td>
                    <td className="num">{st?.bans ?? <span className="faint">–</span>}</td>
                    <td className="num">{st ? pct(st.winRate) : <span className="faint">–</span>}</td>
                    <td>{!st ? <span className="xs faint">no stats</span> : st.lowSample ? <span className="badge caution" title="Fewer than 5 picks">low sample</span> : <span className="xs faint">ok</span>}</td>
                    <td className="xs muted wrap">{r.reason ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <section className="panel">
          <div className="panel-head"><h2>What changed, by role</h2></div>
          {pool.map((p) => (
            <div key={p.role} className={`pattern role-${p.role}`}>
              <span className="role-tag">{p.role}</span>
              <p className="small" style={{ marginTop: 2 }}>{p.changed}</p>
              <SourceLinks ids={p.sources} sources={sources} />
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
