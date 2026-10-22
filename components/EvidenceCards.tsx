"use client";
// Draft Room evidence popovers, all on the shared <Popover> foundation (components/Popover.tsx). Each layer keeps its
// own content and colour: Pro evidence (muted teal), Counter (oxblood), comp-fit breakdown (neutral logic).
//
// Pro evidence answers "who played it, against what, what happened" from the recorded games only (lib/pro-evidence.ts).
// Results, sides, enemy drafts and source status appear only when recorded; pick order never is, so no game is shown
// as a draft response. A champion on the other team is an observed matchup, never a counter.
import Link from "next/link";
import { useState } from "react";
import { FIRST_ROTATION, type StartGame, type StartingPick } from "@/lib/starting-picks";
import { describePro, type Counter } from "@/lib/counters";
import type { CounterFreshness } from "@/lib/counter-freshness";
import { shortDate } from "@/lib/evidence";
import { evidenceGames, type EvidenceGame, type Picks } from "@/lib/pro-evidence";
import { ROLES, type ProDraft, type Role, type Source } from "@/lib/schema";
import type { ProSuggestion } from "@/lib/suggest";
import { ChampIcon } from "./ChampIcon";
import { Popover } from "./Popover";
import { patchLabel } from "@/lib/patch";

const ROLE_SHORT: Record<Role, string> = { TOP: "Top", JUNGLE: "Jungle", MID: "Mid", BOT: "Bot", SUPPORT: "Support" };
const HOVER_GAMES = 3; // games shown before "View all"
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const list = (xs: string[]) => (xs.length < 3 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

export interface ProCtx {
  drafts: ProDraft[]; sources: Record<string, Source>; enemy: Partial<Record<Role, string>>; names: Record<string, string>;
  counterFresh?: CounterFreshness; // the Counter card's patch line: the DPM data's patch against the newest one
}

// `mate`: the Jungle row's "With <mid> · n games" label, which counts every recorded game (LCK archive included); the
// card says how its own narrower count differs (alan, 2026-10-14).
export function ProEvidenceTrigger({ pro, champion, role, ctx, mate }: {
  pro: ProSuggestion; champion: string; role: Role; ctx: ProCtx; mate?: { name: string; games: number };
}) {
  const name = ctx.names[champion] ?? champion;
  return (
    <Popover label={`Pro evidence for ${name}`} triggerClass="sig pro" className="pe" trigger={<>Pro · {plural(pro.score, "game")}</>}>
      {({ mode, pin }) => <ProEvidenceBody pro={pro} champion={champion} role={role} ctx={ctx} mate={mate} pinned={mode !== "hover"} pin={pin} />}
    </Popover>
  );
}

function ProEvidenceBody({ pro, champion, role, ctx, mate, pinned, pin }: {
  pro: ProSuggestion; champion: string; role: Role; ctx: ProCtx; mate?: { name: string; games: number }; pinned: boolean; pin: () => void;
}) {
  const [all, setAll] = useState(false);
  const games = evidenceGames(pro, ctx);
  const n = (id: string) => ctx.names[id] ?? id;
  const shown = all ? games : games.slice(0, HOVER_GAMES);
  // Grouped by event in newest-first order, so each event header is written once.
  const groups: { event: string; patch?: string; games: EvidenceGame[] }[] = [];
  for (const g of shown) {
    const last = groups.at(-1);
    if (last && last.event === g.event && last.patch === g.patch) last.games.push(g);
    else groups.push({ event: g.event, patch: g.patch, games: [g] });
  }
  const ongoing = new Set(pro.lines.filter((l) => l.ongoing).map((l) => l.event));
  return (
    <div className={`pe-card ${all ? "all" : ""}`}>
      <header className="pop-head">
        <span className="pop-title pro">Pro evidence</span>
        <span className="mono">{plural(games.length, "game")}</span>
      </header>
      <p className="pop-sub">{n(champion)} on the same team as {list(pro.with.map(n))}{games.some((g) => g.pending) ? ", including supplied links not read yet" : ""}.</p>
      {mate && <p className="pop-sub">Stored drafts only. &ldquo;With {mate.name} &middot; {plural(mate.games, "game")}&rdquo; counts every recorded game with {mate.name} at mid, the LCK archive included, so it can be higher.</p>}
      {groups.map((grp, i) => (
        <section key={`${grp.event}-${grp.patch}-${i}`} className="pe-event">
          <h4 className="pe-event-name">{grp.event}{grp.patch && <span className="mono"> {patchLabel(grp.patch)}</span>}{ongoing.has(grp.event) && <span className="faint"> · ongoing</span>}</h4>
          <ol className="pe-games">{grp.games.map((g) => <GameItem key={g.key} g={g} champion={champion} role={role} n={n} />)}</ol>
        </section>
      ))}
      <footer className="pop-foot">
        <span>Observed pairing, never part of the order. Pick order isn&apos;t recorded, so no game here shows a counterpick response.</span>
        {games.length > HOVER_GAMES && (
          <button type="button" className="btn sm" onClick={() => { pin(); setAll((v) => !v); }}>
            {all ? "Show fewer" : `View all ${games.length} games`}
          </button>
        )}
        {!pinned && games.length <= HOVER_GAMES && <span className="faint">Click to keep open</span>}
      </footer>
    </div>
  );
}

function GameItem({ g, champion, role, n }: { g: EvidenceGame; champion: string; role: Role; n: (id: string) => string }) {
  const gameNo = g.seriesGame?.match(/G(\d+)$/)?.[1];
  const meta = [shortDate(g.date), g.stage, gameNo ? `Game ${gameNo}` : g.seriesGame,
    g.side ? `${g.side === "blue" ? "Blue" : "Red"} side` : undefined].filter(Boolean);
  const status = g.pending ? "Supplied link, pending refresh: the page hasn't been read here yet"
    : g.verified ? `Gol.gg game page, read ${g.checked ?? ""}`.trim() : "Gol.gg game page, not re-read since import";
  return (
    <li className="pe-game">
      <div className="pe-game-head">
        <span className="pe-teams">{g.team ? <><b>{g.team}</b>{g.opponent && <span className="muted"> vs {g.opponent}</span>}</> : <b>{g.seriesGame}</b>}</span>
        {g.won === true ? <span className="pe-res win">Win</span> : g.won === false ? <span className="pe-res loss">Loss</span>
          : <span className="pe-res none">{g.pending ? "Pending" : "Result not recorded"}</span>}
      </div>
      <div className="pe-meta">
        {meta.length > 0 && <span>{meta.join(" · ")}</span>}
        {g.url && <a href={g.url} target="_blank" rel="noopener noreferrer" title={status}>Gol.gg{g.pending && <span className="faint"> · pending</span>}<span aria-hidden="true"> ↗</span></a>}
      </div>
      {g.picks && <MiniDraft team={g.team} opponent={g.opponent} ours={g.picks} theirs={g.enemyPicks} hl={[champion, ...g.with.map((w) => w.id)]} vs={g.facing.map((f) => f.id)} n={n} />}
      <p className="pe-why">
        {g.pending ? <>Supplied game link with {list(g.with.map((w) => n(w.id)))}; the full draft isn&apos;t recorded.</>
          : <>Teammate pairing: {n(champion)} ({ROLE_SHORT[role]}) with {list(g.with.map((w) => `${n(w.id)} (${ROLE_SHORT[w.role!]})`))}{g.team ? ` on ${g.team}` : ""}.</>}
      </p>
      {g.facing.length > 0 && (
        <p className="pe-why vs">Against {list(g.facing.map((f) => `${n(f.id)} (${ROLE_SHORT[f.role!]})`))}, as in your enemy draft: an observed matchup, not proof of a counter.</p>
      )}
    </li>
  );
}

function MiniDraft({ team, opponent, ours, theirs, hl, vs, n }: {
  team?: string; opponent?: string; ours: Picks; theirs?: Picks; hl: string[]; vs: string[]; n: (id: string) => string;
}) {
  const row = (label: string | undefined, picks: Picks, mark: (id: string) => string) => (
    <div className="md-row">
      <span className="md-team" title={label}>{label ?? ""}</span>
      {ROLES.map((r) => (
        <span key={r} className={`md-cell ${mark(picks[r])}`} title={`${n(picks[r])} · ${ROLE_SHORT[r]}`}>
          <ChampIcon id={picks[r]} name={n(picks[r])} role={r} size="xs" />
        </span>
      ))}
    </div>
  );
  return (
    <div className="mini-draft" aria-label={`${team ?? "Team"}: ${ROLES.map((r) => n(ours[r])).join(", ")}${theirs ? `. ${opponent ?? "Opponent"}: ${ROLES.map((r) => n(theirs[r])).join(", ")}` : ""}`} role="img">
      {row(team, ours, (id) => (hl.includes(id) ? "hl" : ""))}
      {theirs ? row(opponent, theirs, (id) => (vs.includes(id) ? "vs" : ""))
        : <div className="md-row none"><span className="md-team">{opponent ?? ""}</span><span className="faint">Opponent draft not recorded</span></div>}
    </div>
  );
}

// ---------- Counter ----------

const STRENGTH = { confirmed: "Strong · pro agrees", strong: "Strong", favorable: "Favorable" } as const;

export function CounterTrigger({ c, names, fresh }: { c: Counter; names: Record<string, string>; fresh?: CounterFreshness }) {
  const n = (id: string) => names[id] ?? id;
  const e = c.evidence;
  return (
    <Popover label={`Counter evidence for ${n(c.champion)}`} triggerClass="sig counter" className="ce" trigger="Counter">
      {() => (
        <div className="ce-card">
          <header className="pop-head"><span className="pop-title counter">Counter</span><span>{STRENGTH[c.strength]}</span></header>
          <p className="pop-sub">{n(c.champion)} into {list(e.vs.map(n))}{e.with ? ` with ${n(e.with)}` : ""}: a statistically favourable {e.scope === "duo" ? "duo" : "lane"} matchup.</p>
          <dl className="pop-kv">
            <dt>Matchup</dt><dd><a href={e.url} target="_blank" rel="noopener noreferrer" title={`DPM.LOL, updated ${e.updated}`}>DPM.LOL</a> <span className="mono">{(e.winRate * 100).toFixed(1)}%</span> over <span className="mono">{e.games.toLocaleString("en-US")}</span> games · <span className="mono">{patchLabel(e.patch)}</span>{e.rank ? ` · ${e.rank}` : ""}</dd>
            {e.stale && <><dt>Older patch</dt><dd>Collected on patch <span className="mono">{patchLabel(e.patch)}</span>{fresh?.newest ? <> (current <span className="mono">{patchLabel(fresh.newest)}</span>)</> : ""}: a historical matchup that may no longer reflect current balance. Strength is unchanged.<StaleChanges ids={[c.champion, ...e.vs, ...(e.with ? [e.with] : [])]} fresh={fresh} n={n} /></dd></>}
            {e.note && <><dt>Held back</dt><dd>{e.note}</dd></>}
            <dt>Pro games</dt><dd>{c.pro ? describePro(c.pro).replace(/^Pro · /, "") : "No repeated pro sample; shown separately when there is one, never averaged."}</dd>
            {c.cautions.length > 0 && <><dt>Caution</dt><dd>{c.cautions.join("; ")}</dd></>}
          </dl>
          <footer className="pop-foot"><span>Counter signal only, never part of the order. Opposite sides in pro games alone never make a counter.</span></footer>
        </div>
      )}
    </Popover>
  );
}


/** Riot's changes since the DPM patch to the champions in a counter, each linking to its Patch Notes entry. */
function StaleChanges({ ids, fresh, n }: { ids: string[]; fresh?: CounterFreshness; n: (id: string) => string }) {
  const changed = ids.filter((id) => fresh?.changes[id]?.length);
  if (!fresh) return null;
  if (!changed.length) return <> No recorded patch-note change to {list(ids.map(n))} since then.</>;
  return (
    <> Changed since:{" "}
      {changed.map((id, i) => (
        <span key={id}>{i ? "; " : ""}{n(id)} {fresh.changes[id].map((ch, j) => (
          <span key={`${ch.patch}${j}`}>{j ? ", " : ""}<Link href={ch.href}>{patchLabel(ch.patch)}{ch.via ? " (system)" : ch.category ? ` ${ch.category}` : ""}</Link></span>
        ))}</span>
      ))}
    </>
  );
}

// ---------- Pro meta (starting picks) ----------

/**
 * The games behind a row's pro meta counts (lib/starting-picks.ts): presence on the patch, picks in the role, first
 * rotation from each team's recorded pick order, and blind / response only where the pick-order engine read it. Every
 * game links to its Pro Drafts view with that player's build open.
 */
export function MetaEvidenceTrigger({ s, label, cls, names }: { s: StartingPick; label: string; cls: string; names: Record<string, string> }) {
  const n = (id: string) => names[id] ?? id;
  return (
    <Popover label={`Pro meta evidence for ${n(s.champion)}`} triggerClass={`sig ${cls}`} className="pe" trigger={label}>
      {({ mode, pin }) => <MetaEvidenceBody s={s} n={n} pinned={mode !== "hover"} pin={pin} />}
    </Popover>
  );
}

function MetaEvidenceBody({ s, n, pinned, pin }: { s: StartingPick; n: (id: string) => string; pinned: boolean; pin: () => void }) {
  const [all, setAll] = useState(false);
  const role = ROLE_SHORT[s.role];
  const shown = all ? s.games : s.games.slice(0, HOVER_GAMES);
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const unclassified = s.games.length - s.classified;
  return (
    <div className={`pe-card ${all ? "all" : ""}`}>
      <header className="pop-head">
        <span className="pop-title pro">Pro meta · {role}</span>
        <span className="mono">{patchLabel(s.patch)}</span>
      </header>
      <dl className="pop-kv">
        <dt>Presence</dt>
        <dd>{s.presence == null ? "—" : <><span className="mono">{pct(s.presence)}</span> of <span className="mono">{s.banGames}</span> games · {plural(s.picks, "pick")}, {plural(s.bans, "ban")} (bans are champion-wide)</>}{s.low ? " · small sample" : ""}</dd>
        <dt>{role} picks</dt>
        <dd>{s.rolePicks != null ? <span className="mono">{s.rolePicks}</span> : "Champion-wide only: the tournament table doesn't split picks by role"}</dd>
        <dt>First rotation</dt>
        <dd>{s.ordered ? <><span className="mono">{s.firstRotation} of {s.ordered}</span> recorded {role.toLowerCase()} picks were in the team&apos;s first three picks</> : "No pick order recorded"}</dd>
        <dt>First overall</dt>
        <dd>{s.firstOverall == null ? "Not verifiable: the game page doesn't mark which team picked first" : <span className="mono">{s.firstOverall} of {s.games.length}</span>}</dd>
        <dt>Blind / response</dt>
        <dd>{s.blind == null ? (s.role === "TOP" ? "No game where it can be told apart (order or role unclear)" : "Only top picks are classified so far")
          : <><span className="mono">{s.blind}</span> blind · <span className="mono">{s.response}</span> response{unclassified ? <> · <span className="mono">{unclassified}</span> unclassified</> : null}</>}</dd>
      </dl>
      {shown.length > 0 && <ol className="pe-games">{shown.map((g) => <MetaGame key={g.draftId} g={g} s={s} n={n} />)}</ol>}
      {!s.games.length && <p className="pop-sub">Tournament table only: no game records, so no pick order or games to list.</p>}
      <footer className="pop-foot">
        <span>Observed pro evidence on one patch, never a score. Early or blind picks are not proof of blind safety.</span>
        {s.games.length > HOVER_GAMES && (
          <button type="button" className="btn sm" onClick={() => { pin(); setAll((v) => !v); }}>{all ? "Show fewer" : `View all ${s.games.length} games`}</button>
        )}
        {!pinned && s.games.length <= HOVER_GAMES && <span className="faint">Click to keep open</span>}
      </footer>
    </div>
  );
}

function MetaGame({ g, s, n }: { g: StartGame; s: StartingPick; n: (id: string) => string }) {
  const meta = [shortDate(g.date), g.stage, `Game ${g.gameNo}`, `${g.side === "blue" ? "Blue" : "Red"} side`,
    g.teamPick ? `team pick ${g.teamPick} of 5${g.teamPick <= FIRST_ROTATION ? " (first rotation)" : ""}` : undefined].filter(Boolean);
  const r = g.read;
  const situation = !r ? undefined : r.situation === "blind" ? `Blind: the enemy ${ROLE_SHORT[s.role].toLowerCase()} wasn't revealed yet`
    : r.situation === "response" ? `Response: picked after ${r.laneOpponent ? n(r.laneOpponent) : "the enemy pick"} was revealed (not proof of a counter)` : "Blind or response can't be verified for this pick";
  return (
    <li className="pe-game">
      <div className="pe-game-head">
        <span className="pe-teams"><b>{g.team}</b><span className="muted"> vs {g.opponent}</span></span>
        <span className={`pe-res ${g.won ? "win" : "loss"}`}>{g.won ? "Win" : "Loss"}</span>
      </div>
      <div className="pe-meta">
        <span>{meta.join(" · ")}</span>
        <span className="row tight">
          <Link href={`/pro-drafts?id=${g.draftId}&build=${encodeURIComponent(`${g.draftId}:${s.role}`)}`}>Draft and build</Link>
          <a href={g.url} target="_blank" rel="noopener noreferrer">Gol.gg<span aria-hidden="true"> ↗</span></a>
        </span>
      </div>
      {situation && <p className="pe-why">{situation}{r?.firstOverall ? " · first overall pick" : ""}</p>}
      {r?.revealed && r.revealed.length > 0 && (
        <p className="pe-why vs">Enemy picks visible: {r.revealed.map(n).join(", ")}</p>
      )}
    </li>
  );
}
