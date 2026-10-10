import Link from "next/link";
import { EvidenceBadge, SourceLinks } from "@/components/ui";
import { getCompShells, getProDrafts } from "@/lib/data";
import { nameMap, sourceMap } from "@/lib/lookup";
import { ROLES } from "@/lib/schema";

const DIFF_ORDER = ["easy", "easy-medium", "medium", "hard"];

export default async function Comps({ searchParams }: { searchParams: Promise<{ kind?: string; difficulty?: string }> }) {
  const { kind, difficulty } = await searchParams;
  const names = nameMap();
  const sources = sourceMap();
  const drafts = Object.fromEntries(getProDrafts().map((d) => [d.id, d]));
  const shells = getCompShells()
    .filter((s) => !kind || s.kind === kind)
    .filter((s) => !difficulty || s.difficulty === difficulty)
    .sort((a, b) => DIFF_ORDER.indexOf(a.difficulty) - DIFF_ORDER.indexOf(b.difficulty));
  return (
    <>
      <div className="page-head">
        <h1>Comp Library</h1>
        <span className="small muted">Copy the jobs, not necessarily the champions. Swaps are same-role champions with similar attributes.</span>
      </div>
      <form className="filters">
        <label>Type<select name="kind" defaultValue={kind ?? ""}><option value="">All</option><option value="observed">Observed (pro)</option><option value="generalized">Generalized for Clash</option></select></label>
        <label>Difficulty<select name="difficulty" defaultValue={difficulty ?? ""}><option value="">All</option>{DIFF_ORDER.map((d) => <option key={d} value={d}>{d}</option>)}</select></label>
        <button className="btn" type="submit">Filter</button>
      </form>
      <div className="grid cols-auto">
        {shells.map((s) => {
          const d = s.proDraftId ? drafts[s.proDraftId] : undefined;
          return (
            <div key={s.id} id={s.id} className="card">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h2 style={{ margin: 0 }}>{s.name}</h2>
                <span className="row">
                  <EvidenceBadge layer={s.kind === "observed" ? "pro" : "clash"} />
                  <span className="badge plain">{s.difficulty}</span>
                </span>
              </div>
              <p className="small muted">{s.kind === "observed" ? `Observed: ${s.observedBy}${d ? `, ${d.seriesGame} vs ${d.opponent}` : ""}` : "Generalized for Clash"} · {s.identities.join(" · ")}</p>
              <table style={{ marginTop: 4 }}>
                <tbody>
                  {ROLES.map((r) => (
                    <tr key={r} className={`role-${r}`}>
                      <td style={{ width: 56 }}><span className="role-tag">{r.slice(0, 3)}</span></td>
                      <td style={{ width: 96, fontWeight: 600 }}>{names[s.slots[r].champion]}</td>
                      <td>{s.slots[r].job}<div className="small muted">Swap: {s.slots[r].swaps.map((x) => names[x]).join(", ")} <EvidenceBadge layer="logic" /></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ marginTop: 6 }}><b>Win condition:</b> {s.winCondition}</p>
              <p className="small"><b>Why it works:</b> {s.why}</p>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <SourceLinks ids={s.sources} sources={sources} />
                <Link href={`/?shell=${s.id}`}>Use as template →</Link>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
