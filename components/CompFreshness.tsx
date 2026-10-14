"use client";
import { day, useLastRun } from "./ProFreshness";

// Comp Library freshness: when the weekly discovery (.github/workflows/discover-comps.yml) last ran successfully, from
// GitHub's public Actions API, and when it last added a comp or a variation (stored with the data). The run commits
// only when the library changes, so the two dates differ on quiet weeks.
export function CompFreshness({ lastAddition }: { lastAddition: string | null }) {
  const reviewed = useLastRun("discover-comps.yml", "comp-library-review-v2");
  return (
    <p className="pro-freshness xs muted">
      {reviewed && <span title={new Date(reviewed).toLocaleString("en-US", { timeZone: "America/New_York", timeZoneName: "short" })}>Library reviewed: {day(reviewed)}</span>}
      <span>Last addition: {day(lastAddition) ?? "—"}</span>
    </p>
  );
}
