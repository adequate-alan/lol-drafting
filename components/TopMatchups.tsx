"use client";
// Top-lane matchups (alan, 2026-11-14): on the Synergies Top "Matchups" tab, above the pro matchups that were already
// there. One top laner's lane opponents from the stored DPM.LOL rows (the Counter data), grouped by what the ranked data
// says, and one opened matchup read layer by layer: the statistic, the kit read (the Counter card's read, General Draft
// Logic), the two power curves, what a jungler plausibly changes, the recorded pro games and the creator lesson. The
// layers stay in their own blocks; nothing is averaged, graded or scored, and a "difficult" lane is the statistic's
// word, not a counter claim (Counters keep their own thresholds and their own card).
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { ChampIcon } from "./ChampIcon";
import { Disclosure } from "./Disclosure";
import { InteractiveChampion } from "./InteractiveChampion";
import { DPM_MIN_GAMES, olderPatch } from "@/lib/counters";
import { lessonHref } from "@/lib/draft-insights";
import { factOf, matchupRead, NO_READ_TEXT, UNREAD_TEXT } from "@/lib/matchup-read";
import { scrollBehavior } from "@/lib/motion";
import { explorerHref, type LessonBook } from "@/lib/pairings";
import { patchLabel } from "@/lib/patch";
import { blindFacts, curveLine, jungleAngles, LANE_GROUP_LABEL, laneGroups, laneReads, type LaneData, type LaneGroup, type LaneRead } from "@/lib/top-matchups";
import type { TopRow } from "@/lib/top-draft";

type Names = Record<string, string>;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const TOP_CLASSES = "top-classes";

