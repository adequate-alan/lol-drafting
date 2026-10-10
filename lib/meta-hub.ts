// Meta / Research hub: what is being played, by role and tournament, from the same evidence Champion Pool uses
// (meta.json event stats, recorded drafts, supplied game pages). Display only: nothing here touches saved pairings, and
// nothing is computed from champion attributes. Where the data cannot support a number, the number is left out.
import { comparePatchDesc, fresher } from "./evidence";
import { eventStats, listsRole, presenceOf, proGames, type EventStat, type ProGame } from "./pool-stats";
import type { BotPairing, Meta, MetaEvent, ProDraft, Role, Source } from "./schema";

export interface HubInput { meta: Meta; proDrafts: ProDraft[]; botPairings: BotPairing[]; sources: Record<string, Source> }

export interface HubData {
  events: MetaEvent[]; // newest patch first
  games: ProGame[]; // one per team side (or supplied duo), newest first
  stats: EventStat[];
}

export function hubData(input: HubInput): HubData {
  return {
    events: [...input.meta.events].sort((a, b) => comparePatchDesc(a.patch, b.patch)),
    games: proGames(input),
    stats: eventStats(input.meta),
  };
}

const inEvent = (eventId?: string) => (x: { event?: MetaEvent }) => !eventId || x.event?.id === eventId;

// ---------- event summary ----------

export interface EventSummary {
  event: MetaEvent;
  recordedGames: number; // distinct Gol.gg game pages with recorded picks
  champions: number; // champions with a stat or a recorded pick in this event
  refreshed: boolean; // every source for the event re-read by Claude
  providedOn?: string; // newest "supplied during review" date among its sources
}

export function eventSummary(d: HubData, event: MetaEvent, sources: Record<string, Source>): EventSummary {
  const games = d.games.filter(inEvent(event.id));
  const champs = new Set<string>();
  for (const g of games) for (const id of Object.values(g.picks)) if (id) champs.add(id);
  for (const s of d.stats.filter(inEvent(event.id))) champs.add(s.stat.champion);
  const ids = new Set([...event.sources, ...games.flatMap((g) => g.sources)]);
  const list = [...ids].map((id) => sources[id]).filter(Boolean);
  return {
    event,
    recordedGames: new Set(games.map((g) => g.gameSource ?? g.key)).size,
    champions: champs.size,
    refreshed: list.length > 0 && list.every((s) => s.refreshStatus === "verified"),
    providedOn: list.map((s) => s.pendingClaim?.providedOn).filter((x): x is string => !!x).sort().at(-1),
  };
}

// ---------- role table ----------

export interface RoleRow {
  id: string;
  role: Role;
  stat?: EventStat; // tournament aggregate: newest matching event stat for this role
  stats: EventStat[]; // every matching event stat, newest first
  games: ProGame[]; // recorded evidence: stored games in this role, newest first
  latest?: { event?: MetaEvent; eventName: string; patch?: string; date?: string };
}

export function roleRows(d: HubData, role: Role, eventId?: string): RoleRow[] {
  const stats = d.stats.filter(inEvent(eventId)).filter((s) => listsRole(s.stat, role)).sort((a, b) => fresher(a.event, b.event));
  const games = d.games.filter(inEvent(eventId)).filter((g) => g.picks[role]);
  const ids = new Set([...stats.map((s) => s.stat.champion), ...games.map((g) => g.picks[role]!)]);
  return [...ids].map((id) => {
    const mine = stats.filter((s) => s.stat.champion === id);
    const stat = mine[0];
    const played = games.filter((g) => g.picks[role] === id);
    const fromGame = played[0] && { event: played[0].event, eventName: played[0].eventName, patch: played[0].patch, date: played[0].date };
    const fromStat = stat && { event: stat.event, eventName: stat.event.short, patch: stat.event.patch };
    const latest = fromGame && fromStat ? (fresher(fromStat, fromGame) < 0 ? fromStat : fromGame) : fromGame ?? fromStat;
    return { id, role, stat, stats: mine, games: played, latest };
  });
}

