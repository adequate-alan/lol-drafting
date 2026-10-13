"use client";
import { useEffect, useState } from "react";
import type { Freshness } from "@/lib/pro-games";

// The daily pro-data refresh (.github/workflows/refresh-pro-data.yml) commits only when verified data changes, so the
// build knows when data last changed but not when it was last checked. The latest successful scheduled check comes from
// GitHub's public Actions API when it answers; otherwise the check stored with the data is shown.
const runsUrl = (workflow: string) => `https://api.github.com/repos/adequate-alan/lol-drafting/actions/workflows/${workflow}/runs?status=success&branch=main&per_page=1`;

export const day = (iso: string | null) => iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" }) : undefined;
const latest = (xs: (string | null | undefined)[]) => xs.filter((x): x is string => !!x).sort().at(-1) ?? null;

// Unauthenticated API calls are limited to 60 an hour per IP, so one answer (or failure) is reused for an hour across pages.
const TTL = 60 * 60 * 1000;
type Cached = { at: number; value: string | null };
const readCache = (key: string): Cached | undefined => {
  try { const c = JSON.parse(localStorage.getItem(key) ?? "null") as Cached | null; return c && Date.now() - c.at < TTL ? c : undefined; } catch { return undefined; }
};
const writeCache = (key: string, value: string | null) => { try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), value })); } catch { /* storage blocked */ } };

/** When a workflow last finished successfully on main, from GitHub's public Actions API; null until (or unless) it answers. */
export function useLastRun(workflow: string, cacheKey: string) {
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    const cached = readCache(cacheKey);
    if (cached) { setValue(cached.value); return; }
    let live = true;
    fetch(runsUrl(workflow), { headers: { Accept: "application/vnd.github+json" } })
      .then((r) => (r.ok ? r.json() : undefined))
      .then((j: { workflow_runs?: { updated_at?: string }[] } | undefined) => {
        const v = j?.workflow_runs?.[0]?.updated_at ?? null;
        writeCache(cacheKey, v);
        if (live) setValue(v);
      })
      .catch(() => writeCache(cacheKey, null) /* offline or rate-limited: the stored date stays */);
    return () => { live = false; };
  }, [workflow, cacheKey]);
  return value;
}

export function ProFreshness({ items, compact = false }: { items: Freshness[]; compact?: boolean }) {
  const checked = useLastRun("refresh-pro-data.yml", "pro-freshness-check");
  const updated = latest(items.map((i) => i.lastUpdate));
  const check = latest([...items.map((i) => i.lastCheck), checked]);
  const status = (i: Freshness) => i.status === "complete" ? "Completed" : "Ongoing";
  // Tracked events Gol.gg hasn't listed yet share one item instead of one "not on Gol.gg yet" each.
  const waiting = items.filter((i) => !i.listed);
  const listed = items.filter((i) => i.listed);
  const detail = [
    ...listed.map((i) => `${i.label}: ${status(i).toLowerCase()}${i.games != null ? `, ${i.recorded} of ${i.games} games recorded` : ""}`),
    ...(waiting.length ? [`Not on Gol.gg yet: ${waiting.map((i) => i.label).join(", ")}`] : []),
    ...(check ? [`Last checked ${new Date(check).toLocaleString("en-US", { timeZone: "America/New_York", timeZoneName: "short" })}`] : []),
  ].join("\n");
  // Compact (Pro Drafts, alan 2026-10-13): one quiet line, with each tournament's status and the exact check in its tooltip.
  if (compact) return (
    <p className="pro-freshness compact xs muted"><span title={detail}>Data updated {day(updated) ?? "—"}{check ? ` · checked ${day(check)}` : ""}</span></p>
  );
  return (
    <p className="pro-freshness xs muted">
      <span>Last updated: {day(updated) ?? "—"}</span>
      {check && <span title={new Date(check).toLocaleString("en-US", { timeZone: "America/New_York", timeZoneName: "short" })}>Last checked: {day(check)}</span>}
      {items.filter((i) => i.listed).map((i) => <span key={i.event}>{i.label} {status(i)}{i.games != null ? ` · ${i.recorded}/${i.games} games recorded` : ""}</span>)}
      {waiting.length > 0 && <span title="Tracked by the pro-data refresh; Gol.gg hasn't listed these yet">Not on Gol.gg yet: {waiting.map((i) => i.label).join(", ")}</span>}
    </p>
  );
}
