// Top-lane matchup exploration (alan, 2026-11-14): for one top laner, every lane opponent the stored DPM.LOL rows cover,
// grouped by what the ranked data says (favourable, difficult, relatively even, too small to say), and for one opened
// matchup the pieces that explain it, each from its own layer and never merged:
//
//   DPM.LOL statistic   the stored row: win rate, games, patch, bracket. Same thresholds as Counters (lib/counters.ts).
//   Kit read            lib/matchup-read.ts over the stored kit values (General Draft Logic), never sees the win rate
//   Curve               the two stored power curves side by side: early pressure against scaling
//   With a jungler      how a jungler plausibly changes the lane, from the same stored values (analysis; which jungler
//                       and what the enemy jungler does are not modelled)
//   Blind facts         how many qualified lanes fall in each group and the hardest ones: counts, never a safety rating
//
// Pure, so the page reads it in the browser. Nothing here is a score, an order of candidates or a counter claim of its
// own: a counter is still only what lib/counters.ts says, and nothing in recommend.ts or candidates.ts reads this file.
import { DPM_MIN_GAMES, DPM_STRONG_WIN_RATE, LANE_EVEN_BAND } from "./counters";
import type { MatchupBook, MatchupFacts } from "./matchup-read";

/** One stored row, compact: [opponent, win rate in 1/10000, games, shown in DPM's Full List]. */
export type LaneTuple = [string, number, number, 0 | 1];

/** Top's DPM rows for the Synergies page: each page champion's rows, the one collection they come from, and the kit facts. */
export interface LaneData {
  rows: Record<string, LaneTuple[]>; // by page champion
  urls: Record<string, string>; // the DPM.LOL page each champion's rows were read from
  patch: string; // Gol.gg spelling; shown through patchLabel
  rank: string;
  updated: string;
  newest?: string; // newest recognised patch: an older collection is marked, never hidden
  book: MatchupBook; // TOP facts for every champion in the rows
}

export type LaneGroup = "favourable" | "difficult" | "even" | "thin";
export const LANE_GROUP_LABEL: Record<LaneGroup, string> = { favourable: "Favourable", difficult: "Difficult", even: "Relatively even", thin: "Too few games to say" };

export interface LaneRead {
  enemy: string;
  winRate: number; // the selected champion's win rate in the matchup
  games: number;
  group: LaneGroup;
  strong: boolean; // 54%+ either way with the full sample
  /** Read from the opponent's page and turned round: the same games, not a second source. */
  turned: boolean;
  page: string; // whose DPM page holds the row
}

const groupOf = (winRate: number, games: number): LaneGroup =>
  games < DPM_MIN_GAMES ? "thin" : winRate >= 0.5 + LANE_EVEN_BAND ? "favourable" : winRate <= 0.5 - LANE_EVEN_BAND ? "difficult" : "even";

/**
 * Every lane opponent the stored rows cover for `id`: its own page's rows, plus pairs only an opponent's page lists,
 * turned round (100% minus that page's win rate) and marked. One entry per opponent; the champion's own page wins.
 */
export function laneReads(data: LaneData, id: string): LaneRead[] {
  const out = new Map<string, LaneRead>();
  const add = (enemy: string, w: number, games: number, turned: boolean, page: string) => {
    const winRate = Math.round(w) / 10000;
    out.set(enemy, { enemy, winRate, games, group: groupOf(winRate, games), strong: games >= DPM_MIN_GAMES && Math.abs(winRate - 0.5) >= DPM_STRONG_WIN_RATE - 0.5, turned, page });
  };
  for (const [enemy, w, games] of data.rows[id] ?? []) add(enemy, w, games, false, id);
  for (const [page, rows] of Object.entries(data.rows)) {
    if (page === id || out.has(page)) continue;
    const r = rows.find(([enemy]) => enemy === id);
    if (r) add(page, 10000 - r[1], r[2], true, page);
  }
  return [...out.values()];
}

/** The reads by group. Inside a group the order is the statistic's own: the widest margin first, the largest sample for
 *  the even and thin groups. A list of matchups, never a ranking of picks. */
export function laneGroups(reads: LaneRead[]): Record<LaneGroup, LaneRead[]> {
  const of = (g: LaneGroup) => reads.filter((r) => r.group === g);
  return {
    favourable: of("favourable").sort((a, b) => b.winRate - a.winRate || b.games - a.games),
    difficult: of("difficult").sort((a, b) => a.winRate - b.winRate || b.games - a.games),
    even: of("even").sort((a, b) => b.games - a.games),
    thin: of("thin").sort((a, b) => b.games - a.games),
  };
}

export interface BlindFacts { qualified: number; favourable: number; even: number; difficult: number; strongDifficult: number; hardest: LaneRead[]; thin: number }
export const HARDEST_SHOWN = 3;

/** What the lanes say about picking the champion before the enemy top is known: counts over the qualified lanes and the
 *  hardest ones. Facts to weigh beside the saved blind grade and the observed pro usage, never a rating of its own. */
