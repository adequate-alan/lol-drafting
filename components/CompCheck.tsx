"use client";

// Comp Check: the deterministic comp diagnosis from lib/model-v2/analyze.ts (General Draft Logic layer). Identity,
// win condition, the top weak points, what the active open role should bring, and the timing curve up front; the
// numeric detail, the remaining reads and the old rule checks behind "Full analysis". Pro evidence never feeds it.
import { useMemo, type ReactNode } from "react";
import { analyze, bestFix, CONFIDENCE_LABEL, IDENTITY_LABEL, SIEGE_LABEL, type Insight } from "@/lib/model-v2/analyze";
import type { Draft } from "@/lib/model-v2/analyze";
import { convertKits } from "@/lib/model-v2/kits";
import type { BotPairing, Champion, Role } from "@/lib/schema";
import { SourceBadge } from "./ui";
import { compSummary, summaryText } from "@/lib/comp-summary";
import { scrollBehavior } from "@/lib/motion";

const SEVERITY = { major: "Major", moderate: "Moderate", minor: "Minor" } as const;

function Point({ w, open = false }: { w: Insight; open?: boolean }) {
  return (
    <details className={`cc-point ${w.severity}`} open={open}>
      <summary><span className={`sev ${w.severity}`}>{SEVERITY[w.severity]}</span>{w.label}</summary>
      <p>{w.text}</p>
    </details>
  );
}

export interface SiegeCell { value: string; title: string }

export function CompCheck({ draft, enemyIds, champions, botPairings, active, bestOverall, bestFixId, proIds = [], names, grid, children }: {
  draft: Draft; enemyIds: string[]; champions: Champion[]; botPairings: BotPairing[]; active?: Role; bestOverall?: string;
  bestFixId?: string; // the ranking's best fix, so the rail and the list name the same champion
  proIds?: string[]; // candidates the list already shows through their pro games: not repeated as theoretical
  names: Record<string, string>; grid?: (siege: SiegeCell, disengage: SiegeCell) => ReactNode; children?: ReactNode;
}) {
  const kits = useMemo(() => convertKits(champions), [champions]);
  // The enemy list is rebuilt on every Draft Room render; key the reads on its contents.
  const vs = enemyIds.join(",");
  const r = useMemo(() => analyze(draft, kits, enemyIds), [draft, kits, vs]);
  const fix = useMemo(() => (active && r.confidence !== "none" ? bestFix(active, draft, kits, botPairings, enemyIds) : null), [active, r.confidence, draft, kits, botPairings, vs]);
  const locked = Object.values(draft).filter(Boolean) as string[];
  const noKit = locked.filter((id) => !kits.some((k) => k.id === id));
  const needs = active ? (r.roleNeeds[active] ?? []).slice(0, 3) : [];
  const best = (bestFixId && fix?.fixes.find((c) => c.champion === bestFixId)) || fix?.fixes.find((c) => c.fixScore > 0);
  const opportunities = r.versus.filter((v) => v.kind === "opportunity");
  const sg = r.facts.siege;
  const siege: SiegeCell = !r.facts.n ? { value: "—", title: "No picks yet" } : {
    value: SIEGE_LABEL(sg.score),
    title: `Siege ${sg.score}/3 · structure pressure ${sg.pressure}${sg.sources.length ? ` (${sg.sources.map((s) => s.c.name).join(", ")})` : ""} · range ${sg.reach} · waveclear ${sg.clear} · poke ${sg.poke} · disengage ${sg.safety}`,
  };
  const disengage: SiegeCell = !r.facts.n ? { value: "—", title: "No picks yet" }
    : { value: String(Math.round(r.facts.disengage)), title: `Team total disengage from kits · counter-engage ${Math.round(r.facts.counterEngage)}` };
  const identities = r.identity.all.filter((i) => i.score > 0).sort((a, b) => b.score - a.score);

  return (
    <aside className="comp-check" id="comp-check" aria-label="Comp Check" tabIndex={-1}>
      <div className="cc-head">
        <h2>Comp Check</h2>
        <span className="cc-head-tags">
          {r.confidence !== "none" && <span className={`cc-conf ${r.confidence}`}>{CONFIDENCE_LABEL[r.confidence]}</span>}
          <SourceBadge layer="logic" />
        </span>
      </div>
      {noKit.length > 0 && (
        <p className="xs muted">{noKit.map((id) => names[id] ?? id).join(", ")}: kit not reviewed yet, so Comp Check counts nothing from {noKit.length === 1 ? "this pick" : "these picks"}.</p>
      )}

      {r.confidence === "none" ? <p className="xs muted">{r.facts.n ? "The full read starts at two picks." : "Lock a pick to start."}</p> : (
        <>
          <div className="cc-section cc-identity">
            <div className="cc-label">Identity</div>
            <p className="cc-headline">{r.headline}</p>
            {r.winCondition && <p className="cc-win">{r.winCondition}</p>}
          </div>

          <div className="cc-section">
            <div className="cc-label">Weak points</div>
            {!r.weakPoints.length ? <p className="cc-ok">{r.confidence === "early" ? "Nothing major yet." : "None found."}</p>
              : r.weakPoints.map((w, i) => <Point key={w.id} w={w} open={i === 0 && w.severity === "major"} />)}
          </div>

          {active && (
            <div className="cc-section">
              <div className="cc-label">{active.charAt(0) + active.slice(1).toLowerCase()} needs</div>
              {!needs.length ? <p className="xs muted">Nothing specific; take the best fit.</p> : (
                // The weak point above already names the cause; repeat it under a need only when it adds something
                <ol className="cc-needs">{needs.map((n) => <li key={n.id} title={n.because}><b>{n.label}</b>{!r.weakPoints.some((w) => w.label === n.because) && <span>{n.because}</span>}</li>)}</ol>
              )}
              {(best || bestOverall) && (
                <div className="cc-picks">
                  {best && <div><span className="k">Best fix</span><b>{names[best.champion] ?? best.champion}</b><span className="t">{best.fixes.map((f) => f.label).join(", ")}{best.tradeoffs.length ? ` · costs: ${best.tradeoffs.join("; ")}` : ""}</span></div>}
                  {bestOverall && <div><span className="k">Best overall</span><b>{names[bestOverall] ?? bestOverall}</b><span className="t">Top of the recommendation list</span></div>}
                  {fix?.restricted && fix.theoretical.some((c) => !proIds.includes(c.champion)) && (
                    <div className="theory"><span className="k">Theoretical</span><span className="t">{fix.theoretical.filter((c) => !proIds.includes(c.champion)).slice(0, 4).map((c) => names[c.champion] ?? c.champion).join(", ")}: outside {names[draft.BOT!] ?? draft.BOT}&apos;s saved supports, not recommended</span></div>
                  )}
                </div>
              )}
            </div>
          )}

          {grid?.(siege, disengage)}

          {r.timing && (
            <div className="cc-section">
              <div className="cc-label">Timing</div>
              <div className="cc-timing">
                {(["early", "mid", "late"] as const).map((k) => (
                  <div key={k} className="cc-phase"><span className="cc-k">{k[0].toUpperCase() + k.slice(1)}</span><span className="cc-v">{r.timing![k]}/5</span>
                    <span className="cc-bar"><span style={{ width: `${r.timing![k] * 20}%` }} /></span></div>
                ))}
              </div>
              <p className="xs muted">{r.timing.text}</p>
            </div>
          )}
        </>
      )}

      {r.confidence === "none" && r.facts.n > 0 && grid?.(siege, disengage)}

      <details className="cc-section cc-more">
        <summary>Full analysis</summary>
        {r.more.length > 0 && <div className="cc-section"><div className="cc-label">More weak points</div>{r.more.map((w) => <Point key={w.id} w={w} />)}</div>}
        {opportunities.length > 0 && <div className="cc-section"><div className="cc-label">Into the enemy</div>{opportunities.map((w) => <p key={w.id} className="xs"><b>{w.label}.</b> {w.text}</p>)}</div>}
        {identities.length > 0 && (
          <div className="cc-section"><div className="cc-label">Identity scores</div>
            <ul className="cc-scores">{identities.map((i) => <li key={i.id} title={i.because}><span>{IDENTITY_LABEL[i.id]}</span><span className="cc-v">{i.score.toFixed(1)}</span></li>)}</ul>
          </div>
        )}
        {children}
      </details>
    </aside>
  );
}

