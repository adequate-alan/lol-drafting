"use client";
// Top Synergies draft analysis (alan, 2026-10-13): one selected top laner, read through tabs Overview | Draft usage |
// Matchups | Synergies | Pro evidence. Three layers stay apart: the saved blind grade (alan's), observed pro draft usage
// (lib/top-draft.ts, every number with its denominator and its games) and the kit read (General Draft Logic). A response
// is never called a counter; a counter needs a DPM.LOL row. Nothing here scores or changes a saved record.
import Link from "next/link";
import { useState } from "react";
import { ChampIcon } from "./ChampIcon";
import { rovingIndex, rovingKeys } from "./roving";
import { shortDate } from "@/lib/evidence";
import { patchLabel } from "@/lib/patch";
import { buildsHref } from "@/lib/pro-builds";
import { DRAFT_LABEL_MIN } from "@/lib/pro-priority";
import type { Role } from "@/lib/schema";
import type { BlindLine } from "@/lib/top-blind";
import {
  draftSequence, dpmCounter, LOW_SAMPLE, MIN_CLASSIFIED, PAIR_LABEL, ROTATION_LABEL, USAGE_LABEL,
  type GameBrief, type Pair, type PriorityBrief, type TopDraftBundle, type TopRow, type TopSelection,
} from "@/lib/top-draft";

type Names = Record<string, string>;
export type TopView = "overview" | "usage" | "matchups" | "synergies" | "pro";
export const TOP_VIEWS: [TopView, string][] = [["overview", "Overview"], ["usage", "Draft usage"], ["matchups", "Matchups"], ["synergies", "Synergies"], ["pro", "Pro evidence"]];

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
const nm = (names: Names, id: string) => names[id] ?? id;
const SIDE = { blue: "Blue", red: "Red" } as const;

/** "Often blinded · Blind 6/9" style line; neutral below three classified games. */
export function usageLine(r: TopRow | undefined): string {
  if (!r) return "No recorded top games";
  if (r.usage === "too-few") return `Too few games (${r.classified} classified)`;
  return `${USAGE_LABEL[r.usage]} · ${r.usage === "response" ? `Response ${r.response}/${r.classified}` : `Blind ${r.blind}/${r.classified}`}`;
}

export const isPriority = (p?: PriorityBrief) => (p?.presence ?? 0) >= DRAFT_LABEL_MIN;

function UsageTag({ s }: { s: TopSelection }) {
  return <span className={`usage-tag ${s.usage}`} title={s.why}>{s.usage === "blind" ? "Blind" : s.usage === "response" ? "Response" : "Unclear"}</span>;
}

// ---------- one game ----------

