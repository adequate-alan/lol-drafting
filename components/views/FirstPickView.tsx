"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PairingCard, type CardRecord } from "@/components/PairingCard";
import { EvidenceBadge } from "@/components/ui";
import { TABS, type Tab } from "./first-pick-tabs";
import type { BotPairing, MetaStat, MidJunglePairing, Source, TopPick } from "@/lib/schema";

const GRADE_ORDER = ["A", "A-", "B+", "B", "B-", "C+", "C"];

export function FirstPickView({ tab, names, sources, stats, draftLabels, bot, midJungle, top }: {
  tab: Tab; names: Record<string, string>; sources: Record<string, Source>; stats: Record<string, MetaStat>;
  draftLabels: Record<string, string>; bot: BotPairing[]; midJungle: MidJunglePairing[]; top: TopPick[];
}) {
  const params = useSearchParams();
  const champ = params.get("champ") || undefined;
  const role = params.get("role") || undefined;
  let list: { id: string; label: string; sub: string; role?: string }[] = [];
  let selected: CardRecord | undefined;
  if (tab === "bot") {
    const rows = bot;
    list = rows.map((r) => ({ id: r.champion, label: names[r.champion], sub: r.clashDefault.map((s) => names[s]).join(" / ") }));
    const r = rows.find((x) => x.champion === (champ ?? rows[0].champion));
    if (r) selected = { kind: "bot", record: r };
  } else if (tab === "mid-jungle") {
    const rows = midJungle;
    list = rows.map((r) => ({ id: r.anchor, role: r.role, label: names[r.anchor], sub: `${r.role === "MID" ? "Mid" : "Jungle"} · ${r.clashDefault.map((s) => names[s]).join(" / ")}${r.status === "downgraded" ? " · downgraded" : ""}` }));
    const r = rows.find((x) => x.anchor === (champ ?? rows[0].anchor) && (!role || x.role === role));
    if (r) selected = { kind: "mid-jungle", record: r };
  } else {
    const rows = [...top].sort((a, b) => GRADE_ORDER.indexOf(a.blindGrade) - GRADE_ORDER.indexOf(b.blindGrade));
    list = rows.map((r) => ({ id: r.champion, label: names[r.champion], sub: `Blind ${r.blindGrade}${stats[r.champion] ? ` · ${stats[r.champion].picks} picks` : ""}` }));
    const r = rows.find((x) => x.champion === (champ ?? rows[0].champion));
    if (r) selected = { kind: "top", record: r, stats: stats[r.champion] };
  }
  const selectedId = selected ? ("champion" in selected.record ? selected.record.champion : selected.record.anchor) : undefined;

  return (
    <>
      <div className="page-head">
        <h1>First Pick</h1>
        <span className="small muted">Your Clash default always leads; pro pairings are evidence, never the default.</span>
      </div>
      <nav className="tabs">
        {(Object.keys(TABS) as Tab[]).map((t) => <Link key={t} href={`/first-pick/${t}`} className={t === tab ? "active" : undefined}>{TABS[t]}</Link>)}
      </nav>
      <div className="grid" style={{ gridTemplateColumns: "240px minmax(0, 1fr)", alignItems: "start" }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Pick</th><th>{tab === "top" ? "Grade" : <>Clash default <EvidenceBadge layer="clash" /></>}</th></tr></thead>
            <tbody>
              {list.map((x) => (
                <tr key={x.id + (x.role ?? "")} className={`clickable ${x.id === selectedId && (!x.role || selected?.kind !== "mid-jungle" || selected.record.role === x.role) ? "selected" : ""}`}>
                  <td><Link href={`/first-pick/${tab}?champ=${x.id}${x.role ? `&role=${x.role}` : ""}`}>{x.label}</Link></td>
                  <td className="small muted">{x.sub}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          {selected && <PairingCard item={selected} names={names} sources={sources} draftLabels={draftLabels} />}
          {selectedId && (
            <p className="small" style={{ marginTop: 8 }}>
              <Link href={`/?${selected?.kind === "bot" ? "bot" : selected?.kind === "top" ? "top" : (selected?.record as { role: string }).role.toLowerCase()}=${selectedId}`}>Open in Draft Room →</Link>
            </p>
          )}
        </div>
      </div>
    </>
  );
}
