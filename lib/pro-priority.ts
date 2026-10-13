// Pro Priority (alan, 2026-10-12): which champions professionals prioritise on each patch, from verified data only.
// Observed Pro Evidence: it never scores, never orders a Draft Room row and never touches saved pairings, pool tiers or
// Comp Check.
//
// Two datasets, never computed from each other (the Meta stats rule, 2026-10-10):
//   - recorded games (data/pro-games.json): one record per Gol.gg game with sides, ten picks with roles, bans, winner,
//     patch and date. A tournament contributes its games per patch only when every game it has played is recorded.
//   - Gol.gg tournament tables (meta.json stats): picks, bans and wins for a whole tournament. Used for a patch only when
//     the tournament was played on that one patch (its games are never spread across patches), and only when no full
//     set of game records exists. Table rows carry no side, date or pick order.
// Anything else (a tournament with games missing and no single-patch table) is withheld and listed in the coverage line.
//
// Denominator: unique games on the patch (never team-games). Presence = games picked or banned / games with both teams'
// bans recorded; pick rate = picks / games; ban rate = games banned / games with bans recorded; win rate = wins / picks.
// Bans are champion-wide. Role picks come from the role each game page records, or from a table's verified role picks.
import { comparePatchDesc } from "./evidence";
import { turnOf } from "./top-draft";
import { patchLabel, shortPatch } from "./patch";
import { ROLES, type Meta, type MetaStat, type ProDraft, type ProGame, type ProGames, type Role } from "./schema";

// ---------- patches ----------
// Data stays keyed by Gol.gg's "16.18"; the site shows Riot's "26.18" (lib/patch.ts).
export const patchKey = (p: string) => shortPatch(p.trim());
export { patchLabel };

// ---------- contributions ----------

export interface PriorityTournament { id: string; name: string; short: string; status: "ongoing" | "complete"; group: string }

export interface Contribution {
  event: string;
  patch: string;
  kind: "games" | "table";
  games: number; // games this tournament played on this patch
  records: ProGame[]; // complete game records on this patch (all of them when kind is "games")
  table?: MetaStat[]; // kind "table": the Gol.gg tournament table
  seenRoles?: Record<string, Role[]>; // kind "table": roles stored drafts of this tournament show (no counts)
  sources: string[]; // table / match-list sources behind the numbers (game records carry their own URL)
}

export interface Withheld { event: string; patches: string[]; recorded: number; games?: number; reason: string }

export interface PriorityData {
  tournaments: PriorityTournament[];
  contributions: Contribution[];
  withheld: Withheld[];
}

// Worlds main event and its play-in are one tournament choice ("Worlds 2026, including Play-Ins").
const groupOf = (id: string) => id.replace(/-play-in$/, "");

/**
 * Splits the stored data into per-tournament, per-patch contributions. Runs at build time. `drafts` are the hand-recorded
 * drafts (pro-drafts.json): they only name roles for a table's champions, never add to a count.
 */
export function priorityData(meta: Meta, file: ProGames, drafts: ProDraft[] = []): PriorityData {
  const contributions: Contribution[] = [], withheld: Withheld[] = [];
  const tournaments: PriorityTournament[] = [];
  for (const e of meta.events) {
    tournaments.push({ id: e.id, name: e.name, short: e.short, status: e.status, group: groupOf(e.id) });
    // One record per Gol.gg game id, whatever the file holds.
    const records = [...new Map(file.games.filter((g) => g.event === e.id).map((g) => [g.id, g])).values()];
    const state = file.tournaments.find((t) => t.event === e.id);
    const total = state?.games ?? e.games;
    const patches = [...new Set(records.map((g) => patchKey(g.patch)))].sort(comparePatchDesc);
    const table = e.name === meta.tournament.name ? [...meta.stats, ...e.stats] : e.stats;
    if (total && records.length === total) {
      for (const p of patches) {
        const mine = records.filter((g) => patchKey(g.patch) === p);
        contributions.push({ event: e.id, patch: p, kind: "games", games: mine.length, records: mine, sources: e.sources });
      }
    } else if (e.statsComplete && e.games && table.length && records.every((g) => patchKey(g.patch) === patchKey(e.patch))) {
      const seenRoles: Record<string, Role[]> = {};
      for (const d of drafts.filter((x) => x.tournament === e.name)) for (const r of ROLES) {
        const id = d.picks[r];
        if (!(seenRoles[id] ??= []).includes(r)) seenRoles[id].push(r);
      }
      contributions.push({ event: e.id, patch: patchKey(e.patch), kind: "table", games: e.games, records, table, seenRoles, sources: e.sources });
    } else if (records.length || total) {
      withheld.push({ event: e.id, patches, recorded: records.length, games: total,
        reason: records.length > (total ?? Infinity) ? "more games stored than the match list shows" : "not every game is recorded and the tournament table covers more than one patch" });
    }
  }
  return { tournaments, contributions, withheld };
}