export const HUB_SORTS = { presence: "Presence", picks: "Picks", bans: "Bans", winRate: "Win rate", recency: "Recency" } as const;
export type HubSort = keyof typeof HUB_SORTS;

export function sortRoleRows(rows: RoleRow[], key: HubSort): RoleRow[] {
  const val = (r: RoleRow): number | undefined => {
    const s = r.stat?.stat;
    if (key === "picks") return s?.picks;
    if (key === "bans") return s?.bans ?? undefined;
    if (key === "presence") return r.stat ? presenceOf(r.stat) ?? undefined : undefined;
    if (key === "winRate") return s?.winRate;
    return undefined;
  };
  const tie = (a: RoleRow, b: RoleRow) => b.games.length - a.games.length || a.id.localeCompare(b.id);
  return [...rows].sort((a, b) => {
    if (key === "recency") {
      if (!a.latest || !b.latest) return Number(!a.latest) - Number(!b.latest) || tie(a, b);
      return fresher(a.latest, b.latest) || tie(a, b);
    }
    const x = val(a), y = val(b);
    if (x == null || y == null) return Number(x == null) - Number(y == null) || tie(a, b);
    return y - x || tie(a, b);
  });
}

// ---------- trending ----------

export interface Trend { id: string; role: Role; from: number; to: number; fromPicks: number; toPicks: number }
export interface Trending { older?: MetaEvent; newer?: MetaEvent; rising: Trend[]; falling: Trend[]; blocked?: string }

// A move counts only with a pick rate in both events (picks / total games), at least MIN_PICKS picks on the side that
// carries the claim, and a change of at least MIN_SHIFT. One game never makes a trend.
export const MIN_PICKS = 3;
export const MIN_SHIFT = 0.1;

export function trending(d: HubData): Trending {
  const [newer, older] = d.events;
  if (!newer || !older) return { rising: [], falling: [], blocked: "Only one tournament is recorded." };
  const missing = [newer, older].filter((e) => !e.games).map((e) => e.short);
  if (missing.length) return { older, newer, rising: [], falling: [], blocked: `No total game count for ${missing.join(" and ")}, so pick rates can't be compared.` };
  const rate = (e: MetaEvent, id: string, role: Role) => {
    const s = d.stats.find((x) => x.event.id === e.id && x.stat.champion === id && listsRole(x.stat, role));
    return s ? { picks: s.stat.picks, rate: s.stat.picks / e.games! } : undefined;
  };
  const keys = new Set(d.stats.filter((s) => s.event.id === newer.id || s.event.id === older.id).map((s) => `${s.stat.champion}|${s.stat.role}`));
  const rising: Trend[] = [], falling: Trend[] = [];
  for (const k of keys) {
    const [id, role] = k.split("|") as [string, Role];
    const n = rate(newer, id, role), o = rate(older, id, role);
    // A champion missing from a partial stats list may simply be unlisted, so absence only counts as zero when complete.
    const nv = n ?? (newer.statsComplete ? { picks: 0, rate: 0 } : undefined);
    const ov = o ?? (older.statsComplete ? { picks: 0, rate: 0 } : undefined);
    if (!nv || !ov) continue;
    const t = { id, role, from: ov.rate, to: nv.rate, fromPicks: ov.picks, toPicks: nv.picks };
    if (nv.rate - ov.rate >= MIN_SHIFT && nv.picks >= MIN_PICKS) rising.push(t);
    if (ov.rate - nv.rate >= MIN_SHIFT && ov.picks >= MIN_PICKS) falling.push(t);
  }
  rising.sort((a, b) => b.to - b.from - (a.to - a.from));
  falling.sort((a, b) => b.from - b.to - (a.from - a.to));
  return { older, newer, rising, falling };
}

