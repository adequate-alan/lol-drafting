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
import { ORDER_KEYS, PickOrderStats, type OrderParams } from "@/components/PickOrderStats";
import type { OrderGame } from "@/lib/pick-order";
import type { ScopeEvent } from "@/lib/tournament-scope";
import type { Freshness } from "@/lib/pro-games";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChampionProvider } from "@/components/ChampionInteraction";
import type { DrawerContext } from "@/lib/drawer";
const PRO_DRAFTS: DrawerContext = { page: "pro-drafts" };
import { GameDetail } from "@/components/GameBuild";
import { Select } from "@/components/Select";
import { PinIcon, PinPicker, usePins, type PinKind } from "@/components/PlayerPicker";
import type { DrawerData } from "@/lib/data";
import { ChampIcon, ChampionRow, PageHeader, SourceLinks } from "@/components/ui";
import { ROLES, type ProDraft, type Role, type Source } from "@/lib/schema";
import { groupGames, SIDE_LABEL, type GameGroup } from "@/lib/draft-side";
import { patchLabel } from "@/lib/patch";
import { resultsToTop } from "@/lib/motion";
import { shortDate } from "@/lib/evidence";
import { gameKey } from "@/lib/draft-side";
import { buildsHref, type BuildRow } from "@/lib/pro-builds";
import { banPhases, bansOf, buildFor, buildParam, carryBuild, draftOrder, gameIdOf, gameView, latestBatch, newSince, parseBuildParam, pickedFirst, SEEN_KEY, VISIT_KEY, type GameFactBook, type GameView } from "@/lib/pro-drafts-game";

// view: the open game's layout, Composition (default, by role) or Draft order (`view=order`, by pick). Kept while
// browsing games, so a study of pick order carries from one game to the next.
// tab: the page's two views, Games (default) and Pick order (`tab=order`, components/PickOrderStats.tsx), whose own
// filters (position, side, patch, sort, open row, breakdown) sit in the URL beside the shared ones.
type Filters = { team?: string; champion?: string; role?: string; tournament?: string; stage?: string; series?: string; id?: string; build?: string; view?: string;
  tab?: string; pos?: string; side?: string; patch?: string; sort?: string; open?: string; dim?: string };

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

const KEYS = ["team", "champion", "role", "tournament", "stage", "series", "id", "build", "view", "tab", ...ORDER_KEYS] as const;
const FILTER_KEYS = ["team", "champion", "role", "tournament", "stage", "series"] as const;

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

/** Draft order (alan, 2026-10-24): the open game's picks as they were made, blue on the left and red on the right, one
 *  line per turn in time order (a turn never shares its line with the other team's), with each ban phase where it fell. A paired turn shows its two picks together ("B2 · B3"):
 *  the source does not order them. Each champion opens its build like the Composition view. A game whose order Gol.gg
 *  does not give says so, never rebuilt from roles or the lineup. */
