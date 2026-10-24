"use client";
// Pro Drafts' Pick order tab (alan, 2026-10-24): when pros took each champion, from verified chronological draft records
// only (lib/pick-order.ts). Rotation is the default grouping; the Position menu drills into exact turns. Each row is a
// champion with its sample; a row opens how that champion's picks split by patch, tournament stage or team. The win-loss
// record is context, never a sort and never a priority claim. Filters live in the URL like the Games tab's.
import { useMemo, useState } from "react";
import { ChampionRow, pct } from "@/components/ui";
import { PinPicker } from "@/components/PlayerPicker";
import { Select } from "@/components/Select";
import { patchLabel } from "@/lib/patch";
import {
  breakdown, coverage, filterPicks, orderedPicks, pickRows, SLOT_LABEL, SLOTS, SMALL_SAMPLE, slotTeam,
  type Dimension, type OrderGame, type PickFilter, type PickRow, type PickSort, type Position, type Tally,
} from "@/lib/pick-order";
import { comparePatchDesc } from "@/lib/evidence";
import { ROLES } from "@/lib/schema";
import { scopeLabel, type ScopeEvent } from "@/lib/tournament-scope";

export type OrderParams = PickFilter & { pos?: string; sort?: string; open?: string; dim?: string };

const POSITIONS: [Position, string][] = [
  ["first", "First rotation (picks 1–6)"], ["second", "Second rotation (picks 7–9)"], ["last", "Last pick (pick 10)"],
  ...SLOTS.map((s): [Position, string] => [`slot:${s}`, `${SLOT_LABEL[s]} · ${slotTeam(s) === "first" ? "first-pick team" : "second team"}`]),
];
const SIDES: [string, string][] = [["blue", "Blue side"], ["red", "Red side"], ["first", "First-pick team"], ["second", "Second-pick team"]];
const SORTS: [PickSort, string][] = [["at", "Picks at position"], ["first", "First rotation"], ["firstOverall", "First pick"], ["last", "Last pick"], ["picks", "All picks"]];
const DIMS: [Dimension, string][] = [["patch", "Patch"], ["scope", "Tournament stage"], ["team", "Team"]];

/** "6/8" with its share in the hint: a count is never shown without its sample. */
const Of = ({ n, of, what }: { n: number; of: number; what: string }) =>
  of ? <span title={`${n} of ${of} ${what} (${Math.round((n / of) * 100)}%)`}>{n}<span className="faint">/{of}</span></span> : <span className="faint">—</span>;
const WL = ({ t }: { t: Tally }) => <span className="muted">{t.wins}–{t.picks - t.wins}</span>;

