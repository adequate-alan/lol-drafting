// Pairing Explorer (alan, 2026-11-13): one shared pairing layer for Draft Insights, Synergies and the Draft Room, so the
// three never run separate pairing engines. Pure functions only (tests/pairings.test.ts).
//
//   pairGames(...)          every recorded team draft (tracked events, the LCK archive, stored drafts of games the archive
//                           lacks), one row per team per game, built once at load
//   pairEvidence(...)       recorded games with two champions on one team in two roles: games, teams, series, W–L, patches
//   partnerOptions(...)     one anchor's partners in three groups that are never merged: alan's saved Synergy, observed pro
//                           pairings that are not saved, and kit-based proposals. Each champion is listed once.
//   duoRead(...)            General Draft Logic for a bot lane from the stored kits: lane plan, interactions, strengths,
//                           weaknesses, power curve, each line naming the values it rests on
//   coreRead(...)           the same read for a mid + jungle core (alan, 2026-11-14): who starts and who follows, early
//                           pressure, damage mix, power curve
//   pairLessons(...)        Draft Insights moments that speak to the pair (creator opinions and solo-queue stats, labelled)
//
// Four layers stay apart: a recorded game is Observed Pro Evidence and never becomes a saved pairing or a score; a kit read
// is analysis; a creator lesson is learning material. Nothing here is read by recommend.ts, candidates.ts or any ranking.
import { newestGamesFirst } from "./chronology";
import { followOf } from "./model-v2/follow";
import { convertKits } from "./model-v2/kits";
import type { ChampionKit } from "./model-v2/schema";
import { comparePatch } from "./patch";
import { handAlts } from "./pro-alternatives";
import { proposedPartners, type ProposedLink } from "./proposed";
import type { BotPairing, DraftInsights, MidJunglePairing, PairingNote, ProDraft, ProGame, ProposedRecord, Role, Source } from "./schema";

type Side = "blue" | "red";

// ---------- recorded team drafts ----------

/** One team's draft in one recorded game. */
export interface PairGame {
  game: number; // Gol.gg game id
  event: string; // meta.json event id
  stage?: string;
  patch: string; // Gol.gg's spelling (16.xx); shown through patchLabel
  date?: string;
  team: string;
  opponent: string;
  side?: Side;
  won?: boolean;
  series: string; // `${event}:${seriesId}`: Fearless lets a pairing appear once per series, so teams are the real independence
  gameNo?: number;
  picks: Partial<Record<Role, string>>;
  draft?: string; // Pro Drafts id, when Pro Drafts lists the game
  url?: string; // Gol.gg game page
  archive: boolean; // LCK 2026 playoffs: a frozen historical archive
}

const ARCHIVE_EVENTS = new Set(["lck-2026-playoffs"]);

/**
 * Every recorded team draft, once: the tracked games, the archive game records (LCK playoffs, stored with Pro Builds) and
 * any stored draft whose game neither holds (LCK finals G3, 82964, recorded by hand). Keyed by Gol.gg game id and side.
 */
export function pairGames(tracked: ProGame[], archive: ProGame[], stored: ProDraft[], sources: Record<string, Source>, eventOf: (tournament: string) => string | undefined): PairGame[] {
  const out: PairGame[] = [];
  const seen = new Set<number>();
  const storedFor = (g: ProGame, side: Side) => stored.find((d) => d.sources.includes(`golgg-game-${g.id}`) && (["TOP", "JUNGLE", "MID", "BOT", "SUPPORT"] as const).every((r) => d.picks[r] === g[side].picks[r]))?.id;
  const add = (g: ProGame, isArchive: boolean) => {
    if (seen.has(g.id)) return;
    seen.add(g.id);
    for (const side of ["blue", "red"] as const) {
      const other = side === "blue" ? "red" : "blue";
      out.push({
        game: g.id, event: g.event, stage: g.stage, patch: g.patch, date: g.date, team: g[side].team, opponent: g[other].team, side, won: g.winner === side,
        series: `${g.event}:${g.seriesId}`, gameNo: g.game, picks: { ...g[side].picks },
        draft: isArchive ? storedFor(g, side) : `golgg-${g.id}-${side}`, url: g.url, archive: isArchive || ARCHIVE_EVENTS.has(g.event),
      });
    }
  };
  for (const g of tracked) add(g, false);
  for (const g of archive) add(g, true);
  // Stored drafts of a game no record holds: their team names are the short ones the hand record used, so they are
  // matched to the full names of the same series' recorded games where one exists.
  const byGame = new Map<number, ProDraft[]>();
  for (const d of stored) {
    const id = Number(/^golgg-game-(\d+)$/.exec(d.sources.find((s) => /^golgg-game-\d+$/.test(s)) ?? "")?.[1] ?? 0);
    if (!id || seen.has(id)) continue;
    byGame.set(id, [...(byGame.get(id) ?? []), d]);
  }
  for (const [id, drafts] of byGame) {
    const src = sources[`golgg-game-${id}`];
    for (const d of drafts) {
      const event = eventOf(d.tournament) ?? d.tournament;
      const mate = archive.find((g) => g.event === event && g.series.includes(d.team) && g.series.includes(d.opponent));
      const full = (short: string) => (mate ? [mate.blue.team, mate.red.team].find((t) => t === short || t.startsWith(short) || initials(t) === short) ?? short : short);
      const side = src?.sides ? (src.sides.blue === d.team ? "blue" : src.sides.red === d.team ? "red" : undefined) : undefined;
      out.push({
        game: id, event, stage: d.stage?.toUpperCase(), patch: d.patch ?? src?.patch ?? "", date: d.date ?? src?.date ?? undefined, team: full(d.team), opponent: full(d.opponent),
        side, won: side && src?.sides?.winner ? src.sides.winner === side : undefined, series: mate ? `${event}:${mate.seriesId}` : `${event}:${d.stage}:${[d.team, d.opponent].sort().join("|")}`,
        gameNo: Number(/G(\d+)$/.exec(d.seriesGame)?.[1] ?? 0) || undefined, picks: { ...d.picks }, draft: d.id, url: src?.url, archive: ARCHIVE_EVENTS.has(event),
      });
    }
  }
  return out;
}

