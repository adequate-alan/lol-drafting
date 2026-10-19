"use client";
// Candidate preview and comparison for the Draft Room's open role (alan, 2026-10-19; lib/candidate-preview.ts). The
// plan read of each candidate is General Draft Logic, shown in neutral styling; Synergy, Pro and Counter keep their own
// labels and evidence cards, copied from the candidate row and never recomputed. Nothing here locks except a Lock button.
import { Fragment, type ReactNode } from "react";
import { compareGaps, gapText, improvements, isCritical, planText, ruleGaps, type Gap, type PreviewEffect } from "@/lib/candidate-preview";
import type { Candidate } from "@/lib/candidates";
import { tierLabel } from "@/lib/counters";
import type { Tier } from "@/lib/pool-stats";
import { rotationLabel } from "@/lib/starting-picks";
import { ChampIcon } from "./ChampIcon";
import { CounterTrigger, MetaEvidenceTrigger, ProEvidenceTrigger, type ProCtx } from "./EvidenceCards";

const STATUS = { default: "Preferred", alt: "Alt", fits: "Fits" } as const;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** The candidate's Synergy label, as its row shows it. */
export function synergyText(c: Candidate): string | undefined {
  const r = c.fit;
  if (r.eligible && r.saved) return r.savedFromPro ? "Alt (pro)" : `Saved · ${STATUS[r.saved]}`;
  if (r.eligible && r.proposed) return "Proposed";
  return undefined;
}

function Gaps({ gaps, words = [] }: { gaps: Gap[]; words?: string[] }) {
  const all = [...words.map((w) => ({ text: w, crit: false })), ...gaps.map((g) => ({ text: gapText(g), crit: isCritical(g) }))];
  return <>{all.map((g, i) => <Fragment key={g.text}>{i > 0 && ", "}<span className={g.crit ? "crit" : undefined}>{g.text}{g.crit ? " (critical)" : ""}</span></Fragment>)}</>;
}

/** What the candidate does to the plan read: plan kept or shifted, what it adds or fixes, what stays or appears. */
export function EffectList({ e }: { e: PreviewEffect }) {
  if (e.plan.kind === "none") return <p className="xs muted">The comp read starts at two picks.</p>;
  const fixes = ruleGaps(e.fixed), open = ruleGaps(e.open), made = ruleGaps(e.created);
  return (
    <dl className="cmp-effect">
      <dt>Plan</dt><dd>{planText(e)}</dd>
      {(e.adds.length > 0 || fixes.length > 0) && <><dt>Improves</dt><dd className="good"><Gaps gaps={fixes} words={e.adds} /></dd></>}
      {(e.missing.length > 0 || open.length > 0) && <><dt>Still open</dt><dd><Gaps gaps={open} words={e.missing} /></dd></>}
      {made.length > 0 && <><dt>Creates</dt><dd className="bad"><Gaps gaps={made} /></dd></>}
      {e.dropped.length > 0 && <><dt>Plan change</dt><dd className="muted">No longer needs {e.dropped.map((g) => lower(gapText(g))).join(", ")}: a different plan, not a fix</dd></>}
    </dl>
  );
}

/** The Comp Check rail's preview: the real read stays above it; this is the board with the candidate, not locked. */
export function PreviewBlock({ name, effect, busy, compared, full, onLock, onCompare }: {
  name: string; effect?: PreviewEffect; busy: boolean; compared: boolean; full: boolean; onLock: () => void; onCompare: () => void;
}) {
  return (
    <div className={`cc-section cc-preview ${busy ? "busy" : ""}`.trim()} aria-live="polite" aria-busy={busy || undefined}>
      <div className="cc-label"><span className="preview-tag">Preview · not locked</span> {name}</div>
      {effect ? <EffectList e={effect} /> : <p className="xs muted">Reading…</p>}
      <div className="cmp-actions">
        <button type="button" className="btn sm primary" onClick={onLock}>Lock {name}</button>
        <button type="button" className="btn sm" aria-pressed={compared} disabled={!compared && full} onClick={onCompare}
          title={!compared && full ? "Three candidates are being compared: remove one first" : undefined}>{compared ? "Comparing" : "Compare"}</button>
      </div>
    </div>
  );
}

export interface CompareEntry { c: Candidate; e?: PreviewEffect; tier: Tier | null }

/** Up to three candidates side by side: how each changes the comp, what only it brings and what choosing it gives up,
 *  then its Synergy, Pro, Counter and pool labels. Rows that read the same for every candidate are muted. */