/** The recorded game behind a selection: who picked first, the ten picks in draft order, both lineups, result, links. */
export function TopGameDetail({ game, focus, names, bundle, pair }: { game: GameBrief; focus: TopSelection; names: Names; bundle: TopDraftBundle; pair?: Pair }) {
  const seq = draftSequence(game);
  const tops = new Set([game.blue.picks.TOP, game.red.picks.TOP]);
  const first = game.firstPick ? game[game.firstPick].team : undefined;
  const event = bundle.events.find((e) => e.id === game.event)?.short ?? game.tournament;
  const draftId = (side: "blue" | "red") => bundle.drafts[`${game.id}:${side}`];
  const anyDraft = draftId(focus.side) ?? draftId(focus.side === "blue" ? "red" : "blue");
  return (
    <div className="top-game">
      <p className="xs muted tnum">
        {event} · {patchLabel(game.patch)} · {shortDate(game.date) ?? game.date} · {game.series} G{game.gameNo}
        {" · "}{game[game.winner].team} won
      </p>
      <p className="small">
        {first ? <><b>{first}</b> ({SIDE[game.firstPick!].toLowerCase()} side) picked first. </> : "First pick not marked on the game page. "}
        {focus.usage === "uncertain" ? focus.why : <><b>{nm(names, focus.champion)}</b> was pick {focus.turn} of 10; {nm(names, focus.opponentTop)} was pick {focus.opponentTurn}.</>}
      </p>
      {seq && (
        <ol className="draft-seq" aria-label="Picks in draft order">
          {seq.map((p) => (
            <li key={p.turn} className={`seq-${p.side}${tops.has(p.champion) ? " top" : ""}`} title={`${p.turn}. ${game[p.side].team}: ${nm(names, p.champion)}${p.role ? ` (${p.role.toLowerCase()})` : ""}`}>
              <span className="seq-n tnum">{p.turn}</span>
              <ChampIcon id={p.champion} name={nm(names, p.champion)} size="sm" />
              <span className="sr-only">{game[p.side].team} {nm(names, p.champion)}</span>
            </li>
          ))}
        </ol>
      )}
      {pair && (
        <p className="xs">
          <span className={`pair-tag ${pair.status}`}>{PAIR_LABEL[pair.status]}</span>{" "}
          {pair.status === "supported" && pair.dpm
            ? <>DPM.LOL: {nm(names, pair.champion)} wins {(pair.dpm.winRate * 100).toFixed(1)}% of {pair.dpm.games.toLocaleString()} ranked games into {nm(names, pair.into)} ({patchLabel(pair.dpm.patch)}). The pro games are context, not proof.</>
            : pair.status === "repeated" ? <>Picked into {nm(names, pair.into)} in {pair.series} different series. No lane data says it is favourable.</>
            : <>One observed response. It says nothing yet about the matchup.</>}
        </p>
      )}
      <div className="top-game-links">
        {anyDraft && <Link className="btn sm" href={`/pro-drafts?id=${anyDraft}&build=${anyDraft}:TOP`}>Open in Pro Drafts</Link>}
        {(["blue", "red"] as const).map((side) => {
          const c = game[side].picks.TOP, player = bundle.players[`${game.id}:${side}`];
          return <Link key={side} className="btn sm" href={buildsHref(c, "TOP" as Role, game.id)}>{nm(names, c)} build{player ? ` · ${player}` : ""}</Link>;
        })}
        <a className="xs" href={game.url} target="_blank" rel="noreferrer">Gol.gg game page</a>
      </div>
    </div>
  );
}

/** A list of selections; each row opens its game in place. */
function GameRows({ list, names, bundle, open, setOpen, pair, opponent = true }: {
  list: TopSelection[]; names: Names; bundle: TopDraftBundle; open?: string; setOpen: (k?: string) => void; pair?: Pair; opponent?: boolean;
}) {
  if (!list.length) return <p className="muted xs">No recorded games in this scope.</p>;
  return (
    <ul className={`top-games${opponent ? "" : " no-vs"}`}>
      {list.map((s) => {
        const k = `${s.game}:${s.side}`, isOpen = open === k, player = bundle.players[k];
        return (
          <li key={k} className={isOpen ? "open" : undefined}>
            <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? undefined : k)}>
              <span className="tg-date tnum faint">{shortDate(s.date) ?? s.date}</span>
              <span className="tg-team">{s.team}{player ? <span className="faint"> · {player}</span> : null}</span>
              {opponent && <span className="tg-vs"><span className="faint">vs</span> <ChampIcon id={s.opponentTop} name={nm(names, s.opponentTop)} size="xs" /> {nm(names, s.opponentTop)}</span>}
              <span className="tg-turn tnum faint" title="Pick number in the draft">{s.turn ? `${s.turn}/10` : "—"}</span>
              <UsageTag s={s} />
              <span className={`res ${s.won ? "win" : "loss"}`}>{s.won ? "W" : "L"}</span>
            </button>
            {isOpen && bundle.games[s.game] && <TopGameDetail game={bundle.games[s.game]} focus={s} names={names} bundle={bundle} pair={pair} />}
          </li>
        );
      })}
    </ul>
  );
}

// ---------- the report ----------

