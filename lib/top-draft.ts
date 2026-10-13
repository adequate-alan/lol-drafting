// Lane draft usage (alan, 2026-10-13): when professionals actually picked each top, mid, bot and support. Built for Top,
// extended the same day to Mid and to the bot lane as a duo. Observed Pro Evidence only:
// it never scores a Draft Room row, never edits a saved blind grade, pairing or pool tier, and one game proves nothing.
//
// The draft order is rebuilt per game from two stored facts read from the Gol.gg game page:
//   - `pickOrder` per side: that team's five picks in the order the page lists them (the team's own draft order);
//   - `firstPick`: the side carrying Gol.gg's "First Pick" mark. Since 2026 it is not always blue, so it is never assumed.
// Tournament draft (both events here): first team F, second team S, picks F1 S1 S2 F2 F3 S3 | bans | S4 F4 F5 S5.
// A game without either fact is "uncertain", never classified from its side, its lineup or its result.
//
// Each recorded top or mid selection is
//   - blind: the opposing champion of that lane was not yet on the board;
//   - response: it was already picked and could only have played that lane (every other role it plays was visibly
//     filled by a one-role champion);
//   - uncertain: no order, no first-pick mark, or the opponent was on the board but could still have gone elsewhere.
// Bot and support are read as a duo (`bot` on each selection, `duoSelections` per team): what each pick could see of the
// enemy ADC and support, and when its own partner was picked. Picks in one paired turn (2-3, 4-5, 8-9) have no order
// between them on the source, so a partner picked in the same turn is "together", never before or after.
// A response is not a counter. "Repeated" needs the same response in two different series; "supported counter" needs a
// DPM.LOL matchup row that clears the counter thresholds (lib/counters.ts). Win / loss never decides either.
import { DPM_MIN_GAMES, DPM_MIN_WIN_RATE, DPM_STRONG_WIN_RATE } from "./counters";
import { comparePatchDesc } from "./evidence";
import { patchKey } from "./patch";
import { ROLES, type ProGame, type Role } from "./schema";
import type { BlindLine } from "./top-blind";

export type Side = "blue" | "red";
export type Usage = "blind" | "response" | "uncertain";
export type Rotation = "first" | "second" | "last";

// Global turns (1-10) of each team's picks: the first-picking team and the other.
export const FIRST_TURNS = [1, 4, 5, 8, 9] as const;
export const SECOND_TURNS = [2, 3, 6, 7, 10] as const;
export const turnOf = (pickIndex: number, first: boolean) => (first ? FIRST_TURNS : SECOND_TURNS)[pickIndex];
// First rotation = each team's first three picks, before the second ban phase (turns 1-6; alan, 2026-10-13, site-wide).
// Second rotation = turns 7-10, with the last pick (turn 10) kept apart.
export const rotationOf = (turn: number): Rotation => (turn <= 6 ? "first" : turn === 10 ? "last" : "second");
export const ROTATION_LABEL: Record<Rotation, string> = { first: "First rotation", second: "Second rotation", last: "Last pick" };

export const LANE_ROLES = ["TOP", "MID", "BOT", "SUPPORT"] as const satisfies readonly Role[];
export type LaneRole = (typeof LANE_ROLES)[number];
export const isLaneRole = (r: string): r is LaneRole => (LANE_ROLES as readonly string[]).includes(r);

// The same team's two picks in one turn: the source lists them in some order, but nothing establishes which came first.
const PAIRED: [number, number][] = [[2, 3], [4, 5], [8, 9]];
export const sameTurn = (a: number, b: number) => PAIRED.some(([x, y]) => (a === x && b === y) || (a === y && b === x));

/** What a team could see of one enemy champion when it picked: not yet picked, picked and certainly in its final role,
 *  picked and certainly bot lane but not which slot (Seraphine, say), or picked but possibly another lane. */