// "Hanwha Life Esports" -> "HLE"
const initials = (t: string) => t.split(/\s+/).map((w) => w[0]).join("").toUpperCase();

// ---------- evidence for one pair ----------

export interface PairEvidence {
  partner: string;
  games: PairGame[]; // newest first
  teams: string[]; // unique teams, most games first
  series: number;
  wins: number;
  losses: number;
  patches: string[]; // newest first
  events: { event: string; games: number; patch: string }[]; // newest patch first
  newest?: string; // date of the newest game
  current: number; // games on the newest recorded patch overall
  archiveOnly: boolean; // every game is LCK archive
}

const stamp = (g: PairGame) => ({ date: g.date, patch: g.patch, series: g.series, game: g.gameNo, id: g.game });

/** Recorded games with `id` in `role` and a partner in `partnerRole` on the same team, one entry per partner. */
export function pairEvidence(rows: PairGame[], id: string, role: Role, partnerRole: Role, newestPatch?: string): Map<string, PairEvidence> {
  const by = new Map<string, PairGame[]>();
  for (const r of rows) {
    if (r.picks[role] !== id) continue;
    const p = r.picks[partnerRole];
    if (p) by.set(p, [...(by.get(p) ?? []), r]);
  }
  const out = new Map<string, PairEvidence>();
  for (const [partner, list] of by) out.set(partner, evidenceOf(partner, list, newestPatch));
  return out;
}

export function evidenceOf(partner: string, list: PairGame[], newestPatch?: string): PairEvidence {
  const games = newestGamesFirst(list, stamp);
  const teamN = new Map<string, number>();
  for (const g of games) teamN.set(g.team, (teamN.get(g.team) ?? 0) + 1);
  const ev = new Map<string, { event: string; games: number; patch: string }>();
  for (const g of games) {
    const e = ev.get(g.event) ?? { event: g.event, games: 0, patch: g.patch };
    e.games++;
    if (comparePatch(g.patch, e.patch) > 0) e.patch = g.patch;
    ev.set(g.event, e);
  }
  const patches = [...new Set(games.map((g) => g.patch).filter(Boolean))].sort((a, b) => comparePatch(b, a));
  return {
    partner, games,
    teams: [...teamN.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t),
    series: new Set(games.map((g) => g.series)).size,
    wins: games.filter((g) => g.won === true).length,
    losses: games.filter((g) => g.won === false).length,
    patches,
    events: [...ev.values()].sort((a, b) => comparePatch(b.patch, a.patch) || b.games - a.games),
    newest: games.find((g) => g.date)?.date,
    current: newestPatch ? games.filter((g) => g.patch && comparePatch(g.patch, newestPatch) === 0).length : 0,
    archiveOnly: games.every((g) => g.archive),
  };
}

/** The newest patch any recorded team draft is on. */
export const newestPatchOf = (rows: PairGame[]) => rows.map((r) => r.patch).filter(Boolean).sort((a, b) => comparePatch(b, a))[0];

/** Fewer than this many unique teams: a small sample, said so beside the count. */
export const PAIR_FEW_TEAMS = 3;

// ---------- partners of one anchor, in three groups ----------

// Two pairings share the layer (alan, 2026-11-14): the bot lane (ADC + support) and the mid + jungle core. `a` is the
// carry slot shown first (ADC, mid), `b` its partner slot (support, jungler); a pair is always written [a, b].
export type LaneKey = "bot" | "mid-jungle";
export type DuoRole = "BOT" | "SUPPORT" | "MID" | "JUNGLE";
export const LANES: Record<LaneKey, { a: DuoRole; b: DuoRole }> = { bot: { a: "BOT", b: "SUPPORT" }, "mid-jungle": { a: "MID", b: "JUNGLE" } };
export const laneOf = (r: DuoRole): LaneKey => (r === "BOT" || r === "SUPPORT" ? "bot" : "mid-jungle");
export type SavedKind = "default" | "alt";
export const SAVED_LABEL: Record<SavedKind, string> = { default: "Saved preferred", alt: "Saved alternative" };
/** alan's saved records, by lane. Bot lanes are saved on the ADC's record; a mid + jungle pair on either champion's. */
export interface SavedRecords { botPairings: BotPairing[]; midJungle?: MidJunglePairing[] }

export interface PartnerOption {
  id: string; // the partner
  role: DuoRole; // the partner's role
  group: "saved" | "observed" | "proposed";
  /** `on`: whose record holds the link for a mid + jungle pair (the Draft Room scores it only with that champion locked). */
  saved?: { kind: SavedKind; note?: string; on?: "a" | "b" | "both"; sides?: { a?: SavedKind; b?: SavedKind } };
  proposed?: ProposedLink;
  evidence?: PairEvidence;
}

export interface PartnerGroups { saved: PartnerOption[]; observed: PartnerOption[]; proposed: PartnerOption[] }

export const partnerRoleOf = (r: DuoRole): DuoRole => (r === "BOT" ? "SUPPORT" : r === "SUPPORT" ? "BOT" : r === "MID" ? "JUNGLE" : "MID");

