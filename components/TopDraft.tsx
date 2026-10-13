"use client";
// Synergies lane draft analysis (alan, 2026-10-13; Top first, then Mid, Bot and Support): one selected laner, read through
// tabs Overview | Draft usage | (Duo drafting on Bot and Support) | Matchups | (Synergies on Top) | Pro evidence. Three
// layers stay apart: alan's saved record (Top's blind grade, every lane's saved partners), observed pro draft usage
// (lib/top-draft.ts, every number with its denominator and its games) and the kit read (General Draft Logic). A response
// is never called a counter; a counter needs a DPM.LOL row, and no duo-level lane data exists. Nothing here scores or
// changes a saved record.
import Link from "next/link";
import { useMemo, useState } from "react";
import { ChampIcon } from "./ChampIcon";
import { rovingIndex, rovingKeys } from "./roving";
import { shortDate } from "@/lib/evidence";
import { patchLabel } from "@/lib/patch";
import { buildsHref } from "@/lib/pro-builds";
import { DRAFT_LABEL_MIN, orderText } from "@/lib/pro-priority";
import type { Role } from "@/lib/schema";
import type { BlindLine } from "@/lib/top-blind";
import {
  BOT_DETAIL_LABEL, draftSequence, sameTurn, dpmCounter, DUO_SHAPE_LABEL, duoResponses, duoRows, LOW_SAMPLE, MIN_CLASSIFIED, PAIR_LABEL, topPatches, topRows, USAGE_LABEL,
  type BotRead, type DuoResponse, type DuoSelection, type Side, type DuoShape, type GameBrief, type LaneRole, type Pair, type PriorityBrief, type Seen, type TopDraftBundle, type TopRow, type TopScope, type TopSelection,
} from "@/lib/top-draft";

type Names = Record<string, string>;
export type TopView = "overview" | "usage" | "duo" | "matchups" | "synergies" | "pro";
export const TOP_VIEWS: [TopView, string][] = [["overview", "Overview"], ["usage", "Draft usage"], ["matchups", "Matchups"], ["synergies", "Synergies"], ["pro", "Pro evidence"]];
/** Report tabs per lane. Off Top, the saved partners sit on Overview (they are that lane's saved record), so there is no
 *  separate Synergies tab; Bot and Support add Duo drafting. */
export const laneViews = (role: LaneRole): [TopView, string][] => role === "TOP" ? TOP_VIEWS
  : [["overview", "Overview"], ["usage", "Draft usage"], ...(role === "MID" ? [] : [["duo", "Duo drafting"] as [TopView, string]]), ["matchups", "Matchups"], ["pro", "Pro evidence"]];

/** How each lane is named in prose: "the enemy top", "the enemy ADC". */
export const LANE_WORD: Record<LaneRole, string> = { TOP: "top", MID: "mid", BOT: "ADC", SUPPORT: "support" };
const lower = (t: string) => t[0].toLowerCase() + t.slice(1); // "After enemy ADC" -> "after enemy ADC"
const isBot = (r: LaneRole) => r === "BOT" || r === "SUPPORT";
const SEEN_TEXT: Record<Seen, string> = { hidden: "not yet picked", revealed: "on the board", botlane: "on the board, slot unclear", ambiguous: "on the board, lane unclear" };

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
const nm = (names: Names, id: string) => names[id] ?? id;
const SIDE = { blue: "Blue", red: "Red" } as const;

/** "Often blinded · Blind 6/9" style line; neutral below three classified games. */
export function usageLine(r: TopRow | undefined, role: LaneRole = "TOP"): string {
  if (!r) return `No recorded ${LANE_WORD[role]} games`;
  if (r.usage === "too-few") return `Too few games (${r.classified} classified)`;
  return `${USAGE_LABEL[r.usage]} · ${r.usage === "response" ? `Response ${r.response}/${r.classified}` : `Blind ${r.blind}/${r.classified}`}`;
}

export const isPriority = (p?: PriorityBrief) => (p?.presence ?? 0) >= DRAFT_LABEL_MIN;

function UsageTag({ s }: { s: TopSelection }) {
  const label = s.bot?.detail ? BOT_DETAIL_LABEL[s.bot.detail] : s.usage === "blind" ? "Blind" : s.usage === "response" ? "Response" : "Unclear";
  return <span className={`usage-tag ${s.usage}`}>{label}</span>;
}