// ---------- tournament comparison ----------

// picks / presence are the tournament aggregate; games counts recorded games. Shown side by side, never combined.
export interface CompareCell { picks?: number; presence?: number | null; games: number; latest?: string }
export interface CompareRow { id: string; role: Role; cells: Record<string, CompareCell>; seenIn: string[] }

export function comparison(d: HubData, role?: Role): CompareRow[] {
  const rows = new Map<string, CompareRow>();
  const row = (id: string, r: Role) => {
    const k = `${id}|${r}`;
    if (!rows.has(k)) rows.set(k, { id, role: r, cells: {}, seenIn: [] });
    return rows.get(k)!;
  };
  const cell = (x: CompareRow, e: MetaEvent) => (x.cells[e.id] ??= { games: 0 });
  for (const s of d.stats) {
    if (role && s.stat.role !== role) continue;
    const c = cell(row(s.stat.champion, s.stat.role), s.event);
    c.picks = s.stat.picks;
    c.presence = presenceOf(s);
  }
  for (const g of d.games) {
    if (!g.event) continue;
    for (const [r, id] of Object.entries(g.picks) as [Role, string][]) {
      if (role && r !== role) continue;
      const c = cell(row(id, r), g.event);
      c.games += 1;
      if (g.date && (!c.latest || g.date > c.latest)) c.latest = g.date;
    }
  }
  const order = d.events.map((e) => e.id);
  for (const x of rows.values()) x.seenIn = order.filter((id) => x.cells[id]);
  return [...rows.values()].sort((a, b) => b.seenIn.length - a.seenIn.length
    || order.indexOf(a.seenIn[0]) - order.indexOf(b.seenIn[0])
    || (b.cells[b.seenIn[0]].picks ?? b.cells[b.seenIn[0]].games) - (a.cells[a.seenIn[0]].picks ?? a.cells[a.seenIn[0]].games)
    || a.id.localeCompare(b.id));
}

// ---------- pairings ----------

export interface Pairing { a: string; b: string; games: ProGame[]; events: string[]; latest: ProGame }

/** Duos seen together in recorded games: roles a + b on the same side. Observed Pro Evidence only. */
export function pairings(d: HubData, roleA: Role, roleB: Role, eventId?: string): Pairing[] {
  const map = new Map<string, ProGame[]>();
  for (const g of d.games.filter(inEvent(eventId))) {
    const a = g.picks[roleA], b = g.picks[roleB];
    if (!a || !b) continue;
    const k = `${a}|${b}`;
    map.set(k, [...(map.get(k) ?? []), g]);
  }
  return [...map.entries()].map(([k, games]) => {
    const [a, b] = k.split("|");
    return { a, b, games, events: [...new Set(games.map((g) => g.eventName))], latest: games[0] };
  }).sort((x, y) => fresher(x.latest, y.latest) || y.games.length - x.games.length || x.a.localeCompare(y.a));
}

// ---------- recent drafts ----------

export interface DraftGame { key: string; event?: MetaEvent; eventName: string; patch?: string; date?: string; sides: ProGame[]; sources: string[]; partial: boolean }

/** Both sides of a recorded game grouped by its Gol.gg page; supplied duos show as partial drafts. */
export function recentDrafts(d: HubData, eventId?: string): DraftGame[] {
  const map = new Map<string, ProGame[]>();
  for (const g of d.games.filter(inEvent(eventId))) {
    const k = g.gameSource ?? g.key;
    map.set(k, [...(map.get(k) ?? []), g]);
  }
  return [...map.entries()].map(([key, sides]) => ({
    key, event: sides[0].event, eventName: sides[0].eventName, patch: sides[0].patch, date: sides[0].date, sides,
    sources: [...new Set(sides.flatMap((s) => s.sources))], partial: sides.some((s) => Object.keys(s.picks).length < 5),
  })).sort((a, b) => fresher(a, b));
}
