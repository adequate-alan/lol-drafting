import Link from "next/link";
import { EvidenceBadge, SourceLinks } from "@/components/ui";
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
  return (
    <>
      <div className="page-head">
        <h1>Gen.G</h1>
        <EvidenceBadge layer="pro" />
        <span className="small muted">What Gen.G actually drafted. Kept apart from my Clash recommendations; earlier-2026 tendencies are labelled and never shown as current.</span>
      </div>
      <div className="grid cols-2">
        {KINDS.map(({ kind, title }) => {
          const list = patterns.filter((p) => p.kind === kind);
          if (!list.length) return null;
          return (
            <div key={kind} className="card" style={{ marginTop: 0 }}>
              <h2>{title}</h2>
              {list.map((p) => (
                <div key={p.title} style={{ marginBottom: 8 }}>
                  <div className="row">
                    <b>{p.title}</b>
                    <span className={`badge ${p.era === "earlier-2026" ? "warn" : "plain"}`}>{p.era === "earlier-2026" ? "earlier 2026, not current" : "current playoffs"}</span>
                  </div>
                  <p className="small">{p.detail}</p>
                  <div className="row small">
                    {p.proDraftIds.map((id) => <Link key={id} href={`/pro-drafts?team=Gen.G&id=${id}`}>{label[id] ?? id}</Link>)}
                    <SourceLinks ids={p.sources} sources={sources} />
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <h2 style={{ marginTop: 14 }}>Exact Gen.G drafts</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Game</th><th>vs</th>{ROLES.map((r) => <th key={r}>{r}</th>)}<th>Read</th><th>Source</th></tr></thead>
          <tbody>
            {drafts.map((d) => (
              <tr key={d.id}>
                <td><Link href={`/pro-drafts?team=Gen.G&id=${d.id}`}>{d.seriesGame}</Link></td>
                <td className="muted">{d.opponent}</td>
                {ROLES.map((r) => <td key={r}>{names[d.picks[r]] ?? d.picks[r]}</td>)}
                <td className="small">{d.read}{d.note ? <div className="muted">{d.note}</div> : null}</td>
                <td><SourceLinks ids={d.sources} sources={sources} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