export function PickOrderStats({ games, names, events, shortNames, params, set }: {
  games: OrderGame[]; names: Record<string, string>; events: ScopeEvent[]; shortNames: Record<string, string>;
  params: OrderParams; set: (next: Partial<OrderParams>) => void;
}) {
  const all = useMemo(() => orderedPicks(games), [games]);
  const pos = POSITIONS.some(([p]) => p === params.pos) ? (params.pos as Position) : undefined;
  const sort = SORTS.some(([s]) => s === params.sort) ? (params.sort as PickSort) : pos ? "at" : "first";
  const dim = DIMS.some(([d]) => d === params.dim) ? (params.dim as Dimension) : "patch";
  const f: PickFilter = { team: params.team, champion: params.champion, role: params.role, tournament: params.tournament, stage: params.stage, patch: params.patch, side: params.side };
  const picks = useMemo(() => filterPicks(all, f), [all, f.team, f.champion, f.role, f.tournament, f.stage, f.patch, f.side]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => pickRows(picks, pos, sort), [picks, pos, sort]);
  const cov = coverage(games, f);
  const atTotal = rows.reduce((n, r) => n + r.at, 0);

  const uniq = (xs: string[]) => [...new Set(xs)].sort();
  const tournaments = uniq(all.map((p) => p.tournament));
  const stages = params.tournament ? uniq(all.filter((p) => p.tournament === params.tournament && p.stage).map((p) => p.stage)) : [];
  const patches = [...new Set(all.map((p) => patchLabel(p.patch)))].sort((a, b) => comparePatchDesc(a, b));
  const champs = uniq(all.map((p) => p.champion)).sort((a, b) => (names[a] ?? a).localeCompare(names[b] ?? b));
  const sel = (key: keyof OrderParams, label: string, any: string, options: [string, string][]) => (
    <Select showLabel label={label} value={params[key] ?? ""} onChange={(v) => set({ [key]: v || undefined, open: undefined })}
      options={[{ value: "", label: any }, ...options.map(([value, l]) => ({ value, label: l }))]} />
  );
  const posLabel = !pos ? undefined : pos.startsWith("slot:") ? SLOT_LABEL[pos.slice(5) as keyof typeof SLOT_LABEL].replace(/ · .*$/, "")
    : POSITIONS.find(([p]) => p === pos)![1].replace(/ \(.*\)$/, "");

  // Phones fold the menus behind one Filters button, as on the Games tab.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const active = (["pos", "side", "patch", "tournament", "stage", "team", "champion", "role"] as const).filter((k) => params[k]).length;

  return (
    <>
      <form className={`toolbar drafts-tools order-tools ${filtersOpen ? "filters-open" : ""}`.trim()} onSubmit={(e) => e.preventDefault()}>
        <button type="button" className="btn sm filters-toggle" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((o) => !o)}>
          Filters{active > 0 && <span className="filters-count"> · {active}</span>}
        </button>
        {sel("pos", "Position", "Every pick", POSITIONS)}
        {sel("side", "Side", "Both sides", SIDES)}
        {sel("patch", "Patch", "All patches", patches.map((p) => [p, p]))}
        <Select showLabel label="Tournament" value={params.tournament ?? ""} onChange={(v) => set({ tournament: v || undefined, stage: undefined, open: undefined })}
          options={[{ value: "", label: "All tournaments" }, ...tournaments.map((t) => ({ value: t, label: shortNames[t] ?? t }))]} />
        {stages.length > 1 && sel("stage", "Stage", "Every stage", stages.map((s) => [s, s]))}
        <label className="select-field"><span>Team</span>
          <PinPicker kind="team" value={params.team ?? ""} options={uniq(all.map((p) => p.team)).map((t) => [t, t])} onChange={(v) => set({ team: v || undefined, open: undefined })} /></label>
        <label className="select-field"><span>Champion</span>
          <PinPicker kind="champion" value={params.champion ?? ""} options={champs.map((c) => [c, names[c] ?? c])} onChange={(v) => set({ champion: v || undefined })} /></label>
        {sel("role", "Role", "Any role", ROLES.map((r) => [r, r]))}
        {sel("sort", "Sort", pos ? "Picks at position" : "First rotation", SORTS.filter(([s]) => pos || s !== "at").map(([s, l]) => [s, l]))}
      </form>
      <p className="xs muted order-coverage">
        {cov.ordered} game{cov.ordered === 1 ? "" : "s"} with a verified pick order · {picks.length} picks
        {pos && <> · {atTotal} at {posLabel?.toLowerCase()}</>}
        {cov.excluded > 0 && <span title="Gol.gg lists these games' picks in role order or gives no First Pick mark, so their order is unknown"> · {cov.excluded} left out (order not recorded)</span>}
        {" · "}<span className="low">*</span> fewer than {SMALL_SAMPLE} picks. Win–loss is context only, not priority.
      </p>
      <div className="table-wrap tall order-table" data-keep-scroll>
        <table>
          <thead><tr>
            <th>Champion</th>
            {pos && <th className="num" title={`Picks at ${posLabel?.toLowerCase()} / this champion's picks`}>At position</th>}
            <th className="num" title="Ordered picks in this sample">Picks</th>
            <th className="num" title="Picks in each team's first three picks (picks 1–6), of all picks">First rot.</th>
            <th className="num hide-sm" title="Picks 7–9, of all picks">Second rot.</th>
            <th className="num hide-sm" title="Pick 10, the second team's final pick, of all picks">Last pick</th>
            <th className="num" title="Pick 1 of the game (Gol.gg's First Pick mark), of all picks">First pick</th>
            <th className="num hide-sm" title="Blue-side picks in the first rotation / blue-side picks">Blue · 1st rot.</th>
            <th className="num hide-sm" title="Red-side picks in the first rotation / red-side picks">Red · 1st rot.</th>
            <th className="num" title="Games won–lost with this pick: context only, never used for priority">W–L</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => <Row key={r.champion} r={r} pos={pos} names={names} open={params.open === r.champion}
              onToggle={() => set({ open: params.open === r.champion ? undefined : r.champion })}
              detail={params.open === r.champion && <Detail r={r} picks={picks} pos={pos} dim={dim} events={events} setDim={(d) => set({ dim: d === "patch" ? undefined : d })} />} cols={pos ? 10 : 9} />)}
            {!rows.length && <tr><td colSpan={pos ? 10 : 9} className="muted">No verified pick matches these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Row({ r, pos, names, open, onToggle, detail, cols }: {
  r: PickRow; pos?: Position; names: Record<string, string>; open: boolean; onToggle: () => void; detail: React.ReactNode; cols: number;
}) {
  return (
    <>
      <tr className={`click-row ${open ? "open" : ""}`.trim()} tabIndex={0} aria-expanded={open} onClick={(e) => { if (!(e.target as HTMLElement).closest("a, button")) onToggle(); }}
        onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onToggle(); } }}>
        <td><span className="order-champ"><ChampionRow id={r.champion} name={names[r.champion] ?? r.champion} role={r.roles[0]} />
          {r.roles.map((x) => <span key={x} className={`role-tag role-${x}`}>{x}</span>)}</span></td>
        {pos && <td className="num"><Of n={r.at} of={r.picks} what="picks at this position" /></td>}
        <td className="num">{r.picks}{r.small && <span className="low" title={`Fewer than ${SMALL_SAMPLE} ordered picks`}>*</span>}</td>
        <td className="num"><Of n={r.first} of={r.picks} what="picks in the first rotation" /> <span className="xs faint pct-note">{pct(r.first / r.picks)}</span></td>
        <td className="num hide-sm"><Of n={r.second} of={r.picks} what="picks in the second rotation" /></td>
        <td className="num hide-sm"><Of n={r.last} of={r.picks} what="picks as the last pick" /></td>
        <td className="num"><Of n={r.firstOverall} of={r.picks} what="picks as the game's first pick" /></td>
        <td className="num hide-sm"><Of n={r.blue.first} of={r.blue.picks} what="blue-side picks in the first rotation" /></td>
        <td className="num hide-sm"><Of n={r.red.first} of={r.red.picks} what="red-side picks in the first rotation" /></td>
        <td className="num"><WL t={r} /></td>
      </tr>
      {open && <tr className="hub-detail"><td colSpan={cols}>{detail}</td></tr>}
    </>
  );
}