/** alan's saved link between a bot and a support, from the bot's record. A pairing only seen in pro games is never one (alan, 2026-11-13). */
export function savedLink(bot: string, support: string, botPairings: BotPairing[]): PartnerOption["saved"] {
  const rec = botPairings.find((b) => b.champion === bot);
  if (!rec) return undefined;
  if (rec.clashDefault.includes(support)) return { kind: "default", note: rec.alternativeNotes[support] };
  if (rec.alternatives.includes(support)) return { kind: "alt", note: rec.alternativeNotes[support] };
  return undefined;
}

const KIND_ORDER: Record<SavedKind, number> = { default: 0, alt: 1 };

/**
 * alan's saved link between a mid and a jungler. Each champion has its own record, so the link can sit on the mid's
 * record, the jungler's, or both, and the two records may rank it differently (Cho'Gath's record prefers Syndra; Syndra's
 * lists Cho'Gath as an alternative). `kind` is the kind on the `view` side's record when that record holds the link,
 * else the other record's; `sides` keeps both so neither is hidden.
 */
export function savedCore(mid: string, jungle: string, midJungle: MidJunglePairing[], view: "a" | "b" = "a"): PartnerOption["saved"] {
  const kindOn = (anchor: string, role: "MID" | "JUNGLE", partner: string) => {
    const rec = midJungle.find((m) => m.anchor === anchor && m.role === role);
    const kind: SavedKind | undefined = rec?.clashDefault.includes(partner) ? "default" : rec?.alternatives.includes(partner) ? "alt" : undefined;
    return kind && { kind, note: rec!.alternativeNotes[partner] };
  };
  const a = kindOn(mid, "MID", jungle), b = kindOn(jungle, "JUNGLE", mid);
  if (!a && !b) return undefined;
  const mine = view === "a" ? a ?? b : b ?? a;
  return { kind: mine!.kind, note: mine!.note, on: a && b ? "both" : a ? "a" : "b", sides: { a: a?.kind, b: b?.kind } };
}

/** The saved link of a pair [a, b] in its lane, read from the `view` slot's side where the lane keeps two records. */
export const savedPair = (lane: LaneKey, a: string, b: string, saved: SavedRecords, view: "a" | "b" = "a"): PartnerOption["saved"] =>
  lane === "bot" ? savedLink(a, b, saved.botPairings) : savedCore(a, b, saved.midJungle ?? [], view);

const byEvidence = (a: PartnerOption, b: PartnerOption) =>
  (b.evidence?.teams.length ?? 0) - (a.evidence?.teams.length ?? 0) || (b.evidence?.games.length ?? 0) - (a.evidence?.games.length ?? 0)
  || (b.evidence?.newest ?? "").localeCompare(a.evidence?.newest ?? "");

/**
 * The partners of one champion, grouped and ordered without a score:
 *   saved     alan's record order (preferred, then alternatives); for a support, the bots
 *             whose records list it, preferred first, then by recorded teams
 *   observed  recorded together, not saved: most unique teams first, then games, then the newest game (never win rate)
 *   proposed  kit-based proposals not already above: the proposed layer's own order (preferred, then confidence)
 * Each champion appears once, in the first group it qualifies for; its other signals ride along as labels.
 */
export function partnerOptions(anchor: { id: string; role: DuoRole }, input: SavedRecords & { proposed: ProposedRecord[]; rows: PairGame[]; playable: (id: string, role: DuoRole) => boolean; newestPatch?: string }): PartnerGroups {
  const other = partnerRoleOf(anchor.role);
  const lane = laneOf(anchor.role);
  const isA = LANES[lane].a === anchor.role;
  const ev = pairEvidence(input.rows, anchor.id, anchor.role, other, input.newestPatch);
  const pair = (p: string) => (isA ? [anchor.id, p] : [p, anchor.id]) as [string, string];
  const props = proposedPartners(input.proposed, anchor.id, anchor.role, other);
  const propOf = (p: string) => props.find((l) => l.id === p);
  const seen = new Set<string>([anchor.id]);
  const make = (id: string, group: PartnerOption["group"]): PartnerOption => {
    seen.add(id);
    const [a, b] = pair(id);
    return { id, role: other, group, saved: savedPair(lane, a, b, input, isA ? "a" : "b"), proposed: propOf(id), evidence: ev.get(id) };
  };
  const byKind = (a: PartnerOption, b: PartnerOption) => KIND_ORDER[a.saved!.kind] - KIND_ORDER[b.saved!.kind] || byEvidence(a, b);
  let saved: PartnerOption[];
  if (anchor.role === "BOT") {
    const rec = input.botPairings.find((b) => b.champion === anchor.id);
    saved = rec ? [...rec.clashDefault, ...handAlts(rec)].filter((id) => !seen.has(id)).map((id) => make(id, "saved")) : [];
  } else if (anchor.role === "SUPPORT") {
    saved = input.botPairings.filter((b) => b.clashDefault.includes(anchor.id) || b.alternatives.includes(anchor.id)).map((b) => make(b.champion, "saved")).sort(byKind);
  } else {
    // Mid or jungle: the anchor's own record in its order, then the partners whose records list the anchor.
    const records = input.midJungle ?? [];
    const rec = records.find((m) => m.anchor === anchor.id && m.role === anchor.role);
    const own = rec ? [...rec.clashDefault, ...handAlts(rec)].filter((id) => !seen.has(id)).map((id) => make(id, "saved")) : [];
    const theirs = records.filter((m) => m.role === other && !seen.has(m.anchor) && (m.clashDefault.includes(anchor.id) || m.alternatives.includes(anchor.id)))
      .map((m) => make(m.anchor, "saved")).sort(byKind);
    saved = [...own, ...theirs];
  }
  const observed = [...ev.keys()].filter((id) => !seen.has(id)).map((id) => make(id, "observed")).sort(byEvidence);
  const proposed = props.filter((l) => !seen.has(l.id) && input.playable(l.id, other)).map((l) => make(l.id, "proposed"));
  return { saved, observed, proposed };
}