/** DPM.LOL lane evidence with its sample, role, patch and population: a separate signal from the pro games. */
export function dpmText(champion: string, into: string, d: { winRate: number; games: number; patch: string; rank?: string }, role: LaneRole, names: Names): string {
  return `DPM.LOL ranked solo queue (${d.rank ?? "rank not recorded"}, all regions, patch ${patchLabel(d.patch)}): ${nm(names, champion)} won ${(d.winRate * 100).toFixed(1)}% of ${d.games.toLocaleString()} games as ${LANE_WORD[role]} against ${nm(names, into)}.`;
}

/** Why a pick reads the way it does, in names: when it was picked and what of the enemy lane (or bot lane) it could see. */
function readText(s: TopSelection, game: GameBrief, names: Names): React.ReactNode {
  const other = s.side === "blue" ? "red" : "blue";
  if (!s.turn) return s.why;
  const me = <b>{nm(names, s.champion)}</b>;
  if (s.bot) {
    const b = s.bot, ea = nm(names, game[other].picks.BOT), es = nm(names, game[other].picks.SUPPORT);
    const partner = <>{nm(names, b.partner)} {b.partnerWhen === "together" ? "in the same turn (the source does not say which of the two came first)" : b.partnerWhen === "before" ? `earlier, at ${b.partnerTurn}` : `later, at ${b.partnerTurn}`}</>;
    return <>{me} was pick {s.turn} of 10, with {partner}. Enemy ADC {ea}: {SEEN_TEXT[b.enemyAdc]}; enemy support {es}: {SEEN_TEXT[b.enemySupport]}.{" "}
      {b.detail ? <>Read: <b>{BOT_DETAIL_LABEL[b.detail]}</b>.</> : "Unclear: a visible enemy champion could still have played another lane."}</>;
  }
  return <>
    {s.usage === "uncertain" ? s.why.replace(s.laneOpponent, nm(names, s.laneOpponent)) : <>{me} was pick {s.turn} of 10; {nm(names, s.laneOpponent)} was pick {s.opponentTurn}.</>}
    {s.enemyJungle && <> The enemy jungler {nm(names, game[other].picks.JUNGLE)} was {SEEN_TEXT[s.enemyJungle]} (composition context, not a lane response).</>}
  </>;
}

// ---------- one game ----------

/** The recorded game behind a selection: who picked first, the ten picks in draft order, both lineups, result, links. */
export function TopGameDetail({ game, focus, names, bundle, pair }: { game: GameBrief; focus: TopSelection; names: Names; bundle: TopDraftBundle; pair?: Pair }) {
  const seq = draftSequence(game);
  const role = focus.role as LaneRole;
  const lane = new Set((isBot(role) ? (["BOT", "SUPPORT"] as const) : [role]).flatMap((r) => [game.blue.picks[r], game.red.picks[r]]));
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
        {readText(focus, game, names)}
      </p>
      {seq && (
        <ol className="draft-seq" aria-label="Picks in draft order">
          {seq.map((p) => (
            <li key={p.turn} className={`seq-${p.side}${lane.has(p.champion) ? " lane" : ""}`} title={`${p.turn}. ${game[p.side].team}: ${nm(names, p.champion)}${p.role ? ` (${p.role.toLowerCase()})` : ""}`}>
              <span className="seq-n tnum">{p.turn}</span>
              <ChampIcon id={p.champion} name={nm(names, p.champion)} size="sm" />
              <span className="sr-only">{game[p.side].team} {nm(names, p.champion)}</span>
            </li>
          ))}
        </ol>
      )}
      {isBot(role) && <BotLaneSequence game={game} bundle={bundle} names={names} />}
      {pair && (
        <p className="xs">
          <span className={`pair-tag ${pair.status}`}>{PAIR_LABEL[pair.status]}</span>{" "}
          {pair.status === "supported" && pair.dpm
            ? <>{dpmText(pair.champion, pair.into, pair.dpm, role, names)} The pro games are context, not proof, and ranked play is not pro play.</>
            : pair.status === "repeated" ? <>Picked into {nm(names, pair.into)} in {pair.series} different series. No lane data says it is favourable.</>
            : <>One observed response. It says nothing yet about the matchup.</>}
        </p>
      )}
      <div className="top-game-links">
        {anyDraft && <Link className="btn sm" href={`/pro-drafts?id=${anyDraft}&build=${anyDraft}:${role}`}>Open in Pro Drafts</Link>}
        {(["blue", "red"] as const).map((side) => {
          const c = game[side].picks[role], player = bundle.players[`${game.id}:${side}`];
          return <Link key={side} className="btn sm" href={buildsHref(c, role as Role, game.id)}>{nm(names, c)} build{player ? ` · ${player}` : ""}</Link>;
        })}
        <a className="xs" href={game.url} target="_blank" rel="noreferrer">Gol.gg game page</a>
      </div>
    </div>
  );
}

