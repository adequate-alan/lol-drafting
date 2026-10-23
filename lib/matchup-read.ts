// Kit read for a counter pair (alan, 2026-10-22): for a pair DPM.LOL marks statistically favourable, which interactions in
// the two champions' stored kits plausibly explain the edge. General Draft Logic over the v2 kit values and champion
// attributes (unreviewed by alan), kept apart from the DPM statistic: the read never sees the win rate, never grades
// the matchup, never scores and never orders anything. A line is written only when the stored values show a clear,
// one-sided difference; when they show none, the read says so instead of guessing. Sustain, cooldowns, item paths and
// ability interactions are not stored, so they are never cited.
//
// This file is pure (no kit import) so the Draft Room can read it in the browser; lib/matchup-kits.ts builds the facts.
import type { Role } from "./schema";

type N = 0 | 1 | 2 | 3;
export type FightStart = "primary" | "catch" | "follow-up" | "none";

/** One champion's stored facts in one role: the only inputs the read compares. */
export interface MatchupFacts {
  range: N;          // kit.range: effective teamfight range
  poke: N;           // attrs.poke
  waveclear: N;      // kit.waveclear
  lanePressure: N;   // attrs.lanePressure
  early: N;          // kit.curve.early
  late: N;           // kit.curve.late
  reach: N;          // kit.backlineAccess: reaches a protected target through or around a frontline
  /**
   * kit.selfPeel (dashes, spell shield, untargetability), the stored proxy for mobility. It is written for carries and
   * defaults to 0 for everyone else, so it is carried here only where it was set or the champion is a carry threat in
   * the role; absent means "not stored", never "immobile".
   */
  mobility?: N;
  disengage: N;      // kit.disengage
  counterEngage: N;  // kit.counterEngage
  start: FightStart; // fightStart: on-demand crowd control to start (primary) or catch one target
  frontline: N;      // attrs.frontline
  tankDamage: N;     // kit.tankDamage: %HP, true damage, sustained shred
  burst: N;          // attrs.burst
}
export type MatchupBook = Record<string, Partial<Record<Role, MatchupFacts>>>;

export type ReadKind = "range" | "poke" | "early" | "wave" | "allin" | "cc" | "mobility" | "tank" | "burst" | "answer" | "scaling";
export interface ReadLine { kind: ReadKind; text: string; values: string }
export interface MatchupRead {
  /** Kit interactions that plausibly favour the counter: at most READ_LIMIT, in a fixed order, never ranked. */
  lines: ReadLine[];
  /** The same comparisons the other way round: what the kits give the opponent, so the read is never one-sided. */
  against: ReadLine[];
  /** "none" when the stored kits show no clear reason; "unread" when one champion has no stored kit for the role. */
  status: "read" | "none" | "unread";
}

export const READ_LIMIT = 3;
export const AGAINST_LIMIT = 2;
const LANE: Role[] = ["TOP", "MID", "BOT"];
// Specific interactions first, the generic curve comparisons last, so the three-line cap keeps the more telling lines.
const ORDER: ReadKind[] = ["range", "poke", "allin", "cc", "mobility", "tank", "burst", "answer", "wave", "early", "scaling"];

export function factOf(book: MatchupBook, champion: string, role: Role): MatchupFacts | undefined {
  const byRole = book[champion];
  return byRole?.[role] ?? (byRole ? Object.values(byRole)[0] : undefined);
}

const catches = (s: FightStart) => s === "primary" || s === "catch";
const startWord = (s: FightStart, verb: boolean) => (s === "primary" ? (verb ? "start" : "engage") : "catch");

/**
 * Lines for `a` over `b` in `role`. Each rule compares stored values and names them, so a reader can see what the line
 * rests on. Rules read what matters where the two meet: range, poke, waveclear and lane pressure in a lane; early
 * skirmishes in the jungle; crowd control against mobility, backline access against disengage, tank damage against
 * frontline, burst against a target with no frontline and little self-peel, disengage against an on-demand start, and
 * late scaling. The text hedges on purpose: "can", "stored", "rewards"; it never says the matchup is won.
 */
