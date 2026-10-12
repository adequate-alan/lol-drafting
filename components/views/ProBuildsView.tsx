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
  BuildOverview, Icon, Item, PurchaseTimeline, Rune, RunePage, SkillGrid, SkillNotes, SkillSummaryLine, Spell, Tree,
  itemName, runeName, spellName, treeName,
} from "@/components/BuildParts";
import { ChampionProvider } from "@/components/ChampionInteraction";
import { PinIcon, PlayerPicker, usePins } from "@/components/PlayerPicker";
import { InteractiveChampion } from "@/components/InteractiveChampion";
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
  const get = (k: string) => params.get(k) || undefined;
  const update = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) if (v) next.set(k, v); else next.delete(k);
    setParams(next);
    window.history.replaceState(null, "", `${window.location.pathname}${next.size ? `?${next}` : ""}`);
  };

  const [all, setAll] = useState<BuildRow[]>();
  const [failed, setFailed] = useState(false);
  useEffect(() => { let live = true; load().then((r) => live && setAll(r), () => live && setFailed(true)); return () => { live = false; }; }, []);

  const name = (id: string) => names[id] ?? id;
  const evName = (r: BuildRow) => events[r.game.event] ?? r.game.tournament;

  // Selected champion and role: the URL's, else the champion's most played role, else the most recorded entry.
  const askedRole = ROLES.find((r) => r === get("role")?.toUpperCase());
  const champion = get("champion") && index.some((e) => e.champion === get("champion")) ? get("champion")! : index[0]?.champion;
  const roles = index.filter((e) => e.champion === champion);
  const entry = roles.find((e) => e.role === askedRole) ?? roles[0];
  const role = entry?.role;

  // Rail
  const [query, setQuery] = useState("");
  const [railRole, setRailRole] = useState<Role | "">("");
  const q = query.trim().toLowerCase();
  // The search also finds players: typing a name lists the champions they played (pinned players' champions first).
  const { pins } = usePins();
  const playerHit = (e: ChampionBuilds) => (q ? e.names.find((p) => p.toLowerCase().includes(q)) : undefined);
  const railed = index.filter((e) => (!railRole || e.role === railRole) && (!q || name(e.champion).toLowerCase().includes(q) || playerHit(e)))
    .sort((a, b) => name(a.champion).localeCompare(name(b.champion)) || ROLES.indexOf(a.role) - ROLES.indexOf(b.role));
  const rail = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const ul = rail.current, el = ul?.querySelector<HTMLElement>("li button.active");
    if (ul && el && (el.offsetTop < ul.scrollTop || el.offsetTop + el.offsetHeight > ul.scrollTop + ul.clientHeight)) ul.scrollTop = el.offsetTop - ul.clientHeight / 3;
  }, [champion, role]);
  // Picking a champion found by a player's name keeps that player selected.
  const choose = (e: ChampionBuilds, player?: string) => update({ champion: e.champion, role: e.role, game: undefined, a: undefined, b: undefined, event: undefined, patch: undefined, team: undefined, player });

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
    { k: "player" as const, label: "Player", all: "All players", opts: uniq(mine.map((r) => [r.build.player, r.build.player])).sort((a, b) => a[1].localeCompare(b[1])) },
  ];
  const active = FILTERS.filter((k) => get(k));
  const gameLabel = (r: BuildRow) => `${r.build.player} (${r.team})${r.opponent ? ` vs ${name(r.opponent.champion)}` : ""} · ${patchLabel(r.game.patch)} · ${shortDate(r.game.date)} · ${r.won ? "W" : "L"}`;

  const draftHref = champion && role ? `/?${role.toLowerCase()}=${champion}` : undefined;
  return (
    <ChampionProvider data={drawerData}>
      <PageHeader title="Pro Builds" desc="Items, runes, skill order and summoner spells from recorded professional games."
        actions={draftHref && <Link className="btn sm" href={draftHref}>Open in Draft Room →</Link>} />
      <div className="split builds-split">
        <nav className="pick-rail" aria-label="Champions with recorded builds">
          <div className="rail-tools">
            <input type="search" placeholder="Champ or player" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search champions or players" />
            <Select label="Role" value={railRole} onChange={(v) => setRailRole(v as Role | "")}
              options={[{ value: "", label: "All roles" }, ...ROLES.map((r) => ({ value: r, label: ROLE_NAME[r] }))]} />
          </div>
          <ul ref={rail}>
            {railed.map((e) => {
              const on = e.champion === champion && e.role === role;
              return (
                <li key={`${e.champion}-${e.role}`}>
                  <button type="button" className={on ? "active" : undefined} aria-current={on ? "true" : undefined}
                    onClick={() => choose(e, name(e.champion).toLowerCase().includes(q) ? undefined : playerHit(e))}>
                    <ChampIcon id={e.champion} name={name(e.champion)} role={e.role} size="md" />
                    <span className="rail-text"><span className="rail-name">{name(e.champion)}</span>
                      <span className="rail-sub">{e.role} · {e.games} game{e.games > 1 ? "s" : ""} · {patchLabel(e.latest)}</span>
                      {(() => {
                        const hit = !name(e.champion).toLowerCase().includes(q) && playerHit(e);
                        const pinned = e.names.filter((p) => pins.includes(p));
                        return hit ? <span className="rail-sub rail-player">{hit}</span>
                          : pinned.length > 0 ? <span className="rail-sub rail-player" title="Pinned players with recorded builds on this champion"><PinIcon on /> {pinned.join(", ")}</span> : null;
                      })()}</span>
                  </button>
                </li>
              );
            })}
            {!railed.length && <li className="rail-empty">No champion or player matches “{query}”.</li>}
          </ul>
        </nav>

        <div className="builds-main">
          {!entry || !champion || !role ? <p className="muted">No recorded pro builds yet.</p> : <>
            <div className="builds-head">
              <ChampIcon id={champion} name={name(champion)} role={role} size="lg" />
              <div className="builds-title">
                <h2>{name(champion)}</h2>
                <span className="small muted tnum">{entry.games} recorded game{entry.games > 1 ? "s" : ""} · {entry.players} player{entry.players > 1 ? "s" : ""} · latest {patchLabel(entry.latest)}</span>
              </div>
              {roles.length > 1 && (
                <div className="seg" role="group" aria-label="Role">
                  {roles.map((e) => <button key={e.role} type="button" className={e.role === role ? "active" : undefined} aria-pressed={e.role === role} onClick={() => choose(e)}>{ROLE_NAME[e.role]} <span className="tnum muted">{e.games}</span></button>)}
                </div>
              )}
            </div>

            <div className="builds-tools">
              {filters.filter((x) => x.k !== "player").map((x) => (
                <Select key={x.k} label={x.label} value={x.k === "patch" && get("patch") ? patchKey(get("patch")!) : get(x.k) ?? ""}
                  options={[{ value: "", label: x.all }, ...x.opts.map(([value, label]) => ({ value, label }))]}
                  onChange={(v) => update({ [x.k]: v || undefined, game: undefined, a: undefined, b: undefined })} />
              ))}
              <PlayerPicker value={get("player") ?? ""} players={filters.find((x) => x.k === "player")!.opts.map(([v]) => v)}
                onChange={(v) => update({ player: v || undefined, game: undefined, a: undefined, b: undefined })} />
              {active.length > 0 && <button type="button" className="btn sm ghost" onClick={() => update(Object.fromEntries([...active, "game", "a", "b"].map((k) => [k, undefined])))}>Clear filters</button>}
              <div className="seg push" role="tablist" aria-label="View">
                {MODES.map(([m, l]) => <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? "active" : undefined} onClick={() => update({ mode: m === "games" ? undefined : m })}>{l}</button>)}
              </div>
            </div>

            {failed ? <p className="small muted">Build data could not be loaded.</p>
              : !all ? <p className="small faint" aria-busy="true">Loading builds…</p>
              : !rows.length ? <p className="small muted">No recorded games match these filters.</p>
              : mode === "common" ? <CommonView c={common(rows)} rows={rows} champion={champion} evName={evName} />
              : mode === "compare" ? <CompareView rows={rows} a={get("a")} b={get("b")} label={gameLabel} name={name} evName={evName} onPick={(k, v) => update({ [k]: v })} />
              : <GamesView rows={rows} current={get("game")} name={name} evName={evName} onPick={(g) => update({ game: String(g) })} />}
          </>}
        </div>
      </div>
    </ChampionProvider>
  );
}