// ---------- General Draft Logic for a bot lane ----------

export type PlanFit = "shared" | "split" | "neutral";
export interface ReadLine { text: string; basis: string }
export interface DuoRead {
  plan: { label: string; text: string; fit: PlanFit; basis: string };
  works: ReadLine[];
  strengths: ReadLine[];
  weaknesses: ReadLine[];
  curve: ReadLine;
  unread?: string[]; // champions with no stored kit: nothing is read for them
}

type BotWant = "setup" | "early" | "scale" | "range" | "skirmish";
type SupStyle = "engage" | "catch" | "protect" | "poke";

const botWant = (c: ChampionKit): BotWant => {
  if (c.flags.includes("needs-setup") || c.kit.setupDependency >= 2) return "setup";
  if (c.kit.curve.early >= 3) return "early";
  if (c.kit.range >= 3 && c.attrs.poke >= 2) return "range";
  if (c.kit.curve.late >= 3 && c.kit.curve.early <= 1) return "scale";
  return "skirmish";
};
const supStyle = (c: ChampionKit): SupStyle => {
  if (c.fightStart === "primary") return "engage";
  if (c.fightStart === "catch") return "catch";
  if (c.attrs.poke >= 2 && c.attrs.peel < 3) return "poke";
  return "protect";
};
const peels = (c: ChampionKit) => c.attrs.peel >= 2 || c.kit.disengage >= 2;
const threat = (c: ChampionKit) => c.damageByRole.BOT?.damageThreat ?? 3;
const CURVE = ["weak", "even", "strong", "peak"] as const;
const curveText = (c: ChampionKit) => `early ${c.kit.curve.early}, mid ${c.kit.curve.mid}, late ${c.kit.curve.late}`;

/**
 * The bot lane read from the two kits as stored (unreviewed heuristics except where noted in kits.ts). The plan names what
 * the duo wants; `split` means the two kits want different lanes, never that the pair is bad. Every line carries the
 * stored values it rests on, so a disagreement with it is a disagreement with a value, not with hidden judgement.
 */
