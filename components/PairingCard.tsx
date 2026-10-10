import { Fragment } from "react";
import type { BotPairing, MidJunglePairing, ObservedBotShape, ObservedPairing, Role, Source, TopPick } from "@/lib/schema";
import { describeLine, groupObserved, type EventMap } from "@/lib/evidence";
import type { ProposedCard } from "@/lib/proposed";
import { ProposedGroups, ProposedTag } from "./ProposedSynergy";
import { ChampIcon, Chip, ChipList, Duo, EvidenceBadge, LayerBlock, SourceLinks } from "./ui";

type Names = Record<string, string>;
type Sources = Record<string, Source>;

export type CardRecord =
  | { kind: "bot"; record: BotPairing }
  | { kind: "mid-jungle"; record: MidJunglePairing }
  | { kind: "top"; record: TopPick; stats?: { picks: number; winRate: number; lowSample: boolean } }
  | ProposedCard;

function ObservedShapes({ list, names, sources, anchor, draftLabels }: {
  list: ObservedBotShape[]; names: Names; sources: Sources; anchor: string; draftLabels?: Record<string, string>;
}) {
  if (!list.length) return null;
  return (
    <div style={{ marginTop: 6 }}>
      <div className="xs muted" style={{ marginBottom: 2 }}><b>Pro bot lanes</b></div>
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

function Observed({ list, names, sources, events, role, draftLabels }: {
  list: ObservedPairing[]; names: Names; sources: Sources; events: EventMap; role: Role; draftLabels?: Record<string, string>;
}) {
  if (!list.length) return <p className="muted xs">No recorded pro game shows a pairing for this pick.</p>;
  // One block per partner, freshest event first (16.18 above 16.16); older evidence sits under it.
  return (
    <div>
      {groupObserved(list, events, sources).map((g) => (
        <div key={g.champion} className="obs-group">
          {g.lines.map((l, i) => {
            const o = l.pairing;
            return (
              <div key={i} className="obs-row">
                {i === 0 ? <Chip id={o.champion} name={names[o.champion] ?? o.champion} role={role} /> : <span className="obs-older">older</span>}
                <span className="badge pro tnum">{describeLine(l)}</span>
                {l.ongoing && <span className="badge plain" title="Event still running; counts are not final">ongoing</span>}
                {!o.backedByGame && (o.sources.length > 0 && o.sources.every((id) => sources[id]?.pendingClaim)
                  ? <span className="badge plain" title="Not in the recorded drafts; the cited Gol.gg page was supplied during review and is pending refresh">pending refresh</span>
                  : <span className="badge caution" title="Cited by the workbook; no recorded draft shows it yet">not in recorded drafts</span>)}
                {o.backedByGame && draftLabels && <span className="ctx">{o.proDraftIds.map((d) => draftLabels[d] ?? d).join(", ")}</span>}
                {o.era === "earlier-2026" && <span className="ctx">earlier 2026</span>}
                <SourceLinks ids={o.sources} sources={sources} />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const confidenceLabel = (c: string) => c.replace("-", " ");

function Head({ role, id, name, children }: { role: Role; id: string; name: string; children: React.ReactNode }) {
  return (
    <div className={`pick-head role-${role}`}>
      <ChampIcon id={id} name={name} role={role} size="xl" />
      <div><span className={`role-tag role-${role}`}>{role}</span><h2>{name}</h2></div>
      <span className="end">{children}</span>
    </div>
  );
}

export function PairingCard({ item, names, sources, events, compact = false, draftLabels }: {
  item: CardRecord; names: Names; sources: Sources; events: EventMap; compact?: boolean; draftLabels?: Record<string, string>;
}) {
  if (item.kind === "bot") {
    const r = item.record;
    return (
      <article className="panel pick-card">
        <Head role="BOT" id={r.champion} name={names[r.champion]}>
          <span className="xs faint">{confidenceLabel(r.confidence)} confidence</span>
        </Head>
        <div className="identities">{r.identities.join(" · ")}</div>
        <LayerBlock layer="clash">
          <dl className="kv">
            <dt>Preferred</dt><dd><ChipList ids={r.clashDefault} names={names} role="SUPPORT" strong /></dd>
            <dt>Alternatives</dt><dd><ChipList ids={r.alternatives} names={names} role="SUPPORT" notes={r.alternativeNotes} empty="none (default only)" /></dd>
            {!compact && <>
              <dt>Jungle</dt><dd><ChipList ids={r.surrounding.jungle} names={names} role="JUNGLE" /></dd>
              <dt>Mid</dt><dd><ChipList ids={r.surrounding.mid} names={names} role="MID" /></dd>
            </>}
          </dl>
        </LayerBlock>
        <LayerBlock layer="pro" title="Pro pairings">
          <Observed list={r.observedProPairings} names={names} sources={sources} events={events} role="SUPPORT" draftLabels={draftLabels} />
          {!compact && r.playoffRead && <p className="small" style={{ marginTop: 6 }}><b>Current playoff read:</b> {r.playoffRead}</p>}
        </LayerBlock>
        {r.logic.warning && <LayerBlock layer="logic" title="Warning"><p className="small">{r.logic.warning}</p></LayerBlock>}
        {!compact && r.sources.length > 0 && <div className="pick-foot"><SourceLinks ids={r.sources} sources={sources} /></div>}
      </article>
    );
  }
  if (item.kind === "proposed") {
    // No saved record for this pick in this role: Claude's proposed partners, labelled as such, plus any saved links
    // that reach it from other records.
    return (
      <article className="panel pick-card">
        <Head role={item.role} id={item.id} name={names[item.id]}><ProposedTag /></Head>
        {item.identity && <div className="identities">{item.identity}</div>}
        {item.confirmed.length > 0 && (
          <LayerBlock layer="clash">
            <dl className="kv">{item.confirmed.map((g) => <Fragment key={g.label}><dt>{g.label}</dt><dd><ChipList ids={g.ids} names={names} role={g.role} /></dd></Fragment>)}</dl>
          </LayerBlock>
        )}
        <section className="layer clash proposed">
          <div className="layer-label"><span className="ldot" />Proposed synergy</div>
          <ProposedGroups links={compact ? item.links.filter((l) => l.tier === "preferred") : item.links} names={names} compact />
        </section>
      </article>
    );
  }
  if (item.kind === "mid-jungle") {
    const r = item.record;
    const other: Role = r.role === "MID" ? "JUNGLE" : "MID";
    return (
      <article className="panel pick-card">
        <Head role={r.role} id={r.anchor} name={names[r.anchor]}>
          <span className="xs faint">{confidenceLabel(r.confidence)} confidence</span>
          {r.status === "downgraded" && <span className="badge caution">downgraded</span>}
        </Head>
        <div className="identities">{r.identities.join(" · ")}</div>
        <LayerBlock layer="clash">
          <dl className="kv">
            <dt>Primary {other.toLowerCase()}</dt><dd><ChipList ids={r.clashDefault} names={names} role={other} strong /></dd>
            <dt>Secondary</dt><dd><ChipList ids={r.alternatives} names={names} role={other} notes={r.alternativeNotes} /></dd>
            {!compact && <><dt>Bot shape</dt><dd><span className="chip-list">{r.botShapes.length ? r.botShapes.map((d) => <Duo key={d.bot + d.support} bot={d.bot} support={d.support} names={names} />) : <span className="muted small">none</span>}</span></dd></>}
          </dl>
        </LayerBlock>
        <LayerBlock layer="pro" title={`Pro ${other.toLowerCase()} partners`}>
          <Observed list={r.observedProPairings} names={names} sources={sources} events={events} role={other} draftLabels={draftLabels} />
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
      <Head role="TOP" id={r.champion} name={names[r.champion]}>
        <span className="xs muted" title="Blind-pick grade">Blind <b className="grade">{r.blindGrade}</b></span>
        {r.status === "downgraded" && <span className="badge caution">downgraded</span>}
      </Head>
      <div className="identities">{r.identities.join(" · ")}</div>
      <LayerBlock layer="clash" title="Synergy: surrounding comp">
        <dl className="kv">
          <dt>Jungle</dt><dd><ChipList ids={r.surrounding.jungle} names={names} role="JUNGLE" /></dd>
          <dt>Mid</dt><dd><ChipList ids={r.surrounding.mid} names={names} role="MID" /></dd>
          <dt>Bot shape</dt><dd><span className="chip-list">{r.surrounding.botShapes.map((d) => <Duo key={d.bot + d.support} bot={d.bot} support={d.support} names={names} />)}</span></dd>
        </dl>
      </LayerBlock>
      <LayerBlock layer="pro" title="Pro evidence"
        end={item.stats && <span className="xs muted tnum">{item.stats.picks} playoff picks · {Math.round(item.stats.winRate * 100)}% WR{item.stats.lowSample ? " · low sample" : ""}</span>}>
        {!compact && <Observed list={r.observedProPairings} names={names} sources={sources} events={events} role="JUNGLE" draftLabels={draftLabels} />}
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
