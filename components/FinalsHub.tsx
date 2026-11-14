// Gen.G's Worlds 2026 Finals hub (alan, 2026-11-14): the Grand Final against Bilibili Gaming, the road there and a
// comparison of how both teams drafted at the main event. Everything is counted from the recorded games (lib/finals.ts)
// and shown with its sample; the comp read beside a lineup is the comp check's. The page follows the records: scheduled
// until a final game is recorded, the result once a team has three wins. Never "live": there is no live source.
import Link from "next/link";
import { Disclosure } from "@/components/Disclosure";
import { FinalsLab } from "@/components/FinalsLab";
import { GenRang } from "@/components/GenRang";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { ChampionRow, SectionHeader } from "@/components/ui";
import type { FinalsData } from "@/lib/data";
import { BLG, FINAL_INFO, GENG, onlyPicked, pickedAndBanned, type Count, type GameLine, type Matchup, type PlayerLine, type SeriesLine, type Tendencies } from "@/lib/finals";
import { profileHref } from "@/lib/pinned-players";
import { ROLES, type Role } from "@/lib/schema";

const ROLE_NAME: Record<Role, string> = { TOP: "Top", JUNGLE: "Jungle", MID: "Mid", BOT: "Bot", SUPPORT: "Support" };
const SHORT: Record<string, string> = { [GENG]: "Gen.G", [BLG]: "BLG" };
const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const gameHref = (team: string, g: GameLine) => `/pro-drafts?team=${encodeURIComponent(team)}&id=${g.draft}&view=order`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

type Names = Record<string, string>;

/** Champions with a count each, "n/of" in mono; the count is how often, never how strong. */
function Counts({ list, of, names, role, limit = 6, empty = "None recorded" }: { list: (Count & { of?: number; role?: Role })[]; of?: number; names: Names; role?: Role; limit?: number; empty?: string }) {
  if (!list.length) return <span className="muted small">{empty}</span>;
  return (
    <ul className="count-list">
      {list.slice(0, limit).map((c) => (
        <li key={`${c.role ?? ""}${c.champion}`}>
          <ChampionRow id={c.champion} name={names[c.champion] ?? c.champion} role={c.role ?? role} />
          <span className="tnum count">{c.n}{(c.of ?? of) != null && <span className="faint">/{c.of ?? of}</span>}</span>
        </li>
      ))}
    </ul>
  );
}

/** One topic, Gen.G beside Bilibili Gaming; on phones the two stack under the topic, each named. */
function Versus({ title, note, geng, blg }: { title: string; note?: React.ReactNode; geng: React.ReactNode; blg: React.ReactNode }) {
  return (
    <div className="vs-row">
      <div className="vs-topic"><h3>{title}</h3>{note && <p className="xs muted">{note}</p>}</div>
      <div className="vs-side"><span className="vs-team">Gen.G</span>{geng}</div>
      <div className="vs-side"><span className="vs-team">BLG</span>{blg}</div>
    </div>
  );
}

