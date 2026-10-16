// One-line Comp Check summary for narrow screens (alan, 2026-10-12): what the draft is missing, never a score.
// It reads the same plan read as the Comp Check rail (lib/model-v2/plan.ts, the default since 2026-10-14), so the
// line and the rail always describe the same comp, and adds nothing to it.
import type { PlanFinding, PlanRead } from "./model-v2/plan";
import type { Role } from "./schema";

export interface CompSummary {
  state: "none" | "early" | "read";
  picks: number;
  needs: string[];                                            // the open role's top needs, highest priority first
  weak?: { label: string; text: string; severity: "major" | "moderate" }; // the top weak point worth acting on
  clean: boolean;                                             // a read with nothing to act on
  incomplete?: boolean;                                       // a locked pick has no kit: never called clean
}

// A missing plan job reads "Missing <job>" on its own; the plan's name is already in the headline.
const labelOf = (x: PlanFinding, plan: string | undefined) =>
  x.source === "plan" && plan && x.label.startsWith(`${plan}: `) ? x.label.slice(plan.length + 2).replace(/^m/, "M") : x.label;

export function compSummary(p: PlanRead, active?: Role): CompSummary {
  const picks = p.picks;
  const incomplete = p.unread.length > 0;
  if (p.confidence === "none") return { state: "none", picks, needs: [], clean: false, incomplete };
  // Critical, needed and non-minor weaknesses are worth acting on; accepted tradeoffs never are.
  const top = [...p.weaknesses, ...p.more].find((w) => w.tier === "critical" || w.tier === "needed" || w.severity !== "minor");
  const needs = active ? (p.roleNeeds[active] ?? []).slice(0, 2).map((n) => n.label) : [];
  return {
    state: p.confidence === "early" ? "early" : "read",
    picks,
    needs,
    weak: top ? { label: labelOf(top, p.plan?.label), text: top.why, severity: top.tier === "critical" || top.tier === "needed" ? "major" : "moderate" } : undefined,
    clean: !top && !needs.length && !incomplete,
    incomplete,
  };
}

/** The line itself, for the button's accessible name and tests. */
export function summaryText(s: CompSummary): string {
  if (s.state === "none") return s.picks ? "Read starts at two picks" : "Lock a pick to start";
  const parts = [
    ...(s.needs.length ? [`Needs ${s.needs.map((n, i) => (i ? n.toLowerCase() : n)).join(" + ")}`] : []),
    ...(s.weak ? [s.weak.label] : []),
  ];
  return parts.length ? parts.join(" · ") : s.incomplete ? "Incomplete read" : "No major weak points";
}
