"use client";
// The Top tab's rail controls (alan, 2026-10-13): usage filter All | Blind | Response | Both | Meta priority, patch and
// tournament scope, and sort. Everything is in the URL; the default patch is the newest one with enough classified top
// games (lib/top-draft.ts defaultTopPatch), "All patches" is explicit. The rail stays a champion list, not a table.
import { useMemo } from "react";
import type { ReadonlyURLSearchParams } from "next/navigation";
import { Select } from "./Select";
import { rovingIndex, rovingKeys } from "./roving";
import { isPriority, TOP_VIEWS, type TopView } from "./TopDraft";
import { patchKey, patchLabel } from "@/lib/patch";
import { defaultTopPatch, topPatches, topRows, type PriorityBrief, type TopDraftBundle, type TopRow } from "@/lib/top-draft";

export const USE_FILTERS = [["", "All"], ["blind", "Blind"], ["response", "Response"], ["both", "Both"], ["meta", "Meta priority"]] as const;
export type UseFilter = (typeof USE_FILTERS)[number][0];
export const TOP_SORTS = [["", "Saved grade"], ["blind", "Blind frequency"], ["response", "Response frequency"], ["presence", "Pro presence"], ["recent", "Recent"]] as const;
export type TopSort = (typeof TOP_SORTS)[number][0];

export interface TopScopeState {
  patch?: string; // Gol.gg key, undefined = all patches
  patchParam: string; // what the patch menu shows ("all" or 26.xx)
  event?: string;
  use: UseFilter;
  sort: TopSort;
  view: TopView;
  rows: TopRow[];
  prio: Record<string, PriorityBrief>;
  label: string;
  patches: string[];
  events: { id: string; short: string }[];
  href: (next: Partial<Record<"champ" | "patch" | "event" | "use" | "sort" | "view", string | undefined>>) => string;
}

export function useTopScope(bundle: TopDraftBundle | undefined, params: ReadonlyURLSearchParams): TopScopeState | undefined {
  const q = params.toString();
  return useMemo(() => {
    if (!bundle) return undefined;
    const p = new URLSearchParams(q);
    const patches = topPatches(bundle.selections);
    const raw = p.get("patch");
    const patch = raw === "all" ? undefined : raw ? patchKey(raw) : defaultTopPatch(bundle.selections);
    const event = p.get("event") || undefined;
    const use = (USE_FILTERS.find(([k]) => k === p.get("use"))?.[0] ?? "") as UseFilter;
    const sort = (TOP_SORTS.find(([k]) => k === p.get("sort"))?.[0] ?? "") as TopSort;
    const view = (TOP_VIEWS.find(([k]) => k === p.get("view"))?.[0] ?? "overview") as TopView;
    const scope = { patch, events: event ? [event] : undefined };
    const rows = topRows(bundle.selections, scope, bundle.dpm);
    const pkey = patch ? patches.find((x) => patchKey(x) === patch) ?? patch : "all";
    const prio = bundle.priority[pkey]?.rows ?? {};
    const evName = event ? bundle.events.find((e) => e.id === event)?.short ?? event : undefined;
    const label = [patch ? patchLabel(patch) : "all patches", evName].filter(Boolean).join(" · ");
    const href: TopScopeState["href"] = (next) => {
      const out = new URLSearchParams(q);
      for (const [k, v] of Object.entries(next)) (v ? out.set(k, v) : out.delete(k));
      if (out.get("patch") && out.get("patch") !== "all") out.set("patch", patchLabel(out.get("patch")!));
      return `/synergies/top${out.size ? `?${out}` : ""}`;
    };
    return { patch, patchParam: patch ? patchLabel(patch) : "all", event, use, sort, view, rows, prio, label, patches, events: bundle.events, href };
  }, [bundle, q]);
}

/** Short usage for a rail line: the leaning count with its denominator, or why there is none. */
const railUsage = (r: TopRow | undefined) => !r ? "no pro games"
  : r.usage === "too-few" ? `${r.games} game${r.games === 1 ? "" : "s"}, too few`
  : r.usage === "response" ? `Response ${r.response}/${r.classified}` : r.usage === "both" ? `Both · blind ${r.blind}/${r.classified}` : `Blind ${r.blind}/${r.classified}`;

const share = (r: TopRow | undefined, k: "blind" | "response") => (r && r.classified >= 3 ? r[k] / r.classified + r.classified / 1000 : -1);

/** The rail list for the Top tab: filtered by usage, sorted, each line saying the saved grade and observed usage. */
export function topRail<T extends { id: string; label: string; sub: string; proposed?: boolean }>(base: T[], s: TopScopeState, grade: (id: string) => string | undefined): T[] {
  const row = (id: string) => s.rows.find((r) => r.champion === id);
  const keep = (id: string) => {
    const r = row(id);
    if (s.use === "meta") return isPriority(s.prio[id]) && !!r;
    if (s.use) return r?.usage === s.use;
    return true;
  };
  const out = base.filter((x) => keep(x.id)).map((x) => {
    const r = row(x.id), g = grade(x.id);
    return { ...x, sub: `${g ? `Saved ${g}` : x.proposed ? "Proposed" : ""}${g || x.proposed ? " · " : ""}${railUsage(r)}` };
  });
  const by = (f: (id: string) => number) => [...out].sort((a, b) => f(b.id) - f(a.id));
  switch (s.sort) {
    case "blind": return by((id) => share(row(id), "blind"));
    case "response": return by((id) => share(row(id), "response"));
    case "presence": return by((id) => s.prio[id]?.presence ?? -1);
    case "recent": return by((id) => Date.parse(row(id)?.latest || "1970-01-01"));
    default: return out;
  }
}

export function TopRailTools({ scope, set }: { scope: TopScopeState; set: (key: "patch" | "event" | "use" | "sort", value: string | undefined) => void }) {
  return (
    <>
      <div className="seg top-use" role="tablist" aria-label="Observed usage" onKeyDown={(e) => rovingKeys(e)}>
        {USE_FILTERS.map(([k, l]) => (
          <button key={l} type="button" role="tab" aria-selected={scope.use === k} tabIndex={rovingIndex(scope.use === k)} className={scope.use === k ? "active" : undefined}
            onClick={() => set("use", k || undefined)}>{l}</button>
        ))}
      </div>
      <div className="rail-tools top-tools">
        <Select label="Patch" value={scope.patchParam} onChange={(v) => set("patch", v)}
          options={[...scope.patches.map((p) => ({ value: patchLabel(p), label: patchLabel(p) })), { value: "all", label: "All patches" }]} />
        <Select label="Tournament" value={scope.event ?? ""} onChange={(v) => set("event", v || undefined)}
          options={[{ value: "", label: "All tournaments" }, ...scope.events.map((e) => ({ value: e.id, label: e.short }))]} />
        <Select label="Sort" value={scope.sort} onChange={(v) => set("sort", v || undefined)} options={TOP_SORTS.map(([value, label]) => ({ value, label }))} className="span-2" />
      </div>
    </>
  );
}