// ---------- individual games ----------
function GamesView({ rows, current, name, evName, onPick }: {
  rows: BuildRow[]; current?: string; name: (id: string) => string; evName: (r: BuildRow) => string; onPick: (game: number) => void;
}) {
  const { isPinned } = usePins();
  const r = rows.find((x) => String(x.game.id) === current) ?? rows[0];
  return (
    <>
      <div className="build-picks" role="listbox" aria-label="Recorded games">
        {rows.map((x) => (
          <button key={x.key} type="button" role="option" aria-selected={x === r} className={`build-pick side-${x.side} ${x === r ? "active" : ""}`} onClick={() => onPick(x.game.id)}
            title={`${x.build.player} (${x.team}) vs ${x.opponentTeam}\n${evName(x)} · ${patchLabel(x.game.patch)} · ${shortDate(x.game.date)} · ${x.side} side · ${x.won ? "win" : "loss"}`}>
            <span className="small nowrap">{isPinned(x.build.player) && <PinIcon on />}<b>{x.build.player}</b> <span className="muted">{x.team}</span></span>
            <span className="xs muted nowrap">{x.opponent && <>vs {name(x.opponent.champion)} · </>}{shortDate(x.game.date)} <span className={x.won ? "win" : "loss"}>{x.won ? "W" : "L"}</span></span>
          </button>
        ))}
      </div>
      <GameDetail r={r} name={name} evName={evName} />
    </>
  );
}

