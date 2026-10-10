import type { BotPairing, MidJunglePairing, ObservedPairing, Role, Source, TopPick } from "@/lib/schema";
import { ChipList, EvidenceBadge, LayerBlock, SourceLinks } from "./ui";

type Names = Record<string, string>;
type Sources = Record<string, Source>;

export type CardRecord =
  | { kind: "bot"; record: BotPairing }
  | { kind: "mid-jungle"; record: MidJunglePairing }
  | { kind: "top"; record: TopPick; stats?: { picks: number; winRate: number; lowSample: boolean } };

function Observed({ list, names, sources, role, draftLabels }: {
  list: ObservedPairing[]; names: Names; sources: Sources; role: Role; draftLabels?: Record<string, string>;
}) {
  if (!list.length) return <p className="muted small">No recorded pro game shows a pairing for this pick.</p>;
  return (
    <div className="grid" style={{ gap: 4 }}>
      {list.map((o) => (
        <div key={o.champion} className="row">
          <span className={`chip role-${role}`}><span className="dot" />{names[o.champion] ?? o.champion}</span>
          {o.backedByGame
            ? <span className="small muted">{o.proDraftIds.length} recorded game{o.proDraftIds.length > 1 ? "s" : ""}{draftLabels ? `: ${o.proDraftIds.map((d) => draftLabels[d] ?? d).join(", ")}` : ""}</span>
            : o.sources.some((id) => sources[id]?.userVerified)
              ? <span className="badge pro" title="Not in the recorded drafts; the cited Gol.gg game page was checked by hand">game page checked</span>
              : <span className="badge warn" title="Cited by the workbook; no recorded draft shows it yet">not in recorded drafts</span>}
          <span className="small muted">{o.context}{o.era === "earlier-2026" ? " (earlier 2026)" : ""}</span>
          <SourceLinks ids={o.sources} sources={sources} />
        </div>
      ))}
    </div>
  );
}

const confidenceLabel = (c: string) => c.replace("-", " ");