export function blindFacts(reads: LaneRead[]): BlindFacts {
  const g = laneGroups(reads);
  return {
    qualified: reads.length - g.thin.length, favourable: g.favourable.length, even: g.even.length, difficult: g.difficult.length,
    strongDifficult: g.difficult.filter((r) => r.strong).length, hardest: g.difficult.slice(0, HARDEST_SHOWN), thin: g.thin.length,
  };
}

// ---------- the two curves ----------

const CURVE_WORD = ["weak", "even", "strong", "peak"] as const;

/** Early pressure against scaling, from the two stored curves. Undefined when either champion has no stored facts. */
export function curveLine(a: MatchupFacts | undefined, b: MatchupFacts | undefined, me: string, them: string): { text: string; values: string } | undefined {
  if (!a || !b) return undefined;
  const values = `${me} early ${a.early}, late ${a.late}; ${them} early ${b.early}, late ${b.late}`;
  const early = a.early === b.early ? undefined : a.early > b.early ? me : them;
  const late = a.late === b.late ? undefined : a.late > b.late ? me : them;
  const text = early && late && early !== late ? `${early} has the stronger early lane and ${late} the stronger late game: the lane is a race between ${early}'s lead and ${late}'s items.`
    : early && late ? `${early} is stored as the stronger both early and late.`
    : early ? `${early} has the stronger early lane (${CURVE_WORD[Math.max(a.early, b.early)]}); the two are level late.`
    : late ? `Level early; ${late} is the stronger late, so time favours ${late}.`
    : `The two stored curves are level early and late.`;
  return { text, values };
}

// ---------- with a jungler ----------

export interface JungleAngle { kind: "gank" | "slippery" | "setup" | "exposed" | "cover" | "dive" | "time" | "clock"; text: string; values: string }
export const ANGLE_LIMIT = 3;
const catches = (f: MatchupFacts) => f.start === "primary" || f.start === "catch";

/**
 * How a jungler plausibly changes the lane, from the two tops' stored values only: whether the opponent can leave a gank,
 * whether my top holds the target or is held, who has the early lane when junglers arrive, and whose side time is on.
 * Hedged on purpose and capped; it names no jungler (the Pairing Explorer does that) and says nothing about the enemy
 * jungler, who is not modelled.
 */
export function jungleAngles(a: MatchupFacts | undefined, b: MatchupFacts | undefined, me: string, them: string): JungleAngle[] {
  if (!a || !b) return [];
  const out: JungleAngle[] = [];
  if (b.mobility !== undefined && b.mobility <= 1 && b.disengage === 0)
    out.push({ kind: "gank", text: `A gank has something to hit: ${them} stores little self-peel and no disengage, so leaving once a jungler arrives is hard.`, values: `${them} self-peel ${b.mobility}, disengage 0` });
  else if (b.mobility !== undefined && b.mobility >= 2)
    out.push({ kind: "slippery", text: `${them} is hard to gank: stored self-peel (dashes, spell shield or untargetability) lets them leave when a jungler shows.`, values: `${them} self-peel ${b.mobility}` });
  if (catches(a))
    out.push({ kind: "setup", text: `${me} holds the target for the gank, so the jungler only has to arrive.`, values: `${me} ${a.start} start` });
  if (catches(b) && a.mobility !== undefined && a.mobility <= 1)
    out.push({ kind: "exposed", text: `The same works against you: ${them} can hold ${me} for their jungler, so trading forward without vision is the risk.`, values: `${them} ${b.start} start; ${me} self-peel ${a.mobility}` });
  if (b.early > a.early && b.lanePressure >= a.lanePressure)
    out.push({ kind: "cover", text: `${them} usually has the wave early: jungle cover on the top side protects ${me} from dives more than it wins the lane.`, values: `early ${a.early} vs ${b.early}, lane pressure ${a.lanePressure} vs ${b.lanePressure}` });
  else if (a.early > b.early && a.lanePressure >= 2)
    out.push({ kind: "dive", text: `${me} can have the wave early: with a jungler that becomes a dive or a top-side objective, and the enemy jungler has to answer.`, values: `early ${a.early} vs ${b.early}; ${me} lane pressure ${a.lanePressure}` });
  if (a.late >= 3 && a.late > b.late)
    out.push({ kind: "time", text: `Time is on ${me}'s side: jungle help only has to keep the lane even.`, values: `late ${a.late} vs ${b.late}` });
  else if (b.late >= 3 && b.late > a.late)
    out.push({ kind: "clock", text: `${them} outscales: early jungle pressure is what turns the lane before that.`, values: `late ${a.late} vs ${b.late}` });
  return out.slice(0, ANGLE_LIMIT);
}

// ---------- links ----------

/** The Synergies Top matchups view for a champion, optionally with one matchup open. */
export const topMatchupsHref = (id: string, vs?: string) => `/synergies/top/?champ=${id}&view=matchups${vs ? `&vs=${vs}` : ""}`;
