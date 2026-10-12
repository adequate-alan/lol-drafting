"use client";
// Pro Drafts: every recorded team-game, filterable, and one game open at a time for inspection (alan, 2026-10-12): the
// open game shows both teams, their ten picks and bans, and each champion in it is a button that opens that player's
// exact recorded build for that game in the same panel (components/GameBuild.tsx, the one build renderer the site has,
// also used by Pro Builds and Pinned Players). The game is named by its Gol.gg game id and the build by the team row
// and role (lib/pro-drafts-game.ts), never by a row's position. A build Gol.gg did not give is said to be missing.
import { ProFreshness } from "@/components/ProFreshness";
import type { Freshness } from "@/lib/pro-games";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ChampionProvider } from "@/components/ChampionInteraction";
import type { DrawerContext } from "@/lib/drawer";
const PRO_DRAFTS: DrawerContext = { page: "pro-drafts" };
import { GameDetail } from "@/components/GameBuild";
import { Select } from "@/components/Select";
import type { DrawerData } from "@/lib/data";
import { ChampIcon, ChampionRow, PageHeader, SourceLinks } from "@/components/ui";
import { ROLES, type ProDraft, type Role, type Source } from "@/lib/schema";
import { pairRows, SIDE_LABEL } from "@/lib/draft-side";
import { patchLabel } from "@/lib/patch";
import { buildsHref, type BuildRow } from "@/lib/pro-builds";
import { buildFor, buildParam, carryBuild, gameView, parseBuildParam } from "@/lib/pro-drafts-game";

type Filters = { team?: string; champion?: string; role?: string; tournament?: string; series?: string; id?: string; build?: string };

const seriesOf = (d: ProDraft) => d.seriesGame.replace(/\s*G\d+$/i, "");

function matches(d: ProDraft, f: Filters) {
  if (f.team && d.team !== f.team) return false;
  if (f.tournament && d.tournament !== f.tournament) return false;
  if (f.series && seriesOf(d) !== f.series) return false;
  if (f.champion) {
    const roles = f.role ? [f.role as Role] : ROLES;
    if (!roles.some((r) => d.picks[r] === f.champion)) return false;
  }
  return true;
}

const KEYS = ["team", "champion", "role", "tournament", "series", "id", "build"] as const;
const FILTER_KEYS = KEYS.filter((k) => k !== "id" && k !== "build");

// The build rows load as their own chunk the first time a recorded game is opened (lib/pro-builds-bundle.ts).
let loaded: Promise<BuildRow[]> | undefined;
const load = () => (loaded ??= import("@/lib/pro-builds-bundle").then((m) => m.rows));

