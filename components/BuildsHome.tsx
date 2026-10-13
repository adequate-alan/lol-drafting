"use client";
// The Pro Builds overview (alan, 2026-10-13): what /pro-builds/ shows without a champion, game or player in the URL.
// Players matching the search, pinned players, this browser's recently viewed builds and the recent recorded builds
// (newest patch first). Each entry opens the existing detailed view or a Pinned Players profile; the champion browser
// is the page's rail. Observed Pro Evidence only: nothing here scores or touches saved pairings.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChampIcon } from "@/components/ChampIcon";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { PinIcon, usePins } from "@/components/PlayerPicker";
import { shortDate } from "@/lib/evidence";
import { patchLabel } from "@/lib/patch";
import { gameHref, playerDirectory, playerProfile, profileHref } from "@/lib/pinned-players";
import { buildsHref, type BuildRow } from "@/lib/pro-builds";
import { readViewed, recentBuilds, RECENT_KEY, type HomeFilter, type Viewed } from "@/lib/pro-builds-home";
import type { Role } from "@/lib/schema";

const ROLE_NAME: Record<Role, string> = { TOP: "Top", JUNGLE: "Jungle", MID: "Mid", BOT: "Bot", SUPPORT: "Support" };
const PAGE = 25;

export function BuildsHome({ rows, failed, filter, notFound, name, evName, onClearGame }: {
  rows?: BuildRow[]; failed: boolean; filter: HomeFilter; notFound: boolean;
  name: (id: string) => string; evName: (r: BuildRow) => string; onClearGame: () => void;
}) {
  const router = useRouter();
  const { pins, names: pinNames } = usePins();
  const [viewed, setViewed] = useState<Viewed[]>([]);
  useEffect(() => { try { setViewed(readViewed(localStorage.getItem(RECENT_KEY))); } catch { /* private mode */ } }, []);
  const clearViewed = () => { try { localStorage.removeItem(RECENT_KEY); } catch { /* private mode */ } setViewed([]); };
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [filter.q, filter.role, filter.patch, filter.game]);

  const q = filter.q?.trim().toLowerCase() ?? "";
  const players = useMemo(() => (rows && q ? playerDirectory(rows).filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8) : []), [rows, q]);
  const pinned = useMemo(() => pins.map((id) => playerProfile(rows ?? [], id, {}, pinNames[id])), [rows, pins, pinNames]);
  const recent = useMemo(() => (rows ? recentBuilds(rows, filter, name) : []), [rows, filter.q, filter.role, filter.patch, filter.game]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="builds-home">
      {notFound && <p className="small caution-text">That recorded build is not in the data. Showing the overview.</p>}

      {players.length > 0 && (
        <section className="home-section" aria-label="Players">
          <div className="home-head"><h2>Players</h2><span className="xs muted tnum">{players.length} match{players.length > 1 ? "es" : ""}</span></div>
          <ul className="home-players">
            {players.map((p) => (
              <li key={p.id}><Link className="home-player" href={profileHref(p.id)}>
                <PlayerAvatar id={p.id} name={p.name} size="md" />
                <span className="home-player-text"><b>{p.label}</b><span className="muted">{p.team}</span></span>
              </Link></li>
            ))}
          </ul>
        </section>
      )}

      <section className="home-section" aria-label="Pinned players">
        <div className="home-head"><h2>Pinned players</h2>{pins.length > 0 && <span className="xs muted tnum">{pins.length}</span>}<Link className="push small" href="/pro-builds/pinned/">View all →</Link></div>
        {pins.length ? (
          <ul className="home-players">
            {pinned.map((p) => (
              <li key={p.id}><Link className="home-player" href={profileHref(p.id)} title={`${p.name}'s recorded games, champions and builds`}>
                <PlayerAvatar id={p.id} name={p.name} size="md" />
                <span className="home-player-text"><b><PinIcon on />{p.name}</b><span className="muted">{[p.team, p.role && ROLE_NAME[p.role]].filter(Boolean).join(" · ") || "No recorded games yet"}</span></span>
              </Link></li>
            ))}
          </ul>
        ) : <p className="small muted">No pinned players yet. Pin a player from the Player filter on a champion, or from <Link href="/pro-builds/pinned/">Pinned players</Link>.</p>}
      </section>

      {viewed.length > 0 && (
        <section className="home-section" aria-label="Recently viewed">
          <div className="home-head"><h2>Recently viewed</h2><button type="button" className="btn sm ghost push" onClick={clearViewed}>Clear</button></div>
          <ul className="home-viewed">
            {viewed.map((v) => (
              <li key={`${v.champion}-${v.role}`}><Link className="home-chip" href={`${buildsHref(v.champion, v.role, v.game)}${v.player ? `&player=${encodeURIComponent(v.player)}` : ""}`}>
                <ChampIcon id={v.champion} name={name(v.champion)} role={v.role} size="sm" />
                <span><span className="champ-name">{name(v.champion)}</span> <span className="muted">{ROLE_NAME[v.role]}</span></span>
              </Link></li>
            ))}
          </ul>
        </section>
      )}

      <section className="home-section" aria-label="Recent pro builds">
        <div className="home-head">
          <h2>{filter.game ? "Builds in this game" : "Recent pro builds"}</h2>
          <span className="xs muted tnum">{rows ? `${recent.length} build${recent.length === 1 ? "" : "s"} · ` : ""}{filter.patch ? patchLabel(filter.patch) : "all patches"}{filter.role ? ` · ${ROLE_NAME[filter.role]}` : ""} · newest first</span>
          {filter.game && <button type="button" className="btn sm ghost push" onClick={onClearGame}>Show all recent builds</button>}
        </div>
        {failed ? <p className="small muted">Build data could not be loaded.</p>
          : !rows ? <p className="small faint" aria-busy="true">Loading builds…</p>
          : !recent.length ? <p className="small muted">No recorded builds match{q ? ` “${filter.q}”` : ""} in this scope.</p>
          : <>
            <div className="table-wrap">
              <table className="recent-builds">
                <thead><tr>
                  <th>Player</th><th>Champion</th><th className="hide-phone">Role</th><th className="hide-phone">Opponent</th>
                  <th className="hide-phone">Tournament</th><th>Patch</th><th>Date</th><th>Result</th>
                </tr></thead>
                <tbody>
                  {recent.slice(0, shown).map((r) => {
                    const href = gameHref(r);
                    return (
                      <tr key={r.key} className="click-row" onClick={() => router.push(href)}>
                        <td><span className="player-chip"><PlayerAvatar id={r.build.playerId} name={r.build.player} size="sm" /><span className="home-player-text"><b>{r.build.player}</b><span className="muted">{r.team}</span></span></span></td>
                        <td><Link className="cell-link champ-cell" href={href} onClick={(e) => e.stopPropagation()} title={`${r.build.player}'s exact ${name(r.build.champion)} build in this game`}>
                          <ChampIcon id={r.build.champion} name={name(r.build.champion)} role={r.build.role} size="sm" /><span className="champ-name">{name(r.build.champion)}</span></Link></td>
                        <td className="hide-phone">{ROLE_NAME[r.build.role]}</td>
                        <td className="hide-phone nowrap"><span className="muted">vs</span> {r.opponentTeam}{r.opponent && <> <ChampIcon id={r.opponent.champion} name={`${name(r.opponent.champion)}${r.opponent.player ? ` · ${r.opponent.player}` : ""}`} size="xs" /></>}</td>
                        <td className="hide-phone nowrap">{evName(r)}</td>
                        <td className="tnum nowrap">{patchLabel(r.game.patch)}</td>
                        <td className="tnum nowrap">{shortDate(r.game.date) ?? "—"}</td>
                        <td><span className={r.won ? "win" : "loss"}>{r.won ? "Win" : "Loss"}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {recent.length > shown && <p><button type="button" className="btn sm" onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, recent.length - shown)} more</button> <span className="xs muted tnum">{shown} of {recent.length}</span></p>}
          </>}
      </section>
    </div>
  );
}
