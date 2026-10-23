// Champion Pool stats: role-aware Observed Pro Evidence next to alan's pool tiers. Built only from recorded pro drafts,
// game pages supplied during review (pending refresh) and Gol.gg tournament stats in meta.json. Never from champion
// attributes or saved pairings, and nothing here changes a pool tier.
import { scopeKey } from "./tournament-scope";
import { fresher } from "./evidence";
import type { BotPairing, Meta, MetaEvent, MetaStat, PoolEntry, ProDraft, Role, Source } from "./schema";

export type Tier = "core" | "depth" | "flex";
export const TIERS: [Tier, string][] = [["core", "Core"], ["depth", "Depth"], ["flex", "Prepared / flex"]];

// The lane partner a pairing is read against.
export const PARTNER_ROLE: Record<Role, Role> = { TOP: "JUNGLE", JUNGLE: "MID", MID: "JUNGLE", BOT: "SUPPORT", SUPPORT: "BOT" };

export interface ProGame {
  key: string;
  event: MetaEvent | undefined;
  eventName: string;
  scope?: string; // tournament scope key (lib/tournament-scope.ts): the event, or the Worlds main event's stage
  label: string; // "Gen.G Finals G1" or "JDG vs BRO"
  team?: string; // the side these picks belong to, when known
  opponent?: string;
  gameSource?: string; // the Gol.gg game page id, shared by both sides of one game
  patch?: string;
  date?: string;
  picks: Partial<Record<Role, string>>; // a supplied duo has only BOT and SUPPORT
  draftId?: string;
  pending: boolean; // game page supplied during review, not a recorded draft
  sources: string[];
}

// roles: where this champion-wide aggregate is shown. From the source (stat.role, verified rolePicks) or, when the source
// names none, from the roles recorded games show the champion in. Never from the roster's role list.
export interface EventStat { event: MetaEvent; stat: MetaStat; roles: Role[] }

export interface PoolRow {
  id: string;
  role: Role;
  tier: Tier;
  order: number; // position in alan's pool list
  reason?: string;
  stat?: EventStat; // newest event with a stat for this champion in this role
  stats: EventStat[]; // every event's stat for this champion in this role, newest first
  games: ProGame[]; // games where the champion played this role, newest first
  latest?: { event: MetaEvent | undefined; eventName: string; patch?: string; date?: string };
  partner?: { id: string; games: number };
}

export interface PoolInput {
  pool: PoolEntry[];
  meta: Meta;
  proDrafts: ProDraft[];
  botPairings: BotPairing[];
  sources: Record<string, Source>;
}

const eventByName = (events: MetaEvent[], name?: string) => events.find((e) => e.name === name || e.id === name);

/** Every pro game the repo can show by role: recorded drafts plus supplied bot/support game pages. */
export function proGames({ meta, proDrafts, botPairings, sources }: Omit<PoolInput, "pool">): ProGame[] {
  const out: ProGame[] = proDrafts.map((d) => {
    const ev = eventByName(meta.events, d.tournament);
    const game = d.sources.map((id) => sources[id]).find((s) => s?.type === "golgg-game");
    return { key: d.id, event: ev, eventName: ev?.short ?? d.tournament, scope: ev && scopeKey(ev.id, d.stage), label: `${d.team} ${d.seriesGame}`, team: d.team, opponent: d.opponent, gameSource: game?.id,
      patch: d.patch ?? ev?.patch, date: d.date ?? game?.date, picks: d.picks, draftId: d.id, pending: false, sources: d.sources };
  });
  const recorded = new Set(proDrafts.flatMap((d) => d.sources));
  for (const b of botPairings) for (const o of b.observedProPairings) {
    if (o.backedByGame) continue; // its recorded draft is already listed
    const cited = o.sources.map((id) => sources[id]);
    if (!cited.length || !cited.every((s) => s?.type === "golgg-game" && s.pendingClaim && !recorded.has(s.id))) continue;
    for (const s of cited as Source[]) {
      const ev = o.event ? meta.events.find((e) => e.id === o.event) : eventByName(meta.events, s.tournament);
      out.push({ key: `${s.id}-${b.champion}-${o.champion}`, event: ev, eventName: ev?.short ?? s.tournament ?? o.context,
        label: s.seriesGame ?? `${s.team} vs ${s.opponent}`, team: s.team, opponent: s.opponent, gameSource: s.id,
        patch: s.patch ?? ev?.patch, date: s.date,
        picks: { BOT: b.champion, SUPPORT: o.champion }, pending: true, sources: [s.id] });
    }
  }
  return out.sort(fresher);
}

/** Tournament stats per event. The LCK playoffs keep theirs in meta.stats; other events carry their own. */
export function eventStats(meta: Meta, games: ProGame[] = []): EventStat[] {
  const main = eventByName(meta.events, meta.tournament.name);
  const played = new Map<string, Set<Role>>();
  for (const g of games) for (const [r, id] of Object.entries(g.picks) as [Role, string][]) {
    if (!played.has(id)) played.set(id, new Set());
    played.get(id)!.add(r);
  }
  const out: EventStat[] = [];
  for (const e of meta.events) {
    const list = e === main ? [...meta.stats, ...e.stats] : e.stats;
    for (const stat of list) out.push({ event: e, stat, roles: statRoles(stat, played.get(stat.champion)) });
  }
  return out;
}

function statRoles(stat: MetaStat, played?: Set<Role>): Role[] {
  const verified = Object.entries(stat.rolePicks ?? {}).filter(([, n]) => n > 0).map(([r]) => r as Role);
  const named = [stat.role, stat.flexRole].filter((r): r is Role => !!r);
  const roles = new Set<Role>([...named, ...verified]);
  if (!roles.size) for (const r of played ?? []) roles.add(r);
  return [...roles];
}