export function PairingCard({ item, names, sources, compact = false, draftLabels }: {
  item: CardRecord; names: Names; sources: Sources; compact?: boolean; draftLabels?: Record<string, string>;
}) {
  if (item.kind === "bot") {
    const r = item.record;
    return (
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 className="role-BOT" style={{ margin: 0 }}><span className="role-tag">BOT</span> {names[r.champion]}</h2>
          <span className="row"><span className="badge plain">{confidenceLabel(r.confidence)} confidence</span><span className="badge plain">{r.status}</span></span>
        </div>
        <p className="small muted">{r.identities.join(" · ")}</p>
        <LayerBlock layer="clash">
          <div className="row"><b>Clash default:</b> <ChipList ids={r.clashDefault} names={names} role="SUPPORT" /></div>
          <div className="row" style={{ marginTop: 4 }}><b>Alternatives:</b> <ChipList ids={r.alternatives} names={names} role="SUPPORT" notes={r.alternativeNotes} empty="none (default only)" /></div>
          {!compact && <>
            <div className="row" style={{ marginTop: 4 }}><b>Jungle:</b> <ChipList ids={r.surrounding.jungle} names={names} role="JUNGLE" /></div>
            <div className="row" style={{ marginTop: 4 }}><b>Mid:</b> <ChipList ids={r.surrounding.mid} names={names} role="MID" /></div>
          </>}
        </LayerBlock>
        <LayerBlock layer="pro" title="Observed pro pairings">
          <Observed list={r.observedProPairings} names={names} sources={sources} role="SUPPORT" draftLabels={draftLabels} />
          {!compact && r.playoffRead && <p className="small" style={{ marginTop: 4 }}><b>Current playoff read:</b> {r.playoffRead}</p>}
        </LayerBlock>
        {r.logic.warning && <LayerBlock layer="logic" title="Warning"><p>{r.logic.warning}</p></LayerBlock>}
        {!compact && <div style={{ marginTop: 6 }}><SourceLinks ids={r.sources} sources={sources} /></div>}
      </div>
    );
  }
  if (item.kind === "mid-jungle") {
    const r = item.record;
    const other: Role = r.role === "MID" ? "JUNGLE" : "MID";
    return (
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 className={`role-${r.role}`} style={{ margin: 0 }}><span className="role-tag">{r.role}</span> {names[r.anchor]}</h2>
          <span className="row"><span className="badge plain">{confidenceLabel(r.confidence)} confidence</span><span className={`badge ${r.status === "downgraded" ? "warn" : "plain"}`}>{r.status}</span></span>
        </div>
        <p className="small muted">{r.identities.join(" · ")}</p>
        <LayerBlock layer="clash">
          <div className="row"><b>Primary {other.toLowerCase()}:</b> <ChipList ids={r.clashDefault} names={names} role={other} /></div>
          <div className="row" style={{ marginTop: 4 }}><b>Secondary:</b> <ChipList ids={r.alternatives} names={names} role={other} /></div>
          {!compact && <div className="row" style={{ marginTop: 4 }}><b>Bot shape:</b> {r.botShapes.map((d) => (
            <span key={d.bot + d.support} className="chip">{names[d.bot]} + {names[d.support]}</span>))}</div>}
        </LayerBlock>
        <LayerBlock layer="pro" title={`Observed pro ${other.toLowerCase()} partners`}>
          <Observed list={r.observedProPairings} names={names} sources={sources} role={other} draftLabels={draftLabels} />
          {!compact && r.playoffRead && <p className="small" style={{ marginTop: 4 }}><b>Current playoff read:</b> {r.playoffRead}</p>}
        </LayerBlock>
        {r.history.length > 0 && (
          <div className="layer">
            <div className="section-label"><span className="badge plain">History</span> Older tendencies, not current</div>
            {r.history.map((h) => <p key={h.partner} className="small"><b>{names[r.anchor]} + {names[h.partner]}</b> ({h.era}): {h.note}</p>)}
          </div>
        )}
        {!compact && <div style={{ marginTop: 6 }}><SourceLinks ids={r.sources} sources={sources} /></div>}
      </div>
    );
  }
  const r = item.record;
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 className="role-TOP" style={{ margin: 0 }}><span className="role-tag">TOP</span> {names[r.champion]}</h2>
        <span className="row"><span className="badge clash" title="Clash blind grade">Blind {r.blindGrade}</span><span className={`badge ${r.status === "downgraded" ? "warn" : "plain"}`}>{r.status}</span></span>
      </div>
      <p className="small muted">{r.identities.join(" · ")}</p>
      <LayerBlock layer="clash" title="My Clash Recommendation: surrounding comp">
        <div className="row"><b>Jungle:</b> <ChipList ids={r.surrounding.jungle} names={names} role="JUNGLE" /></div>
        <div className="row" style={{ marginTop: 4 }}><b>Mid:</b> <ChipList ids={r.surrounding.mid} names={names} role="MID" /></div>
        <div className="row" style={{ marginTop: 4 }}><b>Bot shape:</b> {r.surrounding.botShapes.map((d) => (
          <span key={d.bot + d.support} className="chip">{names[d.bot]} + {names[d.support]}</span>))}</div>
      </LayerBlock>
      <LayerBlock layer="pro" title="Observed pro evidence">
        {item.stats && <p className="small">{item.stats.picks} playoff picks, {Math.round(item.stats.winRate * 100)}% win rate{item.stats.lowSample ? " (low sample)" : ""}</p>}
        {!compact && <Observed list={r.observedProPairings} names={names} sources={sources} role="JUNGLE" draftLabels={draftLabels} />}
        {r.playoffRead && <p className="small" style={{ marginTop: 4 }}><b>Current playoff read:</b> {r.playoffRead}</p>}
      </LayerBlock>
      <LayerBlock layer="logic">
        <p><b>Gives:</b> {r.logic.gives}</p>
        <p><b>Avoid:</b> {r.logic.avoid}</p>
      </LayerBlock>
      {!compact && <div style={{ marginTop: 6 }}><SourceLinks ids={r.sources} sources={sources} /></div>}
    </div>
  );
}

export { EvidenceBadge };
