"use client";

// Comp Check: the plan-aware comp diagnosis from lib/model-v2/plan.ts (General Draft Logic layer; the default since
// alan's approval, 2026-10-14). The plan and its jobs, critical gaps, weaknesses and accepted tradeoffs, what the open
// role should bring, and the timing curve up front; enemy opportunities and identity scores behind "Full analysis".
// Explanatory only: pro evidence never feeds it and it never feeds a score.
import { useMemo, type ReactNode } from "react";
import { analyze, bestFix, CONFIDENCE_LABEL, IDENTITY_LABEL, SIEGE_LABEL, type Insight } from "@/lib/model-v2/analyze";
import type { Draft } from "@/lib/model-v2/analyze";
import { convertKits } from "@/lib/model-v2/kits";
import { analyzePlan, type PlanFinding, type PlanRead } from "@/lib/model-v2/plan";
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

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const roleName = (r: Role) => r.charAt(0) + r.slice(1).toLowerCase();
const tierLabel = (w: PlanFinding, open: Role | null) =>
  w.tier === "critical" ? "Critical" : w.tier === "needed" ? `Needed from the ${open ? roleName(open).toLowerCase() : "last pick"}`
    : w.tier === "accepted" ? "Accepted" : w.severity === "minor" ? "Minor" : "Weakness";
const tierSev = (w: PlanFinding) => (w.tier === "critical" ? "major" : w.tier === "accepted" || w.severity === "minor" ? "minor" : "moderate");
const list = (xs: string[]) => (xs.length > 4 ? `${xs.slice(0, 4).join(", ")} and ${xs.length - 4} more` : xs.length > 1 ? `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}` : xs[0]);
const fixersText = (w: PlanFinding) => w.fixers?.length ? `${list(w.fixers)} ${w.fixers.length === 1 ? "closes" : "close"} it.`
  : w.theoretical?.length ? `Only supports outside the bot's saved supports close it (theoretical): ${list(w.theoretical)}.` : "";
// Picks that remove the gap only by changing what the comp is: named apart, never as a fix.
const switchText = (w: PlanFinding) => w.switches?.length ? ` Not a fix, a different plan: ${list(w.switches)} would turn the comp into another plan without a critical gap.` : "";

function Exposure({ w }: { w: PlanFinding }) {
  if (w.exposure === "exploited") return <span className="cc-exposure exploited">Against this enemy: {w.against}.</span>;
  if (w.exposure === "less-relevant") return <span className="cc-exposure">Matters less here: {w.against}.</span>;
  return null;
}

function PlanPoint({ w, open }: { w: PlanFinding; open: Role | null }) {
  const sev = tierSev(w);
  return (
    <details className={`cc-point ${sev}`}>
      <summary><span className={`sev ${sev}`}>{tierLabel(w, open)}</span>{w.label}</summary>
      <p>{w.why}{w.tier === "needed" ? ` ${fixersText(w)}` : ""}{switchText(w)}</p>
      <Exposure w={w} />
    </details>
  );
}

export interface SiegeCell { value: string; title: string }

/** The plan read, computed once per board for every Comp Check surface (rail, phone line, header badge), so they
 *  always describe the same comp. */
export function usePlanRead(draft: Draft, enemyIds: string[], champions: Champion[], botPairings: BotPairing[]): PlanRead {
  const kits = useMemo(() => convertKits(champions), [champions]);
  const vs = enemyIds.join(",");
  return useMemo(() => analyzePlan(draft, kits, enemyIds, botPairings), [draft, kits, vs, botPairings]);
}

/** Which Comp Check grid cells the plan read flags, with the reason: a real (not accepted, not minor) finding that
 *  asks for that kind of champion. The grid's numbers are kit facts; only this read colours them. */
const CELL_NEEDS: Record<string, string[]> = {
  Engage: ["engage", "fight-start"], Frontline: ["frontline", "second-frontline"], Peel: ["peel"], Disengage: ["disengage"],
  "AD / AP": ["magic", "physical"], Sustained: ["sustained"],
};
export function planFlags(p: PlanRead): Record<string, string> {
  const out: Record<string, string> = {};
  if (p.confidence === "none") return out;
  for (const w of [...p.weaknesses, ...p.more]) {
    if (w.tier === "weakness" && w.severity === "minor") continue;
    for (const [cell, ids] of Object.entries(CELL_NEEDS)) if (!out[cell] && w.fixes.some((f) => ids.includes(f))) out[cell] = `${w.label}: ${w.why}`;
  }
  return out;
}

