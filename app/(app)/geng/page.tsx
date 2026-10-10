import Link from "next/link";
import { BrandMark } from "@/components/Sidebar";
import { ChampionRow, SectionHeader, SourceBadge, SourceLinks } from "@/components/ui";
import { getGenG, getProDrafts } from "@/lib/data";
import { nameMap, sourceMap } from "@/lib/lookup";
import { ROLES, type GenGPattern } from "@/lib/schema";

const KINDS: { kind: GenGPattern["kind"]; title: string }[] = [
  { kind: "context", title: "Tournament context" },
  { kind: "recurring-pick", title: "Recurring picks" },
  { kind: "combination", title: "Repeated combinations" },
  { kind: "role-flex", title: "Role flexes" },
];

export default function GenG() {
  const names = nameMap();
  const sources = sourceMap();
  const patterns = getGenG();
  const drafts = getProDrafts().filter((d) => d.team === "Gen.G");
  const label = Object.fromEntries(drafts.map((d) => [d.id, d.seriesGame]));
  const current = patterns.filter((p) => p.era !== "earlier-2026").length;
  return (
    <>
      <div className="brand-band">
        <BrandMark />
        <div style={{ display: "grid", gap: 3 }}>
          <div className="row"><h1>Gen.G</h1><span className="badge"><span className="ldot" />Observed pro evidence</span></div>
          <span className="desc">What Gen.G actually drafted. Kept apart from my Clash recommendations; earlier-2026 tendencies are labelled and never shown as current.</span>
        </div>
        <div className="row" style={{ marginLeft: "auto", gap: 18 }}>
          <span className="xs" style={{ color: "var(--side-muted)" }}><b style={{ color: "var(--side-text-strong)", fontSize: 16 }} className="tnum">{drafts.length}</b> exact drafts</span>
          <span className="xs" style={{ color: "var(--side-muted)" }}><b style={{ color: "var(--side-text-strong)", fontSize: 16 }} className="tnum">{current}</b> current patterns</span>
        </div>
      </div>
      <div className="grid cols-2">
        {KINDS.map(({ kind, title }) => {
          const list = patterns.filter((p) => p.kind === kind);
          if (!list.length) return null;
          return (
            <section key={kind} className="panel">
              <div className="panel-head"><h2>{title}</h2><span className="xs muted tnum">{list.length}</span></div>
              {list.map((p) => (
                <div key={p.title} className={`pattern ${p.era === "earlier-2026" ? "earlier" : "current"}`}>
                  <div className="row">
                    <span className="p-title">{p.title}</span>
                    <span className={`badge ${p.era === "earlier-2026" ? "caution" : "clash"}`}>{p.era === "earlier-2026" ? "earlier 2026, not current" : "current playoffs"}</span>
                  </div>
                  <p className="small" style={{ marginTop: 3 }}>{p.detail}</p>
                  <div className="row xs">
                    {p.proDraftIds.map((id) => <Link key={id} className="badge outline" href={`/pro-drafts?team=Gen.G&id=${id}`}>{label[id] ?? id}</Link>)}
                    <SourceLinks ids={p.sources} sources={sources} />
                  </div>
                </div>
              ))}
            </section>
          );
        })}
      </div>
      <SectionHeader title="Exact Gen.G drafts" meta={`${drafts.length} recorded games`} end={<SourceBadge layer="pro" />} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Game</th><th>vs</th>{ROLES.map((r) => <th key={r}>{r}</th>)}<th>Read</th><th>Source</th></tr></thead>
          <tbody>
            {drafts.map((d) => (
              <tr key={d.id}>
                <td><Link className="cell-link" style={{ whiteSpace: "nowrap" }} href={`/pro-drafts?team=Gen.G&id=${d.id}`}>{d.seriesGame}</Link></td>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{d.opponent}</td>
                {ROLES.map((r) => <td key={r}><ChampionRow name={names[d.picks[r]] ?? d.picks[r]} role={r} /></td>)}
                <td className="xs wrap">{d.read}{d.note ? <div className="muted">{d.note}</div> : null}</td>
                <td><SourceLinks ids={d.sources} sources={sources} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
