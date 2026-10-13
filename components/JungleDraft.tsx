"use client";
// Jungle Synergies (alan, 2026-10-13): Mid/Jungle pairings with who was picked first, other lane partners, and the enemy
// board at each jungle pick. Pairings are Observed Pro Evidence (never a saved preference); the board traits are General
// Draft Logic over the champions already visible (lib/jungle-context.ts), shown as potential composition responses, never
// as the reason a team picked.
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ChampIcon } from "./ChampIcon";
import { GameRows } from "./TopDraft";
import { TRAIT_LABEL, type CompTrait } from "@/lib/jungle-context";
import { inTopScope, mateRows, type MateRow, type TopDraftBundle, type TopRow, type TopScope } from "@/lib/top-draft";
import type { Role } from "@/lib/schema";

type Names = Record<string, string>;
const nm = (names: Names, id: string) => names[id] ?? id;
const MIN_CONTEXT = 3; // a trait needs this many picks with it visible before it is listed for one jungler

/** The enemy board traits at one jungle pick, with the champions behind each (game detail). */
export function BoardContext({ hits, names }: { hits?: { trait: string; champions: string[] }[]; names: Names }) {
  if (!hits) return null;
  return (
    <p className="xs">
      <span className="label">Enemy board at the pick</span>{" "}
      {hits.length ? hits.map((h, i) => <span key={h.trait}>{i ? " · " : ""}{TRAIT_LABEL[h.trait as CompTrait] ?? h.trait} ({h.champions.map((c) => nm(names, c)).join(", ")})</span>)
        : <span className="faint">nothing notable visible</span>}
      <span className="faint"> · general draft logic over the champions already picked, not the team&apos;s reason</span>
    </p>
  );
}

function MateTable({ rows, role, names, bundle, saved, open, setOpen }: {
  rows: MateRow[]; role: Role; names: Names; bundle: TopDraftBundle; saved?: { preferred: string[]; alternatives: string[] }; open?: string; setOpen: (k?: string) => void;
}) {
  const [game, setGame] = useState<string>();
  const mid = role === "MID";
  return (
    <table className="pro-table duo-table mate-table">
      <thead>
        <tr>
          <th>{mid ? "Mid" : role === "TOP" ? "Top" : "Support"}</th><th className="num">Games</th><th className="num wide-col">Series</th><th className="num wide-col">Teams</th>
          <th className="num" title="Jungler picked before the partner">Jungle first</th><th className="num" title="Both in one turn: the source does not say which came first">Same turn</th><th className="num" title="Partner picked before the jungler">{mid ? "Mid first" : "Partner first"}</th>
          {mid && <th className="num shape-col" title="Pair completed before the enemy mid or jungler was revealed / after one of them was">Before / after enemy core</th>}
          <th className="num">Won</th>
        </tr>
      </thead>
      {rows.map((r) => {
        const k = `${r.jungle}+${r.mate}`, isOpen = open === k;
        const tag = saved?.preferred.includes(r.mate) ? "Saved · Preferred" : saved?.alternatives.includes(r.mate) ? "Saved · Alt" : undefined;
        return (
          <tbody key={k} className={isOpen ? "open" : undefined}>
            <tr>
              <td>
                <button type="button" className="duo-btn" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? undefined : k)}>
                  <span className="duo"><ChampIcon id={r.mate} name={nm(names, r.mate)} size="xs" /><span>{nm(names, r.mate)}</span></span>
                </button>
                {" "}<span className={`pair-tag ${r.status}`}>{r.status === "repeated" ? "Repeated pairing" : "Observed pairing"}</span>
                {tag && <> <span className="clash-text xs">{tag}</span></>}
              </td>
              <td className="num">{r.games.length}</td><td className="num wide-col">{r.series}</td><td className="num wide-col">{r.teams.length}</td>
              <td className="num">{r.order.jungleFirst}</td><td className="num">{r.order.together}</td><td className="num">{r.order.mateFirst}</td>
              {mid && <td className="num shape-col">{r.completed!.blind} / {r.completed!.afterEnemyCore}{r.completed!.unclear ? ` · ${r.completed!.unclear}?` : ""}</td>}
              <td className="num">{r.wins}/{r.games.length}</td>
            </tr>
            {isOpen && <tr className="duo-open"><td colSpan={mid ? 9 : 8}><GameRows list={r.games} names={names} bundle={bundle} open={game} setOpen={setGame} /></td></tr>}
          </tbody>
        );
      })}
    </table>
  );
}

