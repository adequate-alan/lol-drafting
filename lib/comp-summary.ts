// One-line Comp Check summary for narrow screens (alan, 2026-10-12): what the draft is missing, never a score.
// It reads the same analysis as the Comp Check rail (lib/model-v2/analyze.ts) and adds nothing to it.
import type { Analysis } from "./model-v2/analyze";
import type { Role } from "./schema";

export interface CompSummary {
  state: "none" | "early" | "read";
  picks: number;
  needs: string[];                                            // the open role's top needs, highest priority first
  weak?: { label: string; text: string; severity: "major" | "moderate" }; // the top weak point worth acting on
  clean: boolean;                                             // a read with nothing to act on
}

export function compSummary(r: Analysis, active?: Role): CompSummary {
  const picks = r.facts.n;
  if (r.confidence === "none") return { state: "none", picks, needs: [], clean: false };
  const top = r.weakPoints.find((w) => w.severity !== "minor");
  const needs = active ? (r.roleNeeds[active] ?? []).slice(0, 2).map((n) => n.label) : [];
  return {
    state: r.confidence === "early" ? "early" : "read",
    picks,
    needs,
    weak: top ? { label: top.label, text: top.text, severity: top.severity as "major" | "moderate" } : undefined,
    clean: !top && !needs.length,
  };
}

/** The line itself, for the button's accessible name and tests. */
export function summaryText(s: CompSummary): string {
  if (s.state === "none") return s.picks ? "Read starts at two picks" : "Lock a pick to start";
  const parts = [
    ...(s.needs.length ? [`Needs ${s.needs.map((n, i) => (i ? n.toLowerCase() : n)).join(" + ")}`] : []),
    ...(s.weak ? [s.weak.label] : []),
  ];
  return parts.length ? parts.join(" · ") : "No major weak points";
}
