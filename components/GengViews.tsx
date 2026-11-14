"use client";
// The Gen.G page's two views (alan, 2026-11-14): Worlds 2026 (the Finals hub) and the LCK 2026 Playoffs archive, kept
// apart. Both are rendered into the static page; the tab only chooses which one shows, and lives in the URL (`?view=lck`).
import { useSearchParams } from "next/navigation";
import { rovingIndex, rovingKeys } from "@/components/roving";

const VIEWS = [["worlds", "Worlds 2026"], ["lck", "LCK 2026 Playoffs · archive"]] as const;
type View = (typeof VIEWS)[number][0];

export function GengViews({ worlds, lck }: { worlds: React.ReactNode; lck: React.ReactNode }) {
  const q = useSearchParams();
  const view: View = q.get("view") === "lck" ? "lck" : "worlds";
  const go = (v: View) => {
    if (v === view) return;
    const next = new URLSearchParams(q.toString());
    if (v === "worlds") next.delete("view"); else next.set("view", v);
    const s = next.toString();
    window.history.pushState(null, "", `${window.location.pathname}${s ? `?${s}` : ""}`);
  };
  return (
    <>
      <div className="tabs" role="tablist" aria-label="Gen.G views" onKeyDown={(e) => rovingKeys(e)}>
        {VIEWS.map(([v, label]) => (
          <button key={v} type="button" role="tab" id={`geng-tab-${v}`} aria-selected={view === v} aria-controls={`geng-view-${v}`} tabIndex={rovingIndex(view === v)}
            className={view === v ? "active" : ""} onClick={() => go(v)}>{label}</button>
        ))}
      </div>
      <div role="tabpanel" id="geng-view-worlds" aria-labelledby="geng-tab-worlds" hidden={view !== "worlds"}>{worlds}</div>
      <div role="tabpanel" id="geng-view-lck" aria-labelledby="geng-tab-lck" hidden={view !== "lck"}>{lck}</div>
    </>
  );
}