function GameHeader({ r, name, evName, compact }: { r: BuildRow; name: (id: string) => string; evName: (r: BuildRow) => string; compact?: boolean }) {
  const b = r.build;
  return (
    <div className={`game-head side-${r.side} ${compact ? "compact" : ""}`}>
      <div className="game-who">
        <span className="game-player"><b>{b.player}</b> <span className="muted">{r.team}</span></span>
        {r.opponent && (
          <span className="small game-vs"><span className="faint">vs</span>
            <InteractiveChampion id={r.opponent.champion} role={b.role}><ChampIcon id={r.opponent.champion} name={name(r.opponent.champion)} size="xs" /> {name(r.opponent.champion)}</InteractiveChampion>
            {r.opponent.player && <span className="muted">{r.opponent.player}</span>}<span className="muted">{r.opponentTeam}</span></span>
        )}
      </div>
      <div className="game-meta xs muted tnum">
        <span>{evName(r)}{r.game.stage ? ` · ${r.game.stage.charAt(0) + r.game.stage.slice(1).toLowerCase().replace(/(\d)/, " $1")}` : ""}</span>
        <span>{r.game.series} · game {r.game.game}</span>
        <span>{patchLabel(r.game.patch)} · {shortDate(r.game.date)}</span>
        <span className="side-tag" title={`${r.team} played on the ${r.side} side in this game`}>{r.side === "blue" ? "Blue" : "Red"} side</span>
        <span className={r.won ? "win" : "loss"}>{r.won ? "Win" : "Loss"}</span>
        <a href={`https://gol.gg/game/stats/${r.game.id}/page-builds/`} target="_blank" rel="noopener noreferrer"
          title={`Gol.gg builds page for this game\nRead ${b.checkedOn}`}>Gol.gg source ↗</a>
      </div>
      {b.spells ? (
        <div className="game-spells">{b.spells.map((s, i) => <Spell key={s} a={r.assets} id={s} casts={b.spellCasts?.[i]} size={compact ? "sm" : "md"} />)}</div>
      ) : <span className="xs muted">Summoner spells not recorded</span>}
      {b.missing && <p className="xs caution-text game-missing">Partial record: {b.missing.join(", ")} not given by the source for this game.</p>}
    </div>
  );
}

function GameDetail({ r, name, evName }: { r: BuildRow; name: (id: string) => string; evName: (r: BuildRow) => string }) {
  return (
    <div className="game-detail">
      <GameHeader r={r} name={name} evName={evName} />
      <div className="builds-cols">
        <Panel title="Runes">{<RunePage r={r} />}</Panel>
        <Panel title="Skill order"><SkillSummaryLine r={r} /><SkillGrid r={r} /><SkillNotes r={r} /></Panel>
      </div>
      <Panel title="Item progression">
        <BuildOverview r={r} />
        <h3 className="build-sub label">Purchase timeline</h3>
        <PurchaseTimeline r={r} />
      </Panel>
    </div>
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
