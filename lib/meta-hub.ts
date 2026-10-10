// Meta / Research hub: what is being played, by role and tournament, from the same evidence Champion Pool uses
// (meta.json event stats, recorded drafts, supplied game pages). Display only: nothing here touches saved pairings, and
// nothing is computed from champion attributes. Where the data cannot support a number, the number is left out.
import { comparePatchDesc, fresher } from "./evidence";
import { eventStats, listsRole, presenceOf, proGames, type EventStat, type ProGame } from "./pool-stats";
import { ROLES, type BotPairing, type Meta, type MetaEvent, type ProDraft, type Role, type Source } from "./schema";

export interface HubInput { meta: Meta; proDrafts: ProDraft[]; botPairings: BotPairing[]; sources: Record<string, Source> }

export interface HubData {
  events: MetaEvent[]; // newest patch first
  games: ProGame[]; // one per team side (or supplied duo), newest first
  stats: EventStat[];
}

export function hubData(input: HubInput): HubData {
  const games = proGames(input);
  return {
    events: [...input.meta.events].sort((a, b) => comparePatchDesc(a.patch, b.patch)),
    games,
    stats: eventStats(input.meta, games),
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

/** A role tab, or ALL: every champion in scope, including those no source or recorded game places in a role. */
export type RoleTab = Role | "ALL";

export interface RoleRow {
  id: string;
  role?: Role; // the tab's role; undefined on the ALL tab
  roles: Role[]; // roles the evidence shows (source-named or recorded); empty when none does
  stat?: EventStat; // tournament aggregate: newest matching event stat
  stats: EventStat[]; // every matching event stat, newest first
  games: ProGame[]; // recorded evidence: stored games (in this role, or any role on ALL), newest first
  latest?: { event?: MetaEvent; eventName: string; patch?: string; date?: string };
}

export function roleRows(d: HubData, role: RoleTab, eventId?: string): RoleRow[] {
  const all = role === "ALL";
  const stats = d.stats.filter(inEvent(eventId)).filter((s) => all || listsRole(s, role)).sort((a, b) => fresher(a.event, b.event));
  const games = d.games.filter(inEvent(eventId)).filter((g) => all || g.picks[role]);
  const playedAs = (g: ProGame, id: string) => (all ? ROLES.filter((r) => g.picks[r] === id) : g.picks[role] === id ? [role] : []);
  const ids = new Set([...stats.map((s) => s.stat.champion), ...games.flatMap((g) => (all ? Object.values(g.picks) : [g.picks[role]]) as string[])]);
  return [...ids].map((id) => {
    const mine = stats.filter((s) => s.stat.champion === id);
    const stat = mine[0];
    const played = games.filter((g) => playedAs(g, id).length);
    const seen = new Set<Role>([...mine.flatMap((s) => s.roles), ...played.flatMap((g) => playedAs(g, id))]);
    const fromGame = played[0] && { event: played[0].event, eventName: played[0].eventName, patch: played[0].patch, date: played[0].date };
    const fromStat = stat && { event: stat.event, eventName: stat.event.short, patch: stat.event.patch };
    const latest = fromGame && fromStat ? (fresher(fromStat, fromGame) < 0 ? fromStat : fromGame) : fromGame ?? fromStat;
    return { id, role: all ? undefined : role, roles: all ? ROLES.filter((r) => seen.has(r)) : [role], stat, stats: mine, games: played, latest };
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
    if (key === "winRate") return s?.winRate ?? undefined;
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

export interface Trend { id: string; role?: Role; from: number; to: number; fromPicks: number; toPicks: number }
export interface Trending { older?: MetaEvent; newer?: MetaEvent; rising: Trend[]; falling: Trend[]; blocked?: string }

// A move counts only with a pick rate in both events (picks / total games), at least MIN_PICKS picks on the side that
// carries the claim, and a change of at least MIN_SHIFT. One game never makes a trend. Picks are champion-wide, so a
// trend is per champion; role is only a label from the stat's roles.
export const MIN_PICKS = 3;
export const MIN_SHIFT = 0.1;

export function trending(d: HubData): Trending {
  const [newer, older] = d.events;
  if (!newer || !older) return { rising: [], falling: [], blocked: "Only one tournament is recorded." };
  const missing = [newer, older].filter((e) => !e.games).map((e) => e.short);
  if (missing.length) return { older, newer, rising: [], falling: [], blocked: `No total game count for ${missing.join(" and ")}, so pick rates can't be compared.` };
  const statOf = (e: MetaEvent, id: string) => d.stats.find((x) => x.event.id === e.id && x.stat.champion === id);
  const ids = new Set(d.stats.filter((s) => s.event.id === newer.id || s.event.id === older.id).map((s) => s.stat.champion));
  const rising: Trend[] = [], falling: Trend[] = [];
  for (const id of ids) {
    const n = statOf(newer, id), o = statOf(older, id);
    // A champion missing from a partial stats list may simply be unlisted, so absence only counts as zero when complete.
    const nv = n ? { picks: n.stat.picks, rate: n.stat.picks / newer.games! } : newer.statsComplete ? { picks: 0, rate: 0 } : undefined;
    const ov = o ? { picks: o.stat.picks, rate: o.stat.picks / older.games! } : older.statsComplete ? { picks: 0, rate: 0 } : undefined;
    if (!nv || !ov) continue;
    const t = { id, role: (n ?? o)!.roles[0], from: ov.rate, to: nv.rate, fromPicks: ov.picks, toPicks: nv.picks };
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
  for (const s of d.stats) for (const r of s.roles) {
    if (role && r !== role) continue;
    const c = cell(row(s.stat.champion, r), s.event);
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