function Header({ data }: { data: FinalsData }) {
  const { final, geng, blg } = data;
  const a = geng.tendencies, b = blg.tendencies;
  const done = final.status === "complete";
  return (
    <header className="finals-head" aria-labelledby="finals-title">
      <p className="finals-kicker">{FINAL_INFO.title}{done ? " · final result" : ""}</p>
      <h2 id="finals-title" className="finals-title">
        <span className={`finals-team ${final.winner === GENG ? "won" : ""}`}><GenRang size={34} />Gen.G</span>
        {final.games.length ? <span className="finals-score tnum" aria-label={`Gen.G ${final.geng}, Bilibili Gaming ${final.blg}`}>{final.geng}<span className="faint">–</span>{final.blg}</span> : <span className="finals-vs">vs</span>}
        <span className={`finals-team ${final.winner === BLG ? "won" : ""}`}>Bilibili Gaming</span>
      </h2>
      {done ? (
        <p className="finals-status">
          {final.winner === GENG
            ? <><b>Gen.G are the Worlds 2026 champions</b>, {final.geng}–{final.blg} over Bilibili Gaming.</>
            : <><b>Bilibili Gaming are the Worlds 2026 champions</b>, {final.blg}–{final.geng}. Gen.G finished as finalists.</>}
          {" "}From {plural(final.games.length, "recorded game")}; the game-by-game drafts are below.
        </p>
      ) : final.status === "underway" ? (
        <p className="finals-status"><b>{plural(final.games.length, "game")} recorded so far</b>, Gen.G {final.geng}–{final.blg} Bilibili Gaming. Games appear here after the pro-data refresh records them from Gol.gg, so this can trail the broadcast.</p>
      ) : (
        <p className="finals-status"><b>Scheduled.</b> No final game is recorded yet. Games appear here, and in Pro Drafts, after the pro-data refresh records them from Gol.gg.</p>
      )}
      <dl className="finals-facts">
        <div><dt>When</dt><dd>{FINAL_INFO.when}</dd></div>
        <div><dt>Format</dt><dd>{FINAL_INFO.format}</dd></div>
        <div><dt>Where</dt><dd>{FINAL_INFO.venue}</dd></div>
        <div><dt>Before the final</dt><dd className="tnum">Gen.G {a.wins}–{a.games - a.wins} · BLG {b.wins}–{b.games - b.wins} <span className="muted">· main event, patch {data.patches.join(", ")}</span></dd></div>
      </dl>
      <p className="finals-links">
        {!done && <a className="btn sm" href={FINAL_INFO.watch.url} target="_blank" rel="noopener noreferrer">{FINAL_INFO.watch.label}</a>}
        <a href="#road">Road to the Finals</a><a href="#preview">{final.games.length ? "Pre-final draft preview" : "Draft preview"}</a><a href="#lab">Draft Lab</a>
      </p>
      <p className="xs faint finals-supplied">Schedule, venue and the watch link were supplied on {FINAL_INFO.providedOn} and are not from Gol.gg records. Results, lineups and every count on this page come from recorded games.</p>
    </header>
  );
}

function Player({ p, team, names }: { p?: PlayerLine; team: string; names: Names }) {
  if (!p) return <span className="muted small">No player recorded</span>;
  return (
    <div className="mu-player">
      <Link className="player-chip" href={profileHref(String(p.id))} title={`${p.name}'s recorded games, champions and builds`}>
        <PlayerAvatar id={p.id} name={p.name} size="md" />
        <span className="mu-name"><b>{p.name}</b><span className="xs muted tnum">{SHORT[team]} · {p.games} games · {plural(p.champions.length, "champion")}</span></span>
      </Link>
      <Counts list={p.champions} of={p.games} names={names} limit={12} />
    </div>
  );
}

function Matchups({ list, names, sample }: { list: Matchup[]; names: Names; sample: string }) {
  return (
    <div className="matchups">
      {list.map((m) => (
        <div key={m.role} className="mu-row">
          <span className={`role-tag role-${m.role}`}>{m.role}</span>
          <Player p={m.geng} team={GENG} names={names} />
          <Player p={m.blg} team={BLG} names={names} />
          <p className="xs muted mu-shared">{m.shared.length ? <>Both played {m.shared.map((c) => names[c] ?? c).join(", ")}.</> : <>No champion both played {sample}.</>}</p>
        </div>
      ))}
    </div>
  );
}

