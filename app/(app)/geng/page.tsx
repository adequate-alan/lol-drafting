import Link from "next/link";
import { ChampionProvider } from "@/components/ChampionInteraction";
import { GenRang } from "@/components/GenRang";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { ChampionRow, SectionHeader, SourceLinks } from "@/components/ui";
import { getDrawerData, getGenG, getMeta, getProDrafts, getTeamPlayers } from "@/lib/data";
import { profileHref } from "@/lib/pinned-players";
import { nameMap, sourceMap } from "@/lib/lookup";
import { ROLES, type GenGPattern } from "@/lib/schema";

// Each section names itself in the tab and in history, so a route change is announced (layout template adds the site).
export const metadata = { title: "Gen.G" };

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
  // The LCK playoff sample only: current-meta events (Demacia Cup, Worlds 2026 imports) stay off this page.
  const drafts = getProDrafts().filter((d) => d.team === "Gen.G" && d.tournament === getMeta().tournament.name);
  const label = Object.fromEntries(drafts.map((d) => [d.id, d.seriesGame]));
  const current = patterns.filter((p) => p.era !== "earlier-2026").length;
  // Gen.G players with recorded builds (their latest recorded team), each opening their Pro Builds profile.
  const players = getTeamPlayers("Gen.G");
  return (
    <ChampionProvider data={getDrawerData()} context={{ page: "geng" }}>
      <div className="brand-band">
        <div className="band-text">
          <h1>Gen.G</h1>
          <span className="desc">{drafts.length} recorded playoff drafts and {current} current patterns from the LCK. Earlier-2026 tendencies are marked as such.</span>
        </div>
        <GenRang variant="full" size={84} className="band-mascot" />
      </div>
      {players.length > 0 && (
        <ul className="team-players" aria-label="Gen.G players with recorded builds">
          {players.map((p) => (
            <li key={p.id}>
              <Link className="player-chip" href={profileHref(String(p.id))} title={`${p.name}'s recorded games, champions and builds`}>
                <PlayerAvatar id={p.id} name={p.name} size="lg" />
                <span className="team-player-text"><b>{p.name}</b><span className="xs muted">{p.role} · {p.games} recorded game{p.games === 1 ? "" : "s"}</span></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="patterns">
        {KINDS.map(({ kind, title }) => {
          const list = patterns.filter((p) => p.kind === kind);
          if (!list.length) return null;
          return (
            <section key={kind} className="pattern-group">
              <SectionHeader title={title} meta={list.length} />
              {list.map((p) => (
                <div key={p.title} className={`pattern ${p.era === "earlier-2026" ? "earlier" : "current"}`}>
                  <div className="row">
                    <span className="p-title">{p.title}</span>
                    {p.era === "earlier-2026" && <span className="badge caution">earlier 2026, not current</span>}
                  </div>
                  <p>{p.detail}</p>
                  <div className="row xs">
                    {p.proDraftIds.length === drafts.length && drafts.length > 3
                      ? <Link className="game-link" href="/pro-drafts?team=Gen.G">All {drafts.length} games</Link>
                      : p.proDraftIds.map((id) => <Link key={id} className="game-link" href={`/pro-drafts?team=Gen.G&id=${id}`}>{label[id] ?? id}</Link>)}
                    <SourceLinks ids={p.sources} sources={sources} />
                  </div>
                </div>
              ))}
            </section>
          );
        })}
      </div>
      <SectionHeader title="Exact Gen.G drafts" meta={`${drafts.length} recorded games`} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Game</th><th>vs</th>{ROLES.map((r) => <th key={r}><span className={`role-tag role-${r}`}>{r}</span></th>)}<th>Read</th><th>Source</th></tr></thead>
          <tbody>
            {drafts.map((d) => (
              <tr key={d.id}>
                <td><Link className="cell-link nowrap" href={`/pro-drafts?team=Gen.G&id=${d.id}`}>{d.seriesGame}</Link></td>
                <td className="muted nowrap">{d.opponent}</td>
                {ROLES.map((r) => <td key={r}><ChampionRow id={d.picks[r]} name={names[d.picks[r]] ?? d.picks[r]} role={r} /></td>)}
                <td className="xs wrap">{d.read}{d.note ? <div className="muted">{d.note}</div> : null}</td>
                <td><SourceLinks ids={d.sources} sources={sources} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChampionProvider>
  );
}