export function TopUsageReport({ id, row, prio, bundle, names, view, setView, saved, logic, synergies, proEvidence, scopeLabel }: {
  id: string; row?: TopRow; prio?: PriorityBrief; bundle: TopDraftBundle; names: Names; view: TopView; setView: (v: TopView) => void;
  saved?: { grade: string; tier?: string; gives?: string; avoid?: string };
  logic: BlindLine[]; synergies: React.ReactNode; proEvidence: React.ReactNode; scopeLabel: string;
}) {
  const [open, setOpen] = useState<string>();
  const [pairOpen, setPairOpen] = useState<string>();
  const name = nm(names, id);
  return (
    <article className="panel pick-card scout top-report">
      <header className="scout-head role-TOP">
        <ChampIcon id={id} name={name} role="TOP" size="xxl" />
        <div className="scout-id">
          <h2>{name}</h2>
          <div className="scout-meta">
            <span className="role-tag role-TOP">TOP</span>
            {saved?.tier && <span>{saved.tier}</span>}
            {saved && <span className="clash-text" title="Your saved blind-pick grade">Saved blind grade <b className="grade">{saved.grade}</b></span>}
            <span className="pro-text" title={`Observed pro draft usage, ${scopeLabel}`}>{usageLine(row)}</span>
            {prio?.presence != null && <span className="pro-text tnum" title={`Pick or ban presence, ${scopeLabel}`}>{isPriority(prio) ? "Pro priority" : "Presence"} {Math.round(prio.presence * 100)}%</span>}
          </div>
        </div>
      </header>
      <div className="tabs" role="tablist" aria-label={`${name} report`} onKeyDown={(e) => rovingKeys(e)}>
        {TOP_VIEWS.map(([v, l]) => (
          <button key={v} type="button" role="tab" aria-selected={view === v} tabIndex={rovingIndex(view === v)} className={view === v ? "active" : undefined} onClick={() => setView(v)}>{l}</button>
        ))}
      </div>
      <div role="tabpanel">
        {view === "overview" && <Overview row={row} prio={prio} saved={saved} logic={logic} names={names} scopeLabel={scopeLabel} />}
        {view === "usage" && <Usage row={row} names={names} bundle={bundle} open={open} setOpen={setOpen} scopeLabel={scopeLabel} />}
        {view === "matchups" && <Matchups id={id} row={row} names={names} bundle={bundle} open={open} setOpen={setOpen} pairOpen={pairOpen} setPairOpen={setPairOpen} />}
        {view === "synergies" && synergies}
        {view === "pro" && (
          <>
            {proEvidence}
            {row && (
              <section className="scout-sec layer pro">
                <h3 className="scout-title"><span className="ldot" />Recorded games at top<span className="end tnum">{row.games}</span></h3>
                <GameRows list={row.selections} names={names} bundle={bundle} open={open} setOpen={setOpen} />
              </section>
            )}
          </>
        )}
      </div>
    </article>
  );
}

function Overview({ row, prio, saved, logic, names, scopeLabel }: {
  row?: TopRow; prio?: PriorityBrief; saved?: { grade: string; gives?: string; avoid?: string }; logic: BlindLine[]; names: Names; scopeLabel: string;
}) {
  const answers = row?.answeredBy.filter((p) => p.games.length >= 2) ?? [];
  const high = isPriority(prio);
  const savedHigh = saved && /^A/.test(saved.grade), savedLow = saved && /^C/.test(saved.grade);
  const disagree = row && row.usage !== "too-few" && ((savedHigh && row.usage === "response") || (savedLow && row.usage === "blind"));
  return (
    <>
      <section className="scout-sec layer pro">
        <h3 className="scout-title"><span className="ldot" />Observed draft usage<span className="end">{scopeLabel}</span></h3>
        {!row ? <p className="muted xs">No recorded pro game has this champion at top in this scope.</p> : (
          <>
            <p className="small"><b>{usageLine(row)}</b>{row.low && row.usage !== "too-few" ? <span className="faint"> · small sample (under {LOW_SAMPLE})</span> : null}</p>
            <p className="xs muted tnum">
              {row.games} top game{row.games === 1 ? "" : "s"} · blind {row.blind} · response {row.response}{row.uncertain ? ` · unclear ${row.uncertain}` : ""}
              {prio && <> · {prio.picks} picks, {prio.bans} bans{prio.presence != null ? `, ${Math.round(prio.presence * 100)}% presence` : ""}{prio.winRate != null ? `, ${Math.round(prio.winRate * 100)}% WR${prio.low ? " (low sample)" : ""}` : ""}</>}
            </p>
            {high && row.usage === "blind" && <p className="xs">High priority and usually blinded. Priority is not evidence that it is safe to blind{answers.length ? `: it was answered by ${answers.map((p) => `${nm(names, p.champion)} ${p.games.length}×`).join(", ")}` : ""}.</p>}
            {high && row.usage === "response" && <p className="xs">High priority, and usually held until the enemy top is known.</p>}
            {!high && row.usage === "response" && <p className="xs">Low priority but a recurring response: a situational pick.</p>}
            {row.usage === "too-few" && <p className="xs muted">Fewer than {MIN_CLASSIFIED} classified games: no usage label.</p>}
          </>
        )}
      </section>
      {saved && (
        <section className="scout-sec layer clash">
          <h3 className="scout-title"><span className="ldot" />Saved blind grade<span className="end">your assessment</span></h3>
          <p className="small">Saved blind grade <b className="grade">{saved.grade}</b>{row && row.usage !== "too-few" ? <> · Observed pro usage: <b>{USAGE_LABEL[row.usage]}</b></> : null}</p>
          {disagree && <p className="xs caution-text">Your grade and pro usage point different ways. The grade stays as saved; the games are under Draft usage.</p>}
          {saved.gives && <p className="xs"><b>Gives</b> {saved.gives}</p>}
          {saved.avoid && <p className="xs"><b>Avoid</b> {saved.avoid}</p>}
        </section>
      )}
      <section className="scout-sec layer logic">
        <h3 className="scout-title"><span className="ldot" />Blind-pick safety<span className="end">general draft logic, from the kit</span></h3>
        {logic.length ? (
          <ul className="blind-read">{logic.map((l) => <li key={l.text} className={l.tone}>{l.text}</li>)}</ul>
        ) : <p className="muted xs">No kit read yet for this champion.</p>}
        {answers.length > 0 && <p className="xs muted">Common answers in pro games are under Matchups.</p>}
      </section>
    </>
  );
}