export function duoRead(bot: ChampionKit | undefined, sup: ChampionKit | undefined, names: { bot: string; sup: string }): DuoRead | undefined {
  if (!bot || !sup) return undefined;
  const A = names.bot, S = names.sup;
  const want = botWant(bot), style = supStyle(sup);
  const f = followOf({ role: "BOT", c: bot, threat: threat(bot), physical: 0, magic: 0, true: 0 });
  const engages = style === "engage";
  const plan = ((): DuoRead["plan"] => {
    const b = `${A}: ${want === "setup" ? "needs setup" : want === "early" ? `early curve ${bot.kit.curve.early}` : want === "range" ? `range ${bot.kit.range}, poke ${bot.attrs.poke}` : want === "scale" ? `late curve ${bot.kit.curve.late}` : `curve ${curveText(bot)}`}; ${S}: ${engages ? "primary fight start" : style === "catch" ? "catch start" : style === "poke" ? `poke ${sup.attrs.poke}` : `peel ${sup.attrs.peel}, disengage ${sup.kit.disengage}`}`;
    if (want === "setup") return engages || style === "catch"
      ? { label: "Setup for the carry", fit: "shared", basis: b, text: `${A} needs someone else to start the fight; ${S} provides that start, so ${A} can follow from range.` }
      : { label: "Carry still needs a start", fit: "split", basis: b, text: `${A} needs someone else to start fights and ${S} does not start them: the engage has to come from the jungler or mid.` };
    if (engages) {
      if (want === "early") return f.commits || f.allIn
        ? { label: "Early all-in", fit: "shared", basis: b, text: `${S} locks a target down from level 2 and ${A}'s early damage turns the lockdown into a kill.` }
        : { label: "Engage with ranged follow-up", fit: "neutral", basis: b, text: `${S} starts the fight; ${A} adds damage from range but brings nothing of their own to finish the all-in.` };
      if (want === "range") return f.allIn
        ? { label: "Engage and follow", fit: "shared", basis: b, text: `${S} starts the fight and ${A} adds crowd control or burst of their own from range.` }
        : { label: "Two different lane plans", fit: "split", basis: b, text: `${S} wants committed all-ins; ${A} wants to trade from range and follows an engage only with damage from range.` };
      if (want === "scale") return bot.kit.backlineAccess >= 2
        ? { label: "Dive together", fit: "shared", basis: `${b}; ${A}: backline access ${bot.kit.backlineAccess}`, text: `${S} goes in and ${A} follows onto the same target with their own reach.` }
        : { label: "Fights before the carry is ready", fit: "split", basis: b, text: `${S} wants to force fights early; ${A} wants a quiet lane until their items come online.` };
      return f.allIn
        ? { label: "Fight on the engage", fit: "shared", basis: b, text: `${S} starts the fight and ${A} commits with crowd control or burst of their own.` }
        : { label: "Engage with ranged follow-up", fit: "neutral", basis: b, text: `${S} starts the fight; ${A} adds damage but little to finish the all-in.` };
    }
    if (style === "catch") return { label: want === "scale" ? "Scale with picks" : "Catch and punish", fit: "neutral", basis: b,
      text: `${S} looks for one catch at a time; ${A} ${want === "scale" ? "farms toward items and joins the picks that land" : "punishes the target that gets caught"}.` };
    if (style === "poke") return want === "range" || want === "early"
      ? { label: "Trade from range", fit: "shared", basis: b, text: `Both win trades from range, so the lane is decided by poke and wave control rather than all-ins.` }
      : { label: "Poke while the carry farms", fit: "neutral", basis: b, text: `${S} pokes and controls the lane while ${A} farms toward their stronger stages.` };
    // protect
    if (want === "scale") return { label: "Protect to scale", fit: "shared", basis: b, text: `${S} keeps ${A} alive through lane and fights so ${A} reaches the items that carry the game.` };
    if (want === "early") return { label: "Trade with sustain", fit: "neutral", basis: b, text: `${A} trades early and often; ${S} keeps those trades winning with shields, heals or disengage rather than starting fights.` };
    if (want === "range") return { label: "Poke behind protection", fit: "shared", basis: b, text: `${A} trades from range while ${S} keeps the enemy's all-ins off them.` };
    return { label: "Skirmish with protection", fit: "neutral", basis: b, text: `${A} fights on their own mobility; ${S} protects them inside those fights.` };
  })();

  const works: ReadLine[] = [], strengths: ReadLine[] = [], weaknesses: ReadLine[] = [];
  if (engages || style === "catch") {
    if (f.allIn) works.push({ text: `${A} follows ${S}'s start with crowd control or burst of their own.`, basis: `${A}: follow-up ${bot.kit.followUp}` });
    else if (f.commits) works.push({ text: `${A}'s early damage finishes what ${S}'s crowd control starts.`, basis: `${A}: early curve ${bot.kit.curve.early}, burst ${bot.attrs.burst}, sustained damage ${bot.attrs.sustainedDps}` });
    else if (engages && f.ranged) weaknesses.push({ text: `${A} follows ${S}'s engage from range only: the all-in leans on the jungler or mid to finish.`, basis: `${A}: follow-up ${bot.kit.followUp}, range ${bot.kit.range}` });
    else if (engages && !f.joins) weaknesses.push({ text: `${A} can neither reach ${S}'s target nor hit it from range in time.`, basis: `${A}: range ${bot.kit.range}, backline access ${bot.kit.backlineAccess}` });
  }
  if (peels(sup) && (bot.flags.includes("needs-peel") || bot.kit.selfPeel === 0))
    works.push({ text: `${S}'s peel covers ${A}, who ${bot.kit.selfPeel === 0 ? "has no escape of their own" : "is weak when dived"}.`, basis: `${S}: peel ${sup.attrs.peel}, disengage ${sup.kit.disengage}; ${A}: self-peel ${bot.kit.selfPeel}${bot.flags.includes("needs-peel") ? ", needs peel" : ""}` });
  if (bot.attrs.poke >= 2 && sup.attrs.poke >= 2)
    works.push({ text: `Both poke, so they win the lane in short trades from range.`, basis: `poke ${A} ${bot.attrs.poke}, ${S} ${sup.attrs.poke}` });
  if (bot.attrs.lanePressure >= 3 && sup.attrs.lanePressure >= 2)
    strengths.push({ text: `Lane priority: both push and pressure the wave, which frees the jungler and mid to move first.`, basis: `lane pressure ${A} ${bot.attrs.lanePressure}, ${S} ${sup.attrs.lanePressure}` });
  if (sup.kit.counterEngage >= 2 && peels(sup))
    strengths.push({ text: `Good against enemy engage: ${S} can turn a dive onto ${A} around.`, basis: `${S}: counter-engage ${sup.kit.counterEngage}, disengage ${sup.kit.disengage}` });
  if (bot.kit.structurePressure >= 2 && (bot.kit.range >= 3 || sup.attrs.poke >= 2))
    strengths.push({ text: `Takes towers and plates from range.`, basis: `${A}: structure pressure ${bot.kit.structurePressure}, range ${bot.kit.range}` });
  if (bot.kit.range <= 1 && threat(bot) >= 2 && bot.kit.backlineAccess < 2 && !peels(sup))
    weaknesses.push({ text: `${A} has to stand close to fight and ${S} does not protect them there.`, basis: `${A}: range ${bot.kit.range}; ${S}: peel ${sup.attrs.peel}, disengage ${sup.kit.disengage}` });
  if (bot.flags.includes("needs-peel") && engages && !peels(sup))
    weaknesses.push({ text: `Once ${S} commits forward, ${A} is left without a protector.`, basis: `${A}: needs peel; ${S}: peel ${sup.attrs.peel}` });
  if (!engages && style !== "catch" && sup.kit.disengage <= 1 && bot.kit.selfPeel <= 1 && bot.attrs.peel <= 1 && !peels(sup))
    weaknesses.push({ text: `Little to stop an enemy all-in: neither ${A} nor ${S} has much disengage.`, basis: `${S}: disengage ${sup.kit.disengage}; ${A}: self-peel ${bot.kit.selfPeel}` });
  if (bot.kit.curve.early <= 1 && sup.kit.curve.early <= 2)
    weaknesses.push({ text: `Weak early: an enemy lane that wants level 2–3 fights gets them.`, basis: `early curve ${A} ${bot.kit.curve.early}, ${S} ${sup.kit.curve.early}` });

  const e = Math.max(bot.kit.curve.early, sup.kit.curve.early), late = bot.kit.curve.late;
  const curve: ReadLine = sup.kit.curve.early >= 3 && sup.kit.curve.late <= 1 && late >= 3
    ? { text: `${S} peaks early and ${A} late: the lane is strongest before items, ${A}'s fights after them.`, basis: `${A} ${curveText(bot)}; ${S} ${curveText(sup)}` }
    : bot.kit.curve.early >= 3 && sup.kit.curve.early >= 3
      ? { text: `Strongest in the first levels: both peak before items, so a lead has to be converted${bot.kit.curve.late <= 1 ? ` before ${A} falls off` : ""}.`, basis: `${A} ${curveText(bot)}; ${S} ${curveText(sup)}` }
      : late >= 3 && bot.kit.curve.early <= 1
        ? { text: `${A} is ${CURVE[bot.kit.curve.early]} early and peaks late: the lane is played to reach items, not to win early.`, basis: `${A} ${curveText(bot)}` }
        : { text: `${e >= 3 ? "Strong early" : "Even early"}, ${bot.kit.curve.mid >= 3 ? "strongest in the mid game" : "steady through the mid game"}${late <= 1 ? `, ${A} falls off late` : late >= 3 ? ", still strong late" : ""}.`, basis: `${A} ${curveText(bot)}; ${S} ${curveText(sup)}` };
  return { plan, works, strengths, weaknesses, curve };
}