function Detail({ r, picks, pos, dim, events, setDim }: {
  r: PickRow; picks: ReturnType<typeof filterPicks>; pos?: Position; dim: Dimension; events: ScopeEvent[]; setDim: (d: Dimension) => void;
}) {
  const lines = breakdown(picks, r.champion, dim, pos);
  const label = (k: string) => (dim === "scope" ? scopeLabel(k, events) : k);
  return (
    <div className="order-detail">
      <div className="order-slots xs" aria-label="Picks at each position">
        <span className="label">By position</span>
        {SLOTS.map((s) => <span key={s} className={r.slots[s] ? "" : "faint"} title={`${SLOT_LABEL[s]} (${slotTeam(s) === "first" ? "first-pick team" : "second team"})`}>
          <span className="muted">{s.replace("-", "–")}</span> <b className="tnum">{r.slots[s]}</b></span>)}
      </div>
      <div className="seg" role="group" aria-label="Break down by">
        {DIMS.map(([d, l]) => <button key={d} type="button" className={d === dim ? "active" : ""} aria-pressed={d === dim} onClick={() => setDim(d)}>{l}</button>)}
      </div>
      <table className="order-breakdown">
        <thead><tr>
          <th>{DIMS.find(([d]) => d === dim)![1]}</th>
          {pos && <th className="num">At position</th>}
          <th className="num">Picks</th><th className="num">First rot.</th><th className="num">First pick</th><th className="num">Last pick</th><th className="num">W–L</th>
        </tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.key}>
              <td>{label(l.key)}{l.small && <span className="low" title={`Fewer than ${SMALL_SAMPLE} ordered picks`}>*</span>}</td>
              {pos && <td className="num"><Of n={l.at} of={l.picks} what="picks at this position" /></td>}
              <td className="num">{l.picks}</td>
              <td className="num"><Of n={l.first} of={l.picks} what="picks in the first rotation" /></td>
              <td className="num"><Of n={l.firstOverall} of={l.picks} what="picks as the game's first pick" /></td>
              <td className="num"><Of n={l.last} of={l.picks} what="picks as the last pick" /></td>
              <td className="num"><WL t={l} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const ORDER_KEYS = ["pos", "side", "patch", "sort", "open", "dim"] as const;
