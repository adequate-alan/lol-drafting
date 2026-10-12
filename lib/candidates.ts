// One Draft Room candidate list per open role (alan, 2026-10-11): every champion shows once, carrying its independent
// signals side by side instead of in separate lists.
//
//   Synergy  - alan's saved pairing with a locked pick (preferred, alternative, fits), or a proposed (kit-based) one.
//   Pro      - recorded pro games next to a locked pick (lib/suggest.ts proSuggestions), with the game count.
//   Fit      - comp fit: synergy with the locked picks, team needs, matchups and risks (lib/recommend.ts parts minus
//              the saved and proposed bonuses). "Best fit" marks the top three, "Best fix" the comp engine's pick.
//   Counter  - a DPM matchup counter into the lane opponent (lib/counters.ts).
//   Priority - pro pick/ban presence on the newest patch (lib/pro-priority.ts), shown when the champion has recorded
//              picks in this role. A label only: never a reason to list a champion, never a signal in the tie-break.
//
// A champion qualifies through any one signal. Order is transparent rather than an invented aggregate:
//   1. alan's preferred saved pairing first (his explicit preference is never outranked by evidence);
//   2. then comp fit, highest first, so Synergy alternatives, Pro and Counter candidates compete on the same terms;
//   3. ties: more independent signals first, then the name.
// Pro game counts and counters never move a row; they are labels. A support outside the locked bot's saved supports
// can be a candidate through its pro games, but never takes Synergy, Best fit or Best fix; one with only a counter is
// theoretical and listed last.
import { counterPicks, type Counter, type CounterInput, type EnemyDraft, type RoleCounters } from "./counters";
import type { Draft } from "./evaluate";
import { recommend, savedSupports, type RecommendData, type Recommendation, type Recommendations } from "./recommend";
import { ROLES, type MetaEvent, type Role, type Source } from "./schema";
import { proSuggestions, type ProByRole, type ProSuggestion } from "./suggest";
import { markFor, type PriorityMark } from "./pro-priority";

export type SignalKey = "synergy" | "pro" | "fit" | "counter";
export type Filter = "all" | SignalKey | "priority";

export interface Candidate {
  champion: string;
  role: Role;
  fit: Recommendation; // the full draft-fit read: reasons, fixes, tradeoffs
  compFit: number; // draft fit without the saved / proposed bonuses
  pro: ProSuggestion | null;
  counter: Counter | null;
  priority: PriorityMark | null; // label only (see above)
  bestFit: boolean; // top BEST_FIT on comp fit among eligible candidates
  theoretical: boolean; // a support outside the locked bot's saved supports with no pro games: counter reference only
  signals: SignalKey[]; // independent signals: a pro-derived alternative counts as Pro, not twice
}

export const BEST_FIT = 3;
const FIT_ROWS = 8; // comp-fit-only candidates kept beyond the ones another signal brings in

const BONUS = new Set(["saved", "proposed"]);
const round = (n: number) => Math.round(n * 100) / 100;
export const compFitOf = (r: Recommendation) => round(r.parts.filter((p) => !BONUS.has(p.kind)).reduce((s, p) => s + p.points, 0));

/** A row for a champion with no draft-fit read (roster-only champion seen in a pro game): no reasons, no score. */
const blank = (champion: string, role: Role, eligible: boolean): Recommendation => ({
  champion, role, score: 0, parts: [], saved: null, proposed: null, proGames: 0, fixes: [], also: [], tradeoffs: [], bestFix: false, eligible, savedFromPro: false,
});

export const hasSignal = (c: Candidate, f: Filter) =>
  f === "all" || (f === "priority" ? !!c.priority : (f === "synergy" ? !!(c.fit.saved || c.fit.proposed) : f === "fit" ? c.bestFit || c.fit.bestFix : f === "pro" ? !!c.pro : !!c.counter));