/** Narrow screens, where the rail sits below the list: one line naming what the draft is missing; tap to jump to the
 *  full Comp Check. Same analysis, nothing added. */
export function CompSummaryLine({ draft, enemyIds, champions, active, className = "" }: {
  draft: Draft; enemyIds: string[]; champions: Champion[]; active?: Role; className?: string;
}) {
  const kits = useMemo(() => convertKits(champions), [champions]);
  const vs = enemyIds.join(",");
  const r = useMemo(() => analyze(draft, kits, enemyIds), [draft, kits, vs]);
  const s = compSummary(r, active);
  const line = summaryText(s);
  const jump = () => {
    const el = document.getElementById("comp-check");
    el?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    el?.focus({ preventScroll: true });
  };
  return (
    <button type="button" className={`cc-summary ${s.state} ${className}`} onClick={jump} title={s.weak ? `${s.weak.label}: ${s.weak.text}` : line}
      aria-label={`Comp Check: ${line}${s.state === "early" ? " (early read)" : ""}. Open the full Comp Check`}>
      <span className="cc-sum-k">Comp Check</span>
      {s.state === "early" && <span className="cc-sum-tag">Early read</span>}
      <span className="cc-sum-t truncate">
        {s.state === "none" ? <span className="muted">{line}</span> : s.clean ? <span className="cc-sum-ok">{line}</span> : <>
          {s.needs.length > 0 && <span>Needs <b>{s.needs.map((n, i) => (i ? n.toLowerCase() : n)).join(" + ")}</b></span>}
          {s.needs.length > 0 && s.weak && <span className="sep"> · </span>}
          {s.weak && <span className={`cc-sum-weak ${s.weak.severity}`}>{s.weak.label}</span>}
        </>}
      </span>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M3.5 2 6.5 5 3.5 8" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
    </button>
  );
}