function DraftOrderView({ view, facts, names, hasBuilds, target, onPick }: {
  view: GameView; facts: GameFactBook; names: Record<string, string>; hasBuilds: boolean;
  target?: { d: ProDraft; role: Role }; onPick: (d: ProDraft, role: Role) => void;
}) {
  const order = draftOrder(view.gameId, facts, view.teams.map((t) => ({ team: t.d.team, side: t.side })));
  if (!order.ok) return <p className="small muted order-unavailable"><b>Pick order unavailable.</b> {order.reason}</p>;
  const team = (side: "blue" | "red") => view.teams.find((t) => t.side === side)?.d;
  const Bans = ({ phase }: { phase: number }) => (
    <li className="order-bans" aria-label={phase ? "Second ban phase" : "First ban phase"}>
      <span className="order-phase-name label">{phase ? "Second ban phase" : "Bans"}</span>
      {(["blue", "red"] as const).map((side) => (
        <span key={side} className={`order-ban-side side-${side}`}>
          {(order.bans[side][phase] ?? []).map((b) => <span key={b} className="ban" title={`Banned: ${names[b] ?? b}`}><ChampIcon id={b} name={names[b] ?? b} size="xs" /><span className="sr-only">{names[b] ?? b}</span></span>)}
        </span>
      ))}
    </li>
  );
  const phase = (name: string) => <li className="order-phase"><span className="label">{name}</span></li>;
  return (
    <div className="draft-order">
      <div className="order-heads" aria-hidden="true">
        {(["blue", "red"] as const).map((side) => (
          <span key={side} className={`order-head side-${side}`}><span className="truncate">{team(side)?.team ?? (side === "blue" ? "Blue side" : "Red side")}</span>
            {order.firstPick === side && <FirstPick on />}</span>
        ))}
      </div>
      <ol className="order-steps" aria-label="Picks in draft order">
        <Bans phase={0} />
        {phase("First rotation")}
        {order.steps.map((s) => {
          const d = team(s.side);
          return (
            <Fragment key={s.turns[0]}>
              {s.turns[0] === 7 && <><Bans phase={1} />{phase("Second rotation")}</>}
              <li className="order-step">
                <span className={`order-cell side-${s.side}`}>
                <span className="order-pos">
                  <b>{s.label}</b>
                  <span className="xs muted">{s.turns[0] === 1 ? "First pick" : s.turns[0] === 10 ? "Last pick" : s.turns.length > 1 ? `Picks ${s.turns.join("–")}` : `Pick ${s.turns[0]}`}</span>
                </span>
                <span className="sr-only">{s.side === "blue" ? "Blue side" : "Red side"}{d ? ` ${d.team}` : ""}: </span>
                {s.picks.map((p) => {
                  const champ = names[p.champion] ?? p.champion;
                  const on = !!d && !!p.role && target?.d.id === d.id && target.role === p.role;
                  return (
                    <button key={p.champion} type="button" className="slot-body pick-btn order-pick" aria-pressed={on} disabled={!hasBuilds || !d || !p.role}
                      title={hasBuilds ? `${champ}: this player's build in this game` : `${champ}: no build recorded for this game`}
                      onClick={() => d && p.role && onPick(d, p.role)}>
                      <span className="slot-icon"><ChampIcon id={p.champion} name={champ} role={p.role} size="ml" /></span>
                      <span className="slot-text"><span className="slot-name truncate">{champ}</span>{p.role && <span className={`role-tag role-${p.role}`}>{p.role}</span>}</span>
                    </button>
                  );
                })}
                </span>
              </li>
            </Fragment>
          );
        })}
      </ol>
      <p className="xs muted order-note">Picks in one turn are shown together: the source does not say which came first. A pick made after an opponent&apos;s is an observed response, not proof of a counter.</p>
    </div>
  );
}

/** One game's rows: the game cell, then each team's line with its bans and five picks. Memoized, so opening or closing a
 *  game re-renders only the games whose state changed, never the whole list (a phone felt every tap otherwise). */