// ---------- General Draft Logic for a mid + jungle core ----------

const starts = (c: ChampionKit) => c.fightStart === "primary" || c.fightStart === "catch";
const startWord = (c: ChampionKit) => (c.fightStart === "primary" ? "primary fight start" : c.fightStart === "catch" ? "catch start" : c.fightStart === "follow-up" ? "follow-up only" : "no fight start");
const roleDamage = (c: ChampionKit, role: Role) => c.damageByRole[role] ?? Object.values(c.damageByRole)[0];
const mostly = (c: ChampionKit, role: Role): "magic" | "physical" | undefined => {
  const d = roleDamage(c, role);
  return !d || d.damageThreat < 2 ? undefined : d.damageSplit.magic >= 0.6 ? "magic" : d.damageSplit.physical >= 0.6 ? "physical" : undefined;
};

/**
 * The mid + jungle core read from the two kits as stored (unreviewed heuristics except where noted in kits.ts): who
 * starts a fight and who follows, what the pair does early, its damage mix and its power curve. Same shape and rules as
 * the bot lane read: `split` means the two kits want different things, never that the pair is bad, and every line names
 * the stored values it rests on. Nothing here is read by a score or an order.
 */
export function coreRead(mid: ChampionKit | undefined, jng: ChampionKit | undefined, names: { mid: string; jungle: string }): DuoRead | undefined {
  if (!mid || !jng) return undefined;
  const M = names.mid, J = names.jungle;
  const mS = starts(mid), jS = starts(jng);
  const mF = mid.kit.followUp >= 2, jF = jng.kit.followUp >= 2;
  const b = `${M}: ${startWord(mid)}, follow-up ${mid.kit.followUp}; ${J}: ${startWord(jng)}, follow-up ${jng.kit.followUp}`;
  const lateBoth = mid.kit.curve.late >= 3 && jng.kit.curve.late >= 3 && mid.kit.curve.early <= 1 && jng.kit.curve.early <= 1;
  const jP = jng.fightStart === "primary", mP = mid.fightStart === "primary";
  const dive = mid.kit.backlineAccess >= 2 && jng.kit.backlineAccess >= 2;
  const plan = ((): DuoRead["plan"] => {
    if (jS && dive) return { label: "Dive together", fit: "shared", basis: `${b}; backline access ${M} ${mid.kit.backlineAccess}, ${J} ${jng.kit.backlineAccess}`,
      text: `${J} goes in and ${M} reaches the same target: the pair collapses on one champion rather than fighting front to back.` };
    if (jP && mP) return { label: "Two engages", fit: "shared", basis: b, text: `Both can start a full fight, so the team engages from two angles and a missed start is not the only one.` };
    if (jP) return mF
      ? { label: "Jungler engages, mid follows", fit: "shared", basis: b, text: `${J} starts the fight and ${M} follows at once with crowd control or burst of their own.` }
      : mS ? { label: "Engage plus a mid catch", fit: "neutral", basis: b, text: `${J} starts the team fight; ${M} threatens a separate catch but adds little to ${J}'s engage itself.` }
      : mid.kit.setupDependency >= 2 || mid.flags.includes("needs-setup")
        ? { label: "Setup for the mid", fit: "shared", basis: `${b}; ${M}: setup dependency ${mid.kit.setupDependency}`, text: `${M} needs someone else to create the angle; ${J} provides it.` }
        : { label: "Jungler engages, mid adds damage", fit: "neutral", basis: b, text: `${J} starts the fight; ${M} adds damage but little to lock the target down.` };
    if (mP) return jF || jS
      ? { label: "Mid engages, jungler follows", fit: "shared", basis: b, text: `${M} starts the fight and ${J} follows onto the same target.` }
      : { label: "Mid engages, jungler adds damage", fit: "neutral", basis: b, text: `${M} starts the fight; ${J} adds damage but little crowd control of their own.` };
    if (jS && mS) return { label: "Two pick threats", fit: mF || jF ? "shared" : "neutral", basis: b,
      text: `Both look for one target at a time${mF || jF ? ` and each can follow the other's catch` : ``}: the pair wins by picks before objectives, not by a full engage.` };
    if (jS) return mF
      ? { label: "Jungler catches, mid follows", fit: "shared", basis: b, text: `${J} catches one target and ${M} follows at once with crowd control or burst of their own.` }
      : { label: "Jungler catches, mid adds damage", fit: "neutral", basis: b, text: `${J} catches one target; ${M} adds damage but little to hold it.` };
    if (mS) return jF
      ? { label: "Mid catches, jungler follows", fit: "shared", basis: b, text: `${M} catches one target and ${J} follows at once onto it.` }
      : { label: "Mid catches, jungler adds damage", fit: "neutral", basis: b, text: `${M} catches one target; ${J} adds damage but little crowd control of their own.` };
    if (lateBoth) return { label: "Scale together", fit: "neutral", basis: `${M} ${curveText(mid)}; ${J} ${curveText(jng)}`, text: `Neither starts fights and both peak late: the pair plays for items and needs the side lanes to hold.` };
    return { label: "No start between them", fit: "split", basis: b, text: `Neither ${M} nor ${J} starts a fight: the engage has to come from top or support.` };
  })();

  const works: ReadLine[] = [], strengths: ReadLine[] = [], weaknesses: ReadLine[] = [];
  if (mid.attrs.lanePressure >= 2 && jng.kit.curve.early >= 2)
    works.push({ text: `${M}'s lane priority lets ${J} move first: invades and early objectives arrive with the mid already there.`, basis: `${M}: lane pressure ${mid.attrs.lanePressure}; ${J}: early curve ${jng.kit.curve.early}` });
  if (mS && !jS && jng.kit.curve.early >= 2)
    works.push({ text: `${M}'s crowd control sets up ${J}'s ganks in the mid lane.`, basis: `${M}: ${startWord(mid)}; ${J}: early curve ${jng.kit.curve.early}` });
  if (dive && !jS)
    works.push({ text: `Both reach the backline, so they collapse on the same target.`, basis: `backline access ${M} ${mid.kit.backlineAccess}, ${J} ${jng.kit.backlineAccess}` });
  // Said once: a plan that already names the follow-up does not repeat it as a reason.
  if (/follows/.test(plan.label)) { /* the plan line says it */ }
  else if (mF && jS)
    works.push({ text: `${M} follows ${J}'s start with crowd control or burst of their own.`, basis: `${M}: follow-up ${mid.kit.followUp}; ${J}: ${startWord(jng)}` });
  else if (jF && mS)
    works.push({ text: `${J} follows ${M}'s start at once.`, basis: `${J}: follow-up ${jng.kit.followUp}; ${M}: ${startWord(mid)}` });
  if (mid.kit.aoeCc >= 2 && jng.kit.aoeCc >= 2)
    works.push({ text: `Their area crowd control overlaps in a grouped fight.`, basis: `area crowd control ${M} ${mid.kit.aoeCc}, ${J} ${jng.kit.aoeCc}` });
  const mD = mostly(mid, "MID"), jD = mostly(jng, "JUNGLE");
  if (mD && jD && mD !== jD) strengths.push({ text: `Mixed damage: ${M} deals mostly ${mD} and ${J} mostly ${jD}, so one defensive stat does not answer both.`, basis: `damage split ${M} ${mD}, ${J} ${jD}` });
  if (mD && jD && mD === jD) weaknesses.push({ text: `Both deal mostly ${mD} damage: the other lanes have to bring the rest, or the enemy stacks one resistance.`, basis: `damage split ${M} ${mD}, ${J} ${jD}` });
  if (jng.attrs.objectiveControl >= 2 && (mid.kit.waveclear >= 2 || mid.attrs.lanePressure >= 2))
    strengths.push({ text: `Objective setups: ${M} clears the wave first and ${J} secures the objective.`, basis: `${J}: objective control ${jng.attrs.objectiveControl}; ${M}: waveclear ${mid.kit.waveclear}, lane pressure ${mid.attrs.lanePressure}` });
  if (mid.kit.global || jng.kit.global)
    strengths.push({ text: `A map-wide ultimate turns a side lane into a fight the pair picks.`, basis: `${mid.kit.global ? M : J}: global ultimate` });
  if (mid.attrs.frontline <= 1 && jng.attrs.frontline <= 1)
    weaknesses.push({ text: `Neither stands in front: the frontline has to come from top or support.`, basis: `frontline ${M} ${mid.attrs.frontline}, ${J} ${jng.attrs.frontline}` });
  if (mid.kit.curve.early <= 1 && jng.kit.curve.early <= 1)
    weaknesses.push({ text: `Weak early: the enemy mid and jungler get the first move on river fights and early objectives.`, basis: `early curve ${M} ${mid.kit.curve.early}, ${J} ${jng.kit.curve.early}` });
  if (mid.flags.includes("needs-peel") && jng.attrs.peel <= 1 && jng.kit.backlineAccess >= 2)
    weaknesses.push({ text: `Once ${J} goes in, ${M} is left without a protector from this pair.`, basis: `${M}: needs peel; ${J}: peel ${jng.attrs.peel}, backline access ${jng.kit.backlineAccess}` });
  if (!mS && !jS && plan.fit !== "split")
    weaknesses.push({ text: `Neither starts a fight: the engage has to come from top or support.`, basis: b });

  const cb = `${M} ${curveText(mid)}; ${J} ${curveText(jng)}`;
  const curve: ReadLine = mid.kit.curve.early >= 3 && jng.kit.curve.early >= 3
    ? { text: `Strongest early: both peak before items, so the lead has to be converted${mid.kit.curve.late <= 1 || jng.kit.curve.late <= 1 ? " before they fall off" : ""}.`, basis: cb }
    : lateBoth ? { text: `Both peak late: the pair is played to reach items, not to win early.`, basis: cb }
    : jng.kit.curve.early >= 3 && mid.kit.curve.late >= 3 && mid.kit.curve.early <= 2 ? { text: `${J} carries the early game while ${M} scales into the late game.`, basis: cb }
    : mid.kit.curve.early >= 3 && jng.kit.curve.late >= 3 && jng.kit.curve.early <= 2 ? { text: `${M} wins the early mid lane while ${J} scales into the late game.`, basis: cb }
    : { text: `${Math.max(mid.kit.curve.early, jng.kit.curve.early) >= 3 ? "Strong early" : "Even early"}, ${Math.max(mid.kit.curve.mid, jng.kit.curve.mid) >= 3 ? "strongest in the mid game" : "steady through the mid game"}${mid.kit.curve.late >= 3 || jng.kit.curve.late >= 3 ? ", still strong late" : mid.kit.curve.late <= 1 && jng.kit.curve.late <= 1 ? ", falling off late" : ""}.`, basis: cb };
  return { plan, works, strengths, weaknesses, curve };
}

/** The kit read of a pair [a, b] in its lane. */
export const pairRead = (lane: LaneKey, a: ChampionKit | undefined, b: ChampionKit | undefined, names: { a: string; b: string }) =>
  lane === "bot" ? duoRead(a, b, { bot: names.a, sup: names.b }) : coreRead(a, b, { mid: names.a, jungle: names.b });

// ---------- Draft Insights moments for a pair ----------

export interface PairLesson {
  lesson: string; // Draft Insights lesson id
  title: string;
  kind: "pair" | "adc" | "support" | "jungle" | "note";
  text: string;
  fit?: "fits" | "clashes";
  stat?: { text: string; patch: string };
  period?: string; // the video's population: "Master+ ranked, patch 26.21"
  source?: { video: string; t: number; url: string };
}

/** The part of Draft Insights the explorer reads: each lesson's groups, matchups and first moments, and each video's link
 *  and population. Built at load so pages outside Draft Insights do not carry the whole file. */
export interface LessonBook {
  videos: Record<string, { url: string; period: string; title: string }>;
  insights: Pick<DraftInsights["insights"][number], "id" | "title" | "takeaway" | "groups" | "matchups" | "sources">[];
}
export const lessonBook = (d: DraftInsights): LessonBook => ({
  videos: Object.fromEntries(Object.entries(d.videos).map(([id, v]) => [id, { url: v.url, period: v.period, title: v.title }])),
  insights: d.insights.map(({ id, title, takeaway, groups, matchups, sources }) => ({ id, title, takeaway, groups, matchups, sources })),
});

/** The creator lessons that speak to this pair: the pair itself when a lesson shows it, then each champion's archetype. */
export function pairLessons(insights: LessonBook, bot: string, support: string, extra: string[] = [], lane: LaneKey = "bot"): PairLesson[] {
  const out: PairLesson[] = [];
  const src = (s: { video: string; t: number }) => ({ ...s, url: insights.videos[s.video]?.url ?? "" });
  const period = (s: { video: string }) => insights.videos[s.video]?.period;
  for (const i of insights.insights) {
    for (const m of i.matchups ?? []) {
      const side = m.kind === "pair" ? m.a : [m.a, m.b].find((x) => x.includes(bot) && x.includes(support));
      if (!side || !side.includes(bot) || !side.includes(support)) continue;
      out.push({ lesson: i.id, title: i.title, kind: "pair", text: m.text, fit: m.kind === "pair" ? m.fit : undefined, stat: m.stat, period: period(m.source), source: src(m.source) });
    }
  }
  // The ADC and support archetype lessons speak to bot lanes only, the jungle archetype lesson to the jungler.
  for (const [lid, id, kind] of lane === "bot" ? ([["adc-archetypes", bot, "adc"], ["support-types", support, "support"]] as const) : ([["jungle-archetypes", support, "jungle"]] as const)) {
    const i = insights.insights.find((x) => x.id === lid);
    const g = i?.groups?.find((x) => x.champions.includes(id));
    if (i && g) out.push({ lesson: i.id, title: `${g.label}`, kind, text: g.plan, period: period(g.source), source: src(g.source) });
  }
  for (const lid of extra) {
    const i = insights.insights.find((x) => x.id === lid);
    // The first moment inside the video (a source at 0:00 cites the whole video).
    const first = i?.sources.find((x) => x.t > 0) ?? i?.sources[0];
    if (i && !out.some((o) => o.lesson === lid && o.kind === "note")) out.push({ lesson: i.id, title: i.title, kind: "note", text: i.takeaway, period: first && period(first), source: first && src(first) });
  }
  return out;
}

// ---------- written reads ----------

/** The written read for a pair, when one exists (data/pairing-notes.json, General Draft Logic, unreviewed). */
export const noteFor = (notes: PairingNote[], a: string, b: string, lane: LaneKey = "bot") => notes.find((n) => n.a === a && n.b === b && n.aRole === LANES[lane].a && n.bRole === LANES[lane].b);

// ---------- links ----------

/** The stored kits by id, for duoRead (components never import lib/model-v2 directly). */
export const kitsById = (champions: Parameters<typeof convertKits>[0]) => new Map(convertKits(champions).map((k) => [k.id, k]));
export type { ChampionKit };

/** The explorer on Draft Insights with a pair [a, b] of a lane (either half may be missing). */
export const explorerHref = (a?: string, b?: string, compare?: string[], lane: LaneKey = "bot") => {
  const q = new URLSearchParams({ view: "pairings" });
  if (lane !== "bot") q.set("lane", lane);
  if (a) q.set(LANES[lane].a.toLowerCase(), a);
  if (b) q.set(LANES[lane].b.toLowerCase(), b);
  if (compare?.length) q.set("compare", compare.join(","));
  return `/insights/?${q}`;
};
