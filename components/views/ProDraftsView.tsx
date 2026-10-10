"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChampIcon, ChampionRow, PageHeader, SourceBadge, SourceLinks } from "@/components/ui";
import { ROLES, type ProDraft, type Role, type Source } from "@/lib/schema";

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

const KEYS = ["team", "champion", "role", "tournament", "series", "id"] as const;

export function ProDraftsView({ names, sources, all }: {
  names: Record<string, string>; sources: Record<string, Source>; all: ProDraft[];
}) {
  const params = useSearchParams();
  const router = useRouter();
  const f: Filters = Object.fromEntries(KEYS.map((k) => [k, params.get(k) || undefined]));
  const rows = all.filter((d) => matches(d, f));
  const selected = f.id ? all.find((d) => d.id === f.id) : undefined;
  const uniq = (xs: string[]) => [...new Set(xs)].sort();
  const champions = uniq(all.flatMap((d) => ROLES.map((r) => d.picks[r]))).sort((a, b) => (names[a] ?? a).localeCompare(names[b] ?? b));
  const link = (id: string) => `/pro-drafts?${new URLSearchParams({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), id })}`;

  const closeHref = (() => {
    const q = new URLSearchParams(Object.entries(f).filter(([k, v]) => v && k !== "id") as [string, string][]);
    return `/pro-drafts${q.size ? `?${q}` : ""}`;
  })();
  const setFilter = (key: keyof Filters, value: string) => {
    const next = { ...f, [key]: value || undefined, id: undefined };
    const q = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][]);
    router.replace(`/pro-drafts${q.size ? `?${q}` : ""}`, { scroll: false });
  };
  const sel = (key: keyof Filters, label: string, any: string, options: [string, string][]) => (
    <label>{label}
      <select name={key} defaultValue={f[key] ?? ""} className={f[key] ? "active" : undefined} onChange={(e) => setFilter(key, e.target.value)}>
        <option value="">{any}</option>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
  const active = KEYS.filter((k) => k !== "id" && f[k]).length;

  return (
    <>
      <PageHeader title="Pro Drafts" desc="Recorded LCK games from Gol.gg." />

      {selected && (
        <section className="panel" style={{ marginBottom: 12 }}>
          <div className="panel-head">
            <h2>{selected.team} vs {selected.opponent} · {selected.seriesGame}</h2>
            <span className="xs muted">{selected.tournament}{selected.patch ? ` · patch ${selected.patch}` : ""}</span>
            <div className="end">
              <Link className="btn sm primary" href={`/?${new URLSearchParams(Object.fromEntries(ROLES.map((r) => [r.toLowerCase(), selected.picks[r]])))}`}>Open in Draft Room</Link>
              <Link className="btn sm ghost" href={closeHref} aria-label="Close game">×</Link>
            </div>
          </div>
          <div className="panel-body">
            <div className="draft-slots" style={{ marginBottom: 8 }}>
              {ROLES.map((r) => (
                <div key={r} className={`draft-slot locked role-${r}`} style={{ minHeight: 58 }}>
                  <span className="slot-icon"><ChampIcon id={selected.picks[r]} name={names[selected.picks[r]] ?? selected.picks[r]} role={r} size="lg" /></span>
                  <div className="slot-top"><span className="role-tag">{r}</span></div>
                  <div className="slot-main"><span className="slot-name truncate" style={{ fontSize: 14 }}>{names[selected.picks[r]] ?? selected.picks[r]}</span></div>
                </div>
              ))}
            </div>
            <p><b>Read:</b> {selected.read}</p>
            {selected.note && <p className="small muted">{selected.note}</p>}
            <SourceLinks ids={selected.sources} sources={sources} />
          </div>
        </section>
      )}

      <form key={params.toString()} className="toolbar" method="get">
        {sel("team", "Team", "All teams", uniq(all.map((d) => d.team)).map((t) => [t, t]))}
        {sel("champion", "Champion", "All champions", champions.map((c) => [c, names[c] ?? c]))}
        {sel("role", "Role", "Any role", ROLES.map((r) => [r, r]))}
        {sel("tournament", "Tournament", "All", uniq(all.map((d) => d.tournament)).map((t) => [t, t]))}
        {sel("series", "Series", "All series", uniq(all.map(seriesOf)).map((x) => [x, x]))}
        <noscript><button className="btn primary sm" type="submit">Filter</button></noscript>
        {active > 0 && <Link className="btn sm ghost" href="/pro-drafts">Clear {active} filter{active > 1 ? "s" : ""}</Link>}
        <span className="count">{rows.length} of {all.length} team-games</span>
      </form>
      <div className="table-wrap tall">
        <table>
          <thead><tr><th>Game</th><th>Team</th><th>vs</th>{ROLES.map((r) => <th key={r}>{r}</th>)}<th>Read</th><th>Source</th></tr></thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className={`clickable ${d.id === f.id ? "selected" : ""}`}>
                <td><Link className="cell-link" href={link(d.id)} style={{ whiteSpace: "nowrap" }}>{d.seriesGame}</Link></td>
                <td style={{ whiteSpace: "nowrap" }}>{d.team}</td>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{d.opponent}</td>
                {ROLES.map((r) => <td key={r}><ChampionRow id={d.picks[r]} name={names[d.picks[r]] ?? d.picks[r]} role={r} hit={d.picks[r] === f.champion} /></td>)}
                <td className="xs wrap">{d.read}</td>
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
