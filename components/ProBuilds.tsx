"use client";
// Pro Builds (alan, 2026-10-12): inside the shared champion drawer, so every page that opens a champion gets the same
// section. Observed Pro Evidence, in the pro layer's styling: one recorded game shows exactly what that player used;
// "Common" counts the games in the chosen scope and says so. Tabs: Builds | Runes | Skills | Games.
// The build data is a separate chunk, loaded when a drawer first opens (lib/pro-builds-bundle.ts), so pages stay light.
import { useEffect, useMemo, useState } from "react";
import { ChampIcon } from "@/components/ChampIcon";
import { Disclosure } from "@/components/Disclosure";
import { Select } from "@/components/Select";
import { shortDate } from "@/lib/evidence";
import {
  BASIC, abilityIcon, clock, common, itemIcon, itemTip, maxRanks, overview, rowsFor, runeIcon, shopVisits, skillSummary, spellIcon,
  type BuildRow, type Common, type Skill,
} from "@/lib/pro-builds";
import type { PatchAssets, Role } from "@/lib/schema";
import { patchLabel } from "@/lib/patch";

type Tab = "builds" | "runes" | "skills" | "games";
const TABS: [Tab, string][] = [["builds", "Builds"], ["runes", "Runes"], ["skills", "Skills"], ["games", "Games"]];
const COMMON = "common";

let loaded: Promise<BuildRow[]> | undefined;
const load = () => (loaded ??= import("@/lib/pro-builds-bundle").then((m) => m.rows));

