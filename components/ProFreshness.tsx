"use client";
import { useEffect, useState } from "react";
import type { Freshness } from "@/lib/pro-games";

// The daily pro-data refresh (.github/workflows/refresh-pro-data.yml) commits only when verified data changes, so the
// build knows when data last changed but not when it was last checked. The latest successful scheduled check comes from
// GitHub's public Actions API when it answers; otherwise the check stored with the data is shown.
const RUNS = "https://api.github.com/repos/adequate-alan/lol-drafting/actions/workflows/refresh-pro-data.yml/runs?status=success&branch=main&per_page=1";

const day = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" }) : undefined;
const latest = (xs: (string | null | undefined)[]) => xs.filter((x): x is string => !!x).sort().at(-1) ?? null;

// Unauthenticated API calls are limited to 60 an hour per IP, so one answer (or failure) is reused for an hour across pages.
const CACHE = "pro-freshness-check";
const TTL = 60 * 60 * 1000;
type Cached = { at: number; value: string | null };
const readCache = (): Cached | undefined => {
  try { const c = JSON.parse(localStorage.getItem(CACHE) ?? "null") as Cached | null; return c && Date.now() - c.at < TTL ? c : undefined; } catch { return undefined; }
};
const writeCache = (value: string | null) => { try { localStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), value })); } catch { /* storage blocked */ } };

export function ProFreshness({ items }: { items: Freshness[] }) {
  const [checked, setChecked] = useState<string | null>(null);
  useEffect(() => {
    const cached = readCache();
    if (cached) { setChecked(cached.value); return; }
    let live = true;
    fetch(RUNS, { headers: { Accept: "application/vnd.github+json" } })
      .then((r) => (r.ok ? r.json() : undefined))
      .then((j: { workflow_runs?: { updated_at?: string }[] } | undefined) => {
        const value = j?.workflow_runs?.[0]?.updated_at ?? null;
        writeCache(value);
        if (live) setChecked(value);
      })
      .catch(() => writeCache(null) /* offline or rate-limited: the stored check stays */);
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
