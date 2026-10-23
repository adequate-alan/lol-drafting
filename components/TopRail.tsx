"use client";
// The lane tabs' rail controls (alan, 2026-10-13; Top first, then Mid, Bot and Support): usage filter All | Blind |
// Response | Both | (Duo analysis on Bot and Support) | Meta priority, patch and tournament scope, and sort. Everything
// is in the URL. The default is All patches (historical); meta priority always comes from one named patch, the chosen
// one or else the newest, so combined history is never labelled as the current meta. The rail stays a champion list.
import { useMemo } from "react";
import type { ReadonlyURLSearchParams } from "next/navigation";
import { Select } from "./Select";
import { rovingIndex, rovingKeys } from "./roving";
import { isPriority, laneViews, type TopView } from "./TopDraft";
import { patchKey, patchLabel } from "@/lib/patch";
import { inTopScope, topPatches, topRows, type PriorityBrief, type TopDraftBundle, type TopRow } from "@/lib/top-draft";
import { resolveScope, scopeChoices, scopeKey, scopeLabel } from "@/lib/tournament-scope";

const BASE_FILTERS: [UseFilter, string][] = [["", "All"], ["blind", "Blind"], ["response", "Response"], ["both", "Both"]];
export type UseFilter = "" | "blind" | "response" | "both" | "duo" | "meta";
export const useFilters = (duo: boolean): [UseFilter, string][] => [...BASE_FILTERS, ...(duo ? [["duo", "Duo analysis"] as [UseFilter, string]] : []), ["meta", "Meta priority"]];
export const TOP_SORTS = [["", "Saved order"], ["blind", "Blind frequency"], ["response", "Response frequency"], ["rotation", "First-rotation frequency"], ["presence", "Pro presence"], ["recent", "Recent"]] as const;
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
  prioLabel: string; // the one patch meta priority comes from
  label: string;
  patches: string[];
  events: { id: string; short: string }[];
  duo: boolean;
  duoUsers: Set<string>; // champions in a duo completed with enemy bot-lane information (full or split)
  href: (next: Partial<Record<"champ" | "patch" | "event" | "use" | "sort" | "view", string | undefined>>) => string;
}

export function useTopScope(bundle: TopDraftBundle | undefined, params: ReadonlyURLSearchParams, tab: string): TopScopeState | undefined {
  const q = params.toString();
  return useMemo(() => {
    if (!bundle) return undefined;
    const p = new URLSearchParams(q);
    const patches = topPatches(bundle.selections);
    const raw = p.get("patch");
    const patch = raw && raw !== "all" ? patchKey(raw) : undefined;
    // Tournament scopes over the recorded games of this lane: each tournament, each Worlds stage, All Worlds.
    const gamesByKey = new Map<string, Set<number>>();
    for (const s of bundle.selections) { const k = scopeKey(s.event, s.stage); (gamesByKey.get(k) ?? gamesByKey.set(k, new Set()).get(k)!).add(s.game); }
    const choices = scopeChoices([...gamesByKey].map(([key, g]) => ({ key, games: g.size })), bundle.events);
    const event = resolveScope(p.get("event") || undefined, choices);
    const duo = !!bundle.duos;
    const use = (useFilters(duo).find(([k]) => k === p.get("use"))?.[0] ?? "") as UseFilter;
    const sort = (TOP_SORTS.find(([k]) => k === p.get("sort"))?.[0] ?? "") as TopSort;
    const view = (laneViews(bundle.role).find(([k]) => k === p.get("view"))?.[0] ?? "overview") as TopView;
    const scope = { patch, events: event ? [event] : undefined };
    const rows = topRows(bundle.selections, scope, bundle.dpm);
    // Meta priority is current-patch evidence: the chosen patch, or the newest one under All patches.
    const prioPatch = patch ? patches.find((x) => patchKey(x) === patch) ?? patch : patches[0];
    const prio = (prioPatch && bundle.priority[prioPatch]?.rows) || {};
    const prioLabel = prioPatch ? `${patchLabel(prioPatch)}${patch ? "" : ", newest patch"}` : "no patch";
    const evName = event ? scopeLabel(event, bundle.events) : undefined;
    const range = patches.length > 1 ? ` (${patchLabel(patches.at(-1)!)}–${patchLabel(patches[0])})` : "";
    const label = [patch ? patchLabel(patch) : `All patches${range}`, evName].filter(Boolean).join(" · ");
    const inScope = (d: { patch: string; event: string; stage?: string }) => inTopScope(d, scope);
    const duoUsers = new Set((bundle.duos ?? []).filter((d) => inScope(d) && (d.shape === "full" || d.shape === "split")).map((d) => (bundle.role === "SUPPORT" ? d.support : d.adc)));
    const href: TopScopeState["href"] = (next) => {
      const out = new URLSearchParams(q);
      for (const [k, v] of Object.entries(next)) (v ? out.set(k, v) : out.delete(k));
      if (out.get("patch") && out.get("patch") !== "all") out.set("patch", patchLabel(out.get("patch")!));
      return `/synergies/${tab}${out.size ? `?${out}` : ""}`;
    };
    return { patch, patchParam: patch ? patchLabel(patch) : "all", event, use, sort, view, rows, prio, prioLabel, label, patches, events: choices.map((c) => ({ id: c.value, short: c.label })), duo, duoUsers, href };
  }, [bundle, q, tab]);
}

