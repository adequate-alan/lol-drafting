"use client";
// Pro Builds (alan, 2026-10-12): how professionals built, runed and levelled a champion in recorded games, as its own
// page. Observed Pro Evidence only: nothing here scores or touches saved pairings, rankings, Comp Check or pool tiers.
//   Games   - exactly what one player used in one game: full rune page, level-up grid, build overview, purchase timeline,
//             summoner spells, with the game's tournament, patch, date, side, result and Gol.gg source.
//   Common  - counts across the games in the chosen scope, each against the games that recorded that field. Full rune
//             pages count only games with the complete page. Never one player's build, never "best".
//   Compare - two recorded games of the champion side by side, with what differs.
// Selections live in the URL (champion, role, event, patch, team, player, game, mode, a, b) so a build can be shared.
// The rail renders from the build-time index; the build records load as their own chunk (lib/pro-builds-bundle.ts).
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BuildOverview, Icon, Item, Rune, RunePage, SkillGrid, SkillSummaryLine, Tree, itemName, runeName, spellName, treeName,
} from "@/components/BuildParts";
import { ChampionProvider } from "@/components/ChampionInteraction";
import type { DrawerContext } from "@/lib/drawer";
const PRO_BUILDS: DrawerContext = { page: "pro-builds" };
import { BuildsTabs } from "@/components/BuildsTabs";
import { GameDetail, GameHeader } from "@/components/GameBuild";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { PinIcon, PinPicker, useMigratePlayerPins, usePins } from "@/components/PlayerPicker";
import { playerDirectory, profileHref } from "@/lib/pinned-players";
import { Select } from "@/components/Select";
import { ChampIcon, PageHeader, Panel } from "@/components/ui";
import type { DrawerData } from "@/lib/data";
import { shortDate } from "@/lib/evidence";
import { comparePatch, patchKey, patchLabel } from "@/lib/patch";
import {
  abilityIcon, common, fullRunes, maxRanks, overview, pageKey, scoped as inScope, skillSummary, spellIcon,
  type BuildRow, type BuildScope, type ChampionBuilds, type Common, type Tally,
} from "@/lib/pro-builds";
import { ROLES, type Role } from "@/lib/schema";
import { cleanFrom, draftHref as backHref } from "@/lib/my-role";
import { rovingIndex, rovingKeys } from "@/components/roving";
import { BuildsHome } from "@/components/BuildsHome";
import { browse, buildPatches, defaultGame, latestPatch, parseRole, readViewed, recordFor, selectionOf, addViewed, RECENT_KEY } from "@/lib/pro-builds-home";

type Mode = "games" | "common" | "compare";
const MODES: [Mode, string][] = [["games", "Games"], ["common", "Common build"], ["compare", "Compare"]];
const ROLE_NAME: Record<Role, string> = { TOP: "Top", JUNGLE: "Jungle", MID: "Mid", BOT: "Bot", SUPPORT: "Support" };
const FILTERS = ["event", "patch", "team", "player"] as const;

let loaded: Promise<BuildRow[]> | undefined;
const load = () => (loaded ??= import("@/lib/pro-builds-bundle").then((m) => m.rows));