/** Draft Room header badge: the plan read's own count, never a separate rule set. */
export function CompStatus({ read: p }: { read: PlanRead }) {
  if (p.confidence === "none" || p.picks < 2) return null;
  const real = [...p.weaknesses, ...p.more];
  const needed = real.filter((w) => w.tier === "needed").length;
  const weak = real.filter((w) => w.tier === "weakness" && w.severity !== "minor").length;
  // A pick without a kit: the read is incomplete, so it never says the comp is clean (alan, 2026-10-16).
  const partial = p.unread.length > 0 && <span className="badge">Incomplete read</span>;
  if (!p.critical.length && !needed && !weak) return partial || <span className="badge success">No major weak points</span>;
  return (
    <span className="row tight">
      {partial}
      {p.critical.length > 0 && <span className="badge danger">{p.critical.length} critical</span>}
      {needed > 0 && <span className="badge caution">{needed} needed</span>}
      {weak > 0 && <span className="badge caution">{weak} {weak === 1 ? "weakness" : "weaknesses"}</span>}
    </span>
  );
}

/** The Comp Check (alan, 2026-10-14: the plan-aware read is the default): does the comp have what its own win
 *  condition needs? Plan jobs, critical gaps, weaknesses, accepted tradeoffs, what the open role should bring, and
 *  enemy-exposure tags. Explanatory only: it never feeds a score. Best fix / Best overall come from the
 *  recommendation ranking and say so. `legacy` (?legacy=1, a debugging switch) adds the previous rule list. */
