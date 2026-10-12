// Freshness for Observed Pro Evidence: which event, patch and date a pairing comes from, so a 16.18 game reads as newer
// than a 16.16 one. Display only; nothing here feeds the draft-fit score or touches saved pairings.
import { patchLabel } from "./patch";
import type { MetaEvent, ObservedPairing, Source } from "./schema";

export type EventMap = Record<string, MetaEvent>;

export interface EvidenceLine {
  pairing: ObservedPairing;
  games: number;
  label: string; // event short name, or the pairing's context when it has no event
  patch?: string;
  date?: string; // latest known game date (YYYY-MM-DD)
  ongoing: boolean;
}

/** Newer patch first ("16.18" before "16.16"); a missing patch sorts last. */
export function comparePatchDesc(a?: string, b?: string): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export const fresher = (a: { patch?: string; date?: string }, b: { patch?: string; date?: string }) =>
  comparePatchDesc(a.patch, b.patch) || (b.date ?? "").localeCompare(a.date ?? "");

/** "Oct 3" from "2026-10-03". */
export function shortDate(day?: string): string | undefined {
  if (!day) return undefined;
  const [, m, d] = day.split("-").map(Number);
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${d}`;
}

export function evidenceLine(o: ObservedPairing, events: EventMap, sources: Record<string, Source>): EvidenceLine {
  const ev = o.event ? events[o.event] : undefined;
  const cited = o.sources.map((id) => sources[id]).filter(Boolean);
  const games = o.backedByGame ? o.proDraftIds.length : cited.filter((s) => s.type === "golgg-game").length;
  const date = cited.map((s) => s.date).filter((d): d is string => !!d).sort().at(-1);
  return { pairing: o, games, label: ev?.short ?? o.context, patch: ev?.patch ?? cited.find((s) => s.patch)?.patch, date, ongoing: ev?.status === "ongoing" };
}

/** "1 game · Demacia Cup · 26.18 · Oct 3" (Riot's patch label) */
export function describeLine(l: Pick<EvidenceLine, "games" | "label" | "patch" | "date">): string {
  return [l.games ? `${l.games} game${l.games > 1 ? "s" : ""}` : undefined, l.label, l.patch && patchLabel(l.patch), shortDate(l.date)].filter(Boolean).join(" · ");
}

/** One group per partner champion, freshest evidence first; groups ordered by their freshest line, then game count. */
export function groupObserved(list: ObservedPairing[], events: EventMap, sources: Record<string, Source>) {
  const groups = new Map<string, EvidenceLine[]>();
  for (const o of list) {
    const lines = groups.get(o.champion) ?? [];
    lines.push(evidenceLine(o, events, sources));
    groups.set(o.champion, lines);
  }
  return [...groups.entries()]
    .map(([champion, lines]) => ({ champion, lines: lines.sort(fresher), games: lines.reduce((n, l) => n + l.games, 0) }))
    .sort((a, b) => fresher(a.lines[0], b.lines[0]) || b.games - a.games);
}
