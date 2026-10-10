import Link from "next/link";
import { EvidenceBadge, SourceLinks } from "@/components/ui";
import { getProDrafts } from "@/lib/data";
import { nameMap, sourceMap } from "@/lib/lookup";
import { ROLES, type ProDraft, type Role } from "@/lib/schema";

type Filters = { team?: string; champion?: string; role?: string; tournament?: string; series?: string; id?: string };

const seriesOf = (d: ProDraft) => d.seriesGame.replace(/\s*G\d+$/i, "");

function matches(d: ProDraft, f: Filters) {
  if (f.team && d.team !== f.team) return false;
  if (f.tournament && d.tournament !== f.tournament) return false;
  if (f.series && seriesOf(d) !== f.series) return false;
  if (f.champion) {
    const roles = f.role ? [f.role as Role] : ROLES;
    if (!roles.some((r) => d.picks[r] === f.champion)) return false;
  }
  return true;
}

export default async function ProDrafts({ searchParams }: { searchParams: Promise<Filters> }) {
  const f = await searchParams;
  const names = nameMap();
  const sources = sourceMap();
  const all = getProDrafts();
  const rows = all.filter((d) => matches(d, f));
  const selected = f.id ? all.find((d) => d.id === f.id) : undefined;
  const uniq = (xs: string[]) => [...new Set(xs)].sort();
  const champions = uniq(all.flatMap((d) => ROLES.map((r) => d.picks[r]))).sort((a, b) => (names[a] ?? a).localeCompare(names[b] ?? b));
  const link = (id: string) => `/pro-drafts?${new URLSearchParams({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), id })}`;

  return (
    <>
      <div className="page-head">
        <h1>Pro Drafts</h1>
        <EvidenceBadge layer="pro" />
        <span className="small muted">Recorded pro games only. Evidence, not recommendations: a pairing here never becomes a Clash default on its own.</span>
      </div>
      <form className="filters" method="get">
        <label>Team<select name="team" defaultValue={f.team ?? ""}><option value="">All</option>{uniq(all.map((d) => d.team)).map((t) => <option key={t}>{t}</option>)}</select></label>
        <label>Champion<select name="champion" defaultValue={f.champion ?? ""}><option value="">All</option>{champions.map((c) => <option key={c} value={c}>{names[c] ?? c}</option>)}</select></label>
        <label>Role<select name="role" defaultValue={f.role ?? ""}><option value="">Any</option>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></label>
        <label>Tournament<select name="tournament" defaultValue={f.tournament ?? ""}><option value="">All</option>{uniq(all.map((d) => d.tournament)).map((t) => <option key={t}>{t}</option>)}</select></label>
        <label>Series<select name="series" defaultValue={f.series ?? ""}><option value="">All</option>{uniq(all.map(seriesOf)).map((s) => <option key={s}>{s}</option>)}</select></label>
        <button className="btn primary" type="submit">Filter</button>
        <Link className="btn" href="/pro-drafts">Clear</Link>
        <span className="small muted">{rows.length} of {all.length} team-games</span>
      </form>

      {selected && (
        <div className="card" style={{ marginBottom: 10 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>{selected.team} vs {selected.opponent} · {selected.seriesGame}</h2>
            <span className="small muted">{selected.tournament}{selected.patch ? ` · patch ${selected.patch}` : ""}</span>
          </div>
          <div className="slots" style={{ marginTop: 8, marginBottom: 6 }}>
            {ROLES.map((r) => (
              <div key={r} className={`slot role-${r}`}>
                <div className="slot-head"><span className="role-tag">{r}</span></div>
                <div className="locked">{names[selected.picks[r]] ?? selected.picks[r]}</div>
              </div>
            ))}
          </div>
          <p><b>Read:</b> {selected.read}</p>
          {selected.note && <p className="small">{selected.note}</p>}
          <div className="row">
            <SourceLinks ids={selected.sources} sources={sources} />
            <Link className="btn" href={`/?${new URLSearchParams(Object.fromEntries(ROLES.map((r) => [r.toLowerCase(), selected.picks[r]])))}`}>Open in Draft Room</Link>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr><th>Game</th><th>Team</th><th>vs</th>{ROLES.map((r) => <th key={r}>{r}</th>)}<th>Read</th><th>Source</th></tr></thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className={`clickable ${d.id === f.id ? "selected" : ""}`}>
                <td><Link href={link(d.id)}>{d.seriesGame}</Link></td>
                <td>{d.team}</td>
                <td className="muted">{d.opponent}</td>
                {ROLES.map((r) => <td key={r} style={d.picks[r] === f.champion ? { fontWeight: 700 } : undefined}>{names[d.picks[r]] ?? d.picks[r]}</td>)}
                <td className="small">{d.read}</td>
                <td><SourceLinks ids={d.sources} sources={sources} /></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={10} className="muted">No recorded game matches these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