const GameRows = memo(function GameRows({ g, meta, href, isOpen, openId, fresh, pinned, champion, names, facts, onOpen }: {
  g: GameGroup; meta: string; href: string; isOpen: boolean; openId?: string; fresh: boolean; pinned: ReadonlySet<string>; champion?: string;
  names: Record<string, string>; facts: GameFactBook; onOpen: (d: ProDraft, e?: React.MouseEvent) => void;
}) {
  const first = g.rows[0].d;
  const n = /G\d+$/i.exec(first.seriesGame)?.[0];
  return (
    <tbody className={`game-rows ${isOpen ? "selected" : ""}`.trim()} data-game={g.key} aria-label={`${first.team} vs ${first.opponent}, ${first.seriesGame}`}>
      {g.rows.map(({ d, pair, side }, i) => (
        <tr key={d.id} className={`clickable side-${side} ${pair} ${d.id === openId ? "selected" : ""}`.replace(/\s+/g, " ").trim()} data-side={side} aria-selected={d.id === openId}
          onClick={(e) => { if ((e.target as HTMLElement).closest("a, button")) return; onOpen(d); }}>
          {i === 0 && (
            <td className="game-cell" rowSpan={g.rows.length}>
              <Link className="cell-link" href={href} prefetch={false} aria-expanded={isOpen} title={`${d.team} vs ${d.opponent} · ${d.seriesGame}`} onClick={(e) => onOpen(d, e)}>
                <span className="game-name truncate">{n && d.stage ? `${d.stage} ${n}` : d.seriesGame}{fresh && <span className="new-tag">New</span>}</span>
                <span className="game-meta-line xs muted">{meta}</span>
              </Link>
            </td>
          )}
          <td className="team-cell">
            {/* The strip carries the side visually (no hover tooltip, alan 2026-10-13); this names it for screen readers. */}
            <span className="sr-only">{SIDE_LABEL[side]}: </span>
            <span className="team-line">
              {pinned.has(d.team) && <PinIcon on />}<span className="team-name truncate">{d.team}</span>
              {d.won != null && <span className={`res ${d.won ? "win" : "loss"}`} title={d.won ? "Won" : "Lost"}>{d.won ? "W" : "L"}</span>}
              <FirstPick on={pickedFirst(d, facts)} />
            </span>
            <Bans ids={bansOf(d, facts)} names={names} team={d.team} />
            {!g.paired && <span className="team-vs xs muted truncate">vs {d.opponent}</span>}
          </td>
          {ROLES.map((r) => <td key={r} className="pick-cell"><ChampionRow id={d.picks[r]} name={names[d.picks[r]] ?? d.picks[r]} role={r} hit={d.picks[r] === champion} /></td>)}
        </tr>
      ))}
    </tbody>
  );
});