function linesFor(a: MatchupFacts, b: MatchupFacts, role: Role, me: string, them: string): ReadLine[] {
  const lane = LANE.includes(role), jungle = role === "JUNGLE";
  const out: ReadLine[] = [];
  const add = (kind: ReadKind, text: string, values: string) => out.push({ kind, text, values });
  if (!jungle && a.range >= 2 && a.range > b.range)
    add("range", `Range: ${me} trades from further out, so ${them} has to close the distance to answer.`, `range ${a.range} vs ${b.range}`);
  if (!jungle && a.poke >= 2 && a.poke > b.poke)
    add("poke", `Poke: ${me} can chip ${them} from range without committing.`, `poke ${a.poke} vs ${b.poke}`);
  if (jungle) {
    if (a.early >= 2 && a.early > b.early)
      add("early", `Early skirmishes: ${me}'s stored early curve is the stronger, which favours invades and early fights.`, `early ${a.early} vs ${b.early}`);
  } else if (a.early >= b.early && a.lanePressure >= b.lanePressure && (a.early > b.early || a.lanePressure > b.lanePressure) && (a.early >= 2 || a.lanePressure >= 2)) {
    const what = a.early > b.early && a.lanePressure > b.lanePressure ? "early curve and lane pressure are" : a.early > b.early ? "early curve is" : "lane pressure is";
    add("early", `Early lane: ${me}'s stored ${what} the stronger of the two.`, `early ${a.early} vs ${b.early}, lane pressure ${a.lanePressure} vs ${b.lanePressure}`);
  }
  if (lane && a.waveclear >= 2 && a.waveclear > b.waveclear)
    add("wave", `Wave control: faster waveclear can keep priority and the wave pushed toward ${them}.`, `waveclear ${a.waveclear} vs ${b.waveclear}`);
  if (a.reach >= 2 && b.disengage === 0 && b.counterEngage === 0)
    add("allin", `All-in windows: ${me} can reach ${them}, whose kit stores no disengage or counter-engage to answer a commit.`, `reach ${a.reach}; ${them} disengage 0, counter-engage 0`);
  if (catches(a.start) && b.mobility !== undefined && b.mobility <= 1)
    add("cc", `Crowd control onto a low-mobility target: ${me} can ${startWord(a.start, true)} on demand and ${them} stores little self-peel to slip it.`, `${a.start} start; ${them} self-peel ${b.mobility}`);
  if (a.mobility !== undefined && a.mobility >= 2 && catches(b.start))
    add("mobility", `Mobility against crowd control: ${me}'s stored self-peel (dashes, spell shield or untargetability) makes ${them}'s ${startWord(b.start, false)} harder to land.`, `self-peel ${a.mobility}; ${them} ${b.start} start`);
  if (role !== "SUPPORT" && a.tankDamage >= 2 && b.frontline >= 2)
    add("tank", `Tank damage: ${me}'s kit is stored as a tank killer and ${them}'s as frontline.`, `tank damage ${a.tankDamage}; ${them} frontline ${b.frontline}`);
  if (a.burst >= 2 && b.frontline === 0 && b.mobility !== undefined && b.mobility <= 1)
    add("burst", `Burst: ${them} is stored with no frontline and little self-peel, which ${me}'s burst can punish.`, `burst ${a.burst}; ${them} frontline 0, self-peel ${b.mobility}`);
  if (catches(b.start) && (a.disengage >= 2 || a.counterEngage >= 2))
    add("answer", `Answers the engage: ${me} stores disengage or counter-engage against ${them}'s on-demand ${startWord(b.start, true)}.`, `disengage ${a.disengage}, counter-engage ${a.counterEngage}; ${them} ${b.start} start`);
  if (a.late >= 3 && a.late > b.late)
    add("scaling", `Scaling: ${me}'s stored late curve is the higher, which rewards playing the ${jungle ? "early game" : "lane"} for later.`, `late ${a.late} vs ${b.late}`);
  return out.sort((x, y) => ORDER.indexOf(x.kind) - ORDER.indexOf(y.kind));
}

/**
 * The read for `mine` (the counter) into `theirs` in `role`. A comparison that holds both ways (each can reach the
 * other, say) explains nothing and is dropped from both sides. Names are for the text only; nothing else is read.
 */
export function matchupRead(book: MatchupBook, mine: string, theirs: string, role: Role, name: (id: string) => string = (id) => id): MatchupRead {
  const a = factOf(book, mine, role), b = factOf(book, theirs, role);
  if (!a || !b) return { lines: [], against: [], status: "unread" };
  const forMe = linesFor(a, b, role, name(mine), name(theirs));
  const forThem = linesFor(b, a, role, name(theirs), name(mine));
  const both = new Set(forMe.map((l) => l.kind).filter((k) => forThem.some((l) => l.kind === k)));
  const lines = forMe.filter((l) => !both.has(l.kind)).slice(0, READ_LIMIT);
  const against = forThem.filter((l) => !both.has(l.kind)).slice(0, AGAINST_LIMIT);
  return { lines, against, status: lines.length ? "read" : "none" };
}

/** The sentence the card shows when the kits give no clear reason. Never a guess, never a number from the statistic. */
export const NO_READ_TEXT = "The stored kits show no clear reason for this edge. It may lie in what they don't record: sustain, cooldowns, item paths, ability interactions.";
/** Shown when one champion has no stored kit for the role. */
export const UNREAD_TEXT = "No stored kit for one of these champions in this role, so there is no read.";
/** Every kit-read block carries this, so the reading is never mistaken for the statistic. */
export const READ_DISCLAIMER = "A reading of the stored kit values, not proof and not a score: the matchup figure above stands on its own.";