export function ProBuilds({ champion, role, names, events }: {
  champion: string; role: Role; names: Record<string, string>; events: Record<string, { short: string }>;
}) {
  const [all, setAll] = useState<BuildRow[]>();
  const [failed, setFailed] = useState(false);
  useEffect(() => { let live = true; load().then((r) => live && setAll(r), () => live && setFailed(true)); return () => { live = false; }; }, []);

  const mine = useMemo(() => (all ? rowsFor(all, champion, role) : []), [all, champion, role]);
  const [f, setF] = useState({ event: "", patch: "", team: "", player: "" });
  const [pick, setPick] = useState<string>();
  const [tab, setTab] = useState<Tab>("builds");
  // A new champion or role starts from the default view.
  useEffect(() => { setF({ event: "", patch: "", team: "", player: "" }); setPick(undefined); setTab("builds"); }, [champion, role]);

  const name = (id: string) => names[id] ?? id;
  const evName = (r: BuildRow) => events[r.game.event]?.short ?? r.game.tournament;
  const scoped = mine.filter((r) => (!f.event || r.game.event === f.event) && (!f.patch || r.game.patch === f.patch)
    && (!f.team || r.team === f.team) && (!f.player || r.build.player === f.player));
  const sel = pick && pick !== COMMON ? scoped.find((r) => r.key === pick) : undefined;
  const showCommon = !sel && (pick === COMMON || scoped.length > 1);
  const view = sel ?? (showCommon ? undefined : scoped[0]);

  const options = (vals: [string, string][], all: string) => [{ value: "", label: all }, ...vals.sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label }))];
  const uniq = (xs: [string, string][]) => [...new Map(xs).entries()];
  const filters = [
    { k: "event" as const, label: "Tournament", all: "All tournaments", opts: uniq(mine.map((r) => [r.game.event, evName(r)])) },
    { k: "patch" as const, label: "Patch", all: "All patches", opts: uniq(mine.map((r) => [r.game.patch, patchLabel(r.game.patch)])) },
    { k: "team" as const, label: "Team", all: "All teams", opts: uniq(mine.map((r) => [r.team, r.team])) },
    { k: "player" as const, label: "Player", all: "All players", opts: uniq(mine.map((r) => [r.build.player, r.build.player])) },
  ].filter((x) => x.opts.length > 1);

  const head = <div className="layer-label"><span className="ldot" />Pro builds{all && mine.length > 0 && <span className="push xs muted tnum">{mine.length} game{mine.length > 1 ? "s" : ""}</span>}</div>;
  if (failed) return <section className="layer pro builds">{head}<p className="xs muted">Build data could not be loaded.</p></section>;
  if (!all) return <section className="layer pro builds" aria-busy="true">{head}<p className="xs faint">Loading builds…</p></section>;
  if (!mine.length) return <section className="layer pro builds">{head}<p className="xs muted">No recorded pro builds for {name(champion)} {role.toLowerCase()}.</p></section>;

  const scope = [role.charAt(0) + role.slice(1).toLowerCase(), ...new Set(scoped.map(evName)), ...new Set(scoped.map((r) => patchLabel(r.game.patch)))];
  return (
    <section className="layer pro builds">
      {head}
      {filters.length > 0 && (
        <div className="build-filters">
          {filters.map((x) => <Select key={x.k} label={x.label} value={f[x.k]} options={options(x.opts, x.all)} onChange={(v) => { setF({ ...f, [x.k]: v }); setPick(undefined); }} />)}
        </div>
      )}

      <div className="build-picks" role="listbox" aria-label="Game to inspect">
        {scoped.length > 1 && (
          <button type="button" role="option" aria-selected={showCommon} className={`build-pick common ${showCommon ? "active" : ""}`} onClick={() => setPick(COMMON)}
            title={`Counts across the ${scoped.length} games in this scope, not one player's build`}>
            <span className="small">Common</span><span className="xs muted tnum">{scoped.length} games</span>
          </button>
        )}
        {scoped.map((r) => (
          <button key={r.key} type="button" role="option" aria-selected={view?.key === r.key} className={`build-pick ${view?.key === r.key ? "active" : ""}`}
            onClick={() => setPick(r.key)} title={`${r.build.player} (${r.team}) vs ${r.opponent ? name(r.opponent.champion) : "?"} · ${evName(r)} ${patchLabel(r.game.patch)} · ${shortDate(r.game.date)} · ${r.won ? "win" : "loss"}`}>
            <span className="small nowrap">{r.build.player}</span>
            <span className="xs muted nowrap">{r.opponent && <>vs {name(r.opponent.champion)} </>}<span className={r.won ? "win" : "loss"}>{r.won ? "W" : "L"}</span></span>
          </button>
        ))}
      </div>

      {view ? <GameContext r={view} name={name} evName={evName(view)} />
        : <p className="xs muted build-scope">Common across {scoped.length} recorded games · {scope.join(" · ")}. Counts of games, not a recommended build.</p>}

      <div className="seg build-tabs" role="tablist" aria-label="Build detail">
        {TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "active" : undefined} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      <div className="build-panel" role="tabpanel">
        {tab === "games" ? <GamesList rows={scoped} name={name} evName={evName} current={view?.key} onPick={(k) => { setPick(k); setTab("builds"); }} />
          : view ? (tab === "builds" ? <GameBuild r={view} /> : tab === "runes" ? <GameRunes r={view} /> : <GameSkills r={view} />)
          : <CommonView c={common(scoped)} tab={tab} champion={champion} />}
      </div>
    </section>
  );
}

function GameContext({ r, name, evName }: { r: BuildRow; name: (id: string) => string; evName: string }) {
  return (
    <div className="build-context">
      <ChampIcon id={r.build.champion} name={name(r.build.champion)} size="xs" />
      <span className="small"><b>{r.build.player}</b> <span className="muted">{r.team}</span></span>
      {r.opponent && <span className="small"><span className="faint">vs</span> <ChampIcon id={r.opponent.champion} name={name(r.opponent.champion)} size="xs" /> {name(r.opponent.champion)}{r.opponent.player && <span className="muted"> · {r.opponent.player}</span>} <span className="muted">({r.opponentTeam})</span></span>}
      <span className="xs muted tnum">{evName} · {patchLabel(r.game.patch)} · {shortDate(r.game.date)} · <span className={r.won ? "win" : "loss"}>{r.won ? "Win" : "Loss"}</span>
        {" · "}<a href={`https://gol.gg/game/stats/${r.game.id}/page-builds/`} target="_blank" rel="noopener noreferrer"
          title={`${r.game.series} game ${r.game.game}\nGol.gg builds page, read ${r.build.checkedOn}`}>Gol.gg</a></span>
      {r.build.missing && <span className="xs faint">Not recorded for this game: {r.build.missing.join(", ")}.</span>}
    </div>
  );
}