/** Mid/Jungle: the jungler's pro mid partners with who was picked first, then top and support partners (compact). */
export function MatesView({ id, names, bundle, scope, scopeLabel, saved }: {
  id: string; names: Names; bundle: TopDraftBundle; scope: TopScope; scopeLabel: string; saved?: { preferred: string[]; alternatives: string[] };
}) {
  // `?mate=<mid>` (from a Draft Room Mid/Jungle label) opens that pair with its games.
  const mateParam = useSearchParams().get("mate");
  const [open, setOpen] = useState<string | undefined>(mateParam ? `${id}+${mateParam}` : undefined);
  const mine = useMemo(() => bundle.selections.filter((s) => s.champion === id), [bundle, id]);
  const mids = useMemo(() => mateRows(mine, "MID", scope), [mine, scope]);
  const tops = useMemo(() => mateRows(mine, "TOP", scope).slice(0, 6), [mine, scope]);
  const sups = useMemo(() => mateRows(mine, "SUPPORT", scope).slice(0, 6), [mine, scope]);
  const games = mids.flatMap((r) => r.games), ordered = games.filter((g) => g.turn).length;
  const sum = (k: keyof MateRow["order"]) => mids.reduce((n, r) => n + r.order[k], 0);
  const savedOnly = [...(saved?.preferred ?? []), ...(saved?.alternatives ?? [])].filter((m) => !mids.some((r) => r.mate === m));
  if (!games.length) return <p className="muted xs">No recorded pro game has this champion in the jungle in this scope.</p>;
  return (
    <>
      <section className="scout-sec layer pro">
        <h3 className="scout-title"><span className="ldot" />Mid partners in pro games<span className="end">{scopeLabel}</span></h3>
        <p className="small tnum">
          Picked before its mid in <b>{sum("jungleFirst")}/{ordered}</b>, in the same turn in <b>{sum("together")}/{ordered}</b>, after its mid in <b>{sum("mateFirst")}/{ordered}</b>.
          {sum("unknown") > 0 && <> No order recorded in <b>{sum("unknown")}</b> more (no First Pick mark or pick order): {games.length} games in all.</>}
          {sum("jungleFirst") > sum("mateFirst") ? " Usually the first half of the Mid/Jungle core." : sum("mateFirst") > sum("jungleFirst") ? " Usually added to a mid already picked." : ""}
        </p>
        <MateTable rows={mids} role="MID" names={names} bundle={bundle} saved={saved} open={open} setOpen={setOpen} />
        <p className="xs muted">
          Observed pairing: the two appeared together. Repeated: two or more different series. Neither becomes a saved pairing. Two picks in one turn are
          never ordered, and a jungler picked after its mid was not necessarily picked for that mid. &ldquo;Before / after enemy core&rdquo;
          counts pairs completed before the enemy mid or jungler was revealed, and after one of them was; a question mark counts reads a flex pick left unclear.
        </p>
        {savedOnly.length > 0 && <p className="xs"><span className="clash-text">Your saved mids</span> with no recorded pro game together: {savedOnly.map((m) => nm(names, m)).join(", ")}.</p>}
      </section>
      <section className="scout-sec layer pro">
        <h3 className="scout-title"><span className="ldot" />Top partners<span className="end tnum">{tops.length}</span></h3>
        <MateTable rows={tops} role="TOP" names={names} bundle={bundle} open={open} setOpen={setOpen} />
      </section>
      <section className="scout-sec layer pro">
        <h3 className="scout-title"><span className="ldot" />Support partners<span className="end tnum">{sups.length}</span></h3>
        <MateTable rows={sups} role="SUPPORT" names={names} bundle={bundle} open={open} setOpen={setOpen} />
        <p className="xs muted">The most common partners only. A partner here is a recorded game, not a synergy claim.</p>
      </section>
    </>
  );
}

/** Matchups (Jungle): what the enemy board showed when this jungler was picked, against every jungle pick in scope. */
export function ContextView({ row, bundle, names, scope }: { row: TopRow; bundle: TopDraftBundle; names: Names; scope: TopScope }) {
  const [open, setOpen] = useState<string>();
  const [game, setGame] = useState<string>();
  const ctx = bundle.context ?? {};
  const all = useMemo(() => bundle.selections.filter((s) => s.turn && inTopScope(s, scope)), [bundle, scope]);
  const mine = row.selections.filter((s) => s.turn);
  const hits = (s: { game: number; side: string }) => ctx[`${s.game}:${s.side}`] ?? [];
  const traits = (Object.keys(TRAIT_LABEL) as CompTrait[]).map((t) => {
    const with_ = mine.filter((s) => hits(s).some((h) => h.trait === t));
    const base = all.filter((s) => hits(s).some((h) => h.trait === t)).length;
    return { t, with_, base };
  }).filter((x) => x.with_.length >= MIN_CONTEXT).sort((a, b) => b.with_.length / mine.length - b.base / all.length - (a.with_.length / mine.length - a.base / all.length));
  return (
    <section className="scout-sec layer logic">
      <h3 className="scout-title"><span className="ldot" />Enemy board at the pick<span className="end">potential composition responses</span></h3>
      {!traits.length ? <p className="muted xs">No enemy board trait was visible in {MIN_CONTEXT} or more of its ordered picks.</p> : (
        <ul className="pair-list">
          {traits.map(({ t, with_, base }) => {
            const isOpen = open === t;
            return (
              <li key={t}>
                <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? undefined : t)}>
                  <span />
                  <span className="pl-name">{TRAIT_LABEL[t]}</span>
                  <span className="tnum">{with_.length}/{mine.length} of its picks · {Math.round((base / Math.max(1, all.length)) * 100)}% of all jungle picks</span>
                  <span />
                </button>
                {isOpen && <GameRows list={with_} names={names} bundle={bundle} open={game} setOpen={setGame} />}
              </li>
            );
          })}
        </ul>
      )}
      <p className="xs muted">
        What the enemy had already picked when this jungler was chosen, read from the champions&apos; kits (general draft logic, unreviewed). It shows what was
        visible, never why the team picked, and a champion picked later never counts.
      </p>
    </section>
  );
}
