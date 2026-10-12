"use client";
// Pinned Players (alan, 2026-10-12): the Pro Builds scouting hub for the players you follow. The overview lists every
// pinned player (kept even when the filters leave them no game); a profile shows the player's recorded games in one
// place: overview, champion history, that champion's builds and the full match history, each game opening the exact
// Pro Builds view. Everything is derived from the same build rows as /pro-builds/ (lib/pinned-players.ts), so games the
// daily refresh records appear here on their own. Observed Pro Evidence only: recorded games, never a career; nothing
// here scores or touches saved pairings. Pins live in this browser (localStorage), keyed by Gol.gg player id.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import { BuildsTabs } from "@/components/BuildsTabs";
import { Icon, Item, Rune } from "@/components/BuildParts";
import { ChampionProvider } from "@/components/ChampionInteraction";
import type { DrawerContext } from "@/lib/drawer";
const PINNED: DrawerContext = { page: "pinned" };
import { InteractiveChampion } from "@/components/InteractiveChampion";
import { Disclosure } from "@/components/Disclosure";
import { GameDetail } from "@/components/GameBuild";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { PinIcon, PinPicker, useMigratePlayerPins, usePins } from "@/components/PlayerPicker";
import { allPortraits, creditLine } from "@/lib/player-portraits";
import { Select } from "@/components/Select";
import { ChampIcon, PageHeader, Panel } from "@/components/ui";
import type { DrawerData } from "@/lib/data";
import { shortDate } from "@/lib/evidence";
import { comparePatch, patchKey, patchLabel } from "@/lib/patch";
import {
  championBuildsHref, expandedRow, gameHref, inPlayerScope, playerDirectory, playerKey, playerProfile, profileHref, rowsOfPlayer,
  type PlayerFilter, type PlayerProfile,
} from "@/lib/pinned-players";
import { fullRunes, overview, skillSummary, maxRanks, spellIcon, type BuildRow } from "@/lib/pro-builds";
import type { Role } from "@/lib/schema";

const ROLE_NAME: Record<Role, string> = { TOP: "Top", JUNGLE: "Jungle", MID: "Mid", BOT: "Bot", SUPPORT: "Support" };
const pct = (w: number, n: number) => (n ? `${Math.round((w / n) * 100)}%` : "—");

let loaded: Promise<BuildRow[]> | undefined;
const load = () => (loaded ??= import("@/lib/pro-builds-bundle").then((m) => m.rows));