function Icon({ src, label, tip, size = "md", dim, struck }: { src?: string; label: string; tip?: string; size?: "sm" | "md"; dim?: boolean; struck?: boolean }) {
  const [bad, setBad] = useState(false);
  return (
    <span className={`bicon ${size} ${dim ? "dim" : ""} ${struck ? "struck" : ""}`} title={tip ?? label}>
      {src && !bad ? <img src={src} alt={label} loading="lazy" decoding="async" draggable={false} onError={() => setBad(true)} /> : <span className="bicon-fallback" aria-label={label}>{label.slice(0, 2)}</span>}
    </span>
  );
}

const Item = ({ a, id, extra, size, struck }: { a?: PatchAssets; id: number; extra?: string; size?: "sm" | "md"; struck?: boolean }) =>
  <Icon src={a ? itemIcon(a, id) : undefined} label={a?.items[id]?.name ?? `Item ${id}`} tip={itemTip(a, id, extra)} size={size} struck={struck} />;

function Spells({ r }: { r: BuildRow }) {
  const a = r.assets, b = r.build;
  if (!b.spells) return <span className="xs muted">Not recorded</span>;
  return (
    <span className="build-row-items">
      {b.spells.map((s) => { const sp = a?.spells[s]; return <span key={s} className="spell"><Icon src={a && spellIcon(a, s)} label={sp?.name ?? `Spell ${s}`} size="sm" /><span className="small">{sp?.name ?? s}</span></span>; })}
    </span>
  );
}

function GameBuild({ r }: { r: BuildRow }) {
  const a = r.assets, b = r.build, o = overview(b, a);
  const visits = shopVisits(b);
  const line = (label: string, ids: number[], note?: string) => (
    <><dt>{label}</dt><dd>{ids.length ? <span className="build-row-items">{ids.map((id, i) => <Item key={`${id}-${i}`} a={a} id={id} struck={o.sold.has(id) && label !== "Final"} extra={o.sold.has(id) && label !== "Final" ? "Sold later in the game" : undefined} />)}</span> : <span className="xs muted">{note ?? "none"}</span>}</dd></>
  );
  return (
    <>
      <dl className="kv build-kv">
        <dt>Spells</dt><dd><Spells r={r} /></dd>
        {o.complete ? <>
          {line("Start", o.starting)}
          {line("Boots", o.boots ? [o.boots] : [], "no boots bought")}
          {line("Core", o.core, "no completed item")}
          {o.later.length > 0 && line("Later", o.later)}
        </> : <><dt>Items</dt><dd className="xs muted">Purchase log not recorded for this game.</dd></>}
        {b.final ? line("Final", [...b.final.filter(Boolean), ...(b.trinket ? [b.trinket] : [])], "empty inventory") : <><dt>Final</dt><dd className="xs muted">Not recorded</dd></>}
      </dl>
      <p className="xs faint">Start, boots, core and later are read in order from this game's purchase log; Final is the inventory when the game ended.</p>
      {visits.length > 0 && (
        <Disclosure summary="Purchase timeline" meta={`${visits.length} shop visits`} lazy>
          <ol className="build-timeline" aria-label="Purchases in game time">
            {visits.map((v) => (
              <li key={v.at}>
                <span className="xs muted tnum">{clock(v.at)}</span>
                <span className="build-row-items">{v.steps.map((s, i) => <Item key={i} a={a} id={s.item} size="sm" struck={s.sold} extra={`${s.sold ? "Sold" : "Bought"} at ${clock(s.at)}`} />)}</span>
              </li>
            ))}
          </ol>
          <p className="xs faint">Every buy and sell Gol.gg recorded, grouped into shop visits. Struck through: sold. Components merged into items are not listed again.</p>
        </Disclosure>
      )}
      {b.spellCasts && <Disclosure summary="Spell casts" meta="recorded"><p className="small tnum">{b.spells?.map((s, i) => `${r.assets?.spells[s]?.name ?? s} ${b.spellCasts![i]}`).join(" · ")}</p></Disclosure>}
    </>
  );
}