/** Short usage for a rail line: the leaning count with its denominator, or why there is none. */
const railUsage = (r: TopRow | undefined) => !r ? "no pro games"
  : r.usage === "too-few" ? `${r.games} game${r.games === 1 ? "" : "s"}, too few`
  : r.usage === "response" ? `Response ${r.response}/${r.classified}` : r.usage === "both" ? `Both · blind ${r.blind}/${r.classified}` : `Blind ${r.blind}/${r.classified}`;

// First rotation over ordered picks (turn 1-6), 3+ ordered picks to rank, ties by sample.
const rotationShare = (r: TopRow | undefined) => {
  const n = r ? r.rotation.first + r.rotation.second + r.rotation.last : 0;
  return r && n >= 3 ? r.rotation.first / n + n / 1000 : -1;
};
const share = (r: TopRow | undefined, k: "blind" | "response") => (r && r.classified >= 3 ? r[k] / r.classified + r.classified / 1000 : -1);

/**
 * The rail list for a lane tab: filtered by usage, sorted, each line saying the saved record (the saved blind grade on
 * Top, the saved partners on Bot and Mid) and observed usage. `search` keeps the original line (saved partners) so the rail search still finds them.
 */
export function topRail<T extends { id: string; label: string; sub: string; proposed?: boolean; short?: string }>(base: T[], s: TopScopeState, grade?: (id: string) => string | undefined): (T & { search: string })[] {
  const row = (id: string) => s.rows.find((r) => r.champion === id);
  const keep = (id: string) => {
    const r = row(id);
    if (s.use === "meta") return isPriority(s.prio[id]) && !!r;
    if (s.use === "duo") return s.duoUsers.has(id);
    if (s.use) return r?.usage === s.use;
    return true;
  };
  const out = base.filter((x) => keep(x.id)).map((x) => {
    const r = row(x.id), g = grade?.(x.id);
    const saved = g ? `Saved ${g}` : x.proposed ? "Proposed" : x.short ?? "Saved";
    return { ...x, search: `${x.sub}`, sub: `${saved} · ${railUsage(r)}` };
  });
  const by = (f: (id: string) => number) => [...out].sort((a, b) => f(b.id) - f(a.id));
  switch (s.sort) {
    case "blind": return by((id) => share(row(id), "blind"));
    case "response": return by((id) => share(row(id), "response"));
    case "rotation": return by((id) => rotationShare(row(id)));
    case "presence": return by((id) => s.prio[id]?.presence ?? -1);
    case "recent": return by((id) => Date.parse(row(id)?.latest || "1970-01-01"));
    default: return out;
  }
}

export function TopRailTools({ scope, set }: { scope: TopScopeState; set: (key: "patch" | "event" | "use" | "sort", value: string | undefined) => void }) {
  return (
    <>
      <div className="seg top-use" role="tablist" aria-label="Observed usage" onKeyDown={(e) => rovingKeys(e)}>
        {useFilters(scope.duo).map(([k, l]) => (
          <button key={l} type="button" role="tab" aria-selected={scope.use === k} tabIndex={rovingIndex(scope.use === k)} className={scope.use === k ? "active" : undefined}
            title={k === "meta" ? `Pick or ban presence of 30% or more on ${scope.prioLabel}` : k === "duo" ? "Picked as part of a duo built with enemy bot-lane information" : undefined}
            onClick={() => set("use", k || undefined)}>{l}</button>
        ))}
      </div>
      <div className="rail-tools top-tools">
        <Select label="Patch" value={scope.patchParam} onChange={(v) => set("patch", v)}
          options={[{ value: "all", label: "All patches" }, ...scope.patches.map((p) => ({ value: patchLabel(p), label: patchLabel(p) }))]} />
        <Select label="Tournament" value={scope.event ?? ""} onChange={(v) => set("event", v || undefined)}
          options={[{ value: "", label: "All tournaments" }, ...scope.events.map((e) => ({ value: e.id, label: e.short }))]} />
        <Select label="Sort" value={scope.sort} onChange={(v) => set("sort", v || undefined)} options={TOP_SORTS.map(([value, label]) => ({ value, label }))} className="span-2" />
      </div>
    </>
  );
}