export type Seen = "hidden" | "revealed" | "botlane" | "ambiguous";
export type BotDetail = "blind" | "vs-adc" | "vs-support" | "partial" | "full";
export const BOT_DETAIL_LABEL: Record<BotDetail, string> = {
  blind: "Blind", "vs-adc": "After enemy ADC", "vs-support": "After enemy support", partial: "After one enemy bot laner", full: "Full bot-lane response",
};
export interface BotRead {
  enemyAdc: Seen; enemySupport: Seen;
  detail?: BotDetail; // undefined when uncertain
  partner: string; // own ADC for a support, own support for an ADC
  partnerTurn?: number;
  partnerWhen?: "before" | "together" | "after"; // own partner relative to this pick
}

export interface TopSelection {
  game: number; // Gol.gg game id
  event: string;
  tournament: string;
  patch: string; // Gol.gg spelling; shown with patchLabel
  date: string;
  series: string;
  seriesId: number;
  gameNo: number;
  stage?: string;
  role: Role;
  champion: string;
  team: string;
  opponent: string;
  side: Side;
  won: boolean;
  laneOpponent: string; // the enemy champion in the same role
  laneSeen: boolean; // that opponent was on the board, certainly in this lane, when this was picked
  usage: Usage;
  why: string; // one line: why this classification (or why it is uncertain)
  turn?: number; // 1-10 in the rebuilt draft
  opponentTurn?: number;
  rotation?: Rotation;
  firstPicker?: boolean; // this team had first pick
  enemySeen: string[]; // enemy champions on the board when this was picked (empty when the order is unknown)
  ownSeen: string[];
  flex: string[]; // other roles this champion plays that its team had not visibly filled when it was picked
  unavailable: string[] | null; // Fearless: champions picked earlier in the series (null when an earlier game is missing)
  bot?: BotRead; // BOT and SUPPORT only
  enemyJungle?: Seen; // MID only: whether the enemy jungler was on the board (composition context, not a lane response)
}
export type LaneSelection = TopSelection;

export interface RoleBook { rolesOf: (id: string) => Role[] }

/** Roles a champion can be read as: its roster roles plus every role recorded games show it in. */
export function roleBook(champions: { id: string; roles: Role[] }[], games: Pick<ProGame, "blue" | "red">[]): RoleBook {
  const map = new Map<string, Set<Role>>();
  const add = (id: string, r: Role) => { if (!map.has(id)) map.set(id, new Set()); map.get(id)!.add(r); };
  for (const c of champions) for (const r of c.roles) add(c.id, r);
  for (const g of games) for (const s of [g.blue, g.red]) for (const r of ROLES) add(s.picks[r], r);
  return { rolesOf: (id) => ROLES.filter((r) => map.get(id)?.has(r)) };
}

/** Roles in `roles` (other than `own`) that no other champion in `board` visibly fills (a one-role champion of that role). */
function openRoles(id: string, own: Role, board: string[], book: RoleBook): Role[] {
  const filled = new Set(board.filter((x) => x !== id).map((x) => book.rolesOf(x)).filter((rs) => rs.length === 1).map((rs) => rs[0]));
  return book.rolesOf(id).filter((r) => r !== own && !filled.has(r));
}

/** Champions picked in earlier games of the same series (Fearless), or null when an earlier game is not recorded. */
function fearlessOut(g: ProGame, all: ProGame[]): string[] | null {
  const earlier = all.filter((x) => x.seriesId === g.seriesId && x.event === g.event && x.game < g.game);
  if (new Set(earlier.map((x) => x.game)).size !== g.game - 1) return null;
  return earlier.flatMap((x) => [...Object.values(x.blue.picks), ...Object.values(x.red.picks)]).sort();
}

/** What `side` could see of enemy champion `x` (final role `role`) before turn `turn`. */
function seenOf(x: string, role: Role, enemyOrder: string[], enemyFirst: boolean, turn: number, book: RoleBook): Seen {
  const board = enemyOrder.filter((_, i) => turnOf(i, enemyFirst) < turn);
  if (!board.includes(x)) return "hidden";
  const open = openRoles(x, role, board, book);
  if (!open.length) return "revealed";
  return (role === "BOT" || role === "SUPPORT") && open.every((r) => r === "BOT" || r === "SUPPORT") ? "botlane" : "ambiguous";
}

const LANE_NAME: Record<Role, string> = { TOP: "top", JUNGLE: "jungler", MID: "mid", BOT: "ADC", SUPPORT: "support" };