// ---------- buckets ----------

export interface Scope { patch?: string; tournaments?: string[] } // no patch = all patches (explicit); no tournaments = all

export interface OrderStats { known: number; firstPick: number; firstRotation: number; phase2: number; lastPick: number }

export interface PriorityRow {
  id: string;
  picks: number;
  bans: number; // games banned (either team), over ban-recorded games
  wins: number;
  present: number; // games picked or banned, over ban-recorded games
  pickRate: number;
  banRate: number | null;
  presence: number | null;
  winRate: number | null;
  low: boolean; // fewer than 5 picks
  rolePicks: Partial<Record<Role, number>>;
  roleVerified: boolean; // every pick has a recorded role
  namedRoles: Role[]; // roles a table names, or stored drafts show, without counts (picks then stay champion-wide)
  blue: number; red: number; // picks by side, from game records only
  sideKnown: boolean; // every pick has a recorded side
  latest?: { date: string; game: number; event: string; picked: boolean };
  order: OrderStats; // from games with both teams' pick order recorded
  patches: string[];
  events: string[];
}

export interface Bucket {
  patch?: string;
  patches: string[];
  contributions: Contribution[];
  games: number;
  banGames: number; // games with every ban recorded (table games count: Gol.gg's table holds every ban)
  recorded: number; // complete game records
  orderGames: number; // records with both teams' pick order
  tableGames: number; // games known only from a tournament table
  rows: PriorityRow[];
}

export const LOW_PICKS = 5;
export const SMALL_SAMPLE = 20; // games: below this a patch is marked as a small sample and no move is called a trend

const fullBans = (g: ProGame) => g.blue.bans.length === 5 && g.red.bans.length === 5;
// Order needs both teams' pick order and the side that picked first (not always blue since 2026; lib/top-draft.ts).
const hasOrder = (g: ProGame) => !!g.blue.pickOrder && !!g.red.pickOrder && !!g.firstPick;

export function inScope(c: Contribution, d: PriorityData, s: Scope): boolean {
  if (s.patch && c.patch !== patchKey(s.patch)) return false;
  if (!s.tournaments?.length) return true;
  const group = d.tournaments.find((t) => t.id === c.event)?.group ?? c.event;
  return s.tournaments.includes(c.event) || s.tournaments.includes(group);
}

