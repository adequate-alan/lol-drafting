// Observed pro evidence for the Draft Room: what recorded pro teams played next to the locked picks, and the closest
// recorded drafts and comp shells. Recommendations themselves are ranked by draft fit in lib/recommend.ts; nothing
// here feeds that score.
import type { Draft } from "./evaluate";
import { fresher } from "./evidence";
import { ROLES, type BotPairing, type Champion, type CompShell, type MetaEvent, type MidJunglePairing, type PoolEntry, type ProDraft, type Role, type Source, type TopPick } from "./schema";

export interface SuggestData {
  champions: Champion[];
  botPairings: BotPairing[];
  midJungle: MidJunglePairing[];
  topPicks: TopPick[];
  proDrafts: ProDraft[];
  shells: CompShell[];
  pool: PoolEntry[];
  events?: MetaEvent[];
}

export interface Suggestion { champion: string; score: number; reasons: string[] }
export type ByRole = Partial<Record<Role, Suggestion[]>>;

const openRoles = (draft: Draft) => ROLES.filter((r) => !draft[r]);
const locked = (draft: Draft) => new Set(Object.values(draft).filter(Boolean) as string[]);

export interface ProEvidence { label: string; event: string; patch?: string; date?: string; pending: boolean }
export interface ProLine { event: string; games: number; patch?: string; date?: string; ongoing: boolean }
export interface ProSuggestion extends Suggestion { evidence: ProEvidence[]; lines: ProLine[] }
export type ProByRole = Partial<Record<Role, ProSuggestion[]>>;

/**
 * What pro teams played next to the locked picks: recorded drafts, plus bot/support duos seen on a Gol.gg game page that
 * was supplied during review but is not a recorded draft yet (pending refresh). Freshest patch first, then game count.
 */
export function proSuggestions(draft: Draft, proDrafts: ProDraft[], extra: {
  botPairings?: BotPairing[]; events?: MetaEvent[]; sources?: Record<string, Source>;
} = {}, limit = 6): ProByRole {
  const events = extra.events ?? [];
  const sources = extra.sources ?? {};
  const taken = locked(draft);
  const out: Partial<Record<Role, Map<string, ProSuggestion>>> = {};
  const add = (role: Role, champion: string, ev: ProEvidence) => {
    if (draft[role] || taken.has(champion)) return;
    const m = (out[role] ??= new Map());
    const x = m.get(champion) ?? { champion, score: 0, reasons: [], evidence: [], lines: [] };
    x.score += 1;
    x.evidence.push(ev);
    const why = ev.pending ? `${ev.label} (pending refresh)` : ev.label;
    if (!x.reasons.includes(why)) x.reasons.push(why);
    m.set(champion, x);
  };
  const eventOf = (name?: string) => events.find((e) => e.name === name || e.id === name);

  const lockedRoles = ROLES.filter((r) => draft[r]);
  for (const d of proDrafts) {
    if (!lockedRoles.some((r) => d.picks[r] === draft[r])) continue;
    const ev = eventOf(d.tournament);
    const game = d.sources.map((id) => sources[id]).find((s) => s?.type === "golgg-game");
    for (const role of openRoles(draft)) add(role, d.picks[role], {
      label: `${d.team} ${d.seriesGame}`, event: ev?.short ?? d.tournament, patch: d.patch ?? ev?.patch, date: game?.date, pending: false,
    });
  }
  for (const b of extra.botPairings ?? []) {
    for (const o of b.observedProPairings) {
      if (o.backedByGame) continue; // already counted through its recorded draft
      const games = o.sources.map((id) => sources[id]).filter((s): s is Source => s?.type === "golgg-game" && !!s.pendingClaim);
      if (!games.length || games.length !== o.sources.length) continue;
      const ev = o.event ? events.find((e) => e.id === o.event) : undefined;
      for (const g of games) {
        const e: ProEvidence = { label: g.seriesGame ?? `${g.team} vs ${g.opponent}`, event: ev?.short ?? o.context, patch: g.patch ?? ev?.patch, date: g.date, pending: true };
        if (draft.BOT === b.champion) add("SUPPORT", o.champion, e);
        if (draft.SUPPORT === o.champion) add("BOT", b.champion, e);
      }
    }
  }

  const ongoing = new Set(events.filter((e) => e.status === "ongoing").map((e) => e.short));
  return Object.fromEntries(openRoles(draft).map((r) => [r, [...(out[r]?.values() ?? [])]
    .map((x) => {
      const by = new Map<string, ProLine>();
      for (const e of x.evidence) {
        const l = by.get(e.event) ?? { event: e.event, games: 0, patch: e.patch, date: e.date, ongoing: ongoing.has(e.event) };
        l.games += 1;
        if (e.date && (!l.date || e.date > l.date)) l.date = e.date;
        by.set(e.event, l);
      }
      return { ...x, lines: [...by.values()].sort(fresher) };
    })
    .sort((a, b) => fresher(a.lines[0], b.lines[0]) || b.score - a.score || a.champion.localeCompare(b.champion))
    .slice(0, limit)]));
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