export function PinnedPlayersView({ names, events, drawerData }: { names: Record<string, string>; events: Record<string, string>; drawerData: DrawerData }) {
  const initial = useSearchParams();
  const [params, setParams] = useState(() => new URLSearchParams(initial.toString()));
  const get = (k: string) => params.get(k) || undefined;
  // Opening another player is a history entry (Back returns to the previous profile); filters replace the entry.
  const update = (changes: Record<string, string | undefined>, push = false) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) if (v) next.set(k, v); else next.delete(k);
    setParams(next);
    const url = `${window.location.pathname}${next.size ? `?${next}` : ""}`;
    if (push) window.history.pushState(null, "", url); else window.history.replaceState(null, "", url);
  };
  useEffect(() => {
    const back = () => setParams(new URLSearchParams(window.location.search));
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);

  const [all, setAll] = useState<BuildRow[]>();
  const [failed, setFailed] = useState(false);
  useEffect(() => { let live = true; load().then((r) => live && setAll(r), () => live && setFailed(true)); return () => { live = false; }; }, []);
  useMigratePlayerPins(all);
  const { pins, names: pinNames, isPinned, toggle } = usePins();

  const name = (id: string) => names[id] ?? id;
  const evName = (r: BuildRow) => events[r.game.event] ?? r.game.tournament;
  const player = get("player");
  const filter: PlayerFilter = { event: get("event"), patch: get("patch") };
  const directory = useMemo(() => (all ? playerDirectory(all) : []), [all]);
  const profiles = useMemo(() => pins.map((id) => playerProfile(all ?? [], id, filter, pinNames[id])), [all, pins, pinNames, filter.event, filter.patch]);
  const open = (id?: string) => update({ player: id, champion: undefined, result: undefined, game: undefined }, true);

  // Tournament and patch choices: every recorded game of the pinned players (and the open profile).
  const pool = (all ?? []).filter((r) => pins.includes(playerKey(r)) || playerKey(r) === player);
  const uniq = (xs: [string, string][]) => [...new Map(xs).entries()];
  const eventOpts = uniq(pool.map((r) => [r.game.event, evName(r)]));
  const patchOpts = uniq(pool.map((r) => [patchKey(r.game.patch), patchLabel(r.game.patch)])).sort((a, b) => comparePatch(b[0], a[0]));
  const filtered = !!(get("event") || get("patch"));
  const openProfile = player && !pins.includes(player) && all ? playerProfile(all, player, filter) : undefined;

  return (
    <ChampionProvider data={drawerData} context={PINNED}>
      <PageHeader title="Pro Builds" badges={<BuildsTabs current="pinned" />}
        desc="Players you follow: every recorded game, champion and build. Pins are saved in this browser only and do not sync across devices." />
      <div className="split builds-split">
        <nav className="pick-rail pinned-rail" aria-label="Pinned players">
          <div className="rail-tools one">
            <PinPicker kind="player" value="" placeholder="Find a player" options={directory.map((p) => [p.id, p.label])} onChange={(id) => id && open(id)} />
          </div>
          <ul>
            <li>
              <button type="button" className={!player ? "active" : undefined} aria-current={!player ? "true" : undefined} onClick={() => open(undefined)}>
                <span className="rail-text"><span className="rail-name">All pinned players</span><span className="rail-sub tnum">{pins.length} pinned</span></span>
              </button>
            </li>
            {[...profiles, ...(openProfile ? [openProfile] : [])].map((p) => {
              const on = p.id === player;
              return (
                <li key={p.id} className="rail-player-row">
                  <button type="button" className={on ? "active" : undefined} aria-current={on ? "true" : undefined} onClick={() => open(p.id)}>
                    <PlayerAvatar id={p.id} name={p.name} size="md" />
                    <span className="rail-text"><span className="rail-name">{p.name}</span>
                      <span className="rail-sub">{[p.team, p.role && ROLE_NAME[p.role], `${p.games} game${p.games === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}</span></span>
                  </button>
                  <PinButton on={isPinned(p.id)} name={p.name} onClick={() => toggle(p.id, p.name)} />
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="builds-main">
          <div className="builds-tools">
            <Select label="Tournament" value={get("event") ?? ""} options={[{ value: "", label: "All tournaments" }, ...eventOpts.map(([value, label]) => ({ value, label }))]}
              onChange={(v) => update({ event: v || undefined })} />
            <Select label="Patch" value={get("patch") ? patchKey(get("patch")!) : ""} options={[{ value: "", label: "All patches" }, ...patchOpts.map(([value, label]) => ({ value, label }))]}
              onChange={(v) => update({ patch: v || undefined })} />
            {filtered && <button type="button" className="btn sm ghost" onClick={() => update({ event: undefined, patch: undefined })}>Clear filters</button>}
          </div>
          {failed ? <p className="small muted">Build data could not be loaded.</p>
            : !all ? <p className="small faint" aria-busy="true">Loading recorded games…</p>
            : player ? <Profile rows={all} id={player} fallbackName={pinNames[player]} filter={filter} champion={get("champion")} result={get("result") as PlayerFilter["result"]}
                game={get("game")} pinned={isPinned(player)} onPin={(p) => toggle(p.id, p.name)} name={name} evName={evName} update={update} />
            : <Overview profiles={profiles} filtered={filtered} name={name} onOpen={open} onUnpin={(p) => toggle(p.id, p.name)} />}
          <PhotoCredits />
        </div>
      </div>
    </ChampionProvider>
  );
}

function PinButton({ on, name, onClick }: { on: boolean; name: string; onClick: () => void }) {
  return (
    <button type="button" className="pin-btn" aria-pressed={on} aria-label={`${on ? "Unpin" : "Pin"} ${name}`}
      title={on ? "Pinned in this browser. Click to unpin" : "Pin this player (saved in this browser)"} onClick={onClick}>
      <PinIcon on={on} />
    </button>
  );
}

// A win rate with its sample in view: one game is "1 game", not a bold 100%; fewer than five games stay quiet.
function Rate({ wins, games }: { wins: number; games: number }) {
  if (!games) return null;
  if (games < 3) return <span className="faint rate" title={`${wins} of ${games} recorded game${games === 1 ? "" : "s"}; too few for a rate`}>{games === 1 ? "1 game" : `${games} games`}</span>;
  return <span className={`rate ${games < 5 ? "faint" : "muted"}`} title={`${wins} of ${games} recorded games${games < 5 ? "; small sample" : ""}`}>{pct(wins, games)}</span>;
}

function Results({ recent }: { recent: boolean[] }) {
  if (!recent.length) return <span className="faint">—</span>;
  return <span className="form tnum" title="Last recorded results in these filters, newest first">{recent.map((w, i) => <span key={i} className={w ? "win" : "loss"}>{w ? "W" : "L"}</span>)}</span>;
}

// ---------- overview ----------
function Overview({ profiles, filtered, name, onOpen, onUnpin }: {
  profiles: PlayerProfile[]; filtered: boolean; name: (id: string) => string; onOpen: (id: string) => void; onUnpin: (p: PlayerProfile) => void;
}) {
  if (!profiles.length) return (
    <div className="pinned-empty">
      <p><b>No pinned players yet.</b></p>
      <p className="small muted">Find a player in the box on the left, or in any player filter on Pro Builds, and press the star. Their recorded games, champions and builds collect here, including new games as they are recorded.</p>
    </div>
  );
  return (
    <div className="table-wrap">
      <table className="pinned-table">
        <thead><tr>
          <th aria-label="Pinned" /><th>Player</th><th>Team</th><th>Role</th><th className="num">Games</th><th className="num">W–L</th>
          <th className="hide-phone">Last 5</th><th className="hide-phone">Champions</th><th>Latest</th>
        </tr></thead>
        <tbody>
          {profiles.map((p) => (
            <tr key={p.id} className="click-row" onClick={() => onOpen(p.id)}>
              <td onClick={(e) => e.stopPropagation()}><PinButton on name={p.name} onClick={() => onUnpin(p)} /></td>
              <td><a className="cell-link player-chip" href={profileHref(p.id)} onClick={(e) => { e.preventDefault(); onOpen(p.id); }}><PlayerAvatar id={p.id} name={p.name} size="lg" />{p.name}</a></td>
              <td className="nowrap">{p.team ?? "—"}{p.teams.length > 1 && <span className="xs faint" title={`Recorded teams: ${p.teams.join(", ")}`}> +{p.teams.length - 1}</span>}</td>
              <td>{p.role ? ROLE_NAME[p.role] : "—"}</td>
              {p.games ? <>
                <td className="num tnum">{p.games}</td>
                <td className="num tnum">{p.wins}–{p.losses}</td>
                <td className="hide-phone"><Results recent={p.recent} /></td>
                <td className="hide-phone"><span className="champ-strip">{p.champions.slice(0, 6).map((c) => <ChampIcon key={`${c.champion}-${c.role}`} id={c.champion} name={`${name(c.champion)} · ${c.games} game${c.games > 1 ? "s" : ""}`} size="xs" />)}
                  {p.champions.length > 6 && <span className="xs muted tnum">+{p.champions.length - 6}</span>}</span></td>
                <td className="nowrap small">{p.last && <><span className="tnum">{shortDate(p.last.game.date)}</span> <span className="muted">{name(p.last.build.champion)}</span></>}</td>
              </> : <td colSpan={5} className="small faint">{filtered ? "No recorded games in these filters" : "No recorded games yet"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- one player ----------
function Profile({ rows, id, fallbackName, filter, champion, result, game, pinned, onPin, name, evName, update }: {
  rows: BuildRow[]; id: string; fallbackName?: string; filter: PlayerFilter; champion?: string; result?: PlayerFilter["result"];
  game?: string; pinned: boolean; onPin: (p: PlayerProfile) => void; name: (id: string) => string; evName: (r: BuildRow) => string;
  update: (changes: Record<string, string | undefined>, push?: boolean) => void;
}) {
  const p = playerProfile(rows, id, filter, fallbackName);
  const mine = rowsOfPlayer(rows, id);
  const scope = mine.filter((r) => inPlayerScope(r, filter));
  const history = scope.filter((r) => inPlayerScope(r, { champion, result }));
  // The expanded match is the game named in the URL, only while the filters still show it; otherwise it folds and the
  // URL forgets it, so a filter change never leaves another game's build open.
  const expanded = expandedRow(history, game);
  useEffect(() => { if (game && !expanded) update({ game: undefined }); }, [game, expanded, update]);
  const toggleGame = (r: BuildRow) => update({ game: expanded?.key === r.key ? undefined : String(r.game.id) });
  if (!mine.length) return (
    <div className="pinned-empty">
      <p><b>{p.name}</b> <PinButton on={pinned} name={p.name} onClick={() => onPin(p)} /></p>
      <p className="small muted">No recorded games for this player in the build data.</p>
    </div>
  );
  const pick = champion ? p.champions.find((c) => c.champion === champion) : undefined;
  const champOpts = p.champions.map((c) => ({ value: c.champion, label: name(c.champion) }));

  // Role column only when the player's champions span more than one role (repeating "Mid" ten times says nothing).
  const roles = new Set(p.champions.map((c) => c.role));
  return (
    <div className="player-profile">
      <div className="player-head">
        <PlayerAvatar id={p.id} name={p.name} size="xl" />
        <div className="player-head-text">
          <div className="builds-title">
            <h2>{p.name} <PinButton on={pinned} name={p.name} onClick={() => onPin(p)} /></h2>
            <span className="small muted">{[p.team, p.role && ROLE_NAME[p.role]].filter(Boolean).join(" · ")}
              {p.teams.length > 1 && <span className="faint"> · also recorded for {p.teams.filter((t) => t !== p.team).join(", ")}</span>}
              {p.names.length > 1 && <span className="faint"> · also listed as {p.names.filter((n) => n !== p.name).join(", ")}</span>}</span>
          </div>
          <dl className="player-facts small">
            <div><dt>Recorded games</dt><dd className="tnum">{p.games}</dd></div>
            <div><dt>Record</dt><dd className="tnum">{p.games ? <>{p.wins}–{p.losses} <Rate wins={p.wins} games={p.games} /></> : "—"}</dd></div>
            <div><dt>Last 5</dt><dd><Results recent={p.recent} /></dd></div>
            <div><dt>Tournaments</dt><dd>{p.events.length ? [...new Set(scope.map(evName))].join(", ") : "—"}</dd></div>
            <div><dt>Latest</dt><dd>{p.last ? <Link href={gameHref(p.last)}><span className="tnum">{shortDate(p.last.game.date)}</span> · {name(p.last.build.champion)} vs {p.last.opponentTeam}</Link> : "—"}</dd></div>
          </dl>
        </div>
      </div>
      {!p.games ? <p className="small muted">No recorded games for {p.name} in these filters. Clear the filters to see every recorded game.</p> : <>
        <Panel title="Champions" meta={`${p.champions.length} played · most games first · click one for its builds`} className="profile-section">
          <div className="table-wrap flat">
            <table className="mini champ-history">
              <thead><tr><th>Champion</th>{roles.size > 1 && <th className="hide-phone">Role</th>}<th className="num">Games</th><th className="num">Record</th><th className="num">Latest patch</th><th className="num hide-phone">Last game</th></tr></thead>
              <tbody>
                {p.champions.map((c) => {
                  const on = c.champion === champion;
                  return (
                    <tr key={`${c.champion}-${c.role}`} className={`click-row ${on ? "selected" : ""}`} aria-selected={on}
                      onClick={() => update({ champion: on ? undefined : c.champion })}
                      tabIndex={0} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); update({ champion: on ? undefined : c.champion }); } }} title={on ? "Show every champion" : `Show ${p.name}'s ${name(c.champion)} games and builds`}>
                      <td><span className="cell-champ"><InteractiveChampion id={c.champion} role={c.role}><ChampIcon id={c.champion} name={name(c.champion)} size="xs" /></InteractiveChampion>{name(c.champion)}</span></td>
                      {roles.size > 1 && <td className="hide-phone">{ROLE_NAME[c.role]}</td>}
                      <td className="num tnum">{c.games}</td>
                      <td className="num tnum nowrap">{c.wins}–{c.losses} <Rate wins={c.wins} games={c.games} /></td>
                      <td className="num tnum">{patchLabel(c.latestPatch)}</td>
                      <td className="num tnum hide-phone">{shortDate(c.last.game.date)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        {pick && <ChampionBuilds rows={scope.filter((r) => r.build.champion === pick.champion && r.build.role === pick.role)} id={id} player={p.name} champion={pick.champion} role={pick.role} name={name} />}

        <Panel title="Match history" meta={`${history.length} recorded game${history.length === 1 ? "" : "s"}`} className="profile-section">
          <div className="builds-tools inner">
            <Select label="Champion" value={champion ?? ""} options={[{ value: "", label: "All champions" }, ...champOpts]} onChange={(v) => update({ champion: v || undefined })} />
            <Select label="Result" value={result ?? ""} options={[{ value: "", label: "All results" }, { value: "win", label: "Wins" }, { value: "loss", label: "Losses" }]} onChange={(v) => update({ result: v || undefined })} />
            <span className="xs muted">Recorded games only, newest first. Click a game for its exact runes, items, skills and spells.</span>
          </div>
          {!history.length ? <p className="small muted">No recorded games match these filters.</p> : (
            <div className="table-wrap flat">
              <table className="mini match-history">
                <thead><tr><th aria-label="Expand" /><th>Date</th><th className="hide-phone">Tournament</th><th className="num">Patch</th><th>Champion</th><th className="hide-phone">Role</th><th className="hide-phone">Team</th><th>Opponent</th><th className="hide-phone">Side</th><th>Result</th><th className="num hide-phone">Game</th></tr></thead>
                <tbody>
                  {history.map((r) => {
                    const on = expanded?.key === r.key;
                    const detailId = `match-${r.game.id}-${r.build.playerId}`;
                    return (
                      <Fragment key={r.key}>
                        <tr className={`click-row match-row ${on ? "open" : ""}`} onClick={() => toggleGame(r)} tabIndex={0} aria-expanded={on} aria-controls={on ? detailId : undefined}
                          onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggleGame(r); } }}
                          title={on ? "Collapse this game" : `${p.name}'s exact ${name(r.build.champion)} build in this game`}>
                          <td className="row-chevron" aria-hidden="true">▸</td>
                          <td className="tnum nowrap">{shortDate(r.game.date)}</td>
                          <td className="hide-phone nowrap">{evName(r)}</td>
                          <td className="num tnum">{patchLabel(r.game.patch)}</td>
                          <td><span className="cell-champ"><ChampIcon id={r.build.champion} name={name(r.build.champion)} size="xs" />{name(r.build.champion)}</span></td>
                          <td className="hide-phone">{ROLE_NAME[r.build.role]}</td>
                          <td className="hide-phone nowrap">{r.team}</td>
                          <td className="match-opp">{r.opponentTeam}{r.opponent && <span className="muted nowrap"> · {name(r.opponent.champion)}</span>}</td>
                          <td className={`hide-phone side-${r.side}`}><span className="side-tag">{r.side === "blue" ? "Blue" : "Red"}</span></td>
                          <td><span className={r.won ? "win" : "loss"}>{r.won ? "Win" : "Loss"}</span></td>
                          <td className="num tnum hide-phone">G{r.game.game}</td>
                        </tr>
                        {on && (
                          <tr className="row-detail match-detail" id={detailId}>
                            <td colSpan={11}><div className="match-detail-body">
                              <GameDetail r={r} name={name} evName={evName}
                                end={<Link href={gameHref(r)} className="nowrap" title="This game on the Pro Builds page, with Common build and Compare">Open full Pro Builds →</Link>} />
                            </div></td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </>}
    </div>
  );
}

// One champion's builds for this player, one line per game: keystone and full rune page, spells, max order, start,
// boots and core in purchase order. Missing parts say so. The full view of each game is the existing Pro Builds page.
function ChampionBuilds({ rows, id, player, champion, role, name }: {
  rows: BuildRow[]; id: string; player: string; champion: string; role: Role; name: (id: string) => string;
}) {
  return (
    <Panel title={`${player} on ${name(champion)}`} meta={`${rows.length} recorded game${rows.length === 1 ? "" : "s"}`} className="profile-section sub"
      end={<span className="small builds-links">
        <Link href={championBuildsHref(id, champion, role)}>Games</Link>
        <Link href={championBuildsHref(id, champion, role, "common")}>Common build</Link>
        {rows.length > 1 && <Link href={championBuildsHref(id, champion, role, "compare")}>Compare</Link>}
      </span>}>
      <ul className="build-lines">
        {rows.map((r) => {
          const b = r.build, a = r.assets;
          const runes = fullRunes(b.runes);
          const o = overview(b, a);
          const skills = b.skills ? skillSummary(b.skills, maxRanks(r)) : undefined;
          return (
            <li key={r.key}>
              <Link href={gameHref(r)} className="build-line">
                <span className="build-line-when xs tnum"><span>{shortDate(r.game.date)}</span><span className="muted">{patchLabel(r.game.patch)}</span><span className={r.won ? "win" : "loss"}>{r.won ? "W" : "L"}</span></span>
                {b.missing?.includes("build") ? <span className="small faint">No build recorded for this game</span> : <>
                  <span className="build-line-part">{b.runes ? <><Rune a={a} id={b.runes.keystone} size="sm" chosen />{runes ? runes.primaryRunes.concat(runes.secondaryRunes).map((x) => <Rune key={x} a={a} id={x} size="xs" chosen />) : <span className="xs faint">keystone only</span>}</> : <span className="xs faint">no runes</span>}</span>
                  <span className="build-line-part">{b.spells?.map((s) => <Icon key={s} src={a && spellIcon(a, s)} label={a?.spells[s]?.name ?? `Spell ${s}`} size="sm" />) ?? <span className="xs faint">no spells</span>}</span>
                  <span className="build-line-part xs tnum" title="Skill max order">{skills ? skills.order.join(">") : <span className="faint">no skills</span>}</span>
                  <span className="build-line-part">{o.complete ? <>
                    {o.boots && <Item a={a} id={o.boots} size="sm" />}
                    {o.core.map((x) => <Item key={x} a={a} id={x} size="sm" />)}
                  </> : <span className="xs faint">no purchase log</span>}</span>
                </>}
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

// Every portrait the site uses with its source page: Commons licenses ask for attribution (author, license), and
// dpm.lol photos are listed as taken from dpm.lol (alan's decision, 2026-10-12; no license is claimed for them).
function PhotoCredits() {
  const list = allPortraits();
  if (!list.length) return null;
  const dpm = list.filter((p) => p.provider === "dpm.lol"), commons = list.filter((p) => p.provider === "commons");
  return (
    <Disclosure summary="Photo credits" meta={list.length} className="photo-credits">
      {dpm.length > 0 && <p className="small">Player photos via <a href="https://dpm.lol/" target="_blank" rel="noopener noreferrer">dpm.lol ↗</a> ({dpm.length}): {dpm.map((p, i) => (
        <span key={p.playerId}>{i > 0 && ", "}<a href={p.source} target="_blank" rel="noopener noreferrer">{p.name}</a></span>
      ))}. Cropped and resized; dpm.lol states no reuse license for them, and none is claimed here.</p>}
      {commons.length > 0 && <ul className="small">
        {commons.map((p) => (
          <li key={p.playerId}><b>{p.name}</b>: {creditLine(p).replace(/, via Wikimedia Commons$/, "")}, <a href={p.source} target="_blank" rel="noopener noreferrer">Wikimedia Commons ↗</a>
            {p.licenseUrl && <> · <a href={p.licenseUrl} target="_blank" rel="noopener noreferrer">license</a></>}. Cropped and resized.</li>
        ))}
      </ul>}
      <p className="xs muted">Players without a photograph show their initials.</p>
    </Disclosure>
  );
}
