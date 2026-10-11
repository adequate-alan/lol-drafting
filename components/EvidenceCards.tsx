"use client";
// Draft Room evidence popovers, all on the shared <Popover> foundation (components/Popover.tsx). Each layer keeps its
// own content and colour: Pro evidence (muted teal), Counter (oxblood), comp-fit breakdown (neutral logic).
//
// Pro evidence answers "who played it, against what, what happened" from the recorded games only (lib/pro-evidence.ts).
// Results, sides, enemy drafts and source status appear only when recorded; pick order never is, so no game is shown
// as a draft response. A champion on the other team is an observed matchup, never a counter.
import { useState } from "react";
import { describePro, type Counter } from "@/lib/counters";
import { shortDate } from "@/lib/evidence";
import { evidenceGames, type EvidenceGame, type Picks } from "@/lib/pro-evidence";
import { ROLES, type ProDraft, type Role, type Source } from "@/lib/schema";
import type { ProSuggestion } from "@/lib/suggest";
import { ChampIcon } from "./ChampIcon";
import { Popover } from "./Popover";

const ROLE_SHORT: Record<Role, string> = { TOP: "Top", JUNGLE: "Jungle", MID: "Mid", BOT: "Bot", SUPPORT: "Support" };
const HOVER_GAMES = 3; // games shown before "View all"
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const list = (xs: string[]) => (xs.length < 3 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

export interface ProCtx { drafts: ProDraft[]; sources: Record<string, Source>; enemy: Partial<Record<Role, string>>; names: Record<string, string> }

export function ProEvidenceTrigger({ pro, champion, role, ctx }: { pro: ProSuggestion; champion: string; role: Role; ctx: ProCtx }) {
  const name = ctx.names[champion] ?? champion;
  return (
    <Popover label={`Pro evidence for ${name}`} triggerClass="sig pro" className="pe" trigger={<>Pro · {plural(pro.score, "game")}</>}>
      {({ mode, pin }) => <ProEvidenceBody pro={pro} champion={champion} role={role} ctx={ctx} pinned={mode !== "hover"} pin={pin} />}
    </Popover>
  );
}

function ProEvidenceBody({ pro, champion, role, ctx, pinned, pin }: {
  pro: ProSuggestion; champion: string; role: Role; ctx: ProCtx; pinned: boolean; pin: () => void;
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
      {groups.map((grp, i) => (
        <section key={`${grp.event}-${grp.patch}-${i}`} className="pe-event">
          <h4 className="pe-event-name">{grp.event}{grp.patch && <span className="mono"> {grp.patch}</span>}{ongoing.has(grp.event) && <span className="faint"> · ongoing</span>}</h4>
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

export function CounterTrigger({ c, names }: { c: Counter; names: Record<string, string> }) {
  const n = (id: string) => names[id] ?? id;
  const e = c.evidence;
  return (
    <Popover label={`Counter evidence for ${n(c.champion)}`} triggerClass="sig counter" className="ce" trigger="Counter">
      {() => (
        <div className="ce-card">
          <header className="pop-head"><span className="pop-title counter">Counter</span><span>{STRENGTH[c.strength]}</span></header>
          <p className="pop-sub">{n(c.champion)} into {list(e.vs.map(n))}{e.with ? ` with ${n(e.with)}` : ""}: a statistically favourable {e.scope === "duo" ? "duo" : "lane"} matchup.</p>
          <dl className="pop-kv">
            <dt>Matchup</dt><dd><a href={e.url} target="_blank" rel="noopener noreferrer" title={`DPM.LOL, updated ${e.updated}`}>DPM.LOL</a> <span className="mono">{(e.winRate * 100).toFixed(1)}%</span> over <span className="mono">{e.games.toLocaleString("en-US")}</span> games · <span className="mono">{e.patch}</span>{e.rank ? ` · ${e.rank}` : ""}</dd>
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