export function unifiedCandidates(fits: Recommendations, pro: ProByRole, counters: Partial<Record<Role, RoleCounters>>,
  priority?: Record<string, PriorityMark>): Partial<Record<Role, Candidate[]>> {
  const out: Partial<Record<Role, Candidate[]>> = {};
  for (const role of ROLES) {
    const list = fits[role];
    if (!list) continue;
    const byId = new Map(list.map((r) => [r.champion, r]));
    const proBy = new Map((pro[role] ?? []).map((s) => [s.champion, s]));
    const counterBy = new Map((counters[role]?.counters ?? []).map((c) => [c.champion, c]));
    const eligible = list.filter((r) => r.eligible);
    const byComp = [...eligible].sort((a, b) => compFitOf(b) - compFitOf(a) || b.score - a.score || a.champion.localeCompare(b.champion)).filter((r) => compFitOf(r) > 0);
    // Best fit: the top BEST_FIT on comp fit, and anything tied with the last of them.
    const cut = byComp[BEST_FIT - 1] ? compFitOf(byComp[BEST_FIT - 1]) : -Infinity;
    const best = new Set(byComp.filter((r, i) => i < BEST_FIT || compFitOf(r) >= cut).map((r) => r.champion));
    const ids = new Set<string>([
      ...eligible.filter((r) => r.saved || r.proposed || r.bestFix).map((r) => r.champion),
      ...byComp.slice(0, FIT_ROWS).map((r) => r.champion),
      ...proBy.keys(),
      ...counterBy.keys(),
    ]);
    const rows: Candidate[] = [...ids].map((id) => {
      const p = proBy.get(id) ?? null;
      const counter = counterBy.get(id) ?? null;
      // No read: a counter with no draft-fit reasons, or a roster-only champion seen in a pro game.
      const fit = byId.get(id) ?? blank(id, role, !counter?.theoretical);
      const bestFit = fit.eligible && best.has(id);
      const signals: SignalKey[] = [];
      if (fit.eligible && fit.saved && !fit.savedFromPro) signals.push("synergy");
      if (p) signals.push("pro");
      if (bestFit || fit.bestFix) signals.push("fit");
      if (counter) signals.push("counter");
      return { champion: id, role, fit, compFit: compFitOf(fit), pro: p, counter, priority: markFor(priority, id, role) ?? null, bestFit, theoretical: !fit.eligible && !p, signals };
    });
    const preferred = (c: Candidate) => Number(c.fit.eligible && c.fit.saved === "default");
    out[role] = rows.sort((a, b) =>
      Number(a.theoretical) - Number(b.theoretical)
      || preferred(b) - preferred(a)
      || b.compFit - a.compFit
      || b.signals.length - a.signals.length
      || a.champion.localeCompare(b.champion));
  }
  return out;
}

/** The champions each role's pro evidence brings in, for recommend's `include`: read even outside the eligibility rule. */
export const proIncludes = (pro: ProByRole): Partial<Record<Role, string[]>> =>
  Object.fromEntries(Object.entries(pro).map(([r, l]) => [r, (l ?? []).map((s) => s.champion)]));

export type CandidateData = RecommendData & CounterInput & { events?: MetaEvent[]; priority?: Record<string, PriorityMark> };

/**
 * Everything the Draft Room list needs for a draft: pro pairings (enemy picks left out), the draft-fit read for every
 * champion they bring in, the eligible draft-fit list (`fits`, used by counters and the picker), counters, and the
 * unified candidates.
 */
export function draftCandidates(draft: Draft, enemy: EnemyDraft, data: CandidateData, sources: Record<string, Source>) {
  const enemyIds = ROLES.flatMap((r) => (enemy[r] ? [enemy[r]!] : []));
  const extra = { botPairings: data.botPairings, events: data.events, sources };
  const pro = Object.fromEntries(Object.entries(proSuggestions(draft, data.proDrafts, extra, Infinity))
    .map(([r, list]) => [r, list!.filter((s) => !enemyIds.includes(s.champion))])) as ProByRole;
  // With a saved bot locked, a support outside its saved supports is a candidate only through games with that bot, and
  // counts only those games: games next to the jungler or mid say nothing about the bot lane.
  const eligibleSupports = savedSupports(draft, data.botPairings);
  if (pro.SUPPORT && eligibleSupports) {
    const withBot = new Map((proSuggestions({ BOT: draft.BOT }, data.proDrafts, extra, Infinity).SUPPORT ?? []).map((s) => [s.champion, s]));
    pro.SUPPORT = pro.SUPPORT.flatMap((s) => (eligibleSupports.includes(s.champion) ? [s] : withBot.has(s.champion) ? [withBot.get(s.champion)!] : []));
  }
  const wide = recommend(draft, enemyIds, data, Infinity, { include: proIncludes(pro) });
  const fits = Object.fromEntries(Object.entries(wide).map(([r, list]) => [r, list!.filter((x) => x.eligible)])) as Recommendations;
  const counters = counterPicks(draft, enemy, data, fits);
  return { pro, fits, counters, unified: unifiedCandidates(wide, pro, counters, data.priority) };
}
