import type { BotPairing, MidJunglePairing, ObservedBotShape, ObservedPairing, Role, Source, TopPick } from "@/lib/schema";
import { ChampIcon, Chip, ChipList, Duo, EvidenceBadge, LayerBlock, SourceLinks } from "./ui";

type Names = Record<string, string>;
type Sources = Record<string, Source>;

export type CardRecord =
  | { kind: "bot"; record: BotPairing }
  | { kind: "mid-jungle"; record: MidJunglePairing }
  | { kind: "top"; record: TopPick; stats?: { picks: number; winRate: number; lowSample: boolean } };

function ObservedShapes({ list, names, sources, anchor, draftLabels }: {
  list: ObservedBotShape[]; names: Names; sources: Sources; anchor: string; draftLabels?: Record<string, string>;
}) {
  if (!list.length) return null;
  return (
    <div style={{ marginTop: 6 }}>
      <div className="xs muted" style={{ marginBottom: 2 }}><b>Bot-lane duos seen in pro play</b> (not Clash picks)</div>
      {list.map((o) => (
        <div key={o.bot + o.support} className="obs-row">
          <Duo bot={o.bot} support={o.support} names={names} />
          <span className="ctx">
            {o.withAnchor ? `with ${names[anchor]}` : `not alongside ${names[anchor]}`}
            {o.proDraftIds.length ? `: ${o.proDraftIds.map((d) => draftLabels?.[d] ?? d).join(", ")}` : ""}
          </span>
          <SourceLinks ids={o.sources} sources={sources} />
        </div>
      ))}
    </div>
  );
}

function Observed({ list, names, sources, role, draftLabels }: {
  list: ObservedPairing[]; names: Names; sources: Sources; role: Role; draftLabels?: Record<string, string>;
}) {
  if (!list.length) return <p className="muted xs">No recorded pro game shows a pairing for this pick.</p>;
  return (
    <div>
      {list.map((o) => (
        <div key={o.champion} className="obs-row">
          <Chip name={names[o.champion] ?? o.champion} role={role} />
          {o.backedByGame
            ? <span className="badge pro tnum">{o.proDraftIds.length} game{o.proDraftIds.length > 1 ? "s" : ""}</span>
            : o.sources.length > 0 && o.sources.every((id) => sources[id]?.pendingClaim)
              ? <span className="badge plain" title="Not in the recorded drafts; the cited Gol.gg game page was supplied during review and is pending refresh">pending refresh</span>
              : <span className="badge caution" title="Cited by the workbook; no recorded draft shows it yet">not in recorded drafts</span>}
          <span className="ctx">
            {o.backedByGame && draftLabels ? `${o.proDraftIds.map((d) => draftLabels[d] ?? d).join(", ")} · ` : ""}
            {o.context}{o.era === "earlier-2026" ? " (earlier 2026)" : ""}
          </span>
          <SourceLinks ids={o.sources} sources={sources} />
        </div>
      ))}
    </div>
  );
}

const confidenceLabel = (c: string) => c.replace("-", " ");

function Head({ role, name, children }: { role: Role; name: string; children: React.ReactNode }) {
  return (
    <div className={`pick-head role-${role}`}>
      <ChampIcon name={name} role={role} size="lg" />
      <div><span className="role-tag">{role}</span><h2>{name}</h2></div>
      <span className="end">{children}</span>
    </div>
  );
}