// ---------- tournament aggregates ----------
// Two datasets, never substituted for each other: tournament aggregates (meta.json stats: picks, bans, win rate, total
// games) and recorded games (proGames: drafts and game pages stored in this repo). Aggregates are never counted from
// recorded games, and recorded counts never stand in for tournament numbers.

/** Presence = (picks + bans) / tournament games. Champion-wide, like bans; unknown without a ban count or game total. */
export const presenceOf = ({ event, stat }: EventStat): number | null =>
  stat.bans == null || !event.games ? null : (stat.picks + stat.bans) / event.games;

/** The aggregate is shown on a role row when the source names that role or recorded games show the champion there. */
export const listsRole = (x: EventStat, role: Role) => x.roles.includes(role);

/** Picks and win rate are for all roles unless verified role picks say otherwise; worth flagging on a flex champion. */
/** True when the evidence does not place this aggregate in `role`: the number is the champion's, not this role's. */
export const roleUnconfirmed = (x: EventStat, role: Role) => !listsRole(x, role);
export const allRoles = (x: EventStat) => x.roles.length > 1 && !x.stat.rolePicks;

const ROLE_ABBR: Record<Role, string> = { TOP: "TOP", JUNGLE: "JG", MID: "MID", BOT: "BOT", SUPPORT: "SUP" };

/** "8 SUP" or "6 MID · 2 SUP", only from verified role pick counts. */
export function roleShare(stat: MetaStat): string | undefined {
  const e = Object.entries(stat.rolePicks ?? {}).filter(([, n]) => n > 0) as [Role, number][];
  return e.length ? e.sort((a, b) => b[1] - a[1]).map(([r, n]) => `${n} ${ROLE_ABBR[r]}`).join(" · ") : undefined;
}

export interface PoolFilter { event?: string; patch?: string }

export function poolRows(input: PoolInput, filter: PoolFilter = {}): PoolRow[] {
  const keep = (ev: MetaEvent | undefined, patch?: string) =>
    (!filter.event || ev?.id === filter.event) && (!filter.patch || (patch ?? ev?.patch) === filter.patch);
  const games = proGames(input).filter((g) => keep(g.event, g.patch));
  const stats = eventStats(input.meta, proGames(input)).filter((s) => keep(s.event)).sort((a, b) => fresher(a.event, b.event));
  const rows: PoolRow[] = [];
  let order = 0;
  for (const p of input.pool) {
    for (const [tier] of TIERS) for (const id of p[tier]) {
      const role = p.role;
      // Role-aware: a stat counts only for the role it is recorded under (Camille top stats never show on Camille support).
      // A champion-wide total that no source or recorded game places in any role still belongs to this champion, so it
      // shows on its pool rows marked "role not shown" (roleUnconfirmed) rather than disappearing.
      const mine = stats.filter((s) => s.stat.champion === id && (listsRole(s, role) || !s.roles.length));
      const played = games.filter((g) => g.picks[role] === id);
      const counts = new Map<string, number>();
      for (const g of played) { const pid = g.picks[PARTNER_ROLE[role]]; if (pid) counts.set(pid, (counts.get(pid) ?? 0) + 1); }
      // Most games first; on a tie, the partner from the fresher game (played is already newest first).
      const partner = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      const g0 = played[0];
      // Latest appearance: the fresher of the newest game and the newest event stat.
      const fromGame = g0 && { event: g0.event, eventName: g0.eventName, patch: g0.patch, date: g0.date };
      const fromStat = mine[0] && { event: mine[0].event, eventName: mine[0].event.short, patch: mine[0].event.patch };
      const latest = fromGame && fromStat ? (fresher(fromStat, fromGame) < 0 ? fromStat : fromGame) : fromGame ?? fromStat;
      rows.push({ id, role, tier, order: order++, reason: tier === "core" ? p.coreReasons[id] : undefined,
        stat: mine[0], stats: mine, games: played, latest, partner: partner && { id: partner[0], games: partner[1] } });
    }
  }
  return rows;
}

export const SORTS = { tier: "Pool tier", picks: "Picks", bans: "Bans", presence: "Presence", winRate: "Win rate", recency: "Recency" } as const;
export type SortKey = keyof typeof SORTS;

const TIER_RANK: Record<Tier, number> = { core: 0, depth: 1, flex: 2 };

/** Pool tier is the default order (alan's call, not pro popularity). Missing values sort last. */
export function sortRows(rows: PoolRow[], key: SortKey): PoolRow[] {
  const num = (r: PoolRow) => {
    const s = r.stat?.stat;
    if (key === "picks") return s?.picks;
    if (key === "bans") return s?.bans ?? undefined;
    if (key === "presence") return r.stat ? presenceOf(r.stat) ?? undefined : undefined;
    if (key === "winRate") return s?.winRate ?? undefined;
    return undefined;
  };
  const byTier = (a: PoolRow, b: PoolRow) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || a.order - b.order;
  return [...rows].sort((a, b) => {
    if (key === "tier") return byTier(a, b);
    if (key === "recency") {
      if (!a.latest || !b.latest) return Number(!a.latest) - Number(!b.latest) || byTier(a, b);
      return fresher(a.latest, b.latest) || b.games.length - a.games.length || byTier(a, b);
    }
    const x = num(a), y = num(b);
    if (x == null || y == null) return Number(x == null) - Number(y == null) || byTier(a, b);
    return y - x || byTier(a, b);
  });
}
