"use client";
// Pro: Pro Priority by patch (click a bar or a patch to see that patch's exact statistics and tournaments), recorded
// games (each expands into its compact game detail) and observed pairings (each shows the games behind it). Observed
// Pro Evidence only: nothing here scores.
import Link from "next/link";
import { useState } from "react";
import { Disclosure } from "@/components/Disclosure";
import { PriorityHistory } from "@/components/ProPriority";
import { pct, SourceLinks } from "@/components/ui";
import { GameList, Section, roleName, type DrawerEnv } from "@/components/drawer/parts";
import { observedFor } from "@/lib/comp-links";
import { metaHref, patchStats } from "@/lib/drawer";
import { comparePatchDesc, describeLine, groupObserved } from "@/lib/evidence";
import { patchLabel } from "@/lib/patch";
import { PARTNER_ROLE } from "@/lib/pool-stats";
import { LOW_PICKS, orderRead } from "@/lib/pro-priority";
import { ROLES } from "@/lib/schema";

export function ProTab({ env }: { env: DrawerEnv }) {
  const { id, role, name, data, index, games, history } = env;
  const withRows = history.filter((p) => p.row);
  const selected = history.find((p) => p.patch === env.patch) ?? [...withRows].reverse()[0];
  const stats = selected ? patchStats(data.priority, id, selected) : undefined;
  const r = selected?.row;
  const observed = groupObserved(observedFor(id, role, data), index.events, data.sources);
  const [openObs, setOpenObs] = useState<string>();
  const patches = new Map<string, number>();
  for (const g of games) if (g.patch) patches.set(g.patch, (patches.get(g.patch) ?? 0) + 1);
  const meta = metaHref(role, selected?.patch);

  return (
    <>
      <Section layer="pro" title="Pro priority · all roles" end={<Link className="xs" href={meta} data-to={meta}>Open in Pro priority →</Link>}
        tip="Per patch, never combined: picks and bans from complete Gol.gg game records, or from a tournament table when the whole tournament was one patch. Bans and presence are champion-wide.">
        {withRows.length ? (
          <>
            {history.length > 1 && <PriorityHistory points={history} onPatch={env.setPatch} />}
            <div className="seg dw-patches" role="group" aria-label="Patch">
              {history.map((p) => <button key={p.patch} type="button" className={p.patch === selected?.patch ? "active" : ""} aria-pressed={p.patch === selected?.patch} onClick={() => env.setPatch(p.patch)}>{patchLabel(p.patch)}</button>)}
            </div>
            {selected && stats && (
              <div className="dw-patch-stats" data-patch={patchLabel(selected.patch)}>
                <dl className="dw-kv stats">
                  <dt>Games</dt><dd className="tnum">{selected.games}{stats.events.some((e) => e.ongoing) && <span className="badge pro ongoing" title="A tournament on this patch is still running">Ongoing</span>}</dd>
                  <dt>Picks</dt><dd className="tnum">{r?.picks ?? 0}{r?.low && <span className="low" title={`Fewer than ${LOW_PICKS} picks`}>*</span>}{r?.picks ? <span className="muted"> · {pct(r.pickRate)} of games</span> : null}</dd>
                  <dt>Bans</dt><dd className="tnum">{r?.bans ?? 0}{r?.banRate != null && r.bans ? <span className="muted"> · {pct(r.banRate)} of games</span> : null}</dd>
                  <dt>Presence</dt><dd className="tnum">{selected.presence != null ? pct(selected.presence) : "—"}{selected.banGames < selected.games && <span className="muted"> · over {selected.banGames} games with bans recorded</span>}</dd>
                  <dt>Win rate</dt><dd className="tnum">{r?.winRate != null ? `${pct(r.winRate)} (${r.wins}–${r.picks - r.wins})` : "—"}{r?.low && r.picks ? <span className="muted"> · small sample</span> : null}</dd>
                  <dt>Roles</dt><dd className="tnum">{r && r.picks ? (r.roleVerified ? ROLES.filter((x) => r.rolePicks[x]).map((x) => `${roleName(x)} ${r.rolePicks[x]}`).join(" · ") : r.namedRoles.map(roleName).join(" / ") || "not recorded") : "—"}</dd>
                  <dt>Blue / red</dt><dd className="tnum">{r && r.picks && r.sideKnown ? `${r.blue} / ${r.red}` : "—"}</dd>
                  {stats.teams.length > 0 && <><dt>Teams</dt><dd className="tnum">{stats.teams.slice(0, 6).map((t) => `${t.team} ${t.picks}${t.wins ? ` (${t.wins}W)` : ""}`).join(", ")}{stats.teams.length > 6 && ` +${stats.teams.length - 6}`}</dd></>}
                  {stats.order && <><dt>Pick order</dt><dd className="tnum">first rotation {stats.order.firstRotation} of {stats.order.known} · second phase {stats.order.phase2}{orderRead(stats.order) ? ` · ${orderRead(stats.order)}` : ""}</dd></>}
                  <dt>Sample</dt><dd className="tnum">{stats.events.map((e) => `${e.short} ${e.games} games${e.table ? " (Gol.gg table)" : ""}`).join(" · ")}</dd>
                </dl>
              </div>
            )}
            <Disclosure summary="Every patch" meta={`${withRows.length} with data`} lazy>
              {/* Its own scroll box: a font that runs wider on another machine scrolls the table, never the sheet. */}
              <div className="table-wrap flat">
              <table className="mini">
                <thead><tr><th className="num">Patch</th><th className="num">Games</th><th className="num">Picks</th><th className="num">Bans</th><th className="num">Pres.</th><th className="num">WR</th><th>Roles</th><th className="num" title="Blue / red picks">B / R</th></tr></thead>
                <tbody>
                  {[...history].reverse().map((p) => { const x = p.row; return (
                    <tr key={p.patch} className={p.patch === selected?.patch ? "selected" : undefined}>
                      <td className="num"><button type="button" className="dw-cell-btn" onClick={() => env.setPatch(p.patch)}>{patchLabel(p.patch)}</button></td>
                      <td className="num">{p.games}</td>
                      <td className="num">{x?.picks ?? 0}{x?.low && <span className="low" title="Fewer than 5 picks">*</span>}</td>
                      <td className="num">{x?.bans ?? 0}</td>
                      <td className="num">{p.presence != null ? pct(p.presence) : "—"}</td>
                      <td className="num">{x?.winRate != null ? pct(x.winRate) : "—"}</td>
                      <td className="xs nowrap">{x && x.picks ? (x.roleVerified ? ROLES.filter((y) => x.rolePicks[y]).map((y) => `${y} ${x.rolePicks[y]}`).join(" · ") : x.namedRoles.join(" / ") || "not recorded") : "—"}</td>
                      <td className="num nowrap">{x && x.picks && x.sideKnown ? `${x.blue} / ${x.red}` : "—"}</td>
                    </tr>
                  ); })}
                </tbody>
              </table>
              </div>
            </Disclosure>
          </>
        ) : <p className="xs muted">Not picked or banned in any recorded patch.</p>}
      </Section>

      <Section layer="pro" title={`Recorded games${games.length ? ` · ${games.length}` : ""}`} tip="Drafts and game pages stored in this repo, newest first">
        {games.length ? <GameList env={env} games={games} /> : <p className="xs muted">No recorded games in this role.</p>}
        {patches.size > 1 && <p className="xs muted tnum dw-note">By patch: {[...patches.entries()].sort((a, b) => comparePatchDesc(a[0], b[0])).map(([p, n]) => `${patchLabel(p)} ×${n}`).join(" · ")}</p>}
      </Section>

      {observed.length > 0 && (
        <Section layer="pro" title={`Observed pairings · ${observed.length}`} tip="Pairings the records cite from pro games; a click shows the games behind it">
          <div className="dw-rows">
            {observed.map((g) => {
              const open = openObs === g.champion;
              const pRole = PARTNER_ROLE[role];
              const inComp = env.comp && Object.values(env.comp.slots).includes(g.champion);
              return (
                <div key={g.champion} className={`dw-obs ${open ? "open" : ""} ${inComp ? "in-comp" : ""}`.trim()}>
                  <button type="button" className="dw-row" aria-expanded={open} onClick={() => setOpenObs(open ? undefined : g.champion)}>
                    <span className="dw-row-main">
                      <span className="dw-row-name">{name(g.champion)}</span>
                      <span className="dw-row-sub tnum">{describeLine(g.lines[0])}{g.lines.length > 1 && <span className="faint"> · +{g.lines.length - 1} more</span>}</span>
                    </span>
                    <span className="dw-chevron" aria-hidden="true">{open ? "▾" : "▸"}</span>
                  </button>
                  {open && (
                    <div className="dw-detail">
                      <ul className="dw-lines">
                        {g.lines.map((l, i) => (
                          <li key={i} className="xs">
                            <span className="badge pro tnum">{describeLine(l)}</span>
                            {l.pairing.backedByGame ? <span className="muted"> · recorded draft{l.pairing.proDraftIds.length > 1 ? "s" : ""}</span> : <span className="muted"> · cited, no recorded draft</span>}
                            {" "}<SourceLinks ids={l.pairing.sources} sources={data.sources} />
                          </li>
                        ))}
                      </ul>
                      <p className="dw-actions xs">
                        <button type="button" className="dw-link" onClick={(e) => env.inspect({ id: g.champion, role: pRole }, e.currentTarget)}>Inspect pairing →</button>
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </>
  );
}