function Bar({ parts }: { parts: [string, number, string][] }) {
  const total = parts.reduce((n, [, v]) => n + v, 0);
  if (!total) return null;
  return (
    <div className="usage-bar" role="img" aria-label={parts.map(([l, v]) => `${l} ${v}`).join(", ")}>
      {parts.filter(([, v]) => v).map(([l, v, cls]) => <span key={l} className={cls} style={{ flexGrow: v }} />)}
    </div>
  );
}

function Usage({ row, names, bundle, open, setOpen, scopeLabel }: { row?: TopRow; names: Names; bundle: TopDraftBundle; open?: string; setOpen: (k?: string) => void; scopeLabel: string }) {
  if (!row) return <p className="muted xs">No recorded pro game has this champion at top in this scope.</p>;
  const ordered = row.blind + row.response + row.selections.filter((s) => s.usage === "uncertain" && s.turn).length;
  return (
    <>
      <section className="scout-sec layer pro">
        <h3 className="scout-title"><span className="ldot" />Blind or response<span className="end">{scopeLabel}</span></h3>
        <Bar parts={[["Blind", row.blind, "blind"], ["Response", row.response, "response"], ["Unclear", row.uncertain, "uncertain"]]} />
        <dl className="usage-facts tnum">
          <div><dt>Blind</dt><dd>{row.blind}/{row.classified} <span className="faint">{pct(row.blind, row.classified)}</span></dd></div>
          <div><dt>Response</dt><dd>{row.response}/{row.classified} <span className="faint">{pct(row.response, row.classified)}</span></dd></div>
          <div><dt>Unclear</dt><dd>{row.uncertain}</dd></div>
          <div><dt>First rotation</dt><dd>{row.rotation.first}/{ordered}</dd></div>
          <div><dt>Second rotation</dt><dd>{row.rotation.second + row.rotation.last}/{ordered}</dd></div>
          <div><dt>Last pick</dt><dd>{row.rotation.last}/{ordered}</dd></div>
          <div><dt>Blue / red</dt><dd>{row.blue} / {row.red}</dd></div>
          <div><dt>Team had first pick</dt><dd>{row.firstPicker}/{ordered}</dd></div>
          <div><dt>Won</dt><dd>{row.wins}/{row.games}</dd></div>
        </dl>
        <p className="xs muted">
          Percentages are over classified games only. {row.low ? `Small sample: under ${LOW_SAMPLE} classified games. ` : ""}
          {row.unavailableGames ? `Fearless: already used earlier in the series in ${row.unavailableGames} game${row.unavailableGames === 1 ? "" : "s"}, so it could not be picked there. ` : ""}
          Unclear means the order or the opposing top's lane could not be verified.
        </p>
      </section>
      <section className="scout-sec layer pro">
        <h3 className="scout-title"><span className="ldot" />Games<span className="end tnum">{row.games}</span></h3>
        <GameRows list={row.selections} names={names} bundle={bundle} open={open} setOpen={setOpen} />
      </section>
    </>
  );
}