export function bucket(d: PriorityData, s: Scope): Bucket {
  const contributions = d.contributions.filter((c) => inScope(c, d, s));
  const rows = new Map<string, PriorityRow & { _roleGaps: number; _sideGaps: number }>();
  const row = (id: string) => {
    if (!rows.has(id)) rows.set(id, {
      id, picks: 0, bans: 0, wins: 0, present: 0, pickRate: 0, banRate: null, presence: null, winRate: null, low: true,
      rolePicks: {}, roleVerified: true, namedRoles: [], blue: 0, red: 0, sideKnown: true, order: { known: 0, firstPick: 0, firstRotation: 0, phase2: 0, lastPick: 0 },
      patches: [], events: [], _roleGaps: 0, _sideGaps: 0,
    });
    return rows.get(id)!;
  };
  const seen = (r: PriorityRow, c: Contribution) => {
    if (!r.patches.includes(c.patch)) r.patches.push(c.patch);
    if (!r.events.includes(c.event)) r.events.push(c.event);
  };
  let games = 0, banGames = 0, recorded = 0, orderGames = 0, tableGames = 0;
  const counted = new Set<number>(); // a game id is counted once even if two contributions held it

  for (const c of contributions) {
    games += c.games;
    if (c.kind === "table") {
      tableGames += c.games;
      banGames += c.games;
      for (const st of c.table ?? []) {
        if (st.picks + (st.bans ?? 0) === 0) continue;
        const r = row(st.champion);
        seen(r, c);
        r.picks += st.picks;
        r.bans += st.bans ?? 0;
        r.present += st.picks + (st.bans ?? 0);
        r.wins += st.wins ?? Math.round((st.winRate ?? 0) * st.picks);
        if (st.picks) r._sideGaps += st.picks;
        const verified = Object.entries(st.rolePicks ?? {}).filter(([, n]) => n > 0) as [Role, number][];
        if (st.picks && verified.reduce((n, [, x]) => n + x, 0) === st.picks) for (const [role, n] of verified) r.rolePicks[role] = (r.rolePicks[role] ?? 0) + n;
        else if (st.picks) {
          r._roleGaps += st.picks;
          const named = [st.role, st.flexRole].filter((x): x is Role => !!x);
          for (const x of named.length ? named : c.seenRoles?.[st.champion] ?? []) if (!r.namedRoles.includes(x)) r.namedRoles.push(x);
        }
      }
      continue;
    }
    for (const g of c.records) {
      if (counted.has(g.id)) { games -= 1; continue; }
      counted.add(g.id);
      recorded += 1;
      const bansOk = fullBans(g);
      if (bansOk) banGames += 1;
      const ordered = hasOrder(g);
      if (ordered) orderGames += 1;
      const banned = new Set([...g.blue.bans, ...g.red.bans]);
      for (const side of ["blue", "red"] as const) {
        for (const role of ROLES) {
          const r = row(g[side].picks[role]);
          seen(r, c);
          r.picks += 1;
          if (bansOk) r.present += 1;
          if (g.winner === side) r.wins += 1;
          r.rolePicks[role] = (r.rolePicks[role] ?? 0) + 1;
          r[side] += 1;
          if (!r.latest || g.date > r.latest.date || (g.date === r.latest.date && !r.latest.picked)) r.latest = { date: g.date, game: g.id, event: g.event, picked: true };
        }
        if (ordered) g[side].pickOrder!.forEach((id, i) => {
          const o = row(id).order, turn = turnOf(i, g.firstPick === side);
          o.known += 1;
          if (turn === 1) o.firstPick += 1;
          if (turn <= 6) o.firstRotation += 1; // each team's first three picks (alan, 2026-10-13)
          if (turn >= 7) o.phase2 += 1;
          if (turn === 10) o.lastPick += 1;
        });
      }
      if (!bansOk) continue;
      for (const id of banned) {
        const r = row(id);
        seen(r, c);
        r.bans += 1;
        r.present += 1;
        if (!r.latest || g.date > r.latest.date) r.latest = { date: g.date, game: g.id, event: g.event, picked: false };
      }
    }
  }

  const out: PriorityRow[] = [...rows.values()].map(({ _roleGaps, _sideGaps, ...r }) => ({
    ...r,
    pickRate: games ? r.picks / games : 0,
    banRate: banGames ? r.bans / banGames : null,
    presence: banGames ? r.present / banGames : null,
    winRate: r.picks ? r.wins / r.picks : null,
    low: r.picks < LOW_PICKS,
    roleVerified: _roleGaps === 0,
    sideKnown: _sideGaps === 0,
    patches: r.patches.sort(comparePatchDesc),
  }));
  const patches = [...new Set(contributions.map((c) => c.patch))].sort(comparePatchDesc);
  return { patch: s.patch && patchKey(s.patch), patches, contributions, games, banGames, recorded, orderGames, tableGames, rows: out };
}

/** Patches with data in scope, newest first. */
export function patchesOf(d: PriorityData, tournaments?: string[]): string[] {
  return [...new Set(d.contributions.filter((c) => inScope(c, d, { tournaments })).map((c) => c.patch))].sort(comparePatchDesc);
}

// ---------- role view ----------

export type RoleTab = Role | "ALL";

/** Rows for a role tab: champions with recorded picks in that role, or a table naming the role (champion-wide picks). */
export function forRole(rows: PriorityRow[], role: RoleTab): PriorityRow[] {
  if (role === "ALL") return rows;
  return rows.filter((r) => (r.rolePicks[role] ?? 0) > 0 || r.namedRoles.includes(role));
}

/** Picks in the role, when every pick of the champion has a recorded role; otherwise undefined (champion-wide only). */
export const rolePicksOf = (r: PriorityRow, role: Role) => (r.roleVerified ? r.rolePicks[role] ?? 0 : undefined);

/** The roles a row was played in, most picks first. */
export const rolesOf = (r: PriorityRow): Role[] => {
  const counted = ROLES.filter((x) => (r.rolePicks[x] ?? 0) > 0).sort((a, b) => (r.rolePicks[b] ?? 0) - (r.rolePicks[a] ?? 0));
  return [...counted, ...r.namedRoles.filter((x) => !counted.includes(x))];
};

// ---------- sorting ----------

export const PRIORITY_SORTS = {
  presence: "Presence", picks: "Picks", bans: "Bans", winRate: "Win rate", firstRotation: "First rotation", recency: "Latest",
} as const;
export type PrioritySort = keyof typeof PRIORITY_SORTS;