export function ProBuildsView({ index, names, events, drawerData }: {
  index: ChampionBuilds[]; names: Record<string, string>; events: Record<string, string>; drawerData: DrawerData;
}) {
  const initial = useSearchParams();
  const [params, setParams] = useState(() => new URLSearchParams(initial.toString()));
  // The URL is the selection: a link to this page (the sidebar included), Back and Forward all land here and replace
  // what is shown, so nothing stale is carried over from an earlier visit.
  const urlQuery = initial.toString();
  useEffect(() => { setParams((p) => (p.toString() === urlQuery ? p : new URLSearchParams(urlQuery))); }, [urlQuery]);
  const get = (k: string) => params.get(k) || undefined;
  // Choosing a champion is a history entry (Back returns to the overview or the previous champion); filters, games
  // and modes replace the entry.
  const update = (changes: Record<string, string | undefined>, push = false) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) if (v) next.set(k, v); else next.delete(k);
    setParams(next);
    const url = `${window.location.pathname}${next.size ? `?${next}` : ""}`;
    if (push) window.history.pushState(null, "", url); else window.history.replaceState(null, "", url);
  };

  const [all, setAll] = useState<BuildRow[]>();
  const [failed, setFailed] = useState(false);
  useEffect(() => { let live = true; load().then((r) => live && setAll(r), () => live && setFailed(true)); return () => { live = false; }; }, []);

  const name = (id: string) => names[id] ?? id;
  const evName = (r: BuildRow) => events[r.game.event] ?? r.game.tournament;

  // What the URL asks for (lib/pro-builds-home.ts): a champion (exact role from Draft Room), a recorded game or player,
  // or nothing, which is the overview. Never a default champion.
  const from = cleanFrom(get("from"));
  const sel = selectionOf({ champion: get("champion"), role: get("role"), game: get("game"), player: get("player"), from }, index);
  const home = sel.kind === "home" || sel.kind === "record";
  const askedRole = parseRole(get("role"));
  const champion = sel.kind === "champion" || sel.kind === "missing" ? sel.champion : undefined;
  const roles = sel.kind === "champion" ? sel.roles : [];
  const entry = sel.kind === "champion" ? sel.entry : undefined;
  const role = entry?.role;
  // A game and player without a champion: open that exact recorded build once the rows are in.
  const record = sel.kind === "record" && all ? recordFor(all, sel.game, sel.player) : undefined;
  useEffect(() => {
    if (record) update({ champion: record.build.champion, role: record.build.role, game: sel.kind === "record" && sel.game ? String(record.game.id) : undefined, player: String(record.build.playerId) });
  }, [record?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Patch scope (alan, 2026-10-13): every patch unless one is chosen or in the URL; a chosen patch carries into the
  // champion. "all" (older links) is every patch too.
  const newest = latestPatch(index);
  const patchParam = get("patch");
  const scopePatch = patchParam === "all" ? undefined : patchParam;

  // Rail (the champion browser): on the overview its search and role are the overview's own controls.
  const [query, setQuery] = useState("");
  const [railRole, setRailRole] = useState<Role | "">("");
  const q = query.trim().toLowerCase();
  // The search also finds players: typing a name lists the champions they played (pinned players' champions first).
  const { pins, names: pinNames } = usePins();
  useMigratePlayerPins(all);
  const pinnedNames = new Set(pins.map((id) => pinNames[id] ?? id));
  const homeRole = home ? askedRole : undefined;
  const railed = browse(index, { q, role: home ? homeRole : railRole || undefined, patch: scopePatch }, name);
  const rail = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const ul = rail.current, el = ul?.querySelector<HTMLElement>("li button.active");
    if (ul && el && (el.offsetTop < ul.scrollTop || el.offsetTop + el.offsetHeight > ul.scrollTop + ul.clientHeight)) ul.scrollTop = el.offsetTop - ul.clientHeight / 3;
  }, [champion, role]);
  // Phones arriving from Draft Room land on the builds, not the champion list above them (alan, 2026-10-12).
  // Once the builds have loaded (before that the page is too short to scroll).
  const main = useRef<HTMLDivElement>(null);
  const landed = useRef(false);
  useEffect(() => {
    if (landed.current || !from || (!all && !failed)) return;
    landed.current = true;
    if (window.matchMedia("(max-width: 760px)").matches) main.current?.scrollIntoView({ block: "start" });
  }, [all, failed, from]);
  // Picking a champion found by a player's name keeps that player selected. The patch scope comes along.
  const choose = (e: ChampionBuilds, player?: string) => {
    // A player found by name is selected by id when the build data is in (a name shared by two players picks the one on this champion).
    const hit = player && all?.find((r) => r.build.player === player && r.build.champion === e.champion && r.build.role === e.role);
    const sameChampion = e.champion === champion;
    update({ champion: e.champion, role: e.role, game: undefined, a: undefined, b: undefined, event: undefined, team: undefined,
      patch: scopePatch && (e.patches[patchKey(scopePatch)] ?? 0) > 0 ? scopePatch : undefined,
      player: hit ? String(hit.build.playerId) : player }, !sameChampion);
    if (!sameChampion && home) window.scrollTo({ top: 0 });
  };

  // Recently viewed (this browser): the champion and role on screen, with the game and player picked, as overview
  // shortcuts. Never reopened on its own.
  useEffect(() => {
    if (!entry) return;
    try {
      const list = readViewed(localStorage.getItem(RECENT_KEY));
      const game = Number(get("game")) || undefined;
      localStorage.setItem(RECENT_KEY, JSON.stringify(addViewed(list, { champion: entry.champion, role: entry.role, game, player: get("player") })));
    } catch { /* private mode: no shortcuts */ }
  }, [entry?.champion, entry?.role, params.get("game"), params.get("player")]); // eslint-disable-line react-hooks/exhaustive-deps

  const homeHref = `/pro-builds/${scopePatch ? `?patch=${encodeURIComponent(patchLabel(scopePatch))}` : ""}`;
  const toHome = <Link className="btn sm ghost builds-home-link" href={homeHref}>← Pro Builds overview</Link>;

  // Scope
  const mine = useMemo(() => (all && champion && role ? inScope(all, { champion, role }) : []), [all, champion, role]);
  const scope: BuildScope = { champion, role, event: get("event"), patch: get("patch"), team: get("team"), player: get("player") };
  const rows = inScope(mine, scope);
  const mode: Mode = (MODES.find(([m]) => m === get("mode"))?.[0]) ?? "games";

  const uniq = (xs: [string, string][]) => [...new Map(xs).entries()];
  const filters = [
    { k: "event" as const, label: "Tournament", all: "All tournaments", opts: uniq(mine.map((r) => [r.game.event, evName(r)])) },
    { k: "patch" as const, label: "Patch", all: "All patches", opts: uniq(mine.map((r) => [patchKey(r.game.patch), patchLabel(r.game.patch)])).sort((a, b) => comparePatch(b[0], a[0])) },
    { k: "team" as const, label: "Team", all: "All teams", opts: uniq(mine.map((r) => [r.team, r.team])).sort((a, b) => a[1].localeCompare(b[1])) },
    { k: "player" as const, label: "Player", all: "All players", opts: playerDirectory(mine).map((p): [string, string] => [p.id, p.label]) },
  ];
  const active = FILTERS.filter((k) => get(k));
  const gameLabel = (r: BuildRow) => `${r.build.player} (${r.team})${r.opponent ? ` vs ${name(r.opponent.champion)}` : ""} · ${patchLabel(r.game.patch)} · ${shortDate(r.game.date)} · ${r.won ? "W" : "L"}`;

  const draftHref = champion && role ? `/?${role.toLowerCase()}=${champion}` : undefined;
  // Arriving from Draft Room: the way back restores that draft (picks, enemy row, role being picked, filter).
  const back = from ? <Link className="btn sm" href={backHref(from)}>← Back to Draft Room</Link> : undefined;
  const patches = buildPatches(index);
  return (
    <ChampionProvider data={drawerData} context={PRO_BUILDS}>
      <PageHeader title="Pro Builds" badges={<BuildsTabs current="champions" />}
        desc={home ? "Explore professional champion builds: items, runes, skill order and summoner spells from recorded games." : "Items, runes, skill order and summoner spells from recorded professional games."}
        actions={back ?? (draftHref && <Link className="btn sm" href={draftHref}>Open in Draft Room →</Link>)} />
      {home && (
        // The overview's controls drive the champion browser and the recent builds below.
        <div className="builds-home-tools">
          <input type="search" className="builds-search" placeholder="Search champions or players…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search champions or players" />
          <div className="seg" role="group" aria-label="Role">
            {([undefined, ...ROLES] as (Role | undefined)[]).map((r) => (
              <button key={r ?? "all"} type="button" className={homeRole === r ? "active" : undefined} aria-pressed={homeRole === r} onClick={() => update({ role: r })}>{r ? ROLE_NAME[r] : "All"}</button>
            ))}
          </div>
          <Select label="Patch" value={scopePatch ? patchKey(scopePatch) : ""}
            options={[{ value: "", label: "All patches" }, ...patches.map((p) => ({ value: p, label: p === newest ? `${patchLabel(p)} · latest` : patchLabel(p) }))]}
            onChange={(v) => update({ patch: v || undefined })} />
        </div>
      )}
      <div className={`split builds-split${home ? " home" : ""}`}>
        <nav className="pick-rail" aria-label="Champions with recorded builds">
          {!home && (
            <div className="rail-tools">
              <input type="search" placeholder="Champ or player" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search champions or players" />
              <Select label="Role" value={railRole} onChange={(v) => setRailRole(v as Role | "")}
                options={[{ value: "", label: "All roles" }, ...ROLES.map((r) => ({ value: r, label: ROLE_NAME[r] }))]} />
            </div>
          )}
          {home && <p className="rail-count xs muted tnum">{railed.length} champion{railed.length === 1 ? "" : "s"} · {scopePatch ? patchLabel(scopePatch) : "all patches"}</p>}
          <ul ref={rail}>
            {railed.map(({ entry: e, games, player: hit }) => {
              const on = e.champion === champion && e.role === role;
              const pinned = e.names.filter((p) => pinnedNames.has(p));
              return (
                <li key={`${e.champion}-${e.role}`}>
                  <button type="button" className={on ? "active" : undefined} aria-current={on ? "true" : undefined} onClick={() => choose(e, hit)}>
                    <ChampIcon id={e.champion} name={name(e.champion)} role={e.role} size="md" />
                    <span className="rail-text"><span className="rail-name">{name(e.champion)}</span>
                      <span className="rail-sub">{e.role} · {games} game{games > 1 ? "s" : ""} · {patchLabel(e.latest)}</span>
                      {hit ? <span className="rail-sub rail-player">{hit}</span>
                        : pinned.length > 0 ? <span className="rail-sub rail-player" title="Pinned players with recorded builds on this champion"><PinIcon on /> {pinned.join(", ")}</span> : null}</span>
                  </button>
                </li>
              );
            })}
            {!railed.length && <li className="rail-empty">{q ? <>No champion or player matches “{query}”.</> : "No recorded builds in this scope."}</li>}
          </ul>
        </nav>

        <div className="builds-main" ref={main}>
          {home ? (
            sel.kind === "record" && !all && !failed ? <p className="small faint" aria-busy="true">Opening the recorded build…</p>
              : <BuildsHome rows={all} failed={failed} filter={{ q, role: homeRole, patch: scopePatch, game: sel.kind === "home" ? sel.game : undefined }}
                notFound={sel.kind === "record" && !!all && !record} name={name} evName={evName} onClearGame={() => update({ game: undefined, player: undefined })} />
          ) : !entry && champion ? (
            <div className="builds-empty">
              {toHome}
              <h2>{name(champion)}{askedRole && <> · {ROLE_NAME[askedRole]}</>}</h2>
              <p className="small muted">No recorded professional builds for {name(champion)}{askedRole && <> as {ROLE_NAME[askedRole]}</>} in the tracked tournaments.</p>
              {(roles.length > 0 || back) && <p className="row">
                {roles.map((e) => <button key={e.role} type="button" className="btn sm" onClick={() => choose(e)}>{ROLE_NAME[e.role]} builds · {e.games}</button>)}
                {back}
              </p>}
              <p className="xs muted">Pick another champion from the list to explore other recorded builds.</p>
            </div>
          ) : !entry || !champion || !role ? <p className="muted">No recorded pro builds yet.</p> : <>
            {toHome}
            <div className="builds-head">
              <ChampIcon id={champion} name={name(champion)} role={role} size="xxl" />
              <div className="builds-title">
                <h2>{name(champion)}</h2>
                <span className="small muted tnum">{entry.games} recorded game{entry.games > 1 ? "s" : ""} · {entry.players} player{entry.players > 1 ? "s" : ""} · latest {patchLabel(entry.latest)}</span>
              </div>
              {(() => {
                // One player chosen: their portrait and a link to their profile, in every mode (Games, Common, Compare).
                const r = get("player") && rows[0];
                return r ? <Link className="builds-player player-chip small" href={profileHref(String(r.build.playerId))} title={`${r.build.player}'s recorded games, champions and builds`}>
                  <PlayerAvatar id={r.build.playerId} name={r.build.player} size="lg" /><span className="builds-player-text"><b>{r.build.player}</b><span className="muted">{r.team}</span></span></Link> : null;
              })()}
              {roles.length > 1 && (
                <div className="seg" role="group" aria-label="Role">
                  {roles.map((e) => <button key={e.role} type="button" className={e.role === role ? "active" : undefined} aria-pressed={e.role === role} onClick={() => choose(e)}>{ROLE_NAME[e.role]} <span className="tnum muted">{e.games}</span></button>)}
                </div>
              )}
            </div>

            <div className="builds-tools">
              {filters.map((x) => x.k === "patch" ? (
                <Select key={x.k} label={x.label} value={get("patch") ? patchKey(get("patch")!) : ""}
                  options={[{ value: "", label: x.all }, ...x.opts.map(([value, label]) => ({ value, label }))]}
                  onChange={(v) => update({ patch: v || undefined, game: undefined, a: undefined, b: undefined })} />
              ) : (
                // Tournament, team and player are typeable and pinnable (alan, 2026-10-12).
                <PinPicker key={x.k} kind={x.k} value={get(x.k) ?? ""} options={x.opts}
                  onChange={(v) => update({ [x.k]: v || undefined, game: undefined, a: undefined, b: undefined })} />
              ))}
              {active.length > 0 && <button type="button" className="btn sm ghost" onClick={() => update(Object.fromEntries([...active, "game", "a", "b"].map((k) => [k, undefined])))}>Clear filters</button>}
              <div className="seg push" role="tablist" aria-label="View" onKeyDown={(e) => rovingKeys(e)}>
                {MODES.map(([m, l]) => <button key={m} type="button" role="tab" aria-selected={mode === m} tabIndex={rovingIndex(mode === m)} className={mode === m ? "active" : undefined} onClick={() => update({ mode: m === "games" ? undefined : m })}>{l}</button>)}
              </div>
            </div>

            {failed ? <p className="small muted">Build data could not be loaded.</p>
              : !all ? <p className="small faint" aria-busy="true">Loading builds…</p>
              : !rows.length ? <p className="small muted">No recorded games match these filters.{get("patch") && <> <button type="button" className="btn sm ghost" onClick={() => update({ patch: undefined, game: undefined, a: undefined, b: undefined })}>Show every patch</button></>}</p>
              : mode === "common" ? <CommonView c={common(rows)} rows={rows} champion={champion} evName={evName} />
              : mode === "compare" ? <CompareView rows={rows} a={get("a")} b={get("b")} label={gameLabel} name={name} evName={evName} onPick={(k, v) => update({ [k]: v })} />
              : <GamesView rows={rows} current={get("game")} player={get("player")} name={name} evName={evName} onPick={(g) => update({ game: String(g) })} />}
          </>}
        </div>
      </div>
    </ChampionProvider>
  );
}