function GameRunes({ r }: { r: BuildRow }) {
  const a = r.assets, ru = r.build.runes;
  if (!ru) return <p className="xs muted">Runes not recorded for this game.</p>;
  const picked = new Set([ru.keystone, ...ru.primaryRunes, ...ru.secondaryRunes]);
  const tree = (id: number, skipKeystone: boolean) => {
    const t = a?.trees[id];
    if (!t) return <p className="xs muted">Tree {id}</p>;
    return (
      <div className="rune-tree">
        <div className="rune-tree-head"><Icon src={runeIcon(t.icon)} label={t.name} size="sm" /><span className="small"><b>{t.name}</b></span></div>
        {t.rows.slice(skipKeystone ? 1 : 0).map((row, i) => (
          <div key={i} className={`rune-row ${!skipKeystone && i === 0 ? "keystone" : ""}`}>
            {row.map((x) => { const rn = a?.runes[x]; return <Icon key={x} src={rn && runeIcon(rn.icon)} label={rn?.name ?? `Rune ${x}`} tip={`${rn?.name ?? x}${picked.has(x) ? " · chosen" : ""}\n${rn?.short ?? ""}`} dim={!picked.has(x)} />; })}
          </div>
        ))}
      </div>
    );
  };
  const named = (x: number) => a?.runes[x]?.name ?? `Rune ${x}`;
  return (
    <>
      <p className="small"><b>{named(ru.keystone)}</b> <span className="muted">· {a?.trees[ru.primary]?.name} + {a?.trees[ru.secondary]?.name}</span></p>
      <div className="rune-page">
        {tree(ru.primary, false)}
        <div>
          {tree(ru.secondary, true)}
          {ru.shards && (
            <div className="rune-shards">
              <span className="xs muted">Shards</span>
              {ru.shards.map((x, i) => <span key={i} className="spell"><Icon src={a?.runes[x] && runeIcon(a.runes[x].icon)} label={named(x)} size="sm" /><span className="xs">{named(x)}</span></span>)}
            </div>
          )}
        </div>
      </div>
      <p className="xs faint">Bright: chosen in this game. Dimmed: the other options in the same row.</p>
    </>
  );
}