/** Both selections in `role` of every recorded game, classified. Games are deduplicated by Gol.gg id. */
export function laneSelections(games: ProGame[], book: RoleBook, role: LaneRole): LaneSelection[] {
  const byId = new Map<number, ProGame>();
  for (const g of games) if (!byId.has(g.id)) byId.set(g.id, g);
  const all = [...byId.values()];
  const out: LaneSelection[] = [];
  const bot = role === "BOT" || role === "SUPPORT";
  const partnerRole: Role = role === "BOT" ? "SUPPORT" : "BOT";
  for (const g of all) {
    const out_ = fearlessOut(g, all);
    for (const side of ["blue", "red"] as const) {
      const other: Side = side === "blue" ? "red" : "blue";
      const me = g[side], them = g[other];
      const champion = me.picks[role], laneOpponent = them.picks[role];
      const base = {
        game: g.id, event: g.event, tournament: g.tournament, patch: g.patch, date: g.date, series: g.series, seriesId: g.seriesId,
        gameNo: g.game, stage: g.stage, role, champion, team: me.team, opponent: them.team, side, won: g.winner === side, laneOpponent,
        laneSeen: false, unavailable: out_,
      };
      if (!me.pickOrder || !them.pickOrder || !g.firstPick) {
        out.push({ ...base, usage: "uncertain", why: !g.firstPick ? "The game page does not mark which team picked first." : "Pick order not recorded.", enemySeen: [], ownSeen: [], flex: [],
          ...(bot ? { bot: { enemyAdc: "hidden", enemySupport: "hidden", partner: me.picks[partnerRole] } as BotRead } : {}) });
        continue;
      }
      const first = g.firstPick === side;
      const turn = turnOf(me.pickOrder.indexOf(champion), first), opponentTurn = turnOf(them.pickOrder.indexOf(laneOpponent), !first);
      const enemySeen = them.pickOrder.filter((_, i) => turnOf(i, !first) < turn);
      const ownSeen = me.pickOrder.filter((_, i) => turnOf(i, first) < turn);
      const flex = openRoles(champion, role, ownSeen, book);
      const seen = (x: string, r: Role) => seenOf(x, r, them.pickOrder!, !first, turn, book);
      const common = { ...base, turn, opponentTurn, rotation: rotationOf(turn), firstPicker: first, enemySeen, ownSeen, flex };
      const opp = LANE_NAME[role];
      if (!bot) {
        const extra = role === "MID" ? { enemyJungle: seen(them.picks.JUNGLE, "JUNGLE") } : {};
        if (opponentTurn > turn) {
          out.push({ ...common, ...extra, usage: "blind", why: `Picked at ${turn} of 10, before the enemy ${opp} ${laneOpponent} (${opponentTurn}).` });
          continue;
        }
        const elsewhere = openRoles(laneOpponent, role, enemySeen, book);
        out.push(elsewhere.length
          ? { ...common, ...extra, usage: "uncertain", why: `${laneOpponent} was on the board (${opponentTurn}) but could still have played ${elsewhere.map((r) => r.toLowerCase()).join(" or ")}.` }
          : { ...common, ...extra, laneSeen: true, usage: "response", why: `Picked at ${turn} of 10, after the enemy ${opp} ${laneOpponent} (${opponentTurn}).` });
        continue;
      }
      // Bot lane: what this pick could see of both enemy bot laners, and when its own partner was picked.
      const enemyAdc = seen(them.picks.BOT, "BOT"), enemySupport = seen(them.picks.SUPPORT, "SUPPORT");
      const partner = me.picks[partnerRole], partnerTurn = turnOf(me.pickOrder.indexOf(partner), first);
      const partnerWhen = sameTurn(turn, partnerTurn) ? "together" : partnerTurn < turn ? "before" : "after";
      const visible = [enemyAdc, enemySupport].filter((x) => x !== "hidden");
      const ambiguous = [["ADC", them.picks.BOT, enemyAdc], ["support", them.picks.SUPPORT, enemySupport]].filter(([, , x]) => x === "ambiguous");
      const detail: BotDetail | undefined = ambiguous.length ? undefined
        : !visible.length ? "blind" : visible.length === 2 ? "full"
        : enemyAdc === "revealed" ? "vs-adc" : enemySupport === "revealed" ? "vs-support" : "partial";
      const read: BotRead = { enemyAdc, enemySupport, detail, partner, partnerTurn, partnerWhen };
      const laneSeen = (role === "BOT" ? enemyAdc : enemySupport) === "revealed";
      const at = `Picked at ${turn} of 10`;
      const why = !detail ? `${ambiguous.map(([l, c]) => `${c} (enemy ${l})`).join(" and ")} was on the board but could still have played another lane.`
        : detail === "blind" ? `${at}, before either enemy bot laner (${them.picks.BOT} ${turnOf(them.pickOrder.indexOf(them.picks.BOT), !first)}, ${them.picks.SUPPORT} ${turnOf(them.pickOrder.indexOf(them.picks.SUPPORT), !first)}).`
        : detail === "full" ? `${at}, after both enemy bot laners, ${them.picks.BOT} and ${them.picks.SUPPORT}.`
        : detail === "vs-adc" ? `${at}, after the enemy ADC ${them.picks.BOT} but before their support ${them.picks.SUPPORT}.`
        : detail === "vs-support" ? `${at}, after the enemy support ${them.picks.SUPPORT} but before their ADC ${them.picks.BOT}.`
        : `${at}, after one enemy bot laner whose slot was still open.`;
      out.push({ ...common, laneSeen, usage: !detail ? "uncertain" : detail === "blind" ? "blind" : "response", why, bot: read });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || b.game - a.game || a.side.localeCompare(b.side));
}

/** Both top selections of every recorded game, classified. */
export const topSelections = (games: ProGame[], book: RoleBook) => laneSelections(games, book, "TOP");

// ---------- bot-lane duos ----------

export type DuoShape = "blind" | "partial" | "full" | "split" | "uncertain";
export const DUO_SHAPE_LABEL: Record<DuoShape, string> = {
  blind: "Duo blind", partial: "Partially revealed", full: "Full duo response", split: "Split construction", uncertain: "Unclear",
};

export interface DuoSelection {
  game: number; event: string; tournament: string; patch: string; date: string; series: string; seriesId: number; gameNo: number; stage?: string;
  side: Side; team: string; opponent: string; won: boolean;
  adc: string; support: string; enemyAdc: string; enemySupport: string;
  adcTurn?: number; supportTurn?: number; enemyAdcTurn?: number; enemySupportTurn?: number;
  order?: "adc" | "support" | "together"; // which half of the duo was picked first
  /** Enemy bot laners known at the duo's first and last pick (0-2); null when one was on the board but possibly elsewhere. */
  known?: { first: number | null; last: number | null };
  shape: DuoShape;
  adcRead?: BotRead; supportRead?: BotRead;
}

const knownOf = (r?: BotRead) => (!r || r.enemyAdc === "ambiguous" || r.enemySupport === "ambiguous" ? null : [r.enemyAdc, r.enemySupport].filter((x) => x !== "hidden").length);

/** Each team's bot lane in every recorded game, built from the BOT and SUPPORT selections. */
export function duoSelections(adcs: LaneSelection[], supports: LaneSelection[]): DuoSelection[] {
  const sup = new Map(supports.map((s) => [`${s.game}:${s.side}`, s]));
  const enemy = new Map(adcs.map((s) => [`${s.game}:${s.side}`, s]));
  return adcs.flatMap((a) => {
    const s = sup.get(`${a.game}:${a.side}`);
    if (!s) return [];
    const e = enemy.get(`${a.game}:${a.side === "blue" ? "red" : "blue"}`), es = sup.get(`${a.game}:${a.side === "blue" ? "red" : "blue"}`);
    const ordered = a.turn != null && s.turn != null;
    const order = !ordered ? undefined : sameTurn(a.turn!, s.turn!) ? "together" : a.turn! < s.turn! ? "adc" : "support";
    const firstRead = !ordered ? undefined : order === "support" ? s.bot : a.bot, lastRead = !ordered ? undefined : order === "support" ? a.bot : s.bot;
    const known = ordered ? { first: knownOf(firstRead), last: knownOf(lastRead) } : undefined;
    const shape: DuoShape = !known || known.first == null || known.last == null ? "uncertain"
      : known.first !== known.last ? "split" : known.first === 0 ? "blind" : known.first === 1 ? "partial" : "full";
    return [{
      game: a.game, event: a.event, tournament: a.tournament, patch: a.patch, date: a.date, series: a.series, seriesId: a.seriesId, gameNo: a.gameNo, stage: a.stage,
      side: a.side, team: a.team, opponent: a.opponent, won: a.won,
      adc: a.champion, support: s.champion, enemyAdc: a.laneOpponent, enemySupport: s.laneOpponent,
      adcTurn: a.turn, supportTurn: s.turn, enemyAdcTurn: e?.turn, enemySupportTurn: es?.turn,
      order, known, shape, adcRead: a.bot, supportRead: s.bot,
    }];
  });
}

export interface DuoRow {
  adc: string; support: string;
  games: DuoSelection[]; series: number; teams: string[]; wins: number;
  shapes: Record<DuoShape, number>;
}

const duoKey = (d: Pick<DuoSelection, "adc" | "support">) => `${d.adc}+${d.support}`;

/** Every duo in scope, most games first. */
export function duoRows(all: DuoSelection[], scope: TopScope): DuoRow[] {
  const by = new Map<string, DuoSelection[]>();
  for (const d of all.filter((x) => inTopScope(x, scope))) by.set(duoKey(d), [...(by.get(duoKey(d)) ?? []), d]);
  return [...by.values()].map((games) => ({
    adc: games[0].adc, support: games[0].support, games,
    series: new Set(games.map((g) => `${g.event}:${g.seriesId}`)).size,
    teams: [...new Set(games.map((g) => g.team))].sort(),
    wins: games.filter((g) => g.won).length,
    shapes: Object.fromEntries((["blind", "partial", "full", "split", "uncertain"] as DuoShape[]).map((k) => [k, games.filter((g) => g.shape === k).length])) as Record<DuoShape, number>,
  })).sort((a, b) => b.games.length - a.games.length || a.adc.localeCompare(b.adc) || a.support.localeCompare(b.support));
}

export interface DuoResponse {
  adc: string; support: string; enemyAdc: string; enemySupport: string;
  games: DuoSelection[]; series: number; teams: string[]; wins: number; status: "observed" | "repeated";
}

/**
 * Duos completed after both enemy bot laners were known (full or split ending at two), grouped by the enemy duo they
 * were picked into. "Repeated" needs two series. Never a counter by itself: no duo lane data exists, and wins prove nothing.
 */
export function duoResponses(all: DuoSelection[], scope: TopScope): DuoResponse[] {
  const by = new Map<string, DuoSelection[]>();
  for (const d of all.filter((x) => inTopScope(x, scope) && x.known?.last === 2)) {
    const k = `${duoKey(d)}>${d.enemyAdc}+${d.enemySupport}`;
    by.set(k, [...(by.get(k) ?? []), d]);
  }
  return [...by.values()].map((games) => {
    const series = new Set(games.map((g) => `${g.event}:${g.seriesId}`)).size;
    return {
      adc: games[0].adc, support: games[0].support, enemyAdc: games[0].enemyAdc, enemySupport: games[0].enemySupport, games, series,
      teams: [...new Set(games.map((g) => g.team))].sort(), wins: games.filter((g) => g.won).length, status: series >= 2 ? "repeated" as const : "observed" as const,
    };
  }).sort((a, b) => b.series - a.series || b.games.length - a.games.length || a.adc.localeCompare(b.adc));
}

// ---------- scope ----------

export interface TopScope { patch?: string; events?: string[] } // no patch = every patch (explicit)

export const inTopScope = (s: Pick<TopSelection, "patch" | "event">, scope: TopScope) =>
  (!scope.patch || patchKey(s.patch) === patchKey(scope.patch)) && (!scope.events?.length || scope.events.includes(s.event));

export const topPatches = (sel: Pick<TopSelection, "patch">[]) => [...new Set(sel.map((s) => s.patch))].sort(comparePatchDesc);

export const ENOUGH_GAMES = 10; // a patch needs this many classifiable top selections to be the default

/** Newest patch with enough classifiable top selections (else the newest patch). */
export function defaultTopPatch(sel: TopSelection[]): string | undefined {
  const patches = topPatches(sel);
  return patches.find((p) => sel.filter((s) => s.patch === p && s.usage !== "uncertain").length >= ENOUGH_GAMES) ?? patches[0];
}

// ---------- per champion ----------

export const MIN_CLASSIFIED = 3; // below this, no usage label (neutral)
export const LOW_SAMPLE = 5; // below this, a label is marked as a small sample
export const LEAN = 2 / 3; // share of classifiable selections for "often blinded" / "usually a response"

export type UsageLabel = "blind" | "response" | "both" | "too-few";
export const USAGE_LABEL: Record<UsageLabel, string> = { blind: "Often blinded", response: "Usually a response", both: "Both ways", "too-few": "Too few games" };

export interface DPMRow { role: Role; champion: string; enemy: string; winRate: number; games: number; patch: string; url: string; rank?: string }
export type PairStatus = "observed" | "repeated" | "supported";
export const PAIR_LABEL: Record<PairStatus, string> = { observed: "Observed response", repeated: "Repeated response", supported: "Supported counter" };

export interface Pair {
  champion: string; // the later pick
  into: string; // the lane opponent it was picked into
  games: TopSelection[]; // the later pick's selections, newest first
  series: number; // independent series
  wins: number;
  status: PairStatus;
  dpm?: { winRate: number; games: number; patch: string; url: string; strong: boolean; rank?: string };
}

export interface TopRow {
  champion: string;
  games: number; // recorded top selections in scope
  blind: number;
  response: number;
  uncertain: number;
  classified: number;
  blindShare: number | null;
  usage: UsageLabel;
  low: boolean;
  rotation: Record<Rotation, number>;
  firstPicker: number; // selections made by the team with first pick (ordered games)
  blue: number; red: number;
  wins: number;
  latest: string;
  faced: { champion: string; games: number }[]; // opposing tops, most frequent first
  respondedInto: Pair[]; // this champion picked after a revealed opponent
  answeredBy: Pair[]; // opponents picked after this champion was revealed
  unavailableGames: number; // Fearless: games where an earlier game of the series had already used it (known eligibility only)
  selections: TopSelection[];
  bot?: Record<BotDetail, number> & { partnerBefore: number; together: number; partnerAfter: number }; // BOT / SUPPORT
  enemyJungleSeen?: number; // MID: picks made with the enemy jungler revealed
}
export type LaneRow = TopRow;

const count = <T,>(xs: T[], f: (x: T) => boolean) => xs.filter(f).length;

/** DPM row for `champion` into `enemy` in the lane (top by default), when it clears the counter thresholds. */
export function dpmCounter(rows: DPMRow[], champion: string, enemy: string, role: Role = "TOP"): Pair["dpm"] {
  const r = rows.find((x) => x.role === role && x.champion === champion && x.enemy === enemy);
  if (!r || r.games < DPM_MIN_GAMES || r.winRate < DPM_MIN_WIN_RATE) return undefined;
  return { winRate: r.winRate, games: r.games, patch: r.patch, url: r.url, rank: r.rank, strong: r.winRate >= DPM_STRONG_WIN_RATE };
}

function pairs(responses: TopSelection[], dpm: DPMRow[]): Pair[] {
  const by = new Map<string, TopSelection[]>();
  for (const s of responses) {
    const k = `${s.champion}>${s.laneOpponent}`;
    by.set(k, [...(by.get(k) ?? []), s]);
  }
  return [...by.values()].map((games) => {
    const { champion, laneOpponent: into, role } = games[0];
    const series = new Set(games.map((g) => `${g.event}:${g.seriesId}`)).size;
    const d = dpmCounter(dpm, champion, into, role);
    const status: PairStatus = d ? "supported" : series >= 2 ? "repeated" : "observed";
    return { champion, into, games, series, wins: count(games, (g) => g.won), status, dpm: d };
  }).sort((a, b) => b.games.length - a.games.length || b.series - a.series || a.champion.localeCompare(b.champion));
}

export function topRows(all: TopSelection[], scope: TopScope, dpm: DPMRow[] = []): TopRow[] {
  const sel = all.filter((s) => inTopScope(s, scope));
  const ids = [...new Set(sel.map((s) => s.champion))];
  return ids.map((id) => {
    const mine = sel.filter((s) => s.champion === id);
    const blind = count(mine, (s) => s.usage === "blind"), response = count(mine, (s) => s.usage === "response");
    const classified = blind + response;
    const blindShare = classified ? blind / classified : null;
    const usage: UsageLabel = classified < MIN_CLASSIFIED ? "too-few" : blindShare! >= LEAN ? "blind" : blindShare! <= 1 - LEAN ? "response" : "both";
    const faced = new Map<string, number>();
    for (const s of mine) faced.set(s.laneOpponent, (faced.get(s.laneOpponent) ?? 0) + 1);
    // Games where Fearless had already taken it: eligibility known only for games whose earlier games are all recorded.
    const unavailableGames = new Set(sel.filter((s) => s.unavailable?.includes(id)).map((s) => s.game)).size;
    return {
      champion: id, games: mine.length, blind, response, uncertain: mine.length - classified, classified, blindShare, usage,
      low: classified < LOW_SAMPLE,
      rotation: { first: count(mine, (s) => s.rotation === "first"), second: count(mine, (s) => s.rotation === "second"), last: count(mine, (s) => s.rotation === "last") },
      firstPicker: count(mine, (s) => s.firstPicker === true),
      blue: count(mine, (s) => s.side === "blue"), red: count(mine, (s) => s.side === "red"),
      wins: count(mine, (s) => s.won),
      latest: mine.map((s) => s.date).sort().at(-1) ?? "",
      faced: [...faced].map(([champion, games]) => ({ champion, games })).sort((a, b) => b.games - a.games || a.champion.localeCompare(b.champion)),
      respondedInto: pairs(mine.filter((s) => s.laneSeen), dpm),
      answeredBy: pairs(sel.filter((s) => s.laneSeen && s.laneOpponent === id), dpm),
      unavailableGames,
      selections: mine,
      ...(mine[0]?.bot ? { bot: {
        ...Object.fromEntries((Object.keys(BOT_DETAIL_LABEL) as BotDetail[]).map((k) => [k, count(mine, (s) => s.bot?.detail === k)])) as Record<BotDetail, number>,
        partnerBefore: count(mine, (s) => !!s.turn && s.bot?.partnerWhen === "before"),
        together: count(mine, (s) => !!s.turn && s.bot?.partnerWhen === "together"),
        partnerAfter: count(mine, (s) => !!s.turn && s.bot?.partnerWhen === "after"),
      } } : {}),
      ...(mine[0]?.role === "MID" ? { enemyJungleSeen: count(mine, (s) => s.enemyJungle === "revealed") } : {}),
    };
  }).sort((a, b) => b.games - a.games || a.champion.localeCompare(b.champion));
}

/** Every response pair in scope (champion into opponent), repeated and supported first. */
export const responsePairs = (all: TopSelection[], scope: TopScope, dpm: DPMRow[] = []) =>
  pairs(all.filter((s) => inTopScope(s, scope) && s.laneSeen), dpm)
    .sort((a, b) => (b.status !== "observed" ? 1 : 0) - (a.status !== "observed" ? 1 : 0) || b.games.length - a.games.length);

/** One-line read of a row's counts, e.g. "Blind 6/9 · Response 3/9". */
export const usageCounts = (r: Pick<TopRow, "blind" | "response" | "classified">) =>
  r.classified ? `Blind ${r.blind}/${r.classified} · Response ${r.response}/${r.classified}` : "No classifiable games";

// ---------- page bundle (built at build time by lib/data.ts getTopDraft) ----------

export interface GameBrief {
  id: number; event: string; tournament: string; patch: string; date: string; series: string; gameNo: number; stage?: string;
  firstPick?: Side; winner: Side; url: string;
  blue: { team: string; order?: string[]; picks: Record<Role, string>; bans: string[] };
  red: { team: string; order?: string[]; picks: Record<Role, string>; bans: string[] };
}
export interface PriorityBrief { presence: number | null; picks: number; bans: number; topPicks?: number /* picks in this lane */; winRate: number | null; low: boolean }
export interface TopDraftBundle {
  role: LaneRole;
  selections: TopSelection[];
  games: Record<number, GameBrief>;
  players: Record<string, string>; // `${game}:${side}` -> the player in this role, from the recorded builds
  drafts: Record<string, string>; // `${game}:${side}` -> Pro Drafts draft id, when the game is listed there
  priority: Record<string, { games: number; rows: Record<string, PriorityBrief> }>; // patch key ("all" for every patch)
  dpm: DPMRow[]; // only this lane's rows for matchups that occur in the recorded games
  events: { id: string; short: string }[];
  blind: Record<string, BlindLine[]>; // General Draft Logic (lib/top-blind.ts), never pro evidence
  duos?: DuoSelection[]; // BOT and SUPPORT: every team's bot lane
}
export type LaneDraftBundle = TopDraftBundle;

export const brief = (g: ProGame): GameBrief => ({
  id: g.id, event: g.event, tournament: g.tournament, patch: g.patch, date: g.date, series: g.series, gameNo: g.game, stage: g.stage,
  firstPick: g.firstPick, winner: g.winner, url: g.url,
  blue: { team: g.blue.team, order: g.blue.pickOrder, picks: g.blue.picks, bans: g.blue.bans },
  red: { team: g.red.team, order: g.red.pickOrder, picks: g.red.picks, bans: g.red.bans },
});

/** The ten picks of a game in draft order (turn 1-10), or undefined when the order or the first-pick side is unknown. */
export function draftSequence(g: Pick<GameBrief, "firstPick" | "blue" | "red">): { turn: number; side: Side; champion: string; role?: Role }[] | undefined {
  if (!g.firstPick || !g.blue.order || !g.red.order) return undefined;
  const out = (["blue", "red"] as const).flatMap((side) => g[side].order!.map((champion, i) => ({
    turn: turnOf(i, g.firstPick === side), side, champion, role: ROLES.find((r) => g[side].picks[r] === champion),
  })));
  return out.sort((a, b) => a.turn - b.turn);
}

// ---------- Draft Room (alan, 2026-10-13): labels only, never read by the ranking ----------

export interface TopUsageMark {
  usage: UsageLabel; blind: number; response: number; classified: number; games: number; low: boolean;
  into: Record<string, { games: number; series: number; status: PairStatus }>; // responses into each enemy lane opponent
  /** Bot and Support: duos with this champion completed after both enemy bot laners were known, by `${enemyAdc}+${enemySupport}`. */
  duoInto?: Record<string, { games: number; series: number; wins: number }>;
}
export interface TopUsageMarks { role?: LaneRole; patch?: string; marks: Record<string, TopUsageMark>; blind: Record<string, BlindLine[]> }

/** Per-champion lane usage on one patch (the default: newest with enough classified games), for Draft Room labels. */
export function topUsageMarks(sel: TopSelection[], dpm: DPMRow[], blind: Record<string, BlindLine[]>, patch = defaultTopPatch(sel), duos?: DuoSelection[]): TopUsageMarks {
  const marks: Record<string, TopUsageMark> = {};
  const role = sel[0]?.role as LaneRole | undefined;
  const responses = duos ? duoResponses(duos, { patch }) : [];
  for (const r of topRows(sel, { patch }, dpm)) {
    const mine = responses.filter((d) => (role === "SUPPORT" ? d.support : d.adc) === r.champion);
    const by = new Map<string, DuoSelection[]>();
    for (const d of mine) { const k = `${d.enemyAdc}+${d.enemySupport}`; by.set(k, [...(by.get(k) ?? []), ...d.games]); }
    const duoInto: TopUsageMark["duoInto"] = Object.fromEntries([...by].map(([k, g]) => [k, {
      games: g.length, series: new Set(g.map((x) => `${x.event}:${x.seriesId}`)).size, wins: g.filter((x) => x.won).length,
    }]));
    marks[r.champion] = {
      usage: r.usage, blind: r.blind, response: r.response, classified: r.classified, games: r.games, low: r.low,
      into: Object.fromEntries(r.respondedInto.map((p) => [p.into, { games: p.games.length, series: p.series, status: p.status }])),
      ...(duos ? { duoInto } : {}),
    };
  }
  return { role, patch, marks, blind };
}
