import Link from "next/link";
import { ROLES, type BotPairing, type CompShell, type ObservedBotShape, type ObservedPairing, type Role, type Source } from "@/lib/schema";
import { Disclosure } from "./Disclosure";
import { PARTNER_ROLE, type ProGame } from "@/lib/pool-stats";
import type { ProposedLink } from "@/lib/proposed";
import { ProposedGroups, ProposedTag, type ProCount } from "./ProposedSynergy";
import { groupObserved, shortDate, type EventMap } from "@/lib/evidence";
import type { CardRecord } from "./PairingCard";
import { ChampIcon, Chip, ChipList, Duo, SourceLinks } from "./ui";
import { patchLabel } from "@/lib/patch";

// Champion Synergies scouting report: one selected champion, read top to bottom as header, Synergy, Pro Pairings, Warning,
// Sources. Presentation only; the three layers keep their own sections and colors. The Draft Room keeps PairingCard.

type Names = Record<string, string>;
type Sources = Record<string, Source>;

const label = (s: string) => s.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

function Section({ layer, title, end, proposed, children }: { layer?: "clash" | "pro" | "logic"; title: string; end?: React.ReactNode; proposed?: boolean; children: React.ReactNode }) {
  return (
    <section className={`scout-sec ${layer ? `layer ${layer}` : ""}${proposed ? " proposed" : ""}`}>
      <h3 className="scout-title">{layer && <span className="ldot" />}{title}{end && <span className="end">{end}</span>}</h3>
      {children}
    </section>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="scout-group"><div className="scout-group-title">{title}</div>{children}</div>;
}

function Header({ role, id, name, confidence, identities, children }: {
  role: Role; id: string; name: string; confidence?: string; identities: string[]; children?: React.ReactNode;
}) {
  return (
    <header className={`scout-head role-${role}`}>
      <ChampIcon id={id} name={name} role={role} size="xxl" />
      <div className="scout-id">
        <h2>{name}</h2>
        <div className="scout-meta">
          <span className={`role-tag role-${role}`}>{role}</span>
          {confidence && <span>{label(confidence.replace("-", " "))} confidence</span>}
          {children}
        </div>
        {identities.length > 0 && <div className="scout-tags">{identities.map((t) => <span key={t}>{label(t)}</span>)}</div>}
      </div>
    </header>
  );
}

/** Pro pairings as a compact table: one row per partner and event, freshest first; older evidence sits under it. */
function ProTable({ list, names, sources, events, role, partnerLabel, draftLabels }: {
  list: ObservedPairing[]; names: Names; sources: Sources; events: EventMap; role: Role; partnerLabel: string; draftLabels?: Record<string, string>;
}) {
  if (!list.length) return <p className="muted xs">No recorded pro game shows a pairing for this pick.</p>;
  return (
    <div className="scout-table">
      <table className="pro-table">
        <thead><tr><th>{partnerLabel}</th><th className="num">Games</th><th>Event</th><th>Patch</th><th>Date</th><th>Notes</th></tr></thead>
        <tbody>
          {groupObserved(list, events, sources).flatMap((g) => g.lines.map((l, i) => {
            const o = l.pairing;
            const pending = !o.backedByGame && o.sources.length > 0 && o.sources.every((id) => sources[id]?.pendingClaim);
            return (
              <tr key={g.champion + i} className={i > 0 ? "older" : undefined}>
                <td>{i === 0 ? <Chip id={o.champion} name={names[o.champion] ?? o.champion} role={role} /> : <span className="obs-older">older</span>}</td>
                <td className="num">{l.games || "–"}</td>
                <td>{l.label}{l.ongoing && <span className="faint" title="Event still running; counts are not final"> · ongoing</span>}</td>
                <td className="tnum">{l.patch ? patchLabel(l.patch) : "–"}</td>
                <td className="tnum">{shortDate(l.date) ?? "–"}</td>
                <td className="notes">
                  {o.backedByGame && draftLabels && o.proDraftIds.map((d) => draftLabels[d] ?? d).join(", ")}
                  {!o.backedByGame && (pending
                    ? <span className="faint" title="Not in the recorded drafts; the cited Gol.gg page was supplied during review and is pending refresh">pending refresh</span>
                    : <span className="caution-text" title="Cited by the workbook; no recorded draft shows it yet">not in recorded drafts</span>)}
                  {o.era === "earlier-2026" && <span className="faint"> · earlier 2026</span>}
                </td>
              </tr>
            );
          }))}
        </tbody>
      </table>
    </div>
  );
}

function ProShapes({ list, names, anchor, draftLabels }: { list: ObservedBotShape[]; names: Names; anchor: string; draftLabels?: Record<string, string> }) {
  if (!list.length) return null;
  return (
    <Group title="Pro bot lanes">
      <ul className="scout-shapes">
        {list.map((o) => (
          <li key={o.bot + o.support}>
            <Duo bot={o.bot} support={o.support} names={names} />
            <span className="muted xs">
              {o.withAnchor ? `with ${names[anchor]}` : `not alongside ${names[anchor]}`}
              {o.proDraftIds.length ? `: ${o.proDraftIds.map((d) => draftLabels?.[d] ?? d).join(", ")}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </Group>
  );
}

const Read = ({ text }: { text?: string }) => (text ? <p className="scout-read"><b>Current playoff read:</b> {text}</p> : null);

function Warning({ title = "Warning", children }: { title?: string; children: React.ReactNode }) {
  return <Section layer="logic" title={title}><div className="scout-callout">{children}</div></Section>;
}

/** Every Gol.gg page the report leans on, collapsed so links never compete with the drafting read. */
function SourcesSection({ ids, sources }: { ids: string[]; sources: Sources }) {
  const unique = [...new Set(ids)].filter((id) => sources[id]);
  if (!unique.length) return null;
  return (
    <details className="scout-sources">
      <summary>Sources <span className="tnum">({unique.length})</span></summary>
      <SourceLinks ids={unique} sources={sources} />
    </details>
  );
}

/** Synergy groups. Columns follow the section's width (container queries in globals.css), and a grid holding written
 *  notes stays at two columns until there is room for four readable ones. */
const SBox = ({ children, noted, support }: { children: React.ReactNode; noted?: boolean; support?: boolean }) => {
  const n = Array.isArray(children) ? children.filter(Boolean).length : 1;
  return <div className={`scout-grid n${n}${noted ? " noted" : ""}${support ? " support" : ""}`}>{children}</div>;
};
const Shapes = ({ list, names }: { list: { bot: string; support: string }[]; names: Names }) =>
  list.length ? <span className="chip-list">{list.map((d) => <Duo key={d.bot + d.support} bot={d.bot} support={d.support} names={names} />)}</span> : <span className="muted small">none</span>;

const allSources = (own: string[], pairings: ObservedPairing[], shapes: ObservedBotShape[] = []) =>
  [...own, ...pairings.flatMap((o) => o.sources), ...shapes.flatMap((s) => s.sources)];

/** Claude's proposed partners, in their own section under alan's Synergy (never inside it). */
function ProposedSection({ links, names, proCount, noteFor }: { links: ProposedLink[]; names: Names; proCount?: ProCount; noteFor?: (l: ProposedLink) => string | undefined }) {
  if (!links.length) return null;
  return (
    <Section layer="clash" proposed title="Proposed synergy" end={<ProposedTag />}>
      {/* Below alan's saved record, proposals stay folded so they never outweigh it. */}
      <details className="disclosure prop-fold">
        <summary>{links.length} kit-based partner{links.length === 1 ? "" : "s"}, not saved</summary>
        <div className="disclosure-body"><ProposedGroups links={links} names={names} proCount={proCount} noteFor={noteFor} /></div>
      </details>
    </Section>
  );
}

/** Comp Library shells built around this pick in this role (exact slot first, then as a listed swap). Top and Support
 *  pages only (alan, 2026-10-12: comp shells for top, comp styles for support). Shells are the Comp Library's own data. */
function CompShells({ shells, id, role, names }: { shells: CompShell[]; id: string; role: Role; names: Names }) {
  const rows = shells.map((shell) => ({ shell, exact: shell.slots[role].champion === id, swap: shell.slots[role].swaps.includes(id) }))
    .filter((x) => x.exact || x.swap).sort((a, b) => Number(b.exact) - Number(a.exact));
  if (!rows.length) return null;
  return (
    <Section layer="logic" title={role === "TOP" ? "Comp shells" : "Comp styles"}>
      <Disclosure summary={`${rows.length} comp${rows.length === 1 ? "" : "s"} with ${names[id]} at ${role === "TOP" ? "top" : "support"}`}>
        <div className="shell-list">
          {rows.map(({ shell, exact }) => (
            <div key={shell.id} className="shell-line">
              <div className="row">
                <Link href={`/comps#${shell.id}`}><b>{shell.name}</b></Link>
                <span className="xs faint">{shell.kind === "observed" ? "pro" : "template"}</span>
                <span className="xs muted">{exact ? "in the shell" : "listed swap"}</span>
              </div>
              <p className="xs muted">{ROLES.map((r) => names[shell.slots[r].champion]).join(" · ")} · {shell.winCondition}</p>
            </div>
          ))}
        </div>
      </Disclosure>
    </Section>
  );
}

/** Recorded pro games with this champion in this role (evidence only; a proposal never depends on them). */
function GameList({ games, role, names }: { games: ProGame[]; role: Role; names: Names }) {
  if (!games.length) return <p className="muted xs">No recorded pro game has this pick in this role. That says nothing about its synergy, only about pro evidence.</p>;
  const partner = PARTNER_ROLE[role];
  return (
    <div className="scout-table">
      <table className="pro-table">
        <thead><tr><th>Game</th><th>{partner === "MID" ? "Mid" : partner === "JUNGLE" ? "Jungle" : partner === "BOT" ? "Bot" : "Support"}</th><th>Event</th><th>Patch</th><th>Date</th></tr></thead>
        <tbody>
          {games.slice(0, 8).map((g) => (
            <tr key={g.key}>
              <td>{g.label}{g.pending && <span className="faint"> · pending refresh</span>}</td>
              <td>{g.picks[partner] ? <Chip id={g.picks[partner]} name={names[g.picks[partner]!] ?? g.picks[partner]!} role={partner} /> : "–"}</td>
              <td>{g.eventName}</td>
              <td className="tnum">{g.patch ? patchLabel(g.patch) : "–"}</td>
              <td className="tnum">{shortDate(g.date) ?? "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {games.length > 8 && <p className="xs faint">+{games.length - 8} older</p>}
    </div>
  );
}

export function ScoutingReport({ item, names, sources, events, draftLabels, proposed = [], proCount, games = [], bot = [], shells = [] }: {
  item: CardRecord; names: Names; sources: Sources; events: EventMap; draftLabels?: Record<string, string>;
  proposed?: ProposedLink[]; proCount?: ProCount; games?: ProGame[]; bot?: BotPairing[]; shells?: CompShell[];
}) {
  // A proposed bot for a support that the bot's own saved record does not list says so: the bot's record decides.
  const noteFor = (l: ProposedLink) => {
    if (l.role !== "BOT") return undefined;
    const rec = bot.find((b) => b.champion === l.id);
    return rec ? `not in ${names[l.id]}'s saved supports` : undefined;
  };
  if (item.kind === "proposed") {
    return (
      <article className="panel pick-card scout">
        <Header role={item.role} id={item.id} name={names[item.id]} identities={[]}><ProposedTag /></Header>
        {item.confirmed.length > 0 && (
          <Section layer="clash" title="Saved synergy" end={<span className="faint">from your saved records</span>}>
            <SBox>{item.confirmed.map((g) => <Group key={g.label} title={g.label}><ChipList ids={g.ids} names={names} role={g.role} strong /></Group>)}</SBox>
          </Section>
        )}
        <Section layer="clash" proposed title="Proposed synergy" end={<ProposedTag />}>
          {item.identity && <p className="prop-identity">{item.identity}</p>}
          <ProposedGroups links={item.links} names={names} proCount={proCount} noteFor={noteFor} />
        </Section>
        {(item.role === "TOP" || item.role === "SUPPORT") && <CompShells shells={shells} id={item.id} role={item.role} names={names} />}
        <Section layer="pro" title="Pro pairings">
          <GameList games={games} role={item.role} names={names} />
        </Section>
      </article>
    );
  }
  if (item.kind === "bot") {
    const r = item.record;
    return (
      <article className="panel pick-card scout">
        <Header role="BOT" id={r.champion} name={names[r.champion]} confidence={r.confidence} identities={r.identities} />
        <Section layer="clash" title="Synergy">
          <SBox noted={r.alternatives.some((id) => r.alternativeNotes[id])}>
            <Group title="Preferred"><ChipList ids={r.clashDefault} names={names} role="SUPPORT" strong /></Group>
            <Group title="Alternatives"><ChipList ids={r.alternatives} names={names} role="SUPPORT" notes={r.alternativeNotes} empty="none (default only)" /></Group>
          </SBox>
          <SBox support>
            <Group title="Best jungle partners"><ChipList ids={r.surrounding.jungle} names={names} role="JUNGLE" /></Group>
            <Group title="Best mids"><ChipList ids={r.surrounding.mid} names={names} role="MID" /></Group>
          </SBox>
        </Section>
        <ProposedSection links={proposed} names={names} proCount={proCount} />
        <Section layer="pro" title="Pro pairings">
          <ProTable list={r.observedProPairings} names={names} sources={sources} events={events} role="SUPPORT" partnerLabel="Support" draftLabels={draftLabels} />
          <Read text={r.playoffRead} />
        </Section>
        {r.logic.warning && <Warning><p>{r.logic.warning}</p></Warning>}
        <SourcesSection ids={allSources(r.sources, r.observedProPairings)} sources={sources} />
      </article>
    );
  }
  if (item.kind === "mid-jungle") {
    const r = item.record;
    const other: Role = r.role === "MID" ? "JUNGLE" : "MID";
    const otherName = other === "MID" ? "mid" : "jungle";
    return (
      <article className="panel pick-card scout">
        <Header role={r.role} id={r.anchor} name={names[r.anchor]} confidence={r.confidence} identities={r.identities}>
          {r.status === "downgraded" && <span className="caution-text">downgraded</span>}
        </Header>
        <Section layer="clash" title="Synergy">
          <SBox>
            <Group title={`Preferred ${otherName}`}><ChipList ids={r.clashDefault} names={names} role={other} strong /></Group>
            <Group title="Alternatives"><ChipList ids={r.alternatives} names={names} role={other} notes={r.alternativeNotes} /></Group>
          </SBox>
          {r.botShapes.length > 0 && (
            <SBox support>
              <Group title="Compatible bot shapes"><Shapes list={r.botShapes} names={names} /></Group>
            </SBox>
          )}
        </Section>
        <ProposedSection links={proposed} names={names} proCount={proCount} />
        <Section layer="pro" title="Pro pairings">
          <ProTable list={r.observedProPairings} names={names} sources={sources} events={events} role={other} partnerLabel={other === "MID" ? "Mid" : "Jungle"} draftLabels={draftLabels} />
          <ProShapes list={r.observedBotShapes} names={names} anchor={r.anchor} draftLabels={draftLabels} />
          <Read text={r.playoffRead} />
        </Section>
        {r.history.length > 0 && (
          <Section title="History" end={<span className="faint">older tendencies, not current</span>}>
            {r.history.map((h) => <p key={h.partner} className="small"><b>{names[r.anchor]} + {names[h.partner]}</b> <span className="muted">({h.era})</span>: {h.note}</p>)}
          </Section>
        )}
        <SourcesSection ids={allSources(r.sources, r.observedProPairings, r.observedBotShapes)} sources={sources} />
      </article>
    );
  }
  const r = item.record;
  const s = item.stats;
  return (
    <article className="panel pick-card scout">
      <Header role="TOP" id={r.champion} name={names[r.champion]} identities={r.identities}>
        <span title="Blind-pick grade">Blind <b className="grade">{r.blindGrade}</b></span>
        {r.status === "downgraded" && <span className="caution-text">downgraded</span>}
      </Header>
      <Section layer="clash" title="Synergy">
        <SBox>
          <Group title="Best jungle partners"><ChipList ids={r.surrounding.jungle} names={names} role="JUNGLE" /></Group>
          <Group title="Best mids"><ChipList ids={r.surrounding.mid} names={names} role="MID" /></Group>
          {r.surrounding.botShapes.length > 0 && <Group title="Bot shapes"><Shapes list={r.surrounding.botShapes} names={names} /></Group>}
        </SBox>
      </Section>
      <ProposedSection links={proposed} names={names} proCount={proCount} />
      <CompShells shells={shells} id={r.champion} role="TOP" names={names} />
      <Section layer="pro" title="Pro pairings"
        end={s && <span className="tnum">{s.picks} playoff picks · {Math.round(s.winRate * 100)}% WR{s.lowSample ? " · low sample" : ""}</span>}>
        <ProTable list={r.observedProPairings} names={names} sources={sources} events={events} role="JUNGLE" partnerLabel="Jungle" draftLabels={draftLabels} />
        <ProShapes list={r.observedBotShapes} names={names} anchor={r.champion} draftLabels={draftLabels} />
        <Read text={r.playoffRead} />
      </Section>
      <Section layer="logic" title="Logic"><p className="small"><b>Gives</b> {r.logic.gives}</p></Section>
      <Warning><p><b>Avoid</b> {r.logic.avoid}</p></Warning>
      <SourcesSection ids={allSources(r.sources, r.observedProPairings, r.observedBotShapes)} sources={sources} />
    </article>
  );
}