export function TopMatchups({ id, data, names, row, grade, lessons, vs, setVs, scopeLabel }: {
  id: string; data: LaneData; names: Names; row?: TopRow; grade?: string; lessons?: LessonBook;
  vs?: string; setVs: (enemy?: string) => void; scopeLabel: string;
}) {
  const n = (c: string) => names[c] ?? c;
  const reads = useMemo(() => laneReads(data, id), [data, id]);
  const groups = useMemo(() => laneGroups(reads), [reads]);
  const facts = useMemo(() => blindFacts(reads), [reads]);
  const open = reads.find((r) => r.enemy === vs);
  const stale = olderPatch(data.patch, data.newest);
  const source = `${data.rank}, patch ${patchLabel(data.patch)}`;
  // A linked matchup (?vs=) arrives open and in view.
  useEffect(() => {
    if (open) document.getElementById("tm-detail")?.scrollIntoView({ behavior: scrollBehavior(), block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open?.enemy, id]);

  if (!reads.length) return (
    <section className="scout-sec tm">
      <h3 className="scout-title tm-title"><span className="ldot" />Lane matchups</h3>
      <p className="xs muted">No DPM.LOL matchup rows are stored for {n(id)} at top yet. A gap in the data, not a read on the champion.</p>
    </section>
  );
  const own = !!data.rows[id];
  const chips = (list: LaneRead[], g: LaneGroup) => (
    <ul className="tm-chips">
      {list.map((r) => (
        <li key={r.enemy}>
          <button type="button" className={`tm-chip ${g}${vs === r.enemy ? " open" : ""}`} aria-pressed={vs === r.enemy} onClick={() => setVs(vs === r.enemy ? undefined : r.enemy)}
            title={`${n(id)} ${pct(r.winRate)} over ${r.games.toLocaleString("en-US")} games against ${n(r.enemy)} (DPM.LOL, ${source})${r.turned ? `; read from ${n(r.enemy)}'s page` : ""}`}>
            <ChampIcon id={r.enemy} name={n(r.enemy)} size="xs" /><span>{n(r.enemy)}</span><span className="mono">{pct(r.winRate)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
  return (
    <section className="scout-sec tm" aria-label="Lane matchups">
      <h3 className="scout-title tm-title"><span className="ldot" />Lane matchups<span className="end" title={`DPM.LOL ranked solo queue, all regions, collected ${data.updated}. A separate signal from pro play.`}>DPM.LOL · {source}{stale ? " · older patch" : ""}</span></h3>
      <p className="xs muted tm-blind">
        <b>Picked blind:</b> of {facts.qualified} lane{facts.qualified === 1 ? "" : "s"} with {DPM_MIN_GAMES}+ games, {facts.favourable} favourable, {facts.even} relatively even, {facts.difficult} difficult{facts.strongDifficult ? ` (${facts.strongDifficult} strongly)` : ""}.
        {facts.hardest.length > 0 && <> Hardest: {facts.hardest.map((r) => `${n(r.enemy)} ${pct(r.winRate)}`).join(", ")}.</>}
        {grade && <> Your saved blind grade is <b className="clash-text">{grade}</b>.</>} Counts from ranked data, not a safety rating{own ? "" : `; ${n(id)} has no page of its own in the collection, so only lanes other pages list are shown`}.
      </p>
      <div className="tm-cols">
        <div><h4 className="label tm-h favourable">Favourable <span className="count">{groups.favourable.length}</span></h4>{groups.favourable.length ? chips(groups.favourable, "favourable") : <p className="xs muted">No lane clears 52% with {DPM_MIN_GAMES}+ games.</p>}</div>
        <div><h4 className="label tm-h difficult">Difficult <span className="count">{groups.difficult.length}</span></h4>{groups.difficult.length ? chips(groups.difficult, "difficult") : <p className="xs muted">No lane falls to 48% with {DPM_MIN_GAMES}+ games.</p>}</div>
      </div>
      {groups.even.length > 0 && <Disclosure summary="Relatively even" meta={groups.even.length} open={open?.group === "even"} lazy>{chips(groups.even, "even")}</Disclosure>}
      {groups.thin.length > 0 && <Disclosure summary={`Too few games to say (under ${DPM_MIN_GAMES})`} meta={groups.thin.length} open={open?.group === "thin"} lazy>{chips(groups.thin, "thin")}</Disclosure>}
      {open
        ? <Detail id={id} r={open} data={data} names={names} row={row} lessons={lessons} stale={stale} scopeLabel={scopeLabel} onClose={() => setVs(undefined)} />
        : <p className="xs faint">Open an opponent for the statistic, the kit read, what a jungler changes and the pro games. 48–52% reads as even; favourable and difficult use the same thresholds as Counters.</p>}
    </section>
  );
}

function Detail({ id, r, data, names, row, lessons, stale, scopeLabel, onClose }: {
  id: string; r: LaneRead; data: LaneData; names: Names; row?: TopRow; lessons?: LessonBook; stale: boolean; scopeLabel: string; onClose: () => void;
}) {
  const n = (c: string) => names[c] ?? c;
  const me = n(id), them = n(r.enemy);
  const a = factOf(data.book, id, "TOP"), b = factOf(data.book, r.enemy, "TOP");
  // The read runs for the side the statistic favours; an even or thin lane shows what the kits give each side.
  const hard = r.group === "difficult";
  const read = hard ? matchupRead(data.book, r.enemy, id, "TOP", n) : matchupRead(data.book, id, r.enemy, "TOP", n);
  const [favoured, other] = hard ? [them, me] : [me, them];
  const sided = r.group === "favourable" || r.group === "difficult";
  const curve = curveLine(a, b, me, them);
  const angles = jungleAngles(a, b, me, them);
  const faced = row?.faced.find((f) => f.champion === r.enemy);
  const games = row?.selections.filter((s) => s.laneOpponent === r.enemy) ?? [];
  const cls = (c: string) => lessons?.insights.find((i) => i.id === TOP_CLASSES)?.groups?.find((g) => g.champions.includes(c));
  const mine = cls(id), theirs = cls(r.enemy);
  return (
    <article id="tm-detail" className="tm-detail panel" aria-label={`${me} against ${them}`}>
      <header className="tm-detail-head">
        <span className="px-duo">
          <InteractiveChampion id={id} role="TOP"><ChampIcon id={id} name={me} role="TOP" size="lg" /></InteractiveChampion>
          <InteractiveChampion id={r.enemy} role="TOP"><ChampIcon id={r.enemy} name={them} role="TOP" size="lg" /></InteractiveChampion>
        </span>
        <div className="tm-detail-id">
          <h4>{me} into {them}</h4>
          <p className={`tm-verdict ${r.group}`}>{LANE_GROUP_LABEL[r.group]}{r.strong ? " · strong" : ""} <span className="mono">{pct(r.winRate)}</span></p>
        </div>
        <span className="px-actions">
          <Link className="btn sm" href={explorerHref(id, undefined, undefined, "top-jungle")} title={`Junglers for ${me}: saved pairings, pro pairs and the gank plan with each`}>Jungle partners</Link>
          <button type="button" className="btn sm ghost" onClick={onClose}>Close</button>
        </span>
      </header>

      <section className="layer counter">
        <div className="layer-label"><span className="ldot" />Ranked statistic<span className="push xs faint">DPM.LOL · solo queue, not pro play</span></div>
        <p className="small">{me} won <b className="mono">{pct(r.winRate)}</b> of <span className="mono">{r.games.toLocaleString("en-US")}</span> games at top against {them} ({data.rank}, all regions, patch {patchLabel(data.patch)}).{" "}
          <a className="xs" href={data.urls[r.page]} target="_blank" rel="noopener noreferrer" title={`Collected ${data.updated}`}>DPM.LOL</a></p>
        {r.group === "thin" && <p className="xs caution-text">Under {DPM_MIN_GAMES} games: preliminary, not a verdict either way.</p>}
        {r.turned && <p className="xs muted">Read from {them}&apos;s page and turned round: the same games, not a second source.</p>}
        {stale && <p className="xs muted">Collected on {patchLabel(data.patch)}{data.newest ? ` (current ${patchLabel(data.newest)})` : ""}: balance may have changed since.</p>}
      </section>

      <section className="layer logic">
        <div className="layer-label"><span className="ldot" />Kit read<span className="push xs faint">analysis of the stored kit values · never sees the win rate</span></div>
        {read.status === "unread" ? <p className="small muted">{UNREAD_TEXT}</p> : (
          <>
            {read.lines.length > 0
              ? <><p className="xs muted">{sided ? `What plausibly favours ${favoured}:` : `What the kits give ${favoured}:`}</p>
                  <ul className="px-lines small">{read.lines.map((l) => <li key={l.kind} title={l.values}>{l.text}</li>)}</ul></>
              : <p className="small muted">{sided ? NO_READ_TEXT : `The stored kits show nothing one-sided for ${favoured}.`}</p>}
            {read.against.length > 0 && <><p className="xs muted">What the kits give {other}:</p>
              <ul className="px-lines small">{read.against.map((l) => <li key={l.kind} title={l.values}>{l.text}</li>)}</ul></>}
          </>
        )}
        {curve && <p className="small tm-curve" title={curve.values}><b>Early against late.</b> {curve.text}</p>}
        <p className="xs faint">A reading of the stored kit values, not proof: sustain, cooldowns and item paths are not stored.</p>
      </section>

      <section className="layer logic">
        <div className="layer-label"><span className="ldot" />With a jungler<span className="push xs faint">analysis · the enemy jungler is not modelled</span></div>
        {angles.length
          ? <ul className="px-lines small">{angles.map((l) => <li key={l.kind} title={l.values}>{l.text}</li>)}</ul>
          : <p className="small muted">{a && b ? "The stored kits show nothing specific a jungler changes in this lane." : UNREAD_TEXT}</p>}
        <p className="xs"><Link href={explorerHref(id, undefined, undefined, "top-jungle")}>Which junglers fit {me} →</Link></p>
      </section>

      <section className="layer pro">
        <div className="layer-label"><span className="ldot" />Pro evidence{faced && <span className="push tnum">{faced.games} game{faced.games === 1 ? "" : "s"}</span>}</div>
        {faced
          ? <p className="small">{me} faced {them} at top in {faced.games} recorded pro game{faced.games === 1 ? "" : "s"} ({scopeLabel}): picked blind {games.filter((s) => s.usage === "blind").length}, after {them} {games.filter((s) => s.usage === "response").length}, team won {games.filter((s) => s.won).length}/{games.length}. <span className="muted">Game results, not lane results; the games are listed below.</span></p>
          : <p className="small muted">No recorded pro game has {me} against {them} at top in this scope. That says nothing about the lane.</p>}
      </section>

      {(mine || theirs) && (
        <section className="layer px-lessons">
          <div className="layer-label"><span className="ldot" />Creator lesson<span className="push xs faint">solo queue guide, not pro play</span></div>
          <p className="small">{[mine && `${me}: ${mine.label}`, theirs && `${them}: ${theirs.label}`].filter(Boolean).join(" · ")}.{" "}
            {mine && <span className="muted">{mine.vs} </span>}<Link className="xs" href={lessonHref(TOP_CLASSES)}>Read the lesson →</Link></p>
        </section>
      )}
    </article>
  );
}