export function sortRows(rows: PriorityRow[], key: PrioritySort, role?: Role): PriorityRow[] {
  const val = (r: PriorityRow): number | null => {
    if (key === "presence") return r.presence;
    if (key === "picks") return role ? rolePicksOf(r, role) ?? r.picks : r.picks;
    if (key === "bans") return r.banRate == null ? null : r.bans;
    if (key === "winRate") return r.winRate;
    if (key === "firstRotation") return r.order.known ? r.order.firstRotation / r.order.known + r.order.firstRotation / 1000 : null;
    return r.latest ? Number(r.latest.date.replace(/-/g, "")) : null;
  };
  return [...rows].sort((a, b) => {
    const x = val(a), y = val(b);
    if (x == null || y == null) return Number(x == null) - Number(y == null) || b.present - a.present || a.id.localeCompare(b.id);
    return y - x || b.present - a.present || b.picks - a.picks || a.id.localeCompare(b.id);
  });
}

// ---------- draft order ----------

/** Thresholds for the pick-order read (alan, 2026-10-13), kept here so they can be revisited as Worlds data grows.
 *  Six of ten picks are first rotation, so "early" and "late" need a clear lean past that 60 / 40 split, and a read
 *  needs `minPicks` ordered picks; below that only the counts show. */
export const ORDER_READ = { minPicks: 5, early: 0.8, late: 0.6 } as const;

/** A descriptive read of when a champion is taken, from recorded pick order only. It says when pros picked it, never
 *  that it is a safe blind pick, a counter or a meta priority. Undefined below `ORDER_READ.minPicks` ordered picks. */
export function orderRead(o: OrderStats): "early" | "late" | "mixed" | undefined {
  if (o.known < ORDER_READ.minPicks) return undefined;
  if (o.firstRotation / o.known >= ORDER_READ.early) return "early";
  if (o.phase2 / o.known >= ORDER_READ.late) return "late";
  return "mixed";
}

export const ORDER_READ_LABEL = { early: "usually picked early", late: "usually picked late", mixed: "picked early and late" } as const;

/** "8/10 first rotation (80%)", then the read when the sample allows one, so every label shows its fraction. */
export function orderText(o: OrderStats): string {
  const read = orderRead(o);
  const share = `${o.firstRotation}/${o.known} first rotation (${Math.round((o.firstRotation / o.known) * 100)}%)`;
  return read ? `${share} · ${ORDER_READ_LABEL[read]}` : o.known < ORDER_READ.minPicks ? `${share} · too few picks to read` : share;
}

// ---------- patch-over-patch ----------

export const MIN_COMPARE_GAMES = 10; // a patch needs this many games to be compared against
export const MIN_MOVE = 0.1; // ten percentage points of presence before a move is listed
export const PRIORITY_LINE = 0.25; // presence that counts as priority for "new" / "dropped out"
export const ABSENT_LINE = 0.05;

/** The newest patch older than `patch` with enough games and bans to compare against. */
export function previousPatch(d: PriorityData, patch: string, tournaments?: string[]): string | undefined {
  return patchesOf(d, tournaments).filter((p) => comparePatchDesc(p, patch) > 0)
    .find((p) => { const b = bucket(d, { patch: p, tournaments }); return b.games >= MIN_COMPARE_GAMES && b.banGames > 0; });
}

export interface Move {
  id: string;
  from: PriorityRow | undefined;
  to: PriorityRow | undefined;
  presence: [number, number]; // older, newer (0 when absent from a complete patch)
  pickRate: [number, number];
  banRate: [number, number];
  change: number; // percentage points of presence, newer - older (a difference of rates, never a ratio)
  kind: "new" | "gone" | "up" | "down";
}

export interface Changes { newer: Bucket; older: Bucket; rising: Move[]; falling: Move[]; small: boolean }

/** Presence, pick-rate and ban-rate movement between two patches. Champions absent from a patch count as 0 there. */
export function priorityChanges(d: PriorityData, patch: string, older: string, tournaments?: string[], role: RoleTab = "ALL"): Changes {
  const nb = bucket(d, { patch, tournaments }), ob = bucket(d, { patch: older, tournaments });
  const nRows = new Map(nb.rows.map((r) => [r.id, r])), oRows = new Map(ob.rows.map((r) => [r.id, r]));
  const ids = new Set([...forRole(nb.rows, role), ...forRole(ob.rows, role)].map((r) => r.id));
  const rising: Move[] = [], falling: Move[] = [];
  for (const id of ids) {
    const to = nRows.get(id), from = oRows.get(id);
    const pres: [number, number] = [from?.presence ?? 0, to?.presence ?? 0];
    const change = pres[1] - pres[0];
    if (Math.abs(change) < MIN_MOVE) continue;
    const kind = pres[0] < ABSENT_LINE && pres[1] >= PRIORITY_LINE ? "new" : pres[1] < ABSENT_LINE && pres[0] >= PRIORITY_LINE ? "gone" : change > 0 ? "up" : "down";
    const m: Move = { id, from, to, presence: pres, pickRate: [from?.pickRate ?? 0, to?.pickRate ?? 0], banRate: [from?.banRate ?? 0, to?.banRate ?? 0], change, kind };
    (change > 0 ? rising : falling).push(m);
  }
  rising.sort((a, b) => b.change - a.change || a.id.localeCompare(b.id));
  falling.sort((a, b) => a.change - b.change || a.id.localeCompare(b.id));
  return { newer: nb, older: ob, rising, falling, small: nb.games < SMALL_SAMPLE || ob.games < SMALL_SAMPLE };
}

