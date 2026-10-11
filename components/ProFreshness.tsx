"use client";
import { useEffect, useState } from "react";
import type { Freshness } from "@/lib/pro-games";

// The daily pro-data refresh (.github/workflows/refresh-pro-data.yml) commits only when verified data changes, so the
// build knows when data last changed but not when it was last checked. The latest successful scheduled check comes from
// GitHub's public Actions API when it answers; otherwise the check stored with the data is shown.
const RUNS = "https://api.github.com/repos/adequate-alan/lol-drafting/actions/workflows/refresh-pro-data.yml/runs?status=success&branch=main&per_page=1";

const day = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" }) : undefined;
const latest = (xs: (string | null | undefined)[]) => xs.filter((x): x is string => !!x).sort().at(-1) ?? null;

export function ProFreshness({ items }: { items: Freshness[] }) {
  const [checked, setChecked] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch(RUNS, { headers: { Accept: "application/vnd.github+json" } })
      .then((r) => (r.ok ? r.json() : undefined))
      .then((j: { workflow_runs?: { updated_at?: string }[] } | undefined) => { if (live) setChecked(j?.workflow_runs?.[0]?.updated_at ?? null); })
      .catch(() => { /* offline or rate-limited: the stored check stays */ });
    return () => { live = false; };
  }, []);
  const updated = latest(items.map((i) => i.lastUpdate));
  const check = latest([...items.map((i) => i.lastCheck), checked]);
  const status = (i: Freshness) => !i.listed ? "not on Gol.gg yet" : i.status === "complete" ? "Completed" : "Ongoing";
  return (
    <p className="pro-freshness xs muted">
      <span>Last updated: {day(updated) ?? "—"}</span>
      {check && <span title={new Date(check).toLocaleString("en-US", { timeZone: "America/New_York", timeZoneName: "short" })}>Last checked: {day(check)}</span>}
      {items.map((i) => <span key={i.event}>{i.label} {status(i)}{i.listed && i.games != null ? ` · ${i.recorded}/${i.games} games recorded` : ""}</span>)}
    </p>
  );
}