// ---------- individual games ----------
function GamesView({ rows, current, player, name, evName, onPick }: {
  rows: BuildRow[]; current?: string; player?: string; name: (id: string) => string; evName: (r: BuildRow) => string; onPick: (game: number) => void;
}) {
  const { pins, isPinned } = usePins();
  const team = usePins("team");
  // The game shown (alan, 2026-10-13): the URL's game; else, with no player chosen, the newest game of a pinned
  // player within the filters; else the newest game. A chosen player is never replaced (rows are already theirs).
  const r = defaultGame(rows, { game: current, player }, pins)!;
  // Keep the selected game in view in the strip (the strip scrolls, never the page).
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>(".build-pick.active"), box = strip.current;
    if (el && box && (el.offsetLeft < box.scrollLeft || el.offsetLeft + el.offsetWidth > box.scrollLeft + box.clientWidth)) box.scrollLeft = el.offsetLeft - box.offsetLeft - 8;
  }, [r.key]);
  return (
    <>
      <div className="build-picks" ref={strip} role="listbox" aria-label="Recorded games" onKeyDown={(e) => rovingKeys(e, "[role='option']")}>
        {rows.map((x) => (
          <button key={x.key} type="button" role="option" aria-selected={x === r} tabIndex={rovingIndex(x === r)} className={`build-pick side-${x.side} ${x === r ? "active" : ""}`} onClick={() => onPick(x.game.id)}
            title={`${x.build.player} (${x.team}) vs ${x.opponentTeam}\n${evName(x)} · ${patchLabel(x.game.patch)} · ${shortDate(x.game.date)} · ${x.side} side · ${x.won ? "win" : "loss"}`}>
            <span className="small nowrap"><PlayerAvatar id={x.build.playerId} name={x.build.player} size="xs" /> {isPinned(String(x.build.playerId)) && <PinIcon on />}<b>{x.build.player}</b> <span className="muted">{team.isPinned(x.team) && <PinIcon on />}{x.team}</span></span>
            <span className="xs muted nowrap">{x.opponent && <>vs {name(x.opponent.champion)} · </>}{shortDate(x.game.date)} <span className={x.won ? "win" : "loss"}>{x.won ? "W" : "L"}</span></span>
          </button>
        ))}
      </div>
      <GameDetail r={r} name={name} evName={evName} />
    </>
  );
}