function Road({ team, series, reads, names, final }: { team: string; series: SeriesLine[]; reads: FinalsData["geng"]["reads"]; names: Names; final: FinalsData["final"] }) {
  return (
    <div className="table-wrap">
      <table className="road-table geng-worlds">
        <thead><tr><th>Game</th>{ROLES.map((r) => <th key={r}><span className={`role-tag role-${r}`}>{r}</span></th>)}<th title="How the comp check reads the lineup. Analysis, not a record.">Comp read</th></tr></thead>
        {final.status === "scheduled" && team === GENG && (
          <tbody className="road-series upcoming">
            <tr className="road-head"><th colSpan={7} scope="rowgroup"><span className="road-stage">Grand Final</span><span className="road-opp">vs Bilibili Gaming</span><span className="muted">scheduled {day(FINAL_INFO.date)} · no game recorded yet</span></th></tr>
          </tbody>
        )}
        {series.map((s) => (
          <tbody key={s.id} className={`road-series ${s.final ? "final" : ""}`}>
            <tr className="road-head">
              <th colSpan={7} scope="rowgroup">
                <span className="road-stage">{s.stage}</span><span className="road-opp">vs {s.opponent}</span>
                <span className="tnum road-score">{s.wins}–{s.losses}</span>
                <span className="muted">{day(s.date)}{s.final && final.status === "underway" ? " · recorded so far" : ""}</span>
                <Link className="game-link" href={`/pro-drafts?team=${encodeURIComponent(team)}&series=${encodeURIComponent(`${s.games[0].side === "blue" ? team : s.opponent} vs ${s.games[0].side === "blue" ? s.opponent : team}`)}`}>Series in Pro Drafts</Link>
              </th>
            </tr>
            {s.games.map((g) => {
              const read = reads[g.id];
              return (
                <tr key={g.id}>
                  <td className="nowrap road-game">
                    <Link className="cell-link" href={gameHref(team, g)} title="Open this game's draft order in Pro Drafts">G{g.no}</Link>
                    <span className={`res ${g.won ? "win" : "loss"}`}>{g.won ? "W" : "L"}</span>
                    <span className="xs muted road-side">{g.side === "blue" ? "Blue" : "Red"}</span>
                    {g.firstPick && <span className="first-pick" title="Picked first in this game (Gol.gg First Pick mark)">1st pick</span>}
                  </td>
                  {ROLES.map((r) => <td key={r}><ChampionRow id={g.picks[r]} name={names[g.picks[r]] ?? g.picks[r]} role={r} /></td>)}
                  <td className="xs muted road-read" title={read?.winCondition}>{read ? [read.primary, read.secondary].filter(Boolean).join(" + ") : "Not read"}</td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}

const identityCounts = (t: FinalsData["geng"], ids: Set<number>) => {
  const m = new Map<string, number>();
  let unread = 0;
  for (const s of t.series) for (const g of s.games) {
    if (!ids.has(g.id)) continue;
    const r = t.reads[g.id];
    if (!r) { unread++; continue; }
    m.set(r.primary, (m.get(r.primary) ?? 0) + 1);
  }
  return { rows: [...m.entries()].sort((a, b) => b[1] - a[1]), unread };
};

function Identities({ t }: { t: FinalsData["geng"] }) {
  const pre = new Set(t.series.filter((s) => !s.final).flatMap((s) => s.games.map((g) => g.id)));
  const { rows, unread } = identityCounts(t, pre);
  return <p className="small ident-line">{rows.map(([id, n]) => <span key={id}>{id} <span className="tnum">{n}<span className="faint">/{pre.size}</span></span></span>)}{unread > 0 && <span className="muted">{unread} not read</span>}</p>;
}

function Pairs({ list, of, names, roles }: { list: Tendencies["midJungle"]; of: number; names: Names; roles: [Role, Role] }) {
  const repeated = list.filter((p) => p.n > 1);
  if (!repeated.length) return <span className="muted small">No pair played twice in {of} games ({list.length} different pairs).</span>;
  return (
    <ul className="count-list">
      {repeated.map((p) => (
        <li key={p.a + p.b}>
          <ChampionRow id={p.a} name={names[p.a] ?? p.a} role={roles[0]} /><span className="faint">+</span><ChampionRow id={p.b} name={names[p.b] ?? p.b} role={roles[1]} />
          <span className="tnum count">{p.n}<span className="faint">/{of}</span></span>
        </li>
      ))}
      <li className="muted small">{list.length} different pairs in {of} games</li>
    </ul>
  );
}

function UsageTable({ a, b }: { a: Tendencies; b: Tendencies }) {
  const cell = (t: Tendencies, r: Role) => { const u = t.usage[r]; return <><td className="tnum">{u.blind}<span className="faint">/{t.games}</span></td><td className="tnum">{u.response}<span className="faint">/{t.games}</span></td><td className="tnum muted">{u.uncertain}</td></>; };
  return (
    <div className="table-wrap">
      <table className="usage-table">
        <thead>
          <tr><th rowSpan={2}>Role</th><th colSpan={3}>Gen.G</th><th colSpan={3}>BLG</th></tr>
          <tr><th>Blind</th><th>Response</th><th>Unclear</th><th>Blind</th><th>Response</th><th>Unclear</th></tr>
        </thead>
        <tbody>{ROLES.map((r) => <tr key={r}><td><span className={`role-tag role-${r}`}>{r}</span></td>{cell(a, r)}{cell(b, r)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function Differences({ data, names }: { data: FinalsData; names: Names }) {
  const a = data.geng.tendencies, b = data.blg.tendencies;
  const n = (id: string) => names[id] ?? id;
  const top = (t: Tendencies) => ROLES.flatMap((r) => t.byRole[r].map((c) => ({ ...c, role: r }))).sort((x, y) => y.n - x.n)[0];
  const ta = top(a), tb = top(b);
  const onlyB = onlyPicked(b, a), onlyA = onlyPicked(a, b);
  const banB = pickedAndBanned(a, b), banA = pickedAndBanned(b, a);
  const list = (xs: { champion: string; n?: number; picks?: number; bans?: number }[]) => xs.map((x) => `${n(x.champion)} (${x.bans != null ? `${x.picks} picks, ${x.bans} bans` : x.n})`).join(", ");
  return (
    <ul className="diff-list">
      <li><b>First pick.</b> Gen.G picked first in {a.firstPick} of {a.marked} games, BLG in {b.firstPick} of {b.marked} (Gol.gg's First Pick mark). Sides: Gen.G blue {a.blue}, red {a.red}; BLG blue {b.blue}, red {b.red}.</li>
      <li><b>Pool.</b> Gen.G played {a.unique} different champions in {a.games} games, BLG {b.unique} in {b.games}. Gen.G's most repeated pick is {n(ta.champion)} {ROLE_NAME[ta.role].toLowerCase()} ({ta.n} of {a.games}); BLG's is {n(tb.champion)} {ROLE_NAME[tb.role].toLowerCase()} ({tb.n} of {b.games}).</li>
      {(onlyB.length > 0 || onlyA.length > 0) && <li><b>Picks the other has not played.</b> {onlyB.length > 0 && <>BLG, two games or more: {list(onlyB)}. </>}{onlyA.length > 0 ? <>Gen.G: {list(onlyA)}.</> : <>Every champion Gen.G played twice, BLG has played too.</>}</li>}
      {(banB.length > 0 || banA.length > 0) && <li><b>Picked by one, banned by the other.</b> {banB.length > 0 && <>Gen.G picks BLG has banned before: {list(banB)}. </>}{banA.length > 0 && <>BLG picks Gen.G has banned before: {list(banA)}. </>}Bans made against other opponents, not a forecast.</li>}
      <li><b>Support timing.</b> Gen.G picked their support before either enemy bot laner in {a.usage.SUPPORT.blind} of {a.games} games, BLG in {b.usage.SUPPORT.blind} of {b.games}.</li>
      {data.repeats.series > 0 && data.repeats.repeated === 0 && <li><b>No repeats inside a series.</b> In all {data.repeats.series} recorded multi-game series of the main event, no champion was picked in two games of the same series, so a best of five reaches deep into both pools.</li>}
    </ul>
  );
}

function Preview({ data, names }: { data: FinalsData; names: Names }) {
  const a = data.geng.tendencies, b = data.blg.tendencies;
  const withOf = (t: Tendencies) => t.firstRotation.map((c) => ({ ...c, of: c.picks }));
  const blind = (t: Tendencies) => t.blind.filter((c) => c.n > 1).map((c) => ({ ...c, of: c.picks }));
  const presence = Object.entries(data.presence.rows).map(([champion, p]) => ({ champion, ...p })).sort((x, y) => y.picks + y.bans - (x.picks + x.bans)).slice(0, 10);
  const mine = (t: Tendencies, id: string) => ({ picks: ROLES.reduce((s, r) => s + (t.byRole[r].find((c) => c.champion === id)?.n ?? 0), 0), bans: t.bans.find((c) => c.champion === id)?.n ?? 0 });
  const responses = (t: FinalsData["geng"]) => t.tendencies.responses;
  return (
    <section className="finals-preview" id="preview" aria-labelledby="preview-title">
      <SectionHeader title={<span id="preview-title">{data.final.games.length ? "Pre-final draft preview" : "Gen.G vs BLG draft preview"}</span>}
        meta={`Worlds 2026 Main Event before the final · patch ${data.patches.join(", ")} · Gen.G ${a.games} games, BLG ${b.games}`} />
      <p className="small muted finals-note">Every count is how often something was drafted, with its sample beside it. Frequency is not strength, and small samples stay small: {a.games} and {b.games} games.</p>

      <h3 className="finals-sub">Player matchups and champion pools</h3>
      <Matchups list={data.matchups} names={names} sample="at the main event" />

      <h3 className="finals-sub">How they draft</h3>
      <div className="vs-grid">
        <Versus title="Their bans" note="Champions each team banned, of its games."
          geng={<Counts list={a.bans} of={a.games} names={names} />} blg={<Counts list={b.bans} of={b.games} names={names} />} />
        <Versus title="Banned against them" note="What their opponents banned."
          geng={<Counts list={a.bansAgainst} of={a.games} names={names} />} blg={<Counts list={b.bansAgainst} of={b.games} names={names} />} />
        <Versus title="First rotation" note="In the team's first three picks, of the champion's picks. Early picks, not pick counts."
          geng={<Counts list={withOf(a)} names={names} />} blg={<Counts list={withOf(b)} names={names} />} />
        <Versus title="Blind more than once" note="Picked before the lane opponent was on the board, of the champion's picks in that role."
          geng={<Counts list={blind(a)} names={names} empty="No champion blind-picked twice" />} blg={<Counts list={blind(b)} names={names} empty="No champion blind-picked twice" />} />
        <Versus title="Mid + Jungle" geng={<Pairs list={a.midJungle} of={a.games} names={names} roles={["MID", "JUNGLE"]} />} blg={<Pairs list={b.midJungle} of={b.games} names={names} roles={["MID", "JUNGLE"]} />} />
        <Versus title="Bot + Support" geng={<Pairs list={a.botSupport} of={a.games} names={names} roles={["BOT", "SUPPORT"]} />} blg={<Pairs list={b.botSupport} of={b.games} names={names} roles={["BOT", "SUPPORT"]} />} />
        <Versus title="Comp identity" note="The comp check's read of each lineup. Analysis, not a record."
          geng={<Identities t={data.geng} />} blg={<Identities t={data.blg} />} />
      </div>

      <h3 className="finals-sub">Blind and response by role</h3>
      <p className="xs muted finals-note">From each game&apos;s pick order and Gol.gg&apos;s First Pick mark. Blind: picked before the lane opponent (bot lane: before either enemy bot laner). Response: picked after. Unclear: the opponent on the board could still have played another role. A response is an observed order, never a counter.</p>
      <UsageTable a={a} b={b} />
      <Disclosure summary="Observed responses" meta={`Gen.G ${responses(data.geng).length} · BLG ${responses(data.blg).length}`}>
        <div className="vs-grid">
          <Versus title="Picked after the lane opponent" note="Only where the opponent's role was certain. Not a counter claim."
            geng={<ResponseList t={data.geng} names={names} />} blg={<ResponseList t={data.blg} names={names} />} />
        </div>
      </Disclosure>

      <h3 className="finals-sub">Notable differences</h3>
      <Differences data={data} names={names} />

      <Disclosure summary="Highest presence at the main event" meta={`${presence.length} champions · ${data.presence.games} games`}>
        <div className="table-wrap">
          <table className="usage-table">
            <thead><tr><th>Champion</th><th>Picks</th><th>Bans</th><th title="(picks + bans) / games">Presence</th><th>Gen.G picks</th><th>Gen.G bans</th><th>BLG picks</th><th>BLG bans</th></tr></thead>
            <tbody>
              {presence.map((p) => {
                const g = mine(a, p.champion), l = mine(b, p.champion);
                return (
                  <tr key={p.champion}>
                    <td><ChampionRow id={p.champion} name={names[p.champion] ?? p.champion} /></td>
                    <td className="tnum">{p.picks}</td><td className="tnum">{p.bans}</td>
                    <td className="tnum">{Math.round(((p.picks + p.bans) / data.presence.games) * 100)}% <span className="faint">{p.picks + p.bans}/{data.presence.games}</span></td>
                    <td className="tnum">{g.picks}<span className="faint">/{a.games}</span></td><td className="tnum">{g.bans}<span className="faint">/{a.games}</span></td>
                    <td className="tnum">{l.picks}<span className="faint">/{b.games}</span></td><td className="tnum">{l.bans}<span className="faint">/{b.games}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Disclosure>
    </section>
  );
}

function ResponseList({ t, names }: { t: FinalsData["geng"]; names: Names }) {
  const lines = new Map(t.series.flatMap((s) => s.games.map((g) => [g.id, { s, g }] as const)));
  const list = t.tendencies.responses;
  if (!list.length) return <span className="muted small">None recorded</span>;
  return (
    <ul className="response-list">
      {list.map((r) => {
        const at = lines.get(r.game);
        return (
          <li key={`${r.game}${r.role}`}>
            <span className={`role-tag role-${r.role}`}>{r.role}</span>
            <ChampionRow id={r.champion} name={names[r.champion] ?? r.champion} role={r.role} /><span className="muted xs">after</span><ChampionRow id={r.into} name={names[r.into] ?? r.into} role={r.role} />
            {at && <Link className="game-link" href={gameHref(t.name, at.g)}>{at.s.stage} G{at.g.no}</Link>}
          </li>
        );
      })}
    </ul>
  );
}

/** Once final games are recorded: what each team drafted in the final against its earlier Worlds games. */
function FinalRecap({ data, names }: { data: FinalsData; names: Names }) {
  if (!data.changes) return null;
  const { geng, blg } = data.changes;
  return (
    <section className="finals-recap" aria-labelledby="recap-title">
      <SectionHeader title={<span id="recap-title">The final, draft by draft</span>} meta={`${plural(data.final.games.length, "recorded game")}${data.final.status === "underway" ? " so far" : ""} · compared with each team's earlier main-event games`} />
      <div className="vs-grid">
        <Versus title="Picked in the final" note="Of the final's recorded games." geng={<Counts list={geng.picks} of={geng.games} names={names} limit={25} />} blg={<Counts list={blg.picks} of={blg.games} names={names} limit={25} />} />
        <Versus title="New picks" note="Not picked by the team earlier at the main event."
          geng={<Counts list={geng.newPicks} of={geng.games} names={names} limit={25} empty="Every pick was one they had played before" />} blg={<Counts list={blg.newPicks} of={blg.games} names={names} limit={25} empty="Every pick was one they had played before" />} />
        <Versus title="Bans in the final" geng={<Counts list={geng.bans} of={geng.games} names={names} limit={25} />} blg={<Counts list={blg.bans} of={blg.games} names={names} limit={25} />} />
        <Versus title="Banned every game" geng={<Counts list={geng.everyGameBans} of={geng.games} names={names} empty={geng.games > 1 ? "No champion banned in every game" : "One game recorded"} />} blg={<Counts list={blg.everyGameBans} of={blg.games} names={names} empty={blg.games > 1 ? "No champion banned in every game" : "One game recorded"} />} />
        <Versus title="New bans" note="Not banned by the team earlier at the main event."
          geng={<Counts list={geng.newBans} of={geng.games} names={names} limit={25} empty="Every ban was one they had made before" />} blg={<Counts list={blg.newBans} of={blg.games} names={names} limit={25} empty="Every ban was one they had made before" />} />
      </div>
    </section>
  );
}

export function FinalsHub({ data, names }: { data: FinalsData; names: Names }) {
  const lab = (t: Tendencies) => Object.fromEntries(ROLES.map((r) => [r, t.byRole[r].map((c) => ({ id: c.champion, name: names[c.champion] ?? c.champion, n: c.n }))])) as Record<Role, { id: string; name: string; n: number }[]>;
  const a = data.geng.tendencies, b = data.blg.tendencies;
  return (
    <div className="finals-hub">
      <Header data={data} />
      <FinalRecap data={data} names={names} />
      <section id="road" aria-labelledby="road-title">
        <SectionHeader title={<span id="road-title">Road to the Finals</span>} meta={`${a.series} series · ${a.games} recorded games · ${a.wins}–${a.games - a.wins}${data.final.games.length ? " before the final" : ""} · newest first`} />
        <Road team={GENG} series={data.geng.series} reads={data.geng.reads} names={names} final={data.final} />
        <Disclosure summary="Bilibili Gaming's road" meta={`${b.series} series · ${b.games} recorded games · ${b.wins}–${b.games - b.wins}${data.final.games.length ? " before the final" : ""}`}>
          <Road team={BLG} series={data.blg.series.filter((s) => !s.final)} reads={data.blg.reads} names={names} final={data.final} />
        </Disclosure>
      </section>
      <Preview data={data} names={names} />
      <section id="lab" aria-labelledby="lab-title">
        <SectionHeader title={<span id="lab-title">Finals Draft Lab</span>} meta="A what-if board for the Draft Room · nothing here was picked in the final" />
        <FinalsLab geng={lab(a)} blg={lab(b)} gengGames={a.games} blgGames={b.games} />
      </section>
    </div>
  );
}