function PairList({ title, pairs, names, bundle, open, setOpen, pairOpen, setPairOpen, other, empty }: {
  title: string; pairs: Pair[]; names: Names; bundle: TopDraftBundle; open?: string; setOpen: (k?: string) => void;
  pairOpen?: string; setPairOpen: (k?: string) => void; other: (p: Pair) => string; empty: string;
}) {
  return (
    <section className="scout-sec layer pro">
      <h3 className="scout-title"><span className="ldot" />{title}<span className="end tnum">{pairs.reduce((n, p) => n + p.games.length, 0)}</span></h3>
      {!pairs.length ? <p className="muted xs">{empty}</p> : (
        <ul className="pair-list">
          {pairs.map((p) => {
            const k = `${p.champion}>${p.into}`, isOpen = pairOpen === k, o = other(p);
            return (
              <li key={k}>
                <button type="button" aria-expanded={isOpen} onClick={() => setPairOpen(isOpen ? undefined : k)}>
                  <ChampIcon id={o} name={nm(names, o)} size="sm" />
                  <span className="pl-name">{nm(names, o)}</span>
                  <span className="tnum">{p.games.length} game{p.games.length === 1 ? "" : "s"}{p.series !== p.games.length ? ` · ${p.series} series` : ""}</span>
                  <span className={`pair-tag ${p.status}`}>{PAIR_LABEL[p.status]}</span>
                </button>
                {isOpen && <GameRows list={p.games} names={names} bundle={bundle} open={open} setOpen={setOpen} pair={p} opponent={false} />}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Matchups({ id, row, names, bundle, open, setOpen, pairOpen, setPairOpen }: {
  id: string; row?: TopRow; names: Names; bundle: TopDraftBundle; open?: string; setOpen: (k?: string) => void; pairOpen?: string; setPairOpen: (k?: string) => void;
}) {
  if (!row) return <p className="muted xs">No recorded pro game has this champion at top in this scope.</p>;
  const lane = (enemy: string) => bundle.dpm.find((r) => r.champion === id && r.enemy === enemy);
  return (
    <>
      <section className="scout-sec layer pro">
        <h3 className="scout-title"><span className="ldot" />Opposing tops faced<span className="end tnum">{row.faced.length}</span></h3>
        <table className="pro-table faced">
          <thead><tr><th>Opponent</th><th className="num">Games</th><th className="num">Blind</th><th className="num">Response</th><th className="num">Won</th><th className="num" title="DPM.LOL ranked lane win rate for this champion into the opponent">Lane data</th></tr></thead>
          <tbody>
            {row.faced.map((f) => {
              const g = row.selections.filter((s) => s.opponentTop === f.champion), d = lane(f.champion);
              const counter = dpmCounter(bundle.dpm, id, f.champion);
              return (
                <tr key={f.champion}>
                  <td><span className="chip"><ChampIcon id={f.champion} name={nm(names, f.champion)} size="xs" />{nm(names, f.champion)}</span></td>
                  <td className="num">{f.games}</td>
                  <td className="num">{g.filter((s) => s.usage === "blind").length}</td>
                  <td className="num">{g.filter((s) => s.usage === "response").length}</td>
                  <td className="num">{g.filter((s) => s.won).length}/{g.length}</td>
                  <td className="num" title={d ? `${d.games.toLocaleString()} ranked games, ${patchLabel(d.patch)}${counter ? "; clears the counter threshold" : ""}` : "No DPM.LOL row"}>{d ? `${(d.winRate * 100).toFixed(1)}%${counter ? " ·" : ""}` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="xs muted">Won counts games, not lanes. Lane data is DPM.LOL ranked play, a separate signal; a dot marks a matchup that clears the counter threshold.</p>
      </section>
      <PairList title={`${nm(names, id)} picked into`} pairs={row.respondedInto} names={names} bundle={bundle} open={open} setOpen={setOpen} pairOpen={pairOpen} setPairOpen={setPairOpen}
        other={(p) => p.into} empty="Never picked after the enemy top was known in this scope." />
      <PairList title={`Picked into ${nm(names, id)}`} pairs={row.answeredBy} names={names} bundle={bundle} open={open} setOpen={setOpen} pairOpen={pairOpen} setPairOpen={setPairOpen}
        other={(p) => p.champion} empty="No team picked its top after this champion was revealed in this scope." />
    </>
  );
}