export function PairingCard({ item, names, sources, compact = false, draftLabels }: {
  item: CardRecord; names: Names; sources: Sources; compact?: boolean; draftLabels?: Record<string, string>;
}) {
  if (item.kind === "bot") {
    const r = item.record;
    return (
      <article className="panel pick-card">
        <Head role="BOT" name={names[r.champion]}>
          <span className="badge plain">{confidenceLabel(r.confidence)} confidence</span><span className="badge plain">{r.status}</span>
        </Head>
        <div className="identities">{r.identities.join(" · ")}</div>
        <LayerBlock layer="clash">
          <dl className="kv">
            <dt>Clash default</dt><dd><ChipList ids={r.clashDefault} names={names} role="SUPPORT" strong /></dd>
            <dt>Alternatives</dt><dd><ChipList ids={r.alternatives} names={names} role="SUPPORT" notes={r.alternativeNotes} empty="none (default only)" /></dd>
            {!compact && <>
              <dt>Jungle</dt><dd><ChipList ids={r.surrounding.jungle} names={names} role="JUNGLE" /></dd>
              <dt>Mid</dt><dd><ChipList ids={r.surrounding.mid} names={names} role="MID" /></dd>
            </>}
          </dl>
        </LayerBlock>
        <LayerBlock layer="pro" title="Observed pro pairings">
          <Observed list={r.observedProPairings} names={names} sources={sources} role="SUPPORT" draftLabels={draftLabels} />
          {!compact && r.playoffRead && <p className="small" style={{ marginTop: 6 }}><b>Current playoff read:</b> {r.playoffRead}</p>}
        </LayerBlock>
        {r.logic.warning && <LayerBlock layer="logic" title="Warning"><p className="small">{r.logic.warning}</p></LayerBlock>}
        {!compact && r.sources.length > 0 && <div className="pick-foot"><SourceLinks ids={r.sources} sources={sources} /></div>}
      </article>
    );
  }
  if (item.kind === "mid-jungle") {
    const r = item.record;
    const other: Role = r.role === "MID" ? "JUNGLE" : "MID";
    return (
      <article className="panel pick-card">
        <Head role={r.role} name={names[r.anchor]}>
          <span className="badge plain">{confidenceLabel(r.confidence)} confidence</span>
          <span className={`badge ${r.status === "downgraded" ? "caution" : "plain"}`}>{r.status}</span>
        </Head>
        <div className="identities">{r.identities.join(" · ")}</div>
        <LayerBlock layer="clash">
          <dl className="kv">
            <dt>Primary {other.toLowerCase()}</dt><dd><ChipList ids={r.clashDefault} names={names} role={other} strong /></dd>
            <dt>Secondary</dt><dd><ChipList ids={r.alternatives} names={names} role={other} /></dd>
            {!compact && <><dt>Bot shape</dt><dd><span className="chip-list">{r.botShapes.length ? r.botShapes.map((d) => <Duo key={d.bot + d.support} bot={d.bot} support={d.support} names={names} />) : <span className="muted small">none</span>}</span></dd></>}
          </dl>
        </LayerBlock>
        <LayerBlock layer="pro" title={`Observed pro ${other.toLowerCase()} partners`}>
          <Observed list={r.observedProPairings} names={names} sources={sources} role={other} draftLabels={draftLabels} />
          {!compact && <ObservedShapes list={r.observedBotShapes} names={names} sources={sources} anchor={r.anchor} draftLabels={draftLabels} />}
          {!compact && r.playoffRead && <p className="small" style={{ marginTop: 6 }}><b>Current playoff read:</b> {r.playoffRead}</p>}
        </LayerBlock>
        {r.history.length > 0 && (
          <section className="layer">
            <div className="layer-label"><span className="badge outline">History</span> Older tendencies, not current</div>
            {r.history.map((h) => <p key={h.partner} className="small"><b>{names[r.anchor]} + {names[h.partner]}</b> <span className="muted">({h.era})</span>: {h.note}</p>)}
          </section>
        )}
        {!compact && r.sources.length > 0 && <div className="pick-foot"><SourceLinks ids={r.sources} sources={sources} /></div>}
      </article>
    );
  }
  const r = item.record;
  return (
    <article className="panel pick-card">
      <Head role="TOP" name={names[r.champion]}>
        <span className="badge clash" title="Clash blind grade">Blind {r.blindGrade}</span>
        <span className={`badge ${r.status === "downgraded" ? "caution" : "plain"}`}>{r.status}</span>
      </Head>
      <div className="identities">{r.identities.join(" · ")}</div>
      <LayerBlock layer="clash" title="My Clash Recommendation: surrounding comp">
        <dl className="kv">
          <dt>Jungle</dt><dd><ChipList ids={r.surrounding.jungle} names={names} role="JUNGLE" /></dd>
          <dt>Mid</dt><dd><ChipList ids={r.surrounding.mid} names={names} role="MID" /></dd>
          <dt>Bot shape</dt><dd><span className="chip-list">{r.surrounding.botShapes.map((d) => <Duo key={d.bot + d.support} bot={d.bot} support={d.support} names={names} />)}</span></dd>
        </dl>
      </LayerBlock>
      <LayerBlock layer="pro" title="Observed pro evidence"
        end={item.stats && <span className="xs muted tnum">{item.stats.picks} playoff picks · {Math.round(item.stats.winRate * 100)}% WR{item.stats.lowSample ? " · low sample" : ""}</span>}>
        {!compact && <Observed list={r.observedProPairings} names={names} sources={sources} role="JUNGLE" draftLabels={draftLabels} />}
        {!compact && <ObservedShapes list={r.observedBotShapes} names={names} sources={sources} anchor={r.champion} draftLabels={draftLabels} />}
        {r.playoffRead && <p className="small" style={{ marginTop: 6 }}><b>Current playoff read:</b> {r.playoffRead}</p>}
      </LayerBlock>
      <LayerBlock layer="logic">
        <dl className="kv">
          <dt>Gives</dt><dd className="small">{r.logic.gives}</dd>
          <dt>Avoid</dt><dd className="small">{r.logic.avoid}</dd>
        </dl>
      </LayerBlock>
      {!compact && r.sources.length > 0 && <div className="pick-foot"><SourceLinks ids={r.sources} sources={sources} /></div>}
    </article>
  );
}

export { EvidenceBadge };
