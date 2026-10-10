"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { ChampIcon, PageHeader, SourceBadge, SourceLinks } from "@/components/ui";
import { ROLES, type CompShell, type ProDraft, type Source } from "@/lib/schema";

const DIFF_ORDER = ["easy", "easy-medium", "medium", "hard"];

export function CompsView({ names, sources, drafts, allShells }: {
  names: Record<string, string>; sources: Record<string, Source>; drafts: Record<string, ProDraft>; allShells: CompShell[];
}) {
  const params = useSearchParams();
  const kind = params.get("kind") || undefined;
  const difficulty = params.get("difficulty") || undefined;
  // The cards render in the browser, after the browser's own jump to #shell-id has already run.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);
  const shells = [...allShells]
    .filter((s) => !kind || s.kind === kind)
    .filter((s) => !difficulty || s.difficulty === difficulty)
    .sort((a, b) => DIFF_ORDER.indexOf(a.difficulty) - DIFF_ORDER.indexOf(b.difficulty));
  const href = (o: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries({ kind, difficulty, ...o }).filter(([, v]) => v) as [string, string][]);
    return `/comps${q.size ? `?${q}` : ""}`;
  };
  const KINDS: [string | undefined, string][] = [[undefined, "All"], ["observed", "Observed pro"], ["generalized", "Template"]];
  return (
    <>
      <PageHeader title="Comp Library" desc="Copy the jobs, not necessarily the champions. Swaps are same-role champions with similar attributes (general logic, not pro evidence)."
        actions={<span className="row tight"><SourceBadge layer="pro" label="Observed pro comp" /><span className="badge outline">Template: generalized comp</span><SourceBadge layer="logic" label="Swaps: general logic" /></span>} />
      <div className="row" style={{ marginBottom: 12, gap: 10 }}>
        <nav className="seg" aria-label="Type">{KINDS.map(([k, l]) => <Link key={l} href={href({ kind: k })} className={kind === k ? "active" : undefined}>{l}</Link>)}</nav>
        <nav className="seg" aria-label="Difficulty">
          <Link href={href({ difficulty: undefined })} className={!difficulty ? "active" : undefined}>Any difficulty</Link>
          {DIFF_ORDER.map((d) => <Link key={d} href={href({ difficulty: d })} className={difficulty === d ? "active" : undefined}>{d}</Link>)}
        </nav>
        <span className="xs muted tnum" style={{ marginLeft: "auto" }}>{shells.length} of {allShells.length} shells</span>
      </div>
      <div className="shell-grid">
        {shells.map((s) => {
          const d = s.proDraftId ? drafts[s.proDraftId] : undefined;
          return (
            <article key={s.id} id={s.id} className={`panel shell ${s.kind}`}>
              <div className="shell-head">
                <div className="row between">
                  <h2>{s.name}</h2>
                  <span className="row tight">
                    {s.kind === "observed" ? <SourceBadge layer="pro" label="Observed pro" /> : <span className="badge outline">Template</span>}
                    <span className="badge plain">{s.difficulty}</span>
                  </span>
                </div>
                <span className="xs muted">{s.kind === "observed" ? `${s.observedBy}${d ? `, ${d.seriesGame} vs ${d.opponent}` : ""}` : "Generalized template"} · {s.identities.join(" · ")}</span>
              </div>
              <table>
                <tbody>
                  {ROLES.map((r) => (
                    <tr key={r} className={`role-${r}`}>
                      <td style={{ width: 150 }}><span className="row tight" style={{ flexWrap: "nowrap" }}><ChampIcon id={s.slots[r].champion} name={names[s.slots[r].champion]} role={r} size="md" /><span><span className="role-tag" style={{ display: "flex" }}>{r}</span><b>{names[s.slots[r].champion]}</b></span></span></td>
                      <td className="job">
                        {s.slots[r].job}
                        {s.slots[r].swaps.length > 0 && <span className="swaps" title="Same-role swaps with similar attributes (general draft logic)">
                          <span className="faint">swap</span>{s.slots[r].swaps.map((x) => <span key={x} className="swap">{names[x]}</span>)}
                        </span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="shell-foot">
                <p className="wc"><b>Win condition:</b> {s.winCondition}</p>
                <p className="xs muted"><b>Why it works:</b> {s.why}</p>
                <div className="row between">
                  <SourceLinks ids={s.sources} sources={sources} />
                  <Link className="btn sm" href={`/?shell=${s.id}`}>Use as template →</Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