function GameSkills({ r }: { r: BuildRow }) {
  const a = r.assets, b = r.build;
  if (!b.skills) return <p className="xs muted">Skill order not recorded for this game.</p>;
  const s = skillSummary(b.skills, maxRanks(r));
  const ab = a?.abilities[b.champion];
  const levels = [...b.skills] as Skill[];
  return (
    <>
      <p className="small">
        <span className="muted">{s.maxed.length === s.order.length ? "Max order" : "Priority"}</span> <b className="tnum">{s.order.join(" → ")}</b>
        <span className="muted"> · first levels {s.first.join(" ")}</span>
      </p>
      <div className="skill-grid-wrap">
        <table className="skill-grid" aria-label="Ability given each point, in order">
          <thead><tr><th scope="col"><span className="sr-only">Ability</span></th>{levels.map((_, i) => <th key={i} scope="col" className="tnum">{i + 1}</th>)}</tr></thead>
          <tbody>
            {(["Q", "W", "E", "R"] as Skill[]).map((k) => (
              <tr key={k}>
                <th scope="row"><span className="skill-key"><Icon src={a && abilityIcon(a, b.champion, k)} label={ab?.[k].name ?? k} tip={`${k} · ${ab?.[k].name ?? ""}`} size="sm" />{k}</span></th>
                {levels.map((x, i) => <td key={i} className={x === k ? "up" : ""}>{x === k ? <span className="tnum">{i + 1}</span> : null}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {s.levels < 18 && <p className="xs faint">{s.levels} ability points recorded; the game ended before more were taken, so later ones are not shown.</p>}
      {s.levels > 18 && <p className="xs faint">{s.levels} ability points recorded: this champion takes more ability points than champion levels, so the columns count points, not levels.</p>}
      {s.maxed.length < s.order.length && <p className="xs faint">Not every basic ability was maxed in this game, so the order is by points taken.</p>}
      {b.skillCasts && <Disclosure summary="Ability casts" meta="recorded"><p className="small tnum">{(["Q", "W", "E", "R"] as Skill[]).map((k, i) => `${k} ${b.skillCasts![i]}`).join(" · ")}</p></Disclosure>}
    </>
  );
}

function GamesList({ rows, name, evName, current, onPick }: { rows: BuildRow[]; name: (id: string) => string; evName: (r: BuildRow) => string; current?: string; onPick: (k: string) => void }) {
  return (
    <table className="mini build-games">
      <thead><tr><th>Player</th><th>Against</th><th className="num">Result</th><th>Event</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className={current === r.key ? "active" : undefined}>
            <td><button type="button" className="link-btn small" onClick={() => onPick(r.key)}>{r.build.player}</button><span className="xs muted"> {r.team}</span></td>
            <td className="small">{r.opponent ? <>{name(r.opponent.champion)}{r.opponent.player && <span className="xs muted"> {r.opponent.player}</span>}</> : "—"}</td>
            <td className={`num small ${r.won ? "win" : "loss"}`}>{r.won ? "Win" : "Loss"}</td>
            <td className="xs muted nowrap tnum">{evName(r)} {patchLabel(r.game.patch)} · {shortDate(r.game.date)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CommonView({ c, tab, champion }: { c: Common; tab: Tab; champion: string }) {
  const a = c.assets;
  const n = (x: number) => <span className="xs muted tnum">{x}/{c.games}</span>;
  if (tab === "runes") return (
    <dl className="kv build-kv">
      <dt>Keystone</dt>
      <dd>{c.keystones.length ? <span className="build-counts">{c.keystones.map((k) => <span key={k.value} className="spell"><Icon src={a?.runes[k.value] && runeIcon(a.runes[k.value].icon)} label={a?.runes[k.value]?.name ?? `Rune ${k.value}`} size="sm" /><span className="small">{a?.runes[k.value]?.name ?? k.value}</span>{n(k.games)}</span>)}</span> : <span className="xs muted">Not recorded</span>}</dd>
    </dl>
  );
  if (tab === "skills") return (
    <dl className="kv build-kv">
      <dt>Max order</dt>
      <dd>{c.maxOrders.length ? <span className="build-counts">{c.maxOrders.map((m) => <span key={m.value} className="small tnum">{m.value} {n(m.games)}</span>)}</span> : <span className="xs muted">Not recorded</span>}</dd>
      {a?.abilities[champion] && <><dt>Abilities</dt><dd className="small">{BASIC.map((k) => `${k} ${a.abilities[champion][k].name}`).join(" · ")}</dd></>}
    </dl>
  );
  return (
    <>
      <dl className="kv build-kv">
        <dt>Spells</dt>
        <dd><span className="build-counts">{c.spells.map((s) => <span key={s.value.join("+")} className="spell">{s.value.map((id) => <Icon key={id} src={a && spellIcon(a, id)} label={a?.spells[id]?.name ?? `Spell ${id}`} size="sm" />)}<span className="small">{s.value.map((id) => a?.spells[id]?.name ?? id).join(" + ")}</span>{n(s.games)}</span>)}</span></dd>
        <dt>Boots</dt>
        <dd>{c.boots.length ? <span className="build-counts">{c.boots.map((x) => <span key={x.value} className="spell"><Item a={a} id={x.value} size="sm" />{n(x.games)}</span>)}</span> : <span className="xs muted">none recorded</span>}</dd>
        <dt>Items</dt>
        <dd>{c.items.length ? <span className="build-counts">{c.items.slice(0, 12).map((x) => <span key={x.value} className="spell"><Item a={a} id={x.value} size="sm" extra={`Bought in ${x.games} of ${c.games} games`} />{n(x.games)}</span>)}</span> : <span className="xs muted">none recorded</span>}</dd>
      </dl>
      <p className="xs faint">Completed items by the number of games they were bought in{c.players.length > 1 ? `, across ${c.players.length} players` : ""}. Popular is not the same as best.</p>
    </>
  );
}