// ---------- one champion across patches ----------

export interface HistoryPoint { patch: string; games: number; banGames: number; row?: PriorityRow; pickShare: number; banShare: number | null; presence: number | null }

/** The champion on every patch in scope, oldest first; a patch where it was never picked or banned shows 0. */
export function championHistory(d: PriorityData, id: string, tournaments?: string[]): HistoryPoint[] {
  return patchesOf(d, tournaments).reverse().map((patch) => {
    const b = bucket(d, { patch, tournaments });
    const row = b.rows.find((r) => r.id === id);
    return {
      patch, games: b.games, banGames: b.banGames, row,
      pickShare: b.games ? (row?.picks ?? 0) / b.games : 0,
      banShare: b.banGames ? (row?.bans ?? 0) / b.banGames : null,
      presence: b.banGames ? (row?.present ?? 0) / b.banGames : null,
    };
  });
}

/** Recorded games on a patch that support a champion's numbers (picked or banned), newest first. */
export function supportingGames(b: Bucket, id: string): { game: ProGame; side?: "blue" | "red"; role?: Role; banned: boolean }[] {
  return b.contributions.flatMap((c) => (c.kind === "games" ? c.records : [])).flatMap((g) => {
    for (const side of ["blue", "red"] as const) {
      const role = ROLES.find((r) => g[side].picks[r] === id);
      if (role) return [{ game: g, side, role, banned: false }];
    }
    return fullBans(g) && [...g.blue.bans, ...g.red.bans].includes(id) ? [{ game: g, banned: true }] : [];
  }).sort((a, b) => b.game.date.localeCompare(a.game.date) || b.game.id - a.game.id);
}

/** Teams that picked the champion in scope, most picks first. */
export function teamsFor(b: Bucket, id: string): { team: string; picks: number; wins: number }[] {
  const m = new Map<string, { picks: number; wins: number }>();
  for (const x of supportingGames(b, id)) if (x.side) {
    const t = x.game[x.side].team, v = m.get(t) ?? { picks: 0, wins: 0 };
    v.picks += 1;
    if (x.game.winner === x.side) v.wins += 1;
    m.set(t, v);
  }
  return [...m.entries()].map(([team, v]) => ({ team, ...v })).sort((a, b) => b.picks - a.picks || a.team.localeCompare(b.team));
}

// ---------- Draft Room label ----------

export const DRAFT_LABEL_MIN = 0.3; // presence at or above this shows "Pro priority" on a Draft Room row

export interface PriorityMark { patch: string; presence: number; picks: number; bans: number; games: number; rolePicks: Partial<Record<Role, number>>; roleVerified: boolean; low: boolean }

/**
 * Champion presence on the newest patch with ban data (or the patch given), across all tracked and archived tournaments, for the Draft Room's
 * Pro priority label. A label, never a score: nothing reads it to rank a row.
 */
export function priorityMarks(d: PriorityData, at?: string): Record<string, PriorityMark> {
  const patch = at ? patchKey(at) : patchesOf(d).find((p) => bucket(d, { patch: p }).banGames > 0);
  if (!patch) return {};
  const b = bucket(d, { patch });
  return Object.fromEntries(b.rows.filter((r) => r.presence != null && r.presence >= DRAFT_LABEL_MIN).map((r) => [r.id, {
    patch, presence: r.presence!, picks: r.picks, bans: r.bans, games: b.banGames, rolePicks: r.rolePicks, roleVerified: r.roleVerified, low: r.low,
  }]));
}

/** The label applies in a role only when the champion has recorded picks there (presence itself is champion-wide). */
export const markFor = (marks: Record<string, PriorityMark> | undefined, id: string, role: Role): PriorityMark | undefined => {
  const m = marks?.[id];
  return m && (m.rolePicks[role] ?? 0) > 0 ? m : undefined;
};