export function ProDraftsView({ names, sources, all, freshness, drawerData, buildGames, events, shortNames, eventIds, facts, orderGames, scopeEvents }: {
  names: Record<string, string>; sources: Record<string, Source>; all: ProDraft[]; freshness: Freshness[]; drawerData: DrawerData;
  buildGames: number[]; // recorded games with Pro Builds (data/pro-builds.json)
  events: Record<string, string>; // meta.json event id -> short name, for the build header
  shortNames: Record<string, string>; // tournament name -> short name, for the game cell
  eventIds: Record<string, string>; // tournament name -> meta.json event id, so tournament pins are shared with Pro Builds
  facts: GameFactBook; // Gol.gg game id -> First Pick mark and each side's bans, from the game records
  orderGames: OrderGame[]; // every game record, for the Pick order tab (only verified orders are counted)
  scopeEvents: ScopeEvent[]; // meta.json events, for tournament-stage labels
}) {
  const params = useSearchParams();
  const panelRef = useRef<HTMLElement>(null);
  const f: Filters = Object.fromEntries(KEYS.map((k) => [k, params.get(k) || undefined]));
  const rows = useMemo(() => all.filter((d) => matches(d, f)), [all, f.team, f.champion, f.role, f.tournament, f.stage, f.series]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // The rows read the latest filters through a ref, so the handler stays the same and only changed games re-render.
  // The tapped game keeps its place on screen when another open game above it folds away (no Safari scroll anchoring).
  const latest = useRef(f);
  latest.current = f;
  const anchor = useRef<{ key: string; top: number }>(undefined);
  const onOpen = useCallback((d: ProDraft, e?: React.MouseEvent) => {
    if (e) { if (!plain(e)) return; e.preventDefault(); }
    const cur = latest.current, key = gameKey(d);
    const el = document.querySelector(`tbody.game-rows[data-game="${CSS.escape(key)}"]`);
    anchor.current = el ? { key, top: el.getBoundingClientRect().top } : undefined;
    go(d.id === cur.id ? { ...cur, id: undefined, build: undefined } : { ...cur, id: d.id, build: carryBuild(cur.build, d) }, true);
  }, []);
  useLayoutEffect(() => {
    const a = anchor.current;
    anchor.current = undefined;
    const el = a && document.querySelector(`tbody.game-rows[data-game="${CSS.escape(a.key)}"]`);
    if (!a || !el) return;
    const delta = el.getBoundingClientRect().top - a.top;
    if (Math.abs(delta) < 1) return;
    const box = document.querySelector<HTMLElement>(".drafts-table");
    if (box && box.scrollHeight > box.clientHeight + 1 && getComputedStyle(box).overflowY !== "visible") box.scrollTop += delta;
    else window.scrollBy(0, delta);
  }, [f.id]);
  // Closing returns focus to the game's own link, so the keyboard stays where the game was.
  const close = () => {
    const opener = panelRef.current?.closest("tbody")?.previousElementSibling?.querySelector<HTMLElement>(".cell-link");
    go({ ...f, id: undefined, build: undefined }, true);
    opener?.focus({ preventScroll: true });
  };
  // A new tournament clears its stage, since stages belong to one tournament.
  const setFilter = (key: keyof Filters, value: string) => {
    go({ ...f, ...(key === "tournament" ? { stage: undefined } : {}), [key]: value || undefined, id: undefined, build: undefined });
    resultsToTop(".drafts-table");
  };
  const sel = (key: keyof Filters, label: string, any: string, options: [string, string][]) => (
    <Select showLabel label={label} value={f[key] ?? ""} onChange={(v) => setFilter(key, v)}
      options={[{ value: "", label: any }, ...options.map(([value, l]) => ({ value, label: l }))]} />
  );
  const active = FILTER_KEYS.filter((k) => f[k]).length;
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Pinnable, typeable filters (alan, 2026-10-13): teams, champions, tournaments and series can be pinned; pins are kept
  // in this browser, listed first in their menu, and a pinned team is starred in the table. Team and tournament pins
  // are the same ones Pro Builds uses (tournaments by event id, so the URL keeps the tournament name).
  const pick = (key: keyof Filters, kind: PinKind, options: [string, string][]) => (
    <label className="select-field"><span>{key === "series" ? "Series" : key.charAt(0).toUpperCase() + key.slice(1)}</span>
      <PinPicker kind={kind} value={f[key] ?? ""} options={options} onChange={(v) => setFilter(key, v)} /></label>
  );
  const teamPins = usePins("team");
  const pinnedTeams = useMemo(() => new Set(teamPins.pins), [teamPins.pins]);
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
  const games = useMemo(() => groupGames(rows), [rows]);
  const gameCount = new Set(all.map(gameKey)).size;
  // Stages of the chosen tournament (Worlds: Play-In is its own Gol.gg tournament; Swiss and knockout rounds are stages).
  const stages = f.tournament ? uniq(all.filter((d) => d.tournament === f.tournament && d.stage).map((d) => d.stage)) : [];
  // Worlds games new since this browser's last visit: a small marker on the game and a count in the toolbar.
  const worldsDrafts = all.filter((d) => eventIds[d.tournament]?.startsWith("worlds") && gameIdOf(d));
  const worlds = [...new Set(worldsDrafts.map(gameIdOf))];
  const sinceVisit = useNewGames(worlds);
  // Plus the games the latest refresh added, so the newest batch is always marked (alan, 2026-10-31).
  const batch = useMemo(() => latestBatch(worldsDrafts.map((d) => ({ id: gameIdOf(d), added: facts[gameIdOf(d)]?.added ?? null }))), [all, facts]); // eslint-disable-line react-hooks/exhaustive-deps
  const fresh = new Set([...sinceVisit, ...batch.ids]);
  const freshShown = new Set(rows.map(gameIdOf).filter((id) => fresh.has(id))).size;
  const freshTitle = `Added by the latest refresh${batch.day ? ` (${shortDate(batch.day)})` : ""}${sinceVisit.size ? ", or recorded since your last visit to Pro Drafts in this browser" : ""}`;

  // The open game and its open build. Choosing a champion changes only the build target, in place.
  const view = selected ? gameView(selected, all) : undefined;
  const hasBuilds = !!view && buildGames.includes(view.gameId);
  const target = view ? parseBuildParam(f.build, view) : undefined;
  const orderView = f.view === "order";
  const orderTab = f.tab === "order";
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
  // The game cell: stage and game number ("Finals G1", "Round 2 G3", in GameRows), then tournament, patch and date, each once per game.
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
            <div className="seg game-view-seg" role="group" aria-label="Game view">
              <button type="button" className={orderView ? "" : "active"} aria-pressed={!orderView} onClick={() => go({ ...f, view: undefined })}>Composition</button>
              <button type="button" className={orderView ? "active" : ""} aria-pressed={orderView} onClick={() => go({ ...f, view: "order" })}>Draft order</button>
            </div>
            {orderView && <DraftOrderView view={view} facts={facts} names={names} hasBuilds={hasBuilds} target={target}
              onPick={(d, r) => setBuild(target?.d.id === d.id && target.role === r ? undefined : buildParam(d, r))} />}
            {!orderView && view.teams.map(({ d, side }) => (
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
            {!orderView && view.teams.every((t) => pickedFirst(t.d, facts) === undefined) && <p className="xs muted">Gol.gg does not mark which team picked first in this game.</p>}
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

      {/* Games | Pick order (alan, 2026-10-24). Switching keeps the shared filters (team, champion, role, tournament). */}
      <div className="seg drafts-tabs" role="group" aria-label="Pro Drafts view">
        {([[undefined, "Games"], ["order", "Pick order"]] as const).map(([t, label]) => (
          <button key={label} type="button" className={f.tab === t ? "active" : ""} aria-pressed={f.tab === t}
            onClick={() => { if (f.tab !== t) go({ team: f.team, champion: f.champion, role: f.role, tournament: f.tournament, tab: t }, true); }}>{label}</button>
        ))}
      </div>

      {orderTab && <PickOrderStats games={orderGames} names={names} events={scopeEvents} shortNames={shortNames} params={f as OrderParams}
        set={(next) => { go({ ...f, ...next }); if (Object.keys(next).some((k) => k !== "open" && k !== "dim")) resultsToTop(".order-table"); }} />}

      {!orderTab && selected && view && !inTable && panel}

      {/* Phones fold the menus behind one Filters button (the count, Clear and pinned chips stay out), so the games start
          near the top of the screen instead of under five stacked menus. */}
      {!orderTab && <>
      <form className={`toolbar drafts-tools ${filtersOpen ? "filters-open" : ""}`.trim()} method="get">
        <button type="button" className="btn sm filters-toggle" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((o) => !o)}>
          Filters{active > 0 && <span className="filters-count"> · {active}</span>}
        </button>
        {pick("team", "team", uniq(all.map((d) => d.team)).map((t) => [t, t]))}
        {pick("champion", "champion", champions.map((c) => [c, names[c] ?? c]))}
        {sel("role", "Role", "Any role", ROLES.map((r) => [r, r]))}
        <label className="select-field"><span>Tournament</span>
          <PinPicker kind="event" value={tournamentValue} options={tournamentOptions} onChange={(v) => setFilter("tournament", tournamentName(v))} /></label>
        {stages.length > 1 && sel("stage", "Stage", "Every stage", stages.map((x) => [x, x]))}
        {pick("series", "series", uniq(all.map(seriesOf)).map((x) => [x, x]))}
        <noscript><button className="btn primary sm" type="submit">Filter</button></noscript>
        {active > 0 && <Link className="btn sm ghost" href="/pro-drafts" onClick={(e) => { if (plain(e)) { e.preventDefault(); go({}); resultsToTop(".drafts-table"); } }}>Clear {active} filter{active > 1 ? "s" : ""}</Link>}
        <span className="count" title={`${rows.length} of ${all.length} team drafts`}>{games.length} of {gameCount} games</span>
        {freshShown > 0 && <span className="new-count" title={freshTitle}>{freshShown} new Worlds game{freshShown > 1 ? "s" : ""}</span>}
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
              <GameRows g={g} meta={gameMeta(g.rows[0].d)} href={link(g.rows[0].d)} isOpen={isOpen} openId={isOpen ? f.id : undefined} fresh={fresh.has(gameIdOf(g.rows[0].d))}
                pinned={pinnedTeams} champion={f.champion} names={names} facts={facts} onOpen={onOpen} />
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
      </>}
    </ChampionProvider>
  );
}