// ---------- common build ----------
function CommonView({ c, rows, champion, evName }: { c: Common; rows: BuildRow[]; champion: string; evName: (r: BuildRow) => string }) {
  const a = c.assets;
  const n = (t: Tally<unknown>, games: number) => <span className="xs muted tnum" title={`In ${games} of the ${t.of} games that recorded this`}>{games}/{t.of}</span>;
  const none = <span className="xs muted">Not recorded</span>;
  const scope = [...new Set(rows.map(evName))].join(", ") + " · " + [...new Set(rows.map((r) => patchLabel(r.game.patch)))].sort((x, y) => comparePatch(y, x)).join(", ");
  const abilities = a?.abilities[champion];
  return (
    <div className="common-build">
      <p className="small common-scope">
        <b className="tnum">{c.games} recorded game{c.games > 1 ? "s" : ""}</b><span className="muted"> · {c.players.length} player{c.players.length > 1 ? "s" : ""} · {scope}.</span>
        <span className="muted"> Each number counts games that showed it, against the games that recorded that field. Common is not the same as best.</span>
      </p>
      <div className="builds-cols">
        <Panel title="Runes" meta={c.runePages.of < c.games ? `${c.runePages.of} of ${c.games} games have the full page` : undefined}>
          <h3 className="build-sub label">Full rune pages</h3>
          {c.runePages.counts.length ? (
            <ul className="rune-setups">
              {c.runePages.counts.slice(0, 6).map(({ value: p, games }) => (
                <li key={pageKey(p)}>
                  <Rune a={a} id={p.keystone} size="md" chosen />
                  <span className="build-row-items tight">{p.primaryRunes.map((x) => <Rune key={x} a={a} id={x} size="sm" chosen />)}</span>
                  <Tree a={a} id={p.secondary} size="xs" />
                  <span className="build-row-items tight">{p.secondaryRunes.map((x) => <Rune key={x} a={a} id={x} size="sm" chosen />)}</span>
                  {p.shards && <span className="build-row-items tight">{p.shards.map((x, i) => <Rune key={i} a={a} id={x} size="xs" chosen />)}</span>}
                  <span className="push">{n(c.runePages, games)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="xs muted">No game in this scope has a complete rune page.</p>}
          <dl className="kv build-kv">
            <dt>Keystone</dt>
            <dd>{c.keystones.counts.length ? <span className="build-counts">{c.keystones.counts.map((k) => <span key={k.value} className="count-item"><Rune a={a} id={k.value} size="sm" chosen /><span className="small">{runeName(a, k.value)}</span>{n(c.keystones, k.games)}</span>)}</span> : none}</dd>
            <dt>Secondary</dt>
            <dd>{c.secondaryTrees.counts.length ? <span className="build-counts">{c.secondaryTrees.counts.map((k) => <span key={k.value} className="count-item"><Tree a={a} id={k.value} size="sm" /><span className="small">{treeName(a, k.value)}</span>{n(c.secondaryTrees, k.games)}</span>)}</span> : none}</dd>
          </dl>
        </Panel>
        <Panel title="Skills and spells">
          <dl className="kv build-kv">
            <dt>Max order</dt>
            <dd>{c.maxOrders.counts.length ? <span className="build-counts">{c.maxOrders.counts.map((m) => <span key={m.value} className="count-item"><b className="small tnum">{m.value}</b>{n(c.maxOrders, m.games)}</span>)}</span> : none}</dd>
            {abilities && <><dt>Abilities</dt><dd className="build-row-items">{(["Q", "W", "E"] as const).map((k) => <span key={k} className="count-item"><Icon src={a && abilityIcon(a, champion, k)} label={abilities[k].name} size="sm" /><span className="xs">{k} {abilities[k].name}</span></span>)}</dd></>}
            <dt>Spells</dt>
            <dd>{c.spells.counts.length ? <span className="build-counts">{c.spells.counts.map((s) => (
              <span key={s.value.join("+")} className="count-item">{s.value.map((id) => <Icon key={id} src={a && spellIcon(a, id)} label={spellName(a, id)} size="sm" />)}<span className="small">{s.value.map((id) => spellName(a, id)).join(" + ")}</span>{n(c.spells, s.games)}</span>
            ))}</span> : none}</dd>
          </dl>
        </Panel>
      </div>
      <Panel title="Items" meta={c.items.of < c.games ? `${c.items.of} of ${c.games} games have a purchase log` : undefined}>
        <dl className="kv build-kv">
          <dt>Start</dt>
          <dd>{c.starting.counts.length ? <span className="build-counts">{c.starting.counts.slice(0, 4).map((s) => <span key={s.value.join("+")} className="count-item"><span className="build-row-items tight">{s.value.map((id, i) => <Item key={i} a={a} id={id} size="sm" />)}</span>{n(c.starting, s.games)}</span>)}</span> : none}</dd>
          <dt>First item</dt>
          <dd>{c.firstItems.counts.length ? <span className="build-counts">{c.firstItems.counts.map((x) => <span key={x.value} className="count-item"><Item a={a} id={x.value} size="sm" /><span className="small">{itemName(a, x.value)}</span>{n(c.firstItems, x.games)}</span>)}</span> : none}</dd>
          <dt>Boots</dt>
          <dd>{c.boots.counts.length ? <span className="build-counts">{c.boots.counts.map((x) => <span key={x.value} className="count-item"><Item a={a} id={x.value} size="sm" /><span className="small">{itemName(a, x.value)}</span>{n(c.boots, x.games)}</span>)}</span> : none}</dd>
          <dt>Completed</dt>
          <dd>{c.items.counts.length ? (
            <ul className="item-freq">
              {c.items.counts.map((x) => (
                <li key={x.value}><Item a={a} id={x.value} size="sm" extra={`Bought in ${x.games} of ${c.items.of} games`} /><span className="small">{itemName(a, x.value)}</span>
                  <span className="freq-bar" aria-hidden="true"><span style={{ "--w": `${(x.games / c.items.of) * 100}%` } as React.CSSProperties} /></span>{n(c.items, x.games)}</li>
              ))}
            </ul>
          ) : none}</dd>
        </dl>
      </Panel>
    </div>
  );
}

// ---------- compare two games ----------
function CompareView({ rows, a: ka, b: kb, label, name, evName, onPick }: {
  rows: BuildRow[]; a?: string; b?: string; label: (r: BuildRow) => string; name: (id: string) => string; evName: (r: BuildRow) => string;
  onPick: (k: "a" | "b", v: string) => void;
}) {
  if (rows.length < 2) return <p className="small muted">Compare needs two recorded games in this scope; there is {rows.length}.</p>;
  const find = (k?: string) => rows.find((r) => String(r.game.id) === k);
  const A = find(ka) ?? rows[0];
  // Default B: another player on the same patch, else another player, else the next game.
  const B = find(kb) ?? rows.find((r) => r !== A && r.build.player !== A.build.player && patchKey(r.game.patch) === patchKey(A.game.patch))
    ?? rows.find((r) => r !== A && r.build.player !== A.build.player) ?? rows.find((r) => r !== A)!;
  const opts = rows.map((r) => ({ value: String(r.game.id), label: label(r) }));
  return (
    <div className="compare">
      <div className="compare-pick">
        <Select label="First game" showLabel value={String(A.game.id)} options={opts} onChange={(v) => onPick("a", v)} />
        <Select label="Second game" showLabel value={String(B.game.id)} options={opts} onChange={(v) => onPick("b", v)} />
      </div>
      {patchKey(A.game.patch) !== patchKey(B.game.patch) && <p className="xs caution-text">Different patches: {patchLabel(A.game.patch)} and {patchLabel(B.game.patch)}. Items and runes may have changed between them.</p>}
      {A === B ? <p className="small muted">Pick two different games.</p> : <>
        <Differences A={A} B={B} />
        <div className="compare-cols">
          {[A, B].map((r) => (
            <div key={r.key} className="compare-col">
              <GameHeader r={r} name={name} evName={evName} compact />
              <Panel title="Runes"><RunePage r={r} compact /></Panel>
              <Panel title="Skill order"><SkillSummaryLine r={r} /><SkillGrid r={r} /></Panel>
              <Panel title="Item progression"><BuildOverview r={r} /></Panel>
            </div>
          ))}
        </div>
      </>}
    </div>
  );
}

/** What differs between two games, read field by field from the two records. */
function Differences({ A, B }: { A: BuildRow; B: BuildRow }) {
  const a = A.assets ?? B.assets;
  const pa = fullRunes(A.build.runes), pb = fullRunes(B.build.runes);
  const runes = (p: typeof pa) => new Set(p ? [p.keystone, ...p.primaryRunes, ...p.secondaryRunes] : []);
  const shardsA = A.build.runes?.shards, shardsB = B.build.runes?.shards;
  const shardDiff = !!shardsA && !!shardsB && shardsA.join() !== shardsB.join();
  const shardIcons = (r: BuildRow, xs?: number[]) => xs?.map((x, i) => <Rune key={`s${i}`} a={r.assets} id={x} size="xs" chosen />);
  const ra = runes(pa), rb = runes(pb);
  const onlyA = [...ra].filter((x) => !rb.has(x)), onlyB = [...rb].filter((x) => !ra.has(x));
  const order = (r: BuildRow) => (r.build.skills ? skillSummary(r.build.skills, maxRanks(r)).order.join(" → ") : undefined);
  const oa = overview(A.build, A.assets), ob = overview(B.build, B.assets);
  const same = <span className="xs muted">Same</span>;
  const pair = (x: React.ReactNode, y: React.ReactNode) => <span className="diff-pair"><span>{x}</span><span className="faint">vs</span><span>{y}</span></span>;
  const items = (ids: number[], r: BuildRow) => ids.length ? <span className="build-row-items tight">{ids.map((id, i) => <Item key={i} a={r.assets} id={id} size="sm" />)}</span> : <span className="xs muted">none</span>;
  const spells = (r: BuildRow) => r.build.spells ? r.build.spells.map((s) => spellName(r.assets, s)).join(" + ") : "not recorded";
  const sameSpells = A.build.spells && B.build.spells && [...A.build.spells].sort().join() === [...B.build.spells].sort().join();
  return (
    <Panel title="Differences" meta={`${A.build.player} vs ${B.build.player}`}>
      <dl className="kv build-kv diff">
        <dt>Runes</dt>
        <dd>{!pa || !pb ? <span className="xs muted">A full page is missing for one game, so runes are not compared.</span>
          : !onlyA.length && !onlyB.length && pa.secondary === pb.secondary && !shardDiff ? same
          : pair(<span className="build-row-items tight">{onlyA.map((x) => <Rune key={x} a={A.assets} id={x} size="sm" chosen />)}{pa.secondary !== pb.secondary && <Tree a={a} id={pa.secondary} size="sm" />}{shardDiff && shardIcons(A, shardsA)}</span>,
            <span className="build-row-items tight">{onlyB.map((x) => <Rune key={x} a={B.assets} id={x} size="sm" chosen />)}{pa.secondary !== pb.secondary && <Tree a={a} id={pb.secondary} size="sm" />}{shardDiff && shardIcons(B, shardsB)}</span>)}</dd>
        <dt>Max order</dt>
        <dd>{order(A) === order(B) ? <span className="small tnum">{order(A) ?? "not recorded"} <span className="xs muted">· same</span></span> : pair(<b className="small tnum">{order(A) ?? "—"}</b>, <b className="small tnum">{order(B) ?? "—"}</b>)}</dd>
        <dt>Core order</dt>
        <dd>{oa.core.join() === ob.core.join() ? <span className="build-row-items">{items(oa.core, A)}<span className="xs muted">same</span></span> : pair(items(oa.core, A), items(ob.core, B))}</dd>
        <dt>Boots</dt>
        <dd>{oa.boots === ob.boots ? (oa.boots ? <span className="build-row-items">{items([oa.boots], A)}<span className="xs muted">same</span></span> : <span className="xs muted">none in either</span>) : pair(items(oa.boots ? [oa.boots] : [], A), items(ob.boots ? [ob.boots] : [], B))}</dd>
        <dt>Spells</dt>
        <dd>{sameSpells ? <span className="small">{spells(A)} <span className="xs muted">· same</span></span> : pair(<span className="small">{spells(A)}</span>, <span className="small">{spells(B)}</span>)}</dd>
      </dl>
    </Panel>
  );
}
