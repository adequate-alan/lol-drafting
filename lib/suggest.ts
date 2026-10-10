// Observed pro evidence for the Draft Room: what recorded pro teams played next to the locked picks, and the closest
// recorded drafts and comp shells. Recommendations themselves are ranked by draft fit in lib/recommend.ts; nothing
// here feeds that score.
import type { Draft } from "./evaluate";
import { ROLES, type BotPairing, type Champion, type CompShell, type MidJunglePairing, type PoolEntry, type ProDraft, type Role, type TopPick } from "./schema";

export interface SuggestData {
  champions: Champion[];
  botPairings: BotPairing[];
  midJungle: MidJunglePairing[];
  topPicks: TopPick[];
  proDrafts: ProDraft[];
  shells: CompShell[];
  pool: PoolEntry[];
}

export interface Suggestion { champion: string; score: number; reasons: string[] }
export type ByRole = Partial<Record<Role, Suggestion[]>>;

const openRoles = (draft: Draft) => ROLES.filter((r) => !draft[r]);
const locked = (draft: Draft) => new Set(Object.values(draft).filter(Boolean) as string[]);

function collector(draft: Draft) {
  const out: Partial<Record<Role, Map<string, Suggestion>>> = {};
  const taken = locked(draft);
  const add = (role: Role, champion: string, score: number, reason: string) => {
    if (draft[role] || taken.has(champion)) return;
    const m = (out[role] ??= new Map());
    const s = m.get(champion) ?? { champion, score: 0, reasons: [] };
    s.score += score;
    if (!s.reasons.includes(reason)) s.reasons.push(reason);
    m.set(champion, s);
  };
  const raw = (): ByRole => Object.fromEntries(openRoles(draft).map((r) => [r, [...(out[r]?.values() ?? [])]]));
  const result = (limit = 6): ByRole => Object.fromEntries(Object.entries(raw()).map(([r, list]) => [
    r, list!.sort((a, b) => b.score - a.score || a.champion.localeCompare(b.champion)).slice(0, limit),
  ]));
  return { add, raw, result };
}

export function proSuggestions(draft: Draft, proDrafts: ProDraft[]): ByRole {
  const { add, result } = collector(draft);
  const lockedRoles = ROLES.filter((r) => draft[r]);
  for (const d of proDrafts) {
    const hits = lockedRoles.filter((r) => d.picks[r] === draft[r]);
    if (!hits.length) continue;
    for (const role of openRoles(draft)) add(role, d.picks[role], 1, `${d.team} ${d.seriesGame}`);
  }
  return result();
}

export function similarProDrafts(draft: Draft, proDrafts: ProDraft[], limit = 6) {
  const lockedRoles = ROLES.filter((r) => draft[r]);
  const all = locked(draft);
  return proDrafts
    .map((d) => ({
      draft: d,
      sameRole: lockedRoles.filter((r) => d.picks[r] === draft[r]).length,
      anyRole: ROLES.filter((r) => all.has(d.picks[r])).length,
    }))
    .filter((x) => x.anyRole > 0)
    .sort((a, b) => b.sameRole - a.sameRole || b.anyRole - a.anyRole)
    .slice(0, limit);
}

export function similarShells(draft: Draft, shells: CompShell[], limit = 4) {
  const lockedRoles = ROLES.filter((r) => draft[r]);
  return shells
    .map((s) => ({
      shell: s,
      exact: lockedRoles.filter((r) => s.slots[r].champion === draft[r]).length,
      swap: lockedRoles.filter((r) => s.slots[r].swaps.includes(draft[r]!)).length,
    }))
    .filter((x) => x.exact + x.swap > 0)
    .sort((a, b) => b.exact - a.exact || b.swap - a.swap)
    .slice(0, limit);
}
