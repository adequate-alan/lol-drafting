// Is the counter data current? (alan, 2026-10-22). DPM.LOL matchups are collected for one patch; once a newer patch is
// recognised (Riot's patch notes or recorded pro games), every counter from the older data is shown as historical, with
// its source patch and the Riot changes to the champions involved since then. Informational only: a stale row keeps its
// strength, and nothing here touches the draft-fit score, saved pairings or the order of any list.
import { comparePatch, patchKey } from "./patch";
import { changesFor, patchHref, type PatchIndex } from "./patch-changes";
import type { Counters } from "./schema";

/** One Riot change to a champion since the data patch, as the Counter card lists it. */
export interface ChangeBrief { patch: string; category?: string; via?: "system"; href: string }

export interface CounterFreshness {
  patch: string | null; // the DPM data's patch (newest among its rows), Riot's label
  collected: string | null; // when the rows were collected
  newest: string | null; // the newest patch the site recognises
  stale: boolean; // patch older than newest
  /** Champion id → Riot changes since the data patch, newest first. Only filled when stale. */
  changes: Record<string, ChangeBrief[]>;
}

/** The newest readable patch across every list given; null when none. */
export function newestPatch(...lists: (string | null | undefined)[][]): string | null {
  const all = lists.flat().filter((p): p is string => !!p);
  return all.length ? patchKey(all.reduce((a, b) => (comparePatch(b, a) > 0 ? b : a))) : null;
}

export function counterFreshness(counters: Counters, index: PatchIndex, newest: string | null): CounterFreshness {
  const patch = newestPatch(counters.dpm.map((r) => r.patch), counters.dpmDuos.map((r) => r.patch));
  const collected = [...counters.dpm, ...counters.dpmDuos].map((r) => r.updated).sort().at(-1) ?? null;
  const stale = !!patch && !!newest && comparePatch(patch, newest) < 0;
  const changes: Record<string, ChangeBrief[]> = {};
  if (stale) {
    const ids = new Set([...counters.dpm.flatMap((r) => [r.champion, r.enemy]),
      ...counters.dpmDuos.flatMap((r) => [r.duo.bot, r.duo.support, r.enemy.bot, r.enemy.support])]);
    for (const id of ids) {
      const list = changesFor(index, { kind: "champion", ref: id }, patch!, newest!);
      if (list.length) changes[id] = list.map((c) => ({ patch: c.patch, category: c.category, via: c.via, href: patchHref(c.patch, c.id) }));
    }
  }
  return { patch, collected, newest, stale, changes };
}
