"use client";
// Pro Drafts: a match browser (alan, 2026-10-13): every recorded game is one visual unit, two opposing drafts under a
// shared game cell (blue row then red row, each with its own side strip and W / L), filterable, newest game first. A
// game a filter shows from one side keeps its game cell and its recorded side. Read notes and Gol.gg sources live in
// the open game, not the table. One game is open at a time for inspection (alan, 2026-10-12): the
// open game shows both teams, their ten picks and bans, and each champion in it is a button that opens that player's
// exact recorded build for that game in the same panel (components/GameBuild.tsx, the one build renderer the site has,
// also used by Pro Builds and Pinned Players). The game is named by its Gol.gg game id and the build by the team row
// and role (lib/pro-drafts-game.ts), never by a row's position. A build Gol.gg did not give is said to be missing.
import { ProFreshness } from "@/components/ProFreshness";
import type { Freshness } from "@/lib/pro-games";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { ChampionProvider } from "@/components/ChampionInteraction";
import type { DrawerContext } from "@/lib/drawer";
const PRO_DRAFTS: DrawerContext = { page: "pro-drafts" };
import { GameDetail } from "@/components/GameBuild";
import { Select } from "@/components/Select";
import { PinIcon, PinPicker, usePins, type PinKind } from "@/components/PlayerPicker";
import type { DrawerData } from "@/lib/data";
import { ChampIcon, ChampionRow, PageHeader, SourceLinks } from "@/components/ui";
import { ROLES, type ProDraft, type Role, type Source } from "@/lib/schema";
import { groupGames, SIDE_LABEL } from "@/lib/draft-side";
import { patchLabel } from "@/lib/patch";
import { shortDate } from "@/lib/evidence";
import { gameKey } from "@/lib/draft-side";
import { buildsHref, type BuildRow } from "@/lib/pro-builds";
import { banPhases, bansOf, buildFor, buildParam, carryBuild, gameIdOf, gameView, newSince, parseBuildParam, pickedFirst, SEEN_KEY, VISIT_KEY, type GameFactBook } from "@/lib/pro-drafts-game";

type Filters = { team?: string; champion?: string; role?: string; tournament?: string; stage?: string; series?: string; id?: string; build?: string };

const seriesOf = (d: ProDraft) => d.seriesGame.replace(/\s*G\d+$/i, "");

function matches(d: ProDraft, f: Filters) {
  if (f.team && d.team !== f.team) return false;
  if (f.tournament && d.tournament !== f.tournament) return false;
  if (f.stage && d.stage !== f.stage) return false;
  if (f.series && seriesOf(d) !== f.series) return false;
  if (f.champion) {
    const roles = f.role ? [f.role as Role] : ROLES;
    if (!roles.some((r) => d.picks[r] === f.champion)) return false;
  }
  return true;
}

const KEYS = ["team", "champion", "role", "tournament", "stage", "series", "id", "build"] as const;
const FILTER_KEYS = KEYS.filter((k) => k !== "id" && k !== "build");

// The build rows load as their own chunk the first time a recorded game is opened (lib/pro-builds-bundle.ts).
let loaded: Promise<BuildRow[]> | undefined;
const load = () => (loaded ??= import("@/lib/pro-builds-bundle").then((m) => m.rows));

const readIds = (store: Storage, key: string): number[] | null => {
  try { const v = JSON.parse(store.getItem(key) ?? "null"); return Array.isArray(v) ? v.filter((x) => typeof x === "number") : null; } catch { return null; }
};
const writeIds = (store: Storage, key: string, ids: number[]) => { try { store.setItem(key, JSON.stringify(ids)); } catch { /* storage unavailable: no flags */ } };

