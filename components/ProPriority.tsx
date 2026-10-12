"use client";
// Pro Priority (Meta / Research): which champions pros pick and ban on one patch, by role, with patch-over-patch
// changes and each champion's history. Observed Pro Evidence only; numbers come from lib/pro-priority.ts and are never
// combined across patches unless "All patches" is picked.
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { CATEGORY_LABEL, changesFor, patchHref, type PatchIndex } from "@/lib/patch-changes";
import { InteractiveChampion } from "@/components/ChampionInteraction";
import { Disclosure } from "@/components/Disclosure";
import { Select } from "@/components/Select";
import { ChampIcon, LayerBlock, SectionHeader, SourceLinks, pct } from "@/components/ui";
import { shortDate } from "@/lib/evidence";
import {
  PRIORITY_SORTS, SMALL_SAMPLE, bucket, championHistory, forRole, orderRead, patchLabel, patchesOf, previousPatch, priorityChanges,
  rolePicksOf, rolesOf, sortRows, supportingGames, teamsFor,
  type Bucket, type HistoryPoint, type Move, type PriorityData, type PriorityRow, type PrioritySort, type RoleTab,
} from "@/lib/pro-priority";
import { ROLES, type Role, type Source } from "@/lib/schema";

const DASH = <span className="faint">—</span>;
const pp = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : "±"}${Math.abs(Math.round(x * 100))} pp`;

type Params = { get: (k: string) => string | undefined; set: (k: string, v: string | undefined) => void };

/** Tournament choices: Worlds main event and play-in are one choice. */
function tournamentOptions(d: PriorityData) {
  const groups = new Map<string, { label: string; ongoing: boolean; games: number }>();
  for (const t of d.tournaments) {
    const games = d.contributions.filter((c) => c.event === t.id).reduce((n, c) => n + c.games, 0);
    const g = groups.get(t.group) ?? { label: t.group === t.id ? t.short : t.short.replace(/ Play-In$/, ""), ongoing: false, games: 0 };
    g.ongoing ||= t.status === "ongoing";
    g.games += games;
    groups.set(t.group, g);
  }
  return [...groups.entries()].filter(([, g]) => g.games).map(([value, g]) => ({ value, label: `${g.label} · ${g.games} games${g.ongoing ? " · ongoing" : ""}` }));
}

export function ProPrioritySection({ data, patchIndex, names, sources, params, Champ }: {
  data: PriorityData; patchIndex?: PatchIndex; names: Record<string, string>; sources: Record<string, Source>; params: Params;
  Champ: (p: { id: string; r?: Role; size?: "xs" | "sm" | "md" }) => React.ReactNode;
}) {
  const { get, set } = params;
  const tOptions = tournamentOptions(data);
  const tournament = tOptions.some((o) => o.value === get("event")) ? get("event") : undefined;
  const tournaments = tournament ? [tournament] : undefined;
  const patches = patchesOf(data, tournaments);
  const rawPatch = get("patch");
  const allPatches = rawPatch === "all";
  const patch = allPatches ? undefined : patches.find((p) => p === rawPatch || patchLabel(p) === rawPatch) ?? patches[0];
  const rawRole = get("role");
  const role: RoleTab = rawRole === "ALL" || (ROLES as readonly string[]).includes(rawRole ?? "") ? (rawRole as RoleTab) : "ALL";
  const tabRole = role === "ALL" ? undefined : role;
  const rawSort = get("sort");
  const sort: PrioritySort = rawSort && rawSort in PRIORITY_SORTS ? (rawSort as PrioritySort) : "presence";
  const view = get("view") === "changes" ? "changes" : "table";

  const b = useMemo(() => bucket(data, { patch, tournaments }), [data, patch, tournament]);
  const rows = sortRows(forRole(b.rows, role), sort, tabRole);
  const older = patch ? previousPatch(data, patch, tournaments) : undefined;
  const [openKey, setOpenKey] = useState<string>();
  const toggle = (k: string) => setOpenKey((o) => (o === k ? undefined : k));
  const showOrder = b.orderGames > 0;
  const max = Math.max(0.01, ...rows.map((r) => r.presence ?? 0));

  const sortHead = (k: PrioritySort, label: React.ReactNode, title: string, cls = "") => (
    <th className={`num ${cls}`.trim()} title={title}>
      <button className={`sort ${sort === k ? "active" : ""}`} aria-sort={sort === k ? "descending" : undefined} onClick={() => set("sort", k === "presence" ? undefined : k)}>{label}{sort === k ? " ↓" : ""}</button>
    </th>
  );
  const cols = 7 + Number(role === "ALL") + Number(showOrder) + Number(allPatches);

  return (
    <section className="priority" aria-label="Pro Priority">
      <SectionHeader title="Pro priority" meta={patch ? `Patch ${patchLabel(patch)} only` : `All patches combined: ${patches.map(patchLabel).join(", ")}`}
        end={(
          <nav className="seg" aria-label="Pro priority view">
            <button className={view === "table" ? "active" : undefined} aria-pressed={view === "table"} onClick={() => set("view", undefined)}>Priority</button>
            <button className={view === "changes" ? "active" : undefined} aria-pressed={view === "changes"} onClick={() => set("view", "changes")} disabled={!older}
              title={older ? `Compare with ${patchLabel(older)}` : "No earlier patch with enough games in this scope"}>Changes</button>
          </nav>
        )} />
      <div className="toolbar hub-tools">
        <Select label="Patch" value={allPatches ? "all" : patch ?? ""} onChange={(v) => set("patch", v === patches[0] ? undefined : v === "all" ? "all" : patchLabel(v))}
          options={[...patches.map((p, i) => ({ value: p, label: `${patchLabel(p)} · ${bucket(data, { patch: p, tournaments }).games} games${i === 0 ? " (newest)" : ""}` })), { value: "all", label: "All patches (combined)" }]} />
        <Select label="Tournament" value={tournament ?? ""} onChange={(v) => { set("event", v || undefined); }}
          options={[{ value: "", label: "All tournaments" }, ...tOptions]} />
      </div>
      <Coverage b={b} data={data} tournaments={tournaments} sources={sources} />

      {view === "changes" && patch && older ? (
        <Changes data={data} patchIndex={patchIndex} patch={patch} older={older} tournaments={tournaments} role={role} setRole={(r) => set("role", r === "ALL" ? undefined : r)} Champ={Champ} />
      ) : (
        <>
          <div className="toolbar">
            <RoleTabs role={role} setRole={(r) => set("role", r === "ALL" ? undefined : r)} />
            <span className="count">{rows.length} champions</span>
          </div>
          <Disclosure summary="How these numbers work">
            <p>Presence = games a champion was picked or banned ÷ games on the patch with both teams&apos; bans recorded. Pick rate = picks ÷ games; ban rate = games banned ÷ games; win rate = wins ÷ picks. Games are unique games, never team-games. Bans have no role: on a role tab, picks are that role&apos;s recorded picks, while bans and presence stay champion-wide. A patch is counted from its recorded Gol.gg games when every game of the tournament is recorded; otherwise from the tournament&apos;s Gol.gg table, and only when the whole tournament was played on that one patch (that table has no sides, dates or pick order). First rotation = blue&apos;s first pick and red&apos;s first two, from each team&apos;s pick order as the Gol.gg game page lists it in the standard tournament draft; shown only where that order is stored. * is fewer than 5 picks. Pro evidence only: it never changes saved pairings or the Draft Room order.</p>
          </Disclosure>
          <div className="table-wrap tall hub-table priority-table">
            <table>
              <thead><tr>
                <th>Champion</th>
                {role === "ALL" && <th className="hide-sm" title="Roles recorded for this champion's picks">Roles</th>}
                {sortHead("picks", role === "ALL" ? "Picks" : `${role.charAt(0)}${role.slice(1).toLowerCase()} picks`, role === "ALL" ? "Picks, with pick rate (picks ÷ games)" : `Picks recorded in ${role.toLowerCase()}`)}
                {sortHead("bans", <>Bans{role !== "ALL" && <span className="faint"> · all</span>}</>, "Games banned by either team, with ban rate. Champion-wide: a ban has no role", "hide-sm")}
                {sortHead("presence", <>Presence{role !== "ALL" && <span className="faint"> · all</span>}</>, "Games picked or banned ÷ games. Champion-wide")}
                {sortHead("winRate", "WR", "Wins ÷ picks, all roles")}
                <th className="num hide-sm" title="Picks on blue side / red side (recorded games only)">Blue / red</th>
                {showOrder && sortHead("firstRotation", "1st rot.", "Share of ordered picks taken in the first rotation (B1, R1, R2)", "hide-sm")}
                {allPatches && <th className="hide-sm">Patches</th>}
                {sortHead("recency", "Latest", "Most recent recorded game with this champion picked or banned")}
              </tr></thead>
              <tbody>
                {rows.map((r) => {
                  const k = `${role}-${r.id}`, open = openKey === k;
                  const rp = tabRole ? rolePicksOf(r, tabRole) : undefined;
                  const shownPicks = tabRole && rp !== undefined ? rp : r.picks;
                  const roles = rolesOf(r);
                  return (
                    <Fragment key={r.id}>
                      <tr className={`click-row ${tabRole ? `role-${tabRole}` : ""} ${open ? "open" : ""}`} onClick={() => toggle(k)} tabIndex={0} aria-expanded={open}
                        onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggle(k); } }}>
                        <td><Champ id={r.id} r={tabRole ?? roles[0]} /></td>
                        {role === "ALL" && <td className="hide-sm nowrap">{roles.length ? roles.map((x, i) => (
                          <Fragment key={x}>{i > 0 && " "}<span className={`role-tag role-${x}`} title={r.rolePicks[x] ? `${r.rolePicks[x]} ${x.toLowerCase()} picks` : "Role named by the source or a stored draft; picks not split by role"}>{x}</span>{r.rolePicks[x] && roles.length > 1 ? <span className="xs faint tnum"> {r.rolePicks[x]}</span> : null}</Fragment>
                        )) : <span className="faint" title={r.picks ? "No role recorded" : "Banned only"}>—</span>}</td>}
                        <td className="num nowrap">{shownPicks}{r.low && <span className="low" title="Fewer than 5 picks">*</span>}
                          {tabRole && rp === undefined ? <span className="xs faint" title="Role split not recorded: champion-wide picks"> all roles</span>
                            : <span className="xs faint hide-sm"> {pct(b.games ? shownPicks / b.games : 0)}</span>}</td>
                        <td className="num hide-sm nowrap">{r.banRate != null ? <>{r.bans}<span className="xs faint"> {pct(r.banRate)}</span></> : DASH}</td>
                        <td className="num">{r.presence != null ? <PresenceBar value={r.presence} max={max} /> : DASH}</td>
                        <td className="num">{r.winRate != null ? pct(r.winRate) : DASH}</td>
                        <td className="num hide-sm nowrap">{r.picks && r.sideKnown ? <>{r.blue} <span className="faint">/</span> {r.red}</> : DASH}</td>
                        {showOrder && <td className="num hide-sm">{r.order.known ? <span title={`${r.order.firstRotation} of ${r.order.known} ordered picks in the first rotation`}>{pct(r.order.firstRotation / r.order.known)}</span> : DASH}</td>}
                        {allPatches && <td className="hide-sm nowrap tnum">{r.patches.map(patchLabel).join(", ")}</td>}
                        <td className="num nowrap">{r.latest ? <span title={r.latest.picked ? "Last picked" : "Last banned"}>{shortDate(r.latest.date)}</span> : DASH}</td>
                      </tr>
                      {open && <tr className="hub-detail"><td colSpan={cols}><PriorityDetail r={r} b={b} data={data} patchIndex={patchIndex} tournaments={tournaments} names={names} sources={sources} /></td></tr>}
                    </Fragment>
                  );
                })}
                {!rows.length && <tr><td colSpan={cols} className="xs muted">{b.games ? `No champion has recorded ${role.toLowerCase()} picks on this patch.` : "No verified games in this scope."}</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function RoleTabs({ role, setRole }: { role: RoleTab; setRole: (r: RoleTab) => void }) {
  return (
    <nav className="seg scroll" aria-label="Role">
      <button className={role === "ALL" ? "active" : undefined} onClick={() => setRole("ALL")}>All roles</button>
      {ROLES.map((r) => <button key={r} className={role === r ? "active" : undefined} onClick={() => setRole(r)}><span className={`role-tag role-${r}`}>{r}</span></button>)}
    </nav>
  );
}

export function PresenceBar({ value, max = 1 }: { value: number; max?: number }) {
  return (
    <span className="pbar">
      <span className="pbar-track" aria-hidden="true"><span className="pbar-fill" style={{ width: `${Math.round((value / max) * 100)}%` }} /></span>
      <span className={value >= 0.3 ? "heat-hi" : undefined}>{pct(value)}</span>
    </span>
  );
}

/** "39/39 games recorded · 39/39 with all bans · pick order 0/39", plus what each tournament contributes. */
function Coverage({ b, data, tournaments, sources }: { b: Bucket; data: PriorityData; tournaments?: string[]; sources: Record<string, Source> }) {
  const names = Object.fromEntries(data.tournaments.map((t) => [t.id, t]));
  const per = [...new Set(b.contributions.map((c) => c.event))].map((id) => {
    const cs = b.contributions.filter((c) => c.event === id);
    return { t: names[id], games: cs.reduce((n, c) => n + c.games, 0), table: cs.some((c) => c.kind === "table"), sources: cs.flatMap((c) => c.sources) };
  });
  const gameGames = b.games - b.tableGames;
  const withheld = data.withheld.filter((w) => !tournaments?.length || tournaments.some((t) => w.event === t || names[w.event]?.group === t));
  return (
    <p className="priority-coverage xs muted tnum">
      <b className="text">{b.games} games</b>
      {per.map((x) => (
        <span key={x.t.id}> · {x.t.short} {x.games}{x.t.status === "ongoing" ? <span className="badge pro ongoing">Ongoing</span> : <span className="faint"> (completed)</span>}
          {x.table && <span title="Picks, bans and wins from the tournament's Gol.gg table; per-game records are not stored, so there are no sides, dates or pick order"> · Gol.gg table <SourceLinks ids={x.sources.slice(0, 1)} sources={sources} /></span>}</span>
      ))}
      {gameGames > 0 && <>
        <span> · {b.recorded}/{gameGames} recorded</span>
        <span title="Games where both teams' five bans are recorded"> · {b.banGames - b.tableGames}/{gameGames} with all bans</span>
        <span title="Games with each team's pick order stored"> · pick order {b.orderGames}/{gameGames}</span>
      </>}
      {b.games > 0 && b.games < SMALL_SAMPLE && <span className="caution-text"> · small sample</span>}
      {withheld.map((w) => <span key={w.event} title={w.reason}> · {names[w.event]?.short ?? w.event} not counted ({w.recorded}{w.games ? `/${w.games}` : ""} games recorded)</span>)}
    </p>
  );
}

function Changes({ data, patch, older, tournaments, role, setRole, Champ, patchIndex }: {
  data: PriorityData; patchIndex?: PatchIndex; patch: string; older: string; tournaments?: string[]; role: RoleTab; setRole: (r: RoleTab) => void;
  Champ: (p: { id: string; r?: Role; size?: "xs" | "sm" | "md" }) => React.ReactNode;
}) {
  const c = priorityChanges(data, patch, older, tournaments, role);
  const short = (bk: Bucket) => [...new Set(bk.contributions.map((x) => data.tournaments.find((t) => t.id === x.event)?.short ?? x.event))].join(" + ");
  const sameField = short(c.newer) === short(c.older);
  const List = ({ title, moves }: { title: string; moves: Move[] }) => (
    <div className="table-wrap hub-table mid">
      <table>
        <thead><tr><th>{title}</th><th className="num" title={`Presence on ${patchLabel(older)} → ${patchLabel(patch)}`}>Presence</th><th className="num" title="Difference in percentage points (not a relative change)">Change</th>
          <th className="num hide-sm">Pick rate</th><th className="num hide-sm">Ban rate</th>
          <th className="hide-sm" title={`Official changes to the champion after ${patchLabel(older)}, up to ${patchLabel(patch)}. Listed for context, not as the cause.`}>Patch notes</th></tr></thead>
        <tbody>
          {moves.map((m) => {
            const r = role === "ALL" ? rolesOf((m.to ?? m.from)!)[0] : role;
            return (
              <tr key={m.id}>
                <td className="nowrap"><Champ id={m.id} r={r} />{m.kind === "new" && <span className="badge pro" title="Under 5% presence before, 25% or more now">New</span>}{m.kind === "gone" && <span className="badge plain" title="25% or more before, under 5% now">Dropped out</span>}</td>
                <td className="num nowrap">{pct(m.presence[0])} → <b>{pct(m.presence[1])}</b></td>
                <td className={`num nowrap ${m.change > 0 ? "up" : "down"}`}>{pp(m.change)}</td>
                <td className="num hide-sm nowrap">{pct(m.pickRate[0])} → {pct(m.pickRate[1])}</td>
                <td className="num hide-sm nowrap">{pct(m.banRate[0])} → {pct(m.banRate[1])}</td>
                <td className="hide-sm"><PatchTags id={m.id} index={patchIndex} from={older} to={patch} empty="—" /></td>
              </tr>
            );
          })}
          {!moves.length && <tr><td colSpan={6} className="xs muted">No move of 10 points or more.</td></tr>}
        </tbody>
      </table>
    </div>
  );
  return (
    <>
      <div className="toolbar">
        <RoleTabs role={role} setRole={setRole} />
        <span className="count tnum">{patchLabel(older)} ({short(c.older)}, {c.older.games}) → {patchLabel(patch)} ({short(c.newer)}, {c.newer.games})</span>
      </div>
      <p className="xs muted">
        Presence moves of 10 percentage points or more. Champions absent from a patch count as 0%.
        {!sameField && " Different tournaments on each patch, so teams and regions differ as well as the patch."}
        {c.small && " Small sample: read these as movement, not a trend."}
        {role !== "ALL" && " Presence is champion-wide; the tab lists champions with picks in this role on either patch."}
        {" Patch notes list official changes between the two patches; a change is not shown as the cause of a move."}
      </p>
      <div className="grid cols-2 priority-changes">
        <List title="Rising" moves={c.rising} />
        <List title="Falling" moves={c.falling} />
      </div>
    </>
  );
}

/** Row detail: the formula with its counts, draft order where stored, and the exact games behind the numbers. */
function PriorityDetail({ r, b, data, patchIndex, tournaments, names, sources }: {
  r: PriorityRow; b: Bucket; data: PriorityData; patchIndex?: PatchIndex; tournaments?: string[]; names: Record<string, string>; sources: Record<string, Source>;
}) {
  const games = supportingGames(b, r.id);
  const teams = teamsFor(b, r.id);
  const read = orderRead(r.order);
  const history = championHistory(data, r.id, tournaments);
  const tableSources = b.contributions.filter((c) => c.kind === "table").flatMap((c) => c.sources);
  return (
    <div className="hub-detail-grid">
      <LayerBlock layer="pro" title={`${names[r.id] ?? r.id} · ${b.patch ? patchLabel(b.patch) : "all patches"}`}>
        <p className="small tnum">{r.picks} pick{r.picks === 1 ? "" : "s"} + {r.bans} ban{r.bans === 1 ? "" : "s"} = {r.present} of {b.banGames} games · presence {r.presence != null ? pct(r.presence) : "—"}{r.winRate != null && <> · {r.wins}W {r.picks - r.wins}L</>}</p>
        {teams.length > 0 && <p className="xs muted">Picked by {teams.slice(0, 6).map((t) => `${t.team} ${t.picks}`).join(", ")}{teams.length > 6 ? ` +${teams.length - 6}` : ""}</p>}
        {r.order.known > 0 && (
          <p className="xs muted tnum">Pick order ({r.order.known} ordered picks): first pick {r.order.firstPick} · first rotation {r.order.firstRotation} · second phase {r.order.phase2} · last pick {r.order.lastPick}
            {read && <> · {read === "early" ? "usually an early pick" : read === "late" ? "usually saved for later" : "taken early and late"}</>}</p>
        )}
        {history.length > 1 && <PriorityHistory points={history} />}
        {history.length > 1 && <p className="xs muted">Patch notes {patchLabel(history[0].patch)}–{patchLabel(history.at(-1)!.patch)}: <PatchTags id={r.id} index={patchIndex} from={history[0].patch} to={history.at(-1)!.patch} empty="no official change" /></p>}
        {tableSources.length > 0 && <p className="xs muted">Includes a Gol.gg tournament table (no per-game records): <SourceLinks ids={tableSources} sources={sources} /></p>}
      </LayerBlock>
      <LayerBlock layer="pro" title={`Recorded games · ${games.length}`}>
        {games.length ? games.slice(0, 12).map(({ game: g, side, role, banned }) => (
          <div key={g.id} className="obs-row">
            <span className="small nowrap">{g.blue.team} <span className="faint">vs</span> {g.red.team}</span>
            <span className="ctx">{[shortDate(g.date), patchLabel(g.patch), `G${g.game}`].join(" · ")}</span>
            {banned ? <span className="xs muted">banned</span>
              : <span className="xs nowrap">{side === "blue" ? "Blue" : "Red"} <span className={`role-tag role-${role}`}>{role}</span> {g.winner === side ? "W" : "L"}</span>}
            <a className="src" href={g.url} target="_blank" rel="noreferrer" title="Gol.gg game page, checked by the daily refresh">Gol.gg</a>
          </div>
        )) : <p className="xs muted">No per-game records in this scope{tableSources.length ? "; the numbers come from the tournament table" : ""}.</p>}
        {games.length > 12 && <p className="xs faint">+{games.length - 12} older</p>}
      </LayerBlock>
    </div>
  );
}

/**
 * Official changes to a champion in patches after `from` up to `to`, as links into Patch Notes. Listed beside a priority
 * move, never offered as its cause.
 */
export function PatchTags({ id, index, from, to, empty }: { id: string; index?: PatchIndex; from?: string; to?: string; empty?: string }) {
  const list = index ? changesFor(index, { kind: "champion", ref: id }, from && patchLabel(from), to && patchLabel(to)).filter((c) => !c.via) : [];
  if (!list.length) return empty ? <span className="xs faint">{empty}</span> : null;
  return (
    <span className="ptags">
      {list.map((c) => (
        <Link key={`${c.patch}/${c.id}`} className={`ptag ${c.category ?? "adjustment"}`} href={patchHref(c.patch, c.id)} data-to={patchHref(c.patch, c.id)}
          title={`${c.subject} in patch ${c.patch}: ${c.lines.map((l) => l.text ?? [l.label, l.before && `${l.before} → ${l.after}`].filter(Boolean).join(" ")).join("; ")}${c.more ? ` (+${c.more} more)` : ""}`}>
          {CATEGORY_LABEL[c.category ?? "adjustment"]} {c.patch}
        </Link>
      ))}
    </span>
  );
}

/** Presence per patch, oldest to newest: picks and bans stacked (they never overlap within a game). */
export function PriorityHistory({ points, onPatch }: { points: HistoryPoint[]; onPatch?: (patch: string) => void }) {
  const H = 64, W = Math.max(120, points.length * 44), bw = 22;
  const y = (v: number) => Math.round(v * H);
  return (
    <figure className="phist">
      <svg viewBox={`0 -14 ${W} ${H + 30}`} width={W} height={H + 30} role="img" aria-label={`Presence by patch: ${points.map((p) => `${patchLabel(p.patch)} ${p.presence != null ? pct(p.presence) : "unknown"}`).join(", ")}`}>
        <line x1="0" x2={W} y1={H} y2={H} className="phist-base" />
        {points.map((p, i) => {
          const x = i * 44 + 11, ph = y(p.pickShare), bh = p.banShare != null ? y(p.banShare) : 0;
          const tip = `${patchLabel(p.patch)}: ${p.row?.picks ?? 0} picks, ${p.row?.bans ?? 0} bans of ${p.games} games · presence ${p.presence != null ? pct(p.presence) : "—"}`;
          return (
            <g key={p.patch} className={onPatch ? "phist-col click" : "phist-col"} onClick={onPatch ? () => onPatch(p.patch) : undefined}>
              <title>{tip}</title>
              <rect x={x - 6} y={-14} width={bw + 12} height={H + 30} className="phist-hit" />
              {ph > 0 && <rect x={x} y={H - ph} width={bw} height={ph} className="phist-pick" />}
              {bh > 0 && <rect x={x} y={H - ph - bh - (ph ? 2 : 0)} width={bw} height={bh} className="phist-ban" />}
              {p.presence != null && <text x={x + bw / 2} y={H - ph - bh - (ph && bh ? 2 : 0) - 4} textAnchor="middle" className="phist-value">{pct(p.presence)}</text>}
              <text x={x + bw / 2} y={H + 12} textAnchor="middle" className="phist-label">{patchLabel(p.patch)}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="xs muted"><span className="phist-key pick" /> Picks <span className="phist-key ban" /> Bans · share of games per patch</figcaption>
    </figure>
  );
}