export function ComparePanel({ entries, names, proCtx, busy, collapsed, onCollapse, onLock, onRemove, onClear, onOpen }: {
  entries: CompareEntry[]; names: Record<string, string>; proCtx: ProCtx; busy: boolean; collapsed: boolean;
  onCollapse: (v: boolean) => void; onLock: (id: string) => void; onRemove: (id: string) => void; onClear: () => void; onOpen: (id: string) => void;
}) {
  const n = (id: string) => names[id] ?? id;
  const head = (
    <div className="cmp-head">
      <span className="cmp-title">Comparing {entries.length}</span>
      <span className="cmp-names truncate">{entries.map((x) => n(x.c.champion)).join(", ")}</span>
      {entries.length > 1 && <button type="button" className="btn sm ghost" aria-expanded={!collapsed} onClick={() => onCollapse(!collapsed)}>{collapsed ? "Show" : "Hide"}</button>}
      <button type="button" className="btn sm ghost" onClick={onClear}>Clear</button>
    </div>
  );
  if (entries.length < 2 || collapsed) return (
    <div className="cmp cmp-folded" aria-label="Candidate comparison">
      {head}
      {entries.length < 2 && <p className="xs muted cmp-hint">Preview another candidate and choose Compare (or press C) to see them side by side.</p>}
    </div>
  );

  const effects = entries.flatMap((x) => (x.e ? [x.e] : []));
  const gaps = compareGaps(effects);
  const read = effects.some((e) => e.plan.kind !== "none");
  const rows: { k: string; cells: (x: CompareEntry) => { text: string; node?: ReactNode; cls?: string } }[] = [];
  const effectRow = (k: string, f: (e: PreviewEffect) => { text: string; node?: ReactNode; cls?: string }) =>
    rows.push({ k, cells: (x) => (x.e ? f(x.e) : { text: "…", cls: "muted" }) });
  const list = (xs: string[], cls?: string) => ({ text: xs.join(", ") || "—", cls: xs.length ? cls : "muted" });
  if (read) {
    effectRow("Plan", (e) => ({ text: planText(e), cls: e.plan.kind === "keeps" ? "good" : undefined }));
    effectRow("Improves", (e) => list(improvements(e), "good"));
    effectRow("Still open", (e) => list([...e.missing, ...ruleGaps(e.open).map(gapText)]));
    effectRow("Creates", (e) => list(ruleGaps(e.created).map(gapText), "bad"));
    if (entries.length > 1) {
      effectRow("Only this one", (e) => list(gaps[e.champion]?.only ?? [], "good"));
      effectRow("Gives up", (e) => list(gaps[e.champion]?.givesUp ?? [], "bad"));
    }
  }
  rows.push({ k: "Tradeoff", cells: (x) => list(x.c.fit.tradeoffs, "bad") });
  rows.push({ k: "Synergy", cells: (x) => { const t = synergyText(x.c); return { text: t ?? "—", cls: t ? "syn" : "muted" }; } });
  rows.push({ k: "Pro", cells: (x) => x.c.pro ? { text: `pro ${x.c.pro.score}`, node: <ProEvidenceTrigger pro={x.c.pro} champion={x.c.champion} role={x.c.role} ctx={proCtx} /> } : { text: "—", cls: "muted" } });
  if (entries.some((x) => x.c.meta || x.c.priority)) rows.push({ k: "Pro meta", cells: (x) => {
    const rot = x.c.meta ? rotationLabel(x.c.meta) : undefined;
    const prio = x.c.priority ? `Pro priority · ${Math.round(x.c.priority.presence * 100)}%` : undefined;
    const label = rot ?? prio;
    if (!label) return { text: "—", cls: "muted" };
    return { text: label, node: x.c.meta ? <MetaEvidenceTrigger s={x.c.meta} label={label} cls={rot ? "rot" : "prio"} names={names} /> : <span className="sig prio">{label}</span> };
  } });
  if (entries.some((x) => x.c.counter)) rows.push({ k: "Counter", cells: (x) => x.c.counter ? { text: "counter", node: <CounterTrigger c={x.c.counter} names={names} /> } : { text: "—", cls: "muted" } });
  rows.push({ k: "Pool · fit", cells: (x) => ({ text: `${tierLabel(x.tier)}${x.c.fit.parts.length ? ` · ${x.c.compFit > 0 ? "+" : ""}${x.c.compFit}` : ""}` }) });

  return (
    <div className={`cmp ${busy ? "busy" : ""}`.trim()} aria-label="Candidate comparison" aria-busy={busy || undefined}>
      {head}
      <table className="cmp-table">
        <colgroup><col className="cmp-k" />{entries.map((x) => <col key={x.c.champion} />)}</colgroup>
        <thead><tr><th scope="col"><span className="sr-only">Candidate</span></th>{entries.map((x, i) => (
          <th key={x.c.champion} scope="col">
            <span className="cmp-who">
              <span className="cmp-n" aria-hidden="true">{i + 1}</span>
              <button type="button" className="cmp-champ" onClick={() => onOpen(x.c.champion)} data-drawer-trigger aria-haspopup="dialog" title={`${n(x.c.champion)}: details`}>
                <ChampIcon id={x.c.champion} name={n(x.c.champion)} role={x.c.role} size="sm" /><span className="truncate">{n(x.c.champion)}</span>
              </button>
              <button type="button" className="cmp-x" aria-label={`Remove ${n(x.c.champion)} from the comparison`} onClick={() => onRemove(x.c.champion)}>×</button>
            </span>
          </th>
        ))}</tr></thead>
        <tbody>
          {rows.map((r) => {
            const cells = entries.map((x) => r.cells(x));
            // A row with nothing for any candidate says nothing; one that reads the same for all is muted.
            if (cells.every((c) => c.text === "—")) return null;
            const same = cells.every((c) => c.text === cells[0].text);
            return (
              <tr key={r.k} className={same && entries.length > 1 ? "same" : undefined}>
                <th scope="row">{r.k}</th>
                {cells.map((c, i) => <td key={entries[i].c.champion} className={c.cls}>{c.node ?? c.text}</td>)}
              </tr>
            );
          })}
          <tr className="cmp-lock"><th scope="row"><span className="sr-only">Lock</span></th>{entries.map((x) => (
            <td key={x.c.champion}><button type="button" className="btn sm primary" onClick={() => onLock(x.c.champion)} aria-label={`Lock ${n(x.c.champion)} at ${x.c.role.toLowerCase()}`}>Lock</button></td>
          ))}</tr>
        </tbody>
      </table>
    </div>
  );
}