/** The Worlds games this browser had not seen before this visit (see lib/pro-drafts-game.ts newSince). */
function useNewGames(current: number[]): Set<number> {
  const [ids, setIds] = useState<number[]>([]);
  const sig = current.join();
  useEffect(() => {
    try {
      const visit = readIds(sessionStorage, VISIT_KEY);
      const fresh = visit ?? newSince(readIds(localStorage, SEEN_KEY), current);
      if (!visit) writeIds(sessionStorage, VISIT_KEY, fresh);
      writeIds(localStorage, SEEN_KEY, [...new Set([...(readIds(localStorage, SEEN_KEY) ?? []), ...current])]);
      setIds(fresh.filter((id) => current.includes(id)));
    } catch { /* storage unavailable: no flags */ }
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  return new Set(ids);
}

/** A team's bans: small muted portraits, secondary to the picks, split 3 | 2 as Gol.gg draws the two ban phases.
 *  Each is named for screen readers and in its hint (the portrait alone does not name it). */
function Bans({ ids, names, team }: { ids: string[]; names: Record<string, string>; team: string }) {
  if (!ids.length) return null;
  return (
    <span className="ban-row" role="list" aria-label={`${team} bans`}>
      {banPhases(ids).map((phase, p) => (
        <span key={p} className="ban-phase">
          {phase.map((b) => (
            <span key={b} className="ban" role="listitem" title={`Banned: ${names[b] ?? b}`}>
              <ChampIcon id={b} name={names[b] ?? b} size="xs" /><span className="sr-only">{names[b] ?? b}</span>
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

/** Gol.gg's First Pick mark for this team; nothing when the team did not pick first or the game has no mark. */
const FirstPick = ({ on }: { on?: boolean }) => on
  ? <span className="first-pick" title="Picked first in this game (Gol.gg First Pick mark)"><span aria-hidden="true">1st</span><span className="sr-only">First pick</span></span>
  : null;

export function ProDraftsView({ names, sources, all, freshness, drawerData, buildGames, events, shortNames, eventIds, facts }: {
  names: Record<string, string>; sources: Record<string, Source>; all: ProDraft[]; freshness: Freshness[]; drawerData: DrawerData;
  buildGames: number[]; // recorded games with Pro Builds (data/pro-builds.json)
  events: Record<string, string>; // meta.json event id -> short name, for the build header
  shortNames: Record<string, string>; // tournament name -> short name, for the game cell
  eventIds: Record<string, string>; // tournament name -> meta.json event id, so tournament pins are shared with Pro Builds
  facts: GameFactBook; // Gol.gg game id -> First Pick mark and each side's bans, from the game records
}) {
  const params = useSearchParams();
  const panelRef = useRef<HTMLElement>(null);
  const f: Filters = Object.fromEntries(KEYS.map((k) => [k, params.get(k) || undefined]));
  const rows = all.filter((d) => matches(d, f));
  const selected = f.id ? all.find((d) => d.id === f.id) : undefined;
  const uniq = (xs: string[]) => [...new Set(xs)].sort();
  const champions = uniq(all.flatMap((d) => ROLES.map((r) => d.picks[r]))).sort((a, b) => (names[a] ?? a).localeCompare(names[b] ?? b));
  const href = (next: Filters) => {
    const q = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][]);
    return `/pro-drafts${q.size ? `?${q}` : ""}`;
  };
  // Opening another game keeps the filters and carries an open build's role to that row's team.
  const link = (d: ProDraft) => href({ ...f, id: d.id, build: carryBuild(f.build, d) });
  const closeHref = href({ ...f, id: undefined, build: undefined });
  // Every change on this page is a history write, not a route change (alan, 2026-10-16, interaction polish): the URL and
  // useSearchParams update at once, nothing is refetched, the scroll stays where it is and every row stays mounted.
  // Opening and closing a game is a history entry (Back returns to the previous game); filters and builds replace it.
  const go = (next: Filters, push = false) => {
    const q = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][]);
    const url = `${window.location.pathname}${q.size ? `?${q}` : ""}`;
    if (push) window.history.pushState(null, "", url); else window.history.replaceState(null, "", url);
  };
  // A plain click on a link to this page becomes a history write; modified clicks (new tab) keep the browser's behaviour.
  const plain = (e: React.MouseEvent) => !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0);
  const open = (d: ProDraft) => go(d.id === f.id ? { ...f, id: undefined, build: undefined } : { ...f, id: d.id, build: carryBuild(f.build, d) }, true);
  // Closing returns focus to the game's own link, so the keyboard stays where the game was.
  const close = () => {
    const opener = panelRef.current?.closest("tbody")?.previousElementSibling?.querySelector<HTMLElement>(".cell-link");
    go({ ...f, id: undefined, build: undefined }, true);
    opener?.focus({ preventScroll: true });
  };
  // A new tournament clears its stage, since stages belong to one tournament.
  const setFilter = (key: keyof Filters, value: string) => go({ ...f, ...(key === "tournament" ? { stage: undefined } : {}), [key]: value || undefined, id: undefined, build: undefined });
  const sel = (key: keyof Filters, label: string, any: string, options: [string, string][]) => (
    <Select showLabel label={label} value={f[key] ?? ""} onChange={(v) => setFilter(key, v)}
      options={[{ value: "", label: any }, ...options.map(([value, l]) => ({ value, label: l }))]} />
  );
  const active = FILTER_KEYS.filter((k) => f[k]).length;
  // Pinnable, typeable filters (alan, 2026-10-13): teams, champions, tournaments and series can be pinned; pins are kept
  // in this browser, listed first in their menu, and a pinned team is starred in the table. Team and tournament pins
  // are the same ones Pro Builds uses (tournaments by event id, so the URL keeps the tournament name).
  const pick = (key: keyof Filters, kind: PinKind, options: [string, string][]) => (
    <label className="select-field"><span>{key === "series" ? "Series" : key.charAt(0).toUpperCase() + key.slice(1)}</span>
      <PinPicker kind={kind} value={f[key] ?? ""} options={options} onChange={(v) => setFilter(key, v)} /></label>
  );
  const teamPins = usePins("team");
  const tournamentValue = f.tournament ? eventIds[f.tournament] ?? f.tournament : "";
  const tournamentOptions: [string, string][] = uniq(all.map((d) => d.tournament)).map((t) => [eventIds[t] ?? t, shortNames[t] ?? t]);
  const tournamentName = (v: string) => Object.keys(eventIds).find((n) => eventIds[n] === v) ?? v;
  // Pinned items in this data, as one quiet line of one-click filters under the menus (only when something is pinned).
  const champPins = usePins("champion"), eventPins = usePins("event"), seriesPins = usePins("series");
  const teamSet = new Set(all.map((d) => d.team)), champSet = new Set(champions), seriesSet = new Set(all.map(seriesOf));
  const quick: { key: keyof Filters; value: string; label: React.ReactNode; title: string }[] = [
    ...teamPins.pins.filter((t) => teamSet.has(t)).map((t) => ({ key: "team" as const, value: t, label: t, title: `Team: ${t}` })),
    ...champPins.pins.filter((c) => champSet.has(c)).map((c) => ({ key: "champion" as const, value: c, label: <><ChampIcon id={c} name={names[c] ?? c} size="xs" />{names[c] ?? c}</>, title: `Champion: ${names[c] ?? c}` })),
    ...eventPins.pins.map(tournamentName).filter((t) => t in eventIds && all.some((d) => d.tournament === t)).map((t) => ({ key: "tournament" as const, value: t, label: shortNames[t] ?? t, title: `Tournament: ${t}` })),
    ...seriesPins.pins.filter((x) => seriesSet.has(x)).map((x) => ({ key: "series" as const, value: x, label: x, title: `Series: ${x}` })),
  ];
  // One game is one unit: its blue row then its red row under a shared game cell; a one-sided view keeps the game cell.
  const games = groupGames(rows);
  const gameCount = new Set(all.map(gameKey)).size;
  // Stages of the chosen tournament (Worlds: Play-In is its own Gol.gg tournament; Swiss and knockout rounds are stages).
  const stages = f.tournament ? uniq(all.filter((d) => d.tournament === f.tournament && d.stage).map((d) => d.stage)) : [];
  // Worlds games new since this browser's last visit: a small marker on the game and a count in the toolbar.
  const worlds = [...new Set(all.filter((d) => eventIds[d.tournament]?.startsWith("worlds")).map(gameIdOf).filter(Boolean))];
  const fresh = useNewGames(worlds);
  const freshShown = new Set(rows.map(gameIdOf).filter((id) => fresh.has(id))).size;

  // The open game and its open build. Choosing a champion changes only the build target, in place.
  const view = selected ? gameView(selected, all) : undefined;
  const hasBuilds = !!view && buildGames.includes(view.gameId);
  const target = view ? parseBuildParam(f.build, view) : undefined;
  const setBuild = (value: string | undefined) => go({ ...f, build: value });
  useEffect(() => { if (f.build && selected && !target) setBuild(undefined); }, [f.build, selected, target]); // eslint-disable-line react-hooks/exhaustive-deps

  const [builds, setBuilds] = useState<BuildRow[]>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!hasBuilds || builds) return;
    let live = true;
    load().then((r) => live && setBuilds(r), () => live && setFailed(true));
    return () => { live = false; };
  }, [hasBuilds, builds]);
  const openBuild = target && view ? buildFor(builds, view.gameId, target.side, target.role) : undefined;
  const name = (id: string) => names[id] ?? id;
  const evName = (r: BuildRow) => events[r.game.event] ?? r.game.tournament;

  const meta = (d: ProDraft) => [d.tournament, !d.seriesGame.startsWith(d.stage) && d.stage, d.patch && `patch ${patchLabel(d.patch)}`, d.date].filter(Boolean).join(" · ");
  // The game cell: stage and game number ("Finals G1", "Round 2 G3"), then tournament, patch and date, each once per game.
  const gameLabel = (d: ProDraft) => { const n = /G\d+$/i.exec(d.seriesGame)?.[0]; return n && d.stage ? `${d.stage} ${n}` : d.seriesGame; };
  const gameMeta = (d: ProDraft) => [shortNames[d.tournament] ?? d.tournament, d.patch && patchLabel(d.patch), d.date && shortDate(d.date)].filter(Boolean).join(" · ");

  // The open game unfolds in place under its own two rows (alan, 2026-10-16), so the rows stay where they were clicked and
  // the table keeps its scroll; a game the filters hide opens above the table instead.
  const inTable = !!selected && games.some((g) => g.rows.some((r) => r.d.id === f.id));
  const panel = selected && view ? (
        <section ref={panelRef} className="panel game-panel" tabIndex={-1} onKeyDown={(e) => { if (e.key === "Escape" && !e.defaultPrevented) { e.preventDefault(); close(); } }} aria-label={`${selected.team} vs ${selected.opponent}, ${selected.seriesGame}`}>
          <div className="panel-head game-panel-head">
            <div className="game-id">
              <h2>{selected.team} <span className="faint">vs</span> {selected.opponent}</h2>
              <span className="small muted game-panel-meta">{selected.seriesGame} · {meta(selected)} <SourceLinks ids={[...new Set(view.teams.flatMap((t) => t.d.sources))]} sources={sources} /></span>
            </div>
            <div className="end">
              <Link className="btn sm primary" href={`/?${new URLSearchParams(Object.fromEntries(ROLES.map((r) => [r.toLowerCase(), selected.picks[r]])))}`}>Open in Draft Room</Link>
              <Link className="btn sm ghost" href={closeHref} aria-label="Close game" onClick={(e) => { if (plain(e)) { e.preventDefault(); close(); } }}>×</Link>
            </div>
          </div>
          <div className="panel-body">
            {view.teams.map(({ d, side }) => (
              <div key={d.id} className={`game-team side-${side} ${target?.d.id === d.id ? "inspecting" : ""}`.trim()}>
                <div className="game-team-head">
                  <span className="side-tag label">{side === "none" ? "Side not recorded" : side === "blue" ? "Blue side" : "Red side"}</span>
                  <b className="game-team-name">{d.team}</b>
                  {d.won != null && <span className={`xs ${d.won ? "win" : "loss"}`}>{d.won ? "Win" : "Loss"}</span>}
                  <FirstPick on={pickedFirst(d, facts)} />
                  <Bans ids={bansOf(d, facts)} names={names} team={d.team} />
                </div>
                <div className="draft-slots" role="group" aria-label={`${d.team} picks`}>
                  {ROLES.map((r) => {
                    const on = target?.d.id === d.id && target.role === r;
                    const champ = names[d.picks[r]] ?? d.picks[r];
                    return (
                      <div key={r} className={`draft-slot locked role-${r} ${on ? "active" : ""}`}>
                        <button type="button" className="slot-body pick-btn" aria-pressed={on} disabled={!hasBuilds}
                          title={hasBuilds ? `${champ}: this player's build in this game` : `${champ}: no build recorded for this game`}
                          onClick={() => setBuild(on ? undefined : buildParam(d, r))}>
                          <span className="slot-icon"><ChampIcon id={d.picks[r]} name={champ} role={r} size="lg" /></span>
                          <span className="slot-text"><span className={`role-tag role-${r}`}>{r}</span><span className="slot-name truncate">{champ}</span></span>
                        </button>
                      </div>
                    );
                  })}
                </div>
                {d.read && <p className="small game-read"><b>Read:</b> {d.read}</p>}
                {d.note && <p className="small muted">{d.note}</p>}
              </div>
            ))}
            {view.teams.length === 1 && <p className="xs muted">The other team's draft for this game is not stored.</p>}
            {view.teams.every((t) => pickedFirst(t.d, facts) === undefined) && <p className="xs muted">Gol.gg does not mark which team picked first in this game.</p>}
            {hasBuilds ? (
              target ? (
                <div className="game-build" aria-live="polite">
                  {openBuild ? (
                    <GameDetail r={openBuild} name={name} evName={evName}
                      end={<Link href={buildsHref(openBuild.build.champion, openBuild.build.role, openBuild.game.id)}>Open full Pro Builds →</Link>} />
                  ) : failed ? (
                    <p className="small caution-text">The build data could not be loaded. Reload the page to try again.</p>
                  ) : builds ? (
                    <p className="small muted">No build recorded for {names[target.d.picks[target.role]] ?? target.d.picks[target.role]} ({target.d.team}) in this game.</p>
                  ) : (
                    <p className="small muted">Loading the recorded build…</p>
                  )}
                </div>
              ) : <p className="xs muted game-hint">Select a champion to see that player's exact build in this game: runes, items, skill order and summoner spells.</p>
            ) : <p className="xs muted game-hint">No builds recorded for this game.</p>}
          </div>
        </section>
  ) : null;
  // Closing folds the game away (a short fade, then unmounted); opening another game swaps at once.
  const last = useRef<{ key: string; node: React.ReactNode }>(undefined);
  const [closing, setClosing] = useState<{ key: string; node: React.ReactNode }>();
  useEffect(() => { if (panel && selected && inTable) last.current = { key: gameKey(selected), node: panel }; });
  useEffect(() => {
    if (f.id) { setClosing(undefined); return; }
    if (last.current) setClosing(last.current);
    last.current = undefined;
  }, [f.id]);
  // A link that names a game (?id=) brings it into view once; clicks inside the page never move the scroll.
  const linked = useRef(f.id);
  useEffect(() => {
    if (!linked.current || !panelRef.current) return;
    panelRef.current.closest("tbody")?.previousElementSibling?.scrollIntoView({ block: "start" });
    linked.current = undefined;
  }, [selected]);

  return (
    <ChampionProvider data={drawerData} context={view?.gameId ? { page: "pro-drafts", game: view.gameId } : PRO_DRAFTS}>
      <PageHeader title="Pro Drafts" />
      <ProFreshness items={freshness} compact />

      {selected && view && !inTable && panel}

      <form className="toolbar drafts-tools" method="get">
        {pick("team", "team", uniq(all.map((d) => d.team)).map((t) => [t, t]))}
        {pick("champion", "champion", champions.map((c) => [c, names[c] ?? c]))}
        {sel("role", "Role", "Any role", ROLES.map((r) => [r, r]))}
        <label className="select-field"><span>Tournament</span>
          <PinPicker kind="event" value={tournamentValue} options={tournamentOptions} onChange={(v) => setFilter("tournament", tournamentName(v))} /></label>
        {stages.length > 1 && sel("stage", "Stage", "Every stage", stages.map((x) => [x, x]))}
        {pick("series", "series", uniq(all.map(seriesOf)).map((x) => [x, x]))}
        <noscript><button className="btn primary sm" type="submit">Filter</button></noscript>
        {active > 0 && <Link className="btn sm ghost" href="/pro-drafts">Clear {active} filter{active > 1 ? "s" : ""}</Link>}
        <span className="count" title={`${rows.length} of ${all.length} team drafts`}>{games.length} of {gameCount} games</span>
        {freshShown > 0 && <span className="new-count" title="Recorded since your last visit to Pro Drafts in this browser">{freshShown} new Worlds game{freshShown > 1 ? "s" : ""}</span>}
        {quick.length > 0 && (
          <div className="pinned-filters" role="group" aria-label="Pinned filters">
            <span className="label"><PinIcon on />Pinned</span>
            {quick.map((q) => {
              const on = f[q.key] === q.value;
              return (
                <button key={`${q.key}:${q.value}`} type="button" className={`chip plain ${on ? "strong" : ""}`.trim()} aria-pressed={on}
                  title={`${q.title}${on ? " (click to clear)" : ""}`} onClick={() => setFilter(q.key, on ? "" : q.value)}>{q.label}</button>
              );
            })}
          </div>
        )}
      </form>
      <div className="table-wrap tall drafts-table">
        <table>
          <thead><tr><th className="game-cell">Game</th><th className="team-cell">Team</th>{ROLES.map((r) => <th key={r}><span className={`role-tag role-${r}`}>{r}</span></th>)}</tr></thead>
          {games.map((g) => {
            const isOpen = g.rows.some((r) => r.d.id === f.id);
            return (
              <Fragment key={g.key}>
              <tbody className={`game-rows ${isOpen ? "selected" : ""}`.trim()} aria-label={`${g.rows[0].d.team} vs ${g.rows[0].d.opponent}, ${g.rows[0].d.seriesGame}`}>
                {g.rows.map(({ d, pair, side }, i) => (
                  <tr key={d.id} className={`clickable side-${side} ${pair} ${d.id === f.id ? "selected" : ""}`.replace(/\s+/g, " ").trim()} data-side={side} aria-selected={d.id === f.id}
                    onClick={(e) => { if ((e.target as HTMLElement).closest("a, button")) return; open(d); }}>
                    {i === 0 && (
                      <td className="game-cell" rowSpan={g.rows.length}>
                        <Link className="cell-link" href={link(d)} aria-expanded={isOpen} title={`${d.team} vs ${d.opponent} · ${d.seriesGame}`} onClick={(e) => { if (plain(e)) { e.preventDefault(); open(d); } }}>
                          <span className="game-name truncate">{gameLabel(d)}{fresh.has(gameIdOf(d)) && <span className="new-tag">New</span>}</span>
                          <span className="game-meta-line xs muted">{gameMeta(d)}</span>
                        </Link>
                      </td>
                    )}
                    <td className="team-cell">
                      {/* The strip carries the side visually (no hover tooltip, alan 2026-10-13); this names it for screen readers. */}
                      <span className="sr-only">{SIDE_LABEL[side]}: </span>
                      <span className="team-line">
                        {teamPins.isPinned(d.team) && <PinIcon on />}<span className="team-name truncate">{d.team}</span>
                        {d.won != null && <span className={`res ${d.won ? "win" : "loss"}`} title={d.won ? "Won" : "Lost"}>{d.won ? "W" : "L"}</span>}
                        <FirstPick on={pickedFirst(d, facts)} />
                      </span>
                      <Bans ids={bansOf(d, facts)} names={names} team={d.team} />
                      {!g.paired && <span className="team-vs xs muted truncate">vs {d.opponent}</span>}
                    </td>
                    {ROLES.map((r) => <td key={r} className="pick-cell"><ChampionRow id={d.picks[r]} name={names[d.picks[r]] ?? d.picks[r]} role={r} hit={d.picks[r] === f.champion} /></td>)}
                  </tr>
                ))}
              </tbody>
              {isOpen && panel && <tbody className="game-expand"><tr><td colSpan={7}><div className="game-expand-inner">{panel}</div></td></tr></tbody>}
              {!isOpen && closing?.key === g.key && (
                <tbody className="game-expand closing" aria-hidden="true" inert><tr><td colSpan={7}>
                  <div className="game-expand-inner" onAnimationEnd={() => setClosing(undefined)}>{closing.node}</div>
                </td></tr></tbody>
              )}
              </Fragment>
            );
          })}
          {!rows.length && <tbody><tr><td colSpan={7} className="muted">No recorded game matches these filters.</td></tr></tbody>}
        </table>
      </div>
    </ChampionProvider>
  );
}