export function CompCheck({ read: p, legacy = false, draft, enemyIds, champions, botPairings, active, bestOverall, bestFixId, proIds = [], names, grid, children }: {
  read: PlanRead; legacy?: boolean; draft: Draft; enemyIds: string[]; champions: Champion[]; botPairings: BotPairing[]; active?: Role; bestOverall?: string;
  bestFixId?: string; // the ranking's best fix, so the rail and the list name the same champion
  proIds?: string[]; // candidates the list already shows through their pro games: not repeated as theoretical
  names: Record<string, string>; grid?: (siege: SiegeCell, disengage: SiegeCell) => ReactNode; children?: ReactNode;
}) {
  const kits = useMemo(() => convertKits(champions), [champions]);
  // The enemy list is rebuilt on every Draft Room render; key the reads on its contents.
  const vs = enemyIds.join(",");
  // The comp facts (grid, timing, identity scores) and the ranking's best fix come from the general engine; the
  // diagnosis itself is the plan read.
  const r = useMemo(() => analyze(draft, kits, enemyIds), [draft, kits, vs]);
  const fix = useMemo(() => (active && r.confidence !== "none" ? bestFix(active, draft, kits, botPairings, enemyIds) : null), [active, r.confidence, draft, kits, botPairings, vs]);
  const needs = active ? (p.roleNeeds[active] ?? []).slice(0, 3) : [];
  const best = (bestFixId && fix?.fixes.find((c) => c.champion === bestFixId)) || fix?.fixes.find((c) => c.fixScore > 0);
  const opportunities = r.versus.filter((v) => v.kind === "opportunity");
  // A missing plan job is on the job list with its reason; the points below are everything else.
  const points = [...p.weaknesses, ...p.more].filter((w) => w.source !== "plan");
  const jobFinding = (id: string) => [...p.weaknesses, ...p.more].find((w) => w.id === `plan:${id}`);
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
          {p.confidence !== "none" && <span className={`cc-conf ${p.confidence}`}>{CONFIDENCE_LABEL[p.confidence]}</span>}
          <SourceBadge layer="logic" />
        </span>
      </div>
      {p.unread.length > 0 && <p className="xs muted cc-unread">{unreadText(p, names)}</p>}

      {p.confidence === "none" ? <p className="xs muted">{r.facts.n ? "The full read starts at two picks." : "Lock a pick to start."}</p> : (
        <>
          <div className="cc-section cc-identity">
            <div className="cc-label">Plan</div>
            <p className="cc-headline">{p.headline}</p>
            {p.winCondition && <p className="cc-win">{p.winCondition}</p>}
            {p.enemyRead !== "none" && <p className="xs muted">Read from your picks; the {p.enemyRead === "full" ? "" : "revealed "}enemy picks only mark which gaps they can exploit.</p>}
            {p.plan && (
              <ul className="cc-jobs" aria-label={`${p.plan.label} needs`}>{p.plan.jobs.map((j) => {
                const w = jobFinding(j.id);
                const state = j.met ? "met" : j.unread ? "unread" : w?.tier === "needed" ? "needed" : "missing";
                return (
                  <li key={j.id} className={state}><span aria-hidden="true">{j.met ? "✓" : state === "unread" ? "?" : state === "needed" ? "○" : "✗"}</span><span className="sr-only">{j.met ? "Has" : state === "unread" ? "Not read yet" : state === "needed" ? "Needed from the last pick" : "Missing"}: </span>{j.label}
                    {state === "unread" && <span className="t">Not read yet: {j.unread!.map((id) => names[id] ?? id).join(" or ")} could be doing this.</span>}
                    {!j.met && state !== "unread" && <span className="t">{cap(j.missing)}.{w && state === "needed" ? ` ${tierLabel(w, p.open)}: ${fixersText(w)}` : ""}{w ? switchText(w) : ""}</span>}
                    {w && <Exposure w={w} />}
                  </li>
                );
              })}</ul>
            )}
          </div>

          <div className="cc-section">
            <div className="cc-label">Weak points</div>
            {!points.length ? <p className="cc-ok">{p.weaknesses.length ? "Nothing beyond the plan's missing jobs." : p.unread.length === 1 ? `No weak point stands whoever plays ${p.unread[0].role.toLowerCase()}.` : p.unread.length ? "No weak point is shown until every pick is read." : p.confidence === "early" ? "Nothing blocks the plan yet." : "Nothing blocks the plan."}</p>
              : points.slice(0, 3).map((w) => <PlanPoint key={w.id} w={w} open={p.open} />)}
            {points.length > 3 && <details className="cc-more"><summary>{points.length - 3} more {points.length === 4 ? "point" : "points"}</summary>{points.slice(3).map((w) => <PlanPoint key={w.id} w={w} open={p.open} />)}</details>}
            {p.accepted.length > 0 && <details className="cc-more"><summary>Accepted tradeoffs ({p.accepted.length})</summary>{p.accepted.map((w) => <PlanPoint key={w.id} w={w} open={p.open} />)}</details>}
          </div>

          {active && (
            <div className="cc-section">
              <div className="cc-label">{roleName(active)} should bring</div>
              {!needs.length ? <p className="xs muted">Nothing specific; take the best fit.</p> : (
                <ol className="cc-needs">{needs.map((n) => <li key={n.id}><b>{n.label}</b><span>{n.because}</span></li>)}</ol>
              )}
              {(best || bestOverall) && (
                <div className="cc-picks">
                  {/* Scored by the recommendation ranking (General Draft Logic rules), not by the plan read above. */}
                  <p className="xs muted">From the recommendation ranking</p>
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

      {p.confidence === "none" && r.facts.n > 0 && grid?.(siege, disengage)}

      <details className="cc-section cc-more">
        <summary>Full analysis</summary>
        {opportunities.length > 0 && <div className="cc-section"><div className="cc-label">Into the enemy</div>{opportunities.map((w) => <p key={w.id} className="xs"><b>{w.label}.</b> {w.text}</p>)}</div>}
        {identities.length > 0 && (
          <div className="cc-section"><div className="cc-label">Identity scores</div>
            <ul className="cc-scores">{identities.map((i) => <li key={i.id} title={i.because}><span>{IDENTITY_LABEL[i.id]}</span><span className="cc-v">{i.score.toFixed(1)}</span></li>)}</ul>
          </div>
        )}
        {legacy && (
          <div className="cc-section"><div className="cc-label">Previous Comp Check rules (debug, ?legacy=1)</div>
            <p className="xs muted">{r.headline}</p>
            {[...r.weakPoints, ...r.more].map((w) => <Point key={w.id} w={w} />)}
          </div>
        )}
        {children}
      </details>
    </aside>
  );
}

/** Why the read is incomplete and what was left out: a pick without a kit is never read as an empty slot. */
export function unreadText(p: PlanRead, names: Record<string, string>): string {
  const who = p.unread.map((u) => names[u.id] ?? u.id);
  const one = who.length === 1;
  const list = who.join(" and ");
  const left = p.withheld ? ` ${p.withheld} possible ${p.withheld === 1 ? "gap" : "gaps"} ${one ? `${list} could be covering ${p.withheld === 1 ? "is" : "are"}` : `${p.withheld === 1 ? "is" : "are"}`} left out.` : "";
  const kept = one ? ` Gaps shown stay whoever plays ${p.unread[0].role.toLowerCase()}.` : " No gap is shown until they are read.";
  return `${list} ${one ? "has" : "have"} no kit yet, so this read is incomplete.${left}${kept}`;
}

/** Narrow screens, where the rail sits below the list: one line naming what the draft is missing; tap to jump to the
 *  full Comp Check. Same analysis, nothing added. */
export function CompSummaryLine({ read: p, active, className = "" }: { read: PlanRead; active?: Role; className?: string }) {
  // The same plan read as the rail (usePlanRead), so the line and the full Comp Check describe one comp.
  const s = compSummary(p, active);
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
      {s.incomplete && <span className="cc-sum-tag">Incomplete</span>}
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