export function ProDraftsView({ names, sources, all, freshness, drawerData, buildGames, events }: {
  names: Record<string, string>; sources: Record<string, Source>; all: ProDraft[]; freshness: Freshness[]; drawerData: DrawerData;
  buildGames: number[]; // recorded games with Pro Builds (data/pro-builds.json)
  events: Record<string, string>; // meta.json event id -> short name, for the build header
}) {
  const params = useSearchParams();
  const router = useRouter();
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
  const setFilter = (key: keyof Filters, value: string) => router.replace(href({ ...f, [key]: value || undefined, id: undefined, build: undefined }), { scroll: false });
  const sel = (key: keyof Filters, label: string, any: string, options: [string, string][]) => (
    <Select showLabel label={label} value={f[key] ?? ""} onChange={(v) => setFilter(key, v)}
      options={[{ value: "", label: any }, ...options.map(([value, l]) => ({ value, label: l }))]} />
  );
  const active = FILTER_KEYS.filter((k) => f[k]).length;
  // Both sides of one game sit together as a two-row block; each row's strip is that game's recorded side.
  const ordered = pairRows(rows);

  // The open game and its open build. Choosing a champion changes only the build target, in place.
  const view = selected ? gameView(selected, all) : undefined;
  const hasBuilds = !!view && buildGames.includes(view.gameId);
  const target = view ? parseBuildParam(f.build, view) : undefined;
  const setBuild = (value: string | undefined) => router.replace(href({ ...f, build: value }), { scroll: false });
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

  return (
    <ChampionProvider data={drawerData} context={view?.gameId ? { page: "pro-drafts", game: view.gameId } : PRO_DRAFTS}>
      <PageHeader title="Pro Drafts" />
      <ProFreshness items={freshness} />

      {selected && view && (
        <section className="panel game-panel" aria-label={`${selected.team} vs ${selected.opponent}, ${selected.seriesGame}`}>
          <div className="panel-head game-panel-head">
            <div className="game-id">
              <h2>{selected.team} <span className="faint">vs</span> {selected.opponent}</h2>
              <span className="small muted">{selected.seriesGame} · {meta(selected)}</span>
            </div>
            <div className="end">
              <Link className="btn sm primary" href={`/?${new URLSearchParams(Object.fromEntries(ROLES.map((r) => [r.toLowerCase(), selected.picks[r]])))}`}>Open in Draft Room</Link>
              <Link className="btn sm ghost" href={closeHref} aria-label="Close game">×</Link>
            </div>
          </div>
          <div className="panel-body">
            {view.teams.map(({ d, side }) => (
              <div key={d.id} className={`game-team side-${side}`}>
                <div className="game-team-head">
                  <span className="side-tag label" title={SIDE_LABEL[side]}>{side === "none" ? "Side not recorded" : side === "blue" ? "Blue side" : "Red side"}</span>
                  <b className="game-team-name">{d.team}</b>
                  {d.won != null && <span className={`xs ${d.won ? "win" : "loss"}`}>{d.won ? "Win" : "Loss"}</span>}
                  {d.bans?.length ? <span className="xs muted game-bans">Bans: {d.bans.map((b) => names[b] ?? b).join(", ")}</span> : null}
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
            <SourceLinks ids={[...new Set(view.teams.flatMap((t) => t.d.sources))]} sources={sources} />
          </div>
        </section>
      )}

      <form className="toolbar" method="get">
        {sel("team", "Team", "All teams", uniq(all.map((d) => d.team)).map((t) => [t, t]))}
        {sel("champion", "Champion", "All champions", champions.map((c) => [c, names[c] ?? c]))}
        {sel("role", "Role", "Any role", ROLES.map((r) => [r, r]))}
        {sel("tournament", "Tournament", "All", uniq(all.map((d) => d.tournament)).map((t) => [t, t]))}
        {sel("series", "Series", "All series", uniq(all.map(seriesOf)).map((x) => [x, x]))}
        <noscript><button className="btn primary sm" type="submit">Filter</button></noscript>
        {active > 0 && <Link className="btn sm ghost" href="/pro-drafts">Clear {active} filter{active > 1 ? "s" : ""}</Link>}
        <span className="count">{rows.length} of {all.length} team-games</span>
      </form>
      <div className="table-wrap tall drafts-table">
        <table>
          <thead><tr><th>Game</th><th>Team</th><th>vs</th>{ROLES.map((r) => <th key={r}><span className={`role-tag role-${r}`}>{r}</span></th>)}<th>Read</th><th>Source</th></tr></thead>
          <tbody>
            {ordered.map(({ d, pair, side }) => (
              <tr key={d.id} className={`clickable side-${side} ${pair} ${d.id === f.id ? "selected" : ""}`.replace(/\s+/g, " ").trim()} title={SIDE_LABEL[side]} data-side={side} aria-selected={d.id === f.id}
                onClick={(e) => { if ((e.target as HTMLElement).closest("a, button")) return; router.push(link(d)); }}>
                <td><Link className="cell-link nowrap" href={link(d)}>{d.seriesGame}</Link></td>
                <td className="nowrap">{d.team}{d.won != null && <span className="xs muted" title={d.won ? "Won" : "Lost"}> {d.won ? "W" : "L"}</span>}</td>
                <td className="muted nowrap">{d.opponent}</td>
                {ROLES.map((r) => <td key={r}><ChampionRow id={d.picks[r]} name={names[d.picks[r]] ?? d.picks[r]} role={r} hit={d.picks[r] === f.champion} /></td>)}
                <td className="xs wrap">{d.read}</td>
                <td><SourceLinks ids={d.sources} sources={sources} /></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={10} className="muted">No recorded game matches these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </ChampionProvider>
  );
}