const KNOWN_TEXT = (r?: BotRead) => !r ? "order not recorded" : !r.detail ? "a visible enemy champion could still have played another lane" : lower(BOT_DETAIL_LABEL[r.detail]);

/**
 * The bot lane of one game in draft order: each team's ADC and support pick (two picks in one turn stay together, never
 * ordered), what of the enemy bot lane each pick could see, and how each duo was built. From the rebuilt turns only.
 */
function BotLaneSequence({ game, bundle, names }: { game: GameBrief; bundle: TopDraftBundle; names: Names }) {
  const duos = (bundle.duos ?? []).filter((d) => d.game === game.id);
  if (!duos.length || duos.some((d) => d.adcTurn == null || d.supportTurn == null)) return null;
  type Step = { turn: number; side: Side; picks: { id: string; slot: "ADC" | "support"; read?: BotRead }[] };
  const steps: Step[] = [];
  for (const d of duos) {
    const add = (turn: number, id: string, slot: "ADC" | "support", read?: BotRead) => {
      const same = steps.find((x) => x.side === d.side && sameTurn(x.turn, turn));
      if (same) { same.picks.push({ id, slot, read }); same.turn = Math.min(same.turn, turn); } else steps.push({ turn, side: d.side, picks: [{ id, slot, read }] });
    };
    add(d.adcTurn!, d.adc, "ADC", d.adcRead);
    add(d.supportTurn!, d.support, "support", d.supportRead);
  }
  steps.sort((a, b) => a.turn - b.turn);
  const last = (side: Side) => steps.filter((x) => x.side === side).at(-1);
  return (
    <div className="bot-seq">
      <p className="xs label">Bot lane in draft order</p>
      <ol>
        {steps.map((st) => {
          const d = duos.find((x) => x.side === st.side)!;
          const turns = st.picks.length > 1 ? `Picks ${st.turn}–${st.turn + 1}, same turn` : `Pick ${st.turn}`;
          return (
            <li key={`${st.side}${st.turn}`} className={`seq-${st.side}`}>
              <span className="tnum faint">{turns}</span>
              <span><b>{game[st.side].team}</b> {st.picks.map((p) => `${nm(names, p.id)} (${p.slot})`).join(" + ")}</span>
              <span className="faint">{KNOWN_TEXT(st.picks[0].read)}</span>
              {last(st.side) === st && <span className={`usage-tag ${d.shape === "uncertain" ? "uncertain" : d.shape}`}>{DUO_SHAPE_LABEL[d.shape]}</span>}
            </li>
          );
        })}
      </ol>
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
              <span className="tg-team">{s.team}{player ? <span className="faint"> · {player}</span> : null}{s.bot ? <span className="faint"> · with {nm(names, s.bot.partner)}</span> : null}</span>
              {opponent && <span className="tg-vs"><span className="faint">vs</span> <ChampIcon id={s.laneOpponent} name={nm(names, s.laneOpponent)} size="xs" /> {nm(names, s.laneOpponent)}</span>}
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

export function TopUsageReport({ id, row, prio, prioLabel, bundle, names, view, setView, saved, logic, synergies, proEvidence, scopeLabel, scope }: {
  id: string; row?: TopRow; prio?: PriorityBrief; prioLabel: string; bundle: TopDraftBundle; names: Names; view: TopView; setView: (v: TopView) => void;
  saved?: { grade: string; tier?: string; gives?: string; avoid?: string }; // Top's saved blind grade
  logic: BlindLine[]; synergies: React.ReactNode; proEvidence: React.ReactNode; scopeLabel: string; scope: TopScope;
}) {
  const [open, setOpen] = useState<string>();
  const [pairOpen, setPairOpen] = useState<string>();
  const role = bundle.role;
  const name = nm(names, id);
  const views = laneViews(role);
  const shown = views.some(([v]) => v === view) ? view : "overview";
  return (
    <article className={`panel pick-card scout top-report lane-${role}`}>
      <header className={`scout-head role-${role}`}>
        <ChampIcon id={id} name={name} role={role} size="xxl" />
        <div className="scout-id">
          <h2>{name}</h2>
          <div className="scout-meta">
            <span className={`role-tag role-${role}`}>{role}</span>
            {saved?.tier && <span>{saved.tier}</span>}
            {saved && <span className="clash-text" title="Your saved blind-pick grade">Saved blind grade <b className="grade">{saved.grade}</b></span>}
            <span className="pro-text" title={`Observed pro draft usage, ${scopeLabel}`}>{usageLine(row, role)}</span>
            {prio?.presence != null && <span className="pro-text tnum" title={`Pick or ban presence on ${prioLabel}`}>{isPriority(prio) ? "Pro priority" : "Presence"} {Math.round(prio.presence * 100)}%</span>}
          </div>
        </div>
      </header>
      <div className="tabs" role="tablist" aria-label={`${name} report`} onKeyDown={(e) => rovingKeys(e)}>
        {views.map(([v, l]) => (
          <button key={v} type="button" role="tab" aria-selected={shown === v} tabIndex={rovingIndex(shown === v)} className={shown === v ? "active" : undefined} onClick={() => setView(v)}>{l}</button>
        ))}
      </div>
      <div role="tabpanel">
        {shown === "overview" && <Overview role={role} row={row} prio={prio} prioLabel={prioLabel} saved={saved} logic={logic} names={names} scopeLabel={scopeLabel} synergies={role === "TOP" ? undefined : synergies} />}
        {shown === "usage" && <Usage id={id} row={row} names={names} bundle={bundle} open={open} setOpen={setOpen} scopeLabel={scopeLabel} scope={scope} />}
        {shown === "duo" && <DuoView id={id} names={names} bundle={bundle} scope={scope} scopeLabel={scopeLabel} />}
        {shown === "matchups" && <Matchups id={id} row={row} names={names} bundle={bundle} open={open} setOpen={setOpen} pairOpen={pairOpen} setPairOpen={setPairOpen} />}
        {shown === "synergies" && synergies}
        {shown === "pro" && (
          <>
            {proEvidence}
            {row && (
              <section className="scout-sec layer pro">
                <h3 className="scout-title"><span className="ldot" />Recorded games at {LANE_WORD[role]}<span className="end tnum">{row.games}</span></h3>
                <GameRows list={row.selections} names={names} bundle={bundle} open={open} setOpen={setOpen} />
              </section>
            )}
          </>
        )}
      </div>
    </article>
  );
}

function Overview({ role, row, prio, prioLabel, saved, logic, names, scopeLabel, synergies }: {
  role: LaneRole; row?: TopRow; prio?: PriorityBrief; prioLabel: string; saved?: { grade: string; gives?: string; avoid?: string }; logic: BlindLine[]; names: Names; scopeLabel: string;
  synergies?: React.ReactNode;
}) {
  const answers = row?.answeredBy.filter((p) => p.games.length >= 2) ?? [];
  const high = isPriority(prio);
  const savedHigh = saved && /^A/.test(saved.grade), savedLow = saved && /^C/.test(saved.grade);
  const disagree = row && row.usage !== "too-few" && ((savedHigh && row.usage === "response") || (savedLow && row.usage === "blind"));
  const enemy = `enemy ${LANE_WORD[role]}`;
  const ordered = row ? row.selections.filter((s) => s.turn).length : 0;
  return (
    <>
      <section className="scout-sec layer pro">
        <h3 className="scout-title"><span className="ldot" />Observed draft usage<span className="end">{scopeLabel}</span></h3>
        {!row ? <p className="muted xs">No recorded pro game has this champion at {LANE_WORD[role]} in this scope.</p> : (
          <>
            <p className="small"><b>{usageLine(row, role)}</b>{row.low && row.usage !== "too-few" ? <span className="faint"> · small sample (under {LOW_SAMPLE})</span> : null}</p>
            <p className="xs muted tnum">
              {row.games} {LANE_WORD[role]} game{row.games === 1 ? "" : "s"} · blind {row.blind} · response {row.response}{row.uncertain ? ` · unclear ${row.uncertain}` : ""}
            </p>
            {ordered > 0 && (
              <p className="xs tnum" title="When it was picked, from recorded pick order. Separate from blind or response, and never a claim of blind safety.">
                Pick timing: {orderText({ known: ordered, firstPick: 0, firstRotation: row.rotation.first, phase2: row.rotation.second + row.rotation.last, lastPick: row.rotation.last })}
              </p>
            )}
            {prio && (
              <p className="xs muted tnum">
                Meta priority on {prioLabel}: {prio.picks} picks, {prio.bans} bans{prio.presence != null ? `, ${Math.round(prio.presence * 100)}% presence` : ""}{prio.winRate != null ? `, ${Math.round(prio.winRate * 100)}% WR${prio.low ? " (low sample)" : ""}` : ""}
              </p>
            )}
            {row.bot && ordered > 0 && (
              <p className="xs tnum">
                What it could see of the enemy bot lane: {(Object.keys(BOT_DETAIL_LABEL) as (keyof typeof BOT_DETAIL_LABEL)[]).filter((k) => row.bot![k]).map((k) => `${lower(BOT_DETAIL_LABEL[k])} ${row.bot![k]}`).join(", ")}{row.uncertain ? `, unclear ${row.uncertain}` : ""} (of {row.games}).
              </p>
            )}
            {row.bot && ordered > 0 && (
              <p className="xs tnum">
                Own {role === "BOT" ? "support" : "ADC"} picked earlier in {row.bot.partnerBefore}/{ordered}, in the same turn in {row.bot.together}/{ordered}, later in {row.bot.partnerAfter}/{ordered}.
              </p>
            )}
            {row.enemyJungleSeen != null && ordered > 0 && (
              <p className="xs tnum">Picked after the enemy jungler was revealed in {row.enemyJungleSeen}/{ordered} (composition context, not a lane response).</p>
            )}
            {high && row.usage === "blind" && <p className="xs">High priority and usually blinded. Priority is not evidence that it is safe to blind{answers.length ? `: it was answered by ${answers.map((p) => `${nm(names, p.champion)} ${p.games.length}×`).join(", ")}` : ""}.</p>}
            {high && row.usage === "response" && <p className="xs">High priority, and usually held until the {enemy} is known.</p>}
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
      {synergies}
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

function Usage({ id, row, names, bundle, open, setOpen, scopeLabel, scope }: {
  id: string; row?: TopRow; names: Names; bundle: TopDraftBundle; open?: string; setOpen: (k?: string) => void; scopeLabel: string; scope: TopScope;
}) {
  const role = bundle.role;
  // Per-patch breakdown under All patches: the combined history above, each patch's own counts and presence here.
  const perPatch = useMemo(() => scope.patch ? [] : topPatches(bundle.selections).map((patch) => ({
    patch, row: topRows(bundle.selections, { ...scope, patch }, bundle.dpm).find((r) => r.champion === id), prio: bundle.priority[patch]?.rows[id],
  })).filter((p) => p.row || p.prio), [bundle, id, scope]);
  if (!row) return <p className="muted xs">No recorded pro game has this champion at {LANE_WORD[role]} in this scope.</p>;
  const ordered = row.selections.filter((s) => s.turn).length;
  const b = row.bot;
  return (
    <>
      <section className="scout-sec layer pro">
        <h3 className="scout-title"><span className="ldot" />Blind or response<span className="end">{scopeLabel}</span></h3>
        <Bar parts={[["Blind", row.blind, "blind"], ["Response", row.response, "response"], ["Unclear", row.uncertain, "uncertain"]]} />
        <dl className="usage-facts tnum">
          <div><dt>Blind</dt><dd>{row.blind}/{row.classified} <span className="faint">{pct(row.blind, row.classified)}</span></dd></div>
          <div><dt>Response</dt><dd>{row.response}/{row.classified} <span className="faint">{pct(row.response, row.classified)}</span></dd></div>
          <div><dt>Unclear</dt><dd>{row.uncertain}</dd></div>
          <div><dt>First rotation</dt><dd>{row.rotation.first}/{ordered} <span className="faint">{pct(row.rotation.first, ordered)}</span></dd></div>
          <div><dt>Second rotation</dt><dd>{row.rotation.second + row.rotation.last}/{ordered}</dd></div>
          <div><dt>Last pick</dt><dd>{row.rotation.last}/{ordered}</dd></div>
          <div><dt>Blue / red</dt><dd>{row.blue} / {row.red}</dd></div>
          <div><dt>Team had first pick</dt><dd>{row.firstPicker}/{ordered}</dd></div>
          <div><dt>Won</dt><dd>{row.wins}/{row.games}</dd></div>
          {row.enemyJungleSeen != null && <div><dt title="Composition context, never counted as a lane response">After enemy jungler</dt><dd>{row.enemyJungleSeen}/{ordered}</dd></div>}
        </dl>
        <p className="xs muted">
          Percentages are over classified games only. {row.low ? `Small sample: under ${LOW_SAMPLE} classified games. ` : ""}
          {row.unavailableGames ? `Fearless: already used earlier in the series in ${row.unavailableGames} game${row.unavailableGames === 1 ? "" : "s"}, so it could not be picked there. ` : ""}
          {isBot(role) ? "Unclear means the order was not recorded or a visible enemy champion could still have played another lane." : `Unclear means the order or the opposing ${LANE_WORD[role]}'s lane could not be verified.`}
        </p>
      </section>
      {b && (
        <section className="scout-sec layer pro">
          <h3 className="scout-title"><span className="ldot" />What it could see of the enemy bot lane<span className="end tnum">{ordered} ordered</span></h3>
          <dl className="usage-facts tnum">
            {(Object.keys(BOT_DETAIL_LABEL) as (keyof typeof BOT_DETAIL_LABEL)[]).map((k) => <div key={k}><dt>{BOT_DETAIL_LABEL[k]}</dt><dd>{b[k]}/{row.games}</dd></div>)}
            <div><dt>Unclear</dt><dd>{row.uncertain}/{row.games}</dd></div>
          </dl>
          <dl className="usage-facts tnum">
            <div><dt>Own {role === "BOT" ? "support" : "ADC"} earlier</dt><dd>{b.partnerBefore}/{ordered}</dd></div>
            <div><dt>Same turn</dt><dd>{b.together}/{ordered}</dd></div>
            <div><dt>Own {role === "BOT" ? "support" : "ADC"} later</dt><dd>{b.partnerAfter}/{ordered}</dd></div>
          </dl>
          <p className="xs muted">&ldquo;After one enemy bot laner&rdquo; is a champion that was certainly bot lane but could still have been the ADC or the support. Two picks in the same turn are never ordered.</p>
        </section>
      )}
      {perPatch.length > 1 && (
        <section className="scout-sec layer pro">
          <h3 className="scout-title"><span className="ldot" />By patch<span className="end">meta priority is per patch, never combined</span></h3>
          <table className="pro-table by-patch">
            <thead><tr><th>Patch</th><th className="num">Games</th><th className="num">Blind</th><th className="num">Response</th><th className="num">First rotation</th><th className="num" title="Pick or ban presence on that patch">Presence</th></tr></thead>
            <tbody>
              {perPatch.map(({ patch, row: r, prio }) => {
                const o = r ? r.selections.filter((s) => s.turn).length : 0;
                return (
                  <tr key={patch}>
                    <td>{patchLabel(patch)}</td>
                    <td className="num">{r?.games ?? 0}</td>
                    <td className="num">{r ? `${r.blind}/${r.classified}` : "—"}</td>
                    <td className="num">{r ? `${r.response}/${r.classified}` : "—"}</td>
                    <td className="num">{r && o ? `${r.rotation.first}/${o}` : "—"}</td>
                    <td className="num">{prio?.presence != null ? `${Math.round(prio.presence * 100)}%` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
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
                  <span className="tnum">{p.games.length} game{p.games.length === 1 ? "" : "s"} · {p.series} series · won {p.wins}/{p.games.length}</span>
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
  const role = bundle.role, word = LANE_WORD[role];
  if (!row) return <p className="muted xs">No recorded pro game has this champion at {word} in this scope.</p>;
  const lane = (enemy: string) => bundle.dpm.find((r) => r.champion === id && r.enemy === enemy);
  return (
    <>
      <section className="scout-sec layer pro">
        <h3 className="scout-title"><span className="ldot" />Opposing {word === "ADC" ? "ADCs" : `${word}s`} faced<span className="end tnum">{row.faced.length}</span></h3>
        <table className="pro-table faced">
          <thead><tr><th>Opponent</th><th className="num">Games</th><th className="num">Blind</th><th className="num">Response</th><th className="num">Won</th><th className="num" title="DPM.LOL ranked lane win rate for this champion into the opponent">Lane data</th></tr></thead>
          <tbody>
            {row.faced.map((f) => {
              const g = row.selections.filter((s) => s.laneOpponent === f.champion), d = lane(f.champion);
              const counter = dpmCounter(bundle.dpm, id, f.champion, role);
              return (
                <tr key={f.champion}>
                  <td><span className="chip"><ChampIcon id={f.champion} name={nm(names, f.champion)} size="xs" />{nm(names, f.champion)}</span></td>
                  <td className="num">{f.games}</td>
                  <td className="num">{g.filter((s) => s.usage === "blind").length}</td>
                  <td className="num">{g.filter((s) => s.usage === "response").length}</td>
                  <td className="num">{g.filter((s) => s.won).length}/{g.length}</td>
                  <td className="num" title={d ? `${dpmText(id, f.champion, d, role, names)}${counter ? " Clears the counter threshold." : ""}` : "No DPM.LOL row"}>{d ? `${(d.winRate * 100).toFixed(1)}%${counter ? " ·" : ""}` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="xs muted">Won counts pro games, not lanes. Lane data is DPM.LOL ranked solo queue{bundle.dpm[0]?.rank ? ` (${bundle.dpm[0].rank})` : ""}, a separate signal from pro play; a dot marks a matchup that clears the counter threshold (300+ games, 52%+).{isBot(role) ? ` Responses here are ${word} into ${word}; whole bot lanes are under Duo drafting.` : ""}</p>
      </section>
      <PairList title={`${nm(names, id)} picked into`} pairs={row.respondedInto} names={names} bundle={bundle} open={open} setOpen={setOpen} pairOpen={pairOpen} setPairOpen={setPairOpen}
        other={(p) => p.into} empty={`Never picked after the enemy ${word} was known in this scope.`} />
      <PairList title={`Picked into ${nm(names, id)}`} pairs={row.answeredBy} names={names} bundle={bundle} open={open} setOpen={setOpen} pairOpen={pairOpen} setPairOpen={setPairOpen}
        other={(p) => p.champion} empty={`No team picked its ${word} after this champion was revealed in this scope.`} />
    </>
  );
}

// ---------- duo drafting (Bot and Support) ----------

const SHAPES: DuoShape[] = ["blind", "partial", "split", "full", "uncertain"];
const SHAPE_SHORT: Record<DuoShape, string> = { blind: "Blind", partial: "Partial", split: "Split", full: "Full", uncertain: "Unclear" };
const turnText = (d: DuoSelection) => d.adcTurn == null || d.supportTurn == null ? "order not recorded"
  : d.order === "together" ? `${d.adcTurn} + ${d.supportTurn}, same turn` : `ADC ${d.adcTurn}, support ${d.supportTurn}`;
const knownText = (d: DuoSelection) => !d.known ? "—" : d.known.first == null || d.known.last == null ? "unclear" : d.known.first === d.known.last ? `${d.known.first} of 2` : `${d.known.first} → ${d.known.last} of 2`;

function Duo({ adc, support, names }: { adc: string; support: string; names: Names }) {
  return (
    <span className="duo">
      <ChampIcon id={adc} name={nm(names, adc)} size="xs" /><ChampIcon id={support} name={nm(names, support)} size="xs" />
      <span>{nm(names, adc)} + {nm(names, support)}</span>
    </span>
  );
}

/** The duo's games: pick order, what of the enemy bot lane each half could see, the enemy duo, the result; each opens its game. */
function DuoGames({ list, names, bundle }: { list: DuoSelection[]; names: Names; bundle: TopDraftBundle }) {
  const [open, setOpen] = useState<string>();
  const sel = useMemo(() => new Map(bundle.selections.map((s) => [`${s.game}:${s.side}`, s])), [bundle]);
  return (
    <ul className="top-games duo-games">
      {list.map((d) => {
        const k = `${d.game}:${d.side}`, isOpen = open === k, s = sel.get(k);
        return (
          <li key={k} className={isOpen ? "open" : undefined}>
            <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? undefined : k)}>
              <span className="tg-date tnum faint">{shortDate(d.date) ?? d.date}</span>
              <span className="tg-team">{d.team} <span className="faint">· {patchLabel(d.patch)} · {turnText(d)}</span></span>
              <span className="tg-vs"><span className="faint">vs</span> <Duo adc={d.enemyAdc} support={d.enemySupport} names={names} /></span>
              <span className="tg-turn tnum faint" title="Enemy bot laners known at the duo's first → last pick">{knownText(d)}</span>
              <span className={`usage-tag ${d.shape === "uncertain" ? "uncertain" : d.shape}`}>{DUO_SHAPE_LABEL[d.shape]}</span>
              <span className={`res ${d.won ? "win" : "loss"}`}>{d.won ? "W" : "L"}</span>
            </button>
            {isOpen && s && bundle.games[d.game] && <TopGameDetail game={bundle.games[d.game]} focus={s} names={names} bundle={bundle} />}
          </li>
        );
      })}
    </ul>
  );
}

function ResponseList({ title, list, names, bundle, empty, note }: { title: string; list: DuoResponse[]; names: Names; bundle: TopDraftBundle; empty: string; note?: string }) {
  const [open, setOpen] = useState<string>();
  return (
    <section className="scout-sec layer pro">
      <h3 className="scout-title"><span className="ldot" />{title}<span className="end tnum">{list.reduce((n, r) => n + r.games.length, 0)}</span></h3>
      {!list.length ? <p className="muted xs">{empty}</p> : (
        <ul className="pair-list duo-list">
          {list.map((r) => {
            const k = `${r.adc}+${r.support}>${r.enemyAdc}+${r.enemySupport}`, isOpen = open === k;
            return (
              <li key={k}>
                <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? undefined : k)}>
                  <Duo adc={r.adc} support={r.support} names={names} />
                  <span className="duo-into"><span className="faint">into</span> <Duo adc={r.enemyAdc} support={r.enemySupport} names={names} /></span>
                  <span className="tnum">{r.series} series · {r.teams.length} team{r.teams.length === 1 ? "" : "s"} · won {r.wins}/{r.games.length}</span>
                  <span className={`pair-tag ${r.status}`}>{r.status === "repeated" ? "Repeated response" : "Observed response"}</span>
                </button>
                {isOpen && <DuoGames list={r.games} names={names} bundle={bundle} />}
              </li>
            );
          })}
        </ul>
      )}
      {note && <p className="xs muted">{note}</p>}
    </section>
  );
}

function DuoView({ id, names, bundle, scope, scopeLabel }: { id: string; names: Names; bundle: TopDraftBundle; scope: TopScope; scopeLabel: string }) {
  const [open, setOpen] = useState<string>();
  const support = bundle.role === "SUPPORT";
  const all = bundle.duos ?? [];
  const mine = (d: { adc: string; support: string }) => (support ? d.support : d.adc) === id;
  const rows = useMemo(() => duoRows(all, scope).filter(mine), [all, scope, id]); // eslint-disable-line react-hooks/exhaustive-deps
  const responses = useMemo(() => duoResponses(all, scope), [all, scope]);
  const games = rows.flatMap((r) => r.games);
  if (!games.length) return <p className="muted xs">No recorded duo with this champion in this scope.</p>;
  const shapes = Object.fromEntries(SHAPES.map((k) => [k, games.filter((g) => g.shape === k).length])) as Record<DuoShape, number>;
  const ordered = games.filter((g) => g.order).length;
  const order = (o: DuoSelection["order"]) => games.filter((g) => g.order === o).length;
  const into = responses.filter((r) => mine(r));
  const against = responses.filter((r) => (support ? r.enemySupport : r.enemyAdc) === id);
  return (
    <>
      <section className="scout-sec layer pro">
        <h3 className="scout-title"><span className="ldot" />How its duos were built<span className="end">{scopeLabel}</span></h3>
        <Bar parts={[["Duo blind", shapes.blind, "blind"], ["Partially revealed", shapes.partial, "response"], ["Split construction", shapes.split, "response"], ["Full duo response", shapes.full, "response"], ["Unclear", shapes.uncertain, "uncertain"]]} />
        <dl className="usage-facts tnum">
          {SHAPES.map((k) => <div key={k}><dt>{DUO_SHAPE_LABEL[k]}</dt><dd>{shapes[k]}/{games.length}</dd></div>)}
          <div><dt>ADC first</dt><dd>{order("adc")}/{ordered}</dd></div>
          <div><dt>Same turn</dt><dd>{order("together")}/{ordered}</dd></div>
          <div><dt>Support first</dt><dd>{order("support")}/{ordered}</dd></div>
        </dl>
        <p className="xs muted">
          Duo blind: both picks before either enemy bot laner. Partially revealed: one enemy bot laner known at both picks. Full: both known at both picks. Split: the
          second half saw more of the enemy bot lane than the first. Unclear: no order recorded, or a visible enemy champion could still have played another lane.
        </p>
      </section>
      <section className="scout-sec layer pro">
        <h3 className="scout-title"><span className="ldot" />Duos<span className="end tnum">{rows.length}</span></h3>
        <table className="pro-table duo-table">
          <thead><tr><th>Duo</th><th className="num">Games</th>{SHAPES.map((k) => <th key={k} className="num shape-col" title={DUO_SHAPE_LABEL[k]}>{SHAPE_SHORT[k]}</th>)}<th className="num">Teams</th><th className="num">Won</th></tr></thead>
          {rows.map((r) => {
            const k = `${r.adc}+${r.support}`, isOpen = open === k;
            return (
              <tbody key={k} className={isOpen ? "open" : undefined}>
                <tr>
                  <td><button type="button" className="duo-btn" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? undefined : k)}><Duo adc={r.adc} support={r.support} names={names} /></button></td>
                  <td className="num">{r.games.length}</td>
                  {SHAPES.map((s) => <td key={s} className="num shape-col">{r.shapes[s] || "·"}</td>)}
                  <td className="num">{r.teams.length}</td>
                  <td className="num">{r.wins}/{r.games.length}</td>
                </tr>
                {isOpen && <tr className="duo-open"><td colSpan={SHAPES.length + 4}><DuoGames list={r.games} names={names} bundle={bundle} /></td></tr>}
              </tbody>
            );
          })}
        </table>
      </section>
      <ResponseList title="Completed after the whole enemy bot lane" list={into} names={names} bundle={bundle}
        empty="This champion's duo was never completed after both enemy bot laners were known in this scope." />
      <ResponseList title="Duos picked into it" list={against} names={names} bundle={bundle}
        empty="No duo was completed into a bot lane with this champion in this scope."
        note="Both lists count duos whose last pick came after both enemy bot laners were known (full responses and splits). A response is not a counter: no duo-level lane data exists, and wins prove nothing. Repeated needs two different series." />
    </>
  );
}
