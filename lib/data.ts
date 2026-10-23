import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { z } from "zod";
import { buildLibrary, type Library } from "./comp-library";
import { lineupReader } from "./comp-discovery";
import { withProAlternatives } from "./pro-alternatives";
import { golggGameId, newestGameFirst, withGameSides } from "./draft-side";
import { draftsFromGames, freshness, resultsFromGames, sourcesFromGames } from "./pro-games";
import { priorityData, priorityMarks, type PriorityData } from "./pro-priority";
import { buildPatchIndex } from "./patch-changes";
import { counterFreshness, newestPatch, type CounterFreshness } from "./counter-freshness";
import { storedKitQueue } from "./kit-review";
import { championIndex, type ChampionBuilds } from "./pro-builds";
import { withoutConfirmed } from "./proposed";
import { Files, ROLES, type Role } from "./schema";
import { brief, duoSelections, LANE_ROLES, laneSelections, roleBook, topUsageMarks, type LaneRole, type TopDraftBundle, type TopUsageMarks } from "./top-draft";
import { blindReads } from "./top-blind";
import { boardTraits, compResponses, type CompResponse, type FactBook } from "./jungle-context";
import { factBook } from "./jungle-kits";
import { matchupBook } from "./matchup-kits";
import type { MatchupBook } from "./matchup-read";
import { bucket, patchesOf } from "./pro-priority";

// Data lives in /data and is read at build time; the static export embeds what each page renders.
type FileName = keyof typeof Files;
type Parsed<F extends FileName> = z.infer<(typeof Files)[F]>;

const cache = new Map<FileName, unknown>();
function load<F extends FileName>(file: F): Parsed<F> {
  if (!cache.has(file)) {
    const raw = JSON.parse(readFileSync(join(process.cwd(), "data", file), "utf8"));
    cache.set(file, Files[file].parse(raw));
  }
  return cache.get(file) as Parsed<F>;
}

export const getChampions = () => load("champions.json");
// Imported pro games (data/pro-games.json, refreshed daily from Gol.gg) join the hand-recorded drafts, sources and
// results here, so every page reads one list. Each game is stored once; its two drafts and its source are derived.
export const getProGames = () => load("pro-games.json");
let sources: Parsed<"sources.json"> | undefined, drafts: Parsed<"pro-drafts.json"> | undefined, counters: Parsed<"counters.json"> | undefined;
export const getSources = () => (sources ??= [...load("sources.json"), ...sourcesFromGames(getProGames().games, load("sources.json"))]);
export const getProFreshness = () => freshness(getProGames());
// Pro pairings not already saved join the alternatives, marked as pro-derived (alan, 2026-10-10).
let bots: Parsed<"bot-pairings.json"> | undefined, midJungle: Parsed<"mid-jungle.json"> | undefined;
export const getBotPairings = () => (bots ??= load("bot-pairings.json").map(withProAlternatives));
export const getMidJungle = () => (midJungle ??= load("mid-jungle.json").map(withProAlternatives));
export const getTopPicks = () => load("top.json");
// Newest game first everywhere drafts are listed (Pro Drafts, Gen.G).
export const getProDrafts = () => (drafts ??= newestGameFirst([
  ...withGameSides(load("pro-drafts.json"), Object.fromEntries(getSources().map((s) => [s.id, s]))),
  ...draftsFromGames(getProGames().games),
]));
export const getCompShells = () => load("comp-shells.json");
export const getCompReview = () => load("comp-review.json");
// Comp Library: the hand-written shells plus the weekly discovery's Observed Pro Comps and observed variations.
let library: Library | undefined;
export const getLibrary = () => (library ??= buildLibrary(getCompShells(), load("discovered-comps.json"), getProGames().games,
  getCompReview(), getBuildGameRecords(), lineupReader(getChampions())));
export const getPool = () => load("pool.json");
export const getMeta = () => load("meta.json");
export const getGenG = () => load("geng.json");
export const getRules = () => load("rules.json");
// Pro Priority: per-patch pick/ban presence from complete game records or single-patch tournament tables (lib/pro-priority.ts).
let priority: PriorityData | undefined;
export const getPriority = () => (priority ??= priorityData(getMeta(), getProGames(), load("pro-drafts.json")));
export const getCounters = () => (counters ??= ((c) => ({ ...c, proResults: [...c.proResults, ...resultsFromGames(getProGames().games, c.proResults)] }))(load("counters.json")));
// Synergy · Proposed: Claude's kit-based partners, minus every pairing alan already confirmed (lib/proposed.ts).
let proposed: Parsed<"proposed-synergy.json"> | undefined;
export const getProposed = () => (proposed ??= withoutConfirmed(load("proposed-synergy.json"), { botPairings: getBotPairings(), midJungle: getMidJungle(), topPicks: getTopPicks() }));

// Official Riot patch notes (26.16 onward, refreshed daily) and the compact index pages pass to the browser.
export const getPatchNotes = () => load("patch-notes.json");
let patchIndex: ReturnType<typeof buildPatchIndex> | undefined;
export const getPatchIndex = () => (patchIndex ??= buildPatchIndex(getPatchNotes()));
/** Champions whose Riot changes touch their stored kit values and that alan has not reviewed yet (lib/kit-review.ts). */
export const getKitQueue = () => storedKitQueue(getPatchNotes(), getChampions(), load("kit-review.json").decisions);
let counterFresh: CounterFreshness | undefined;
/** The DPM data's patch against the newest patch the site recognises (Riot's patch notes and recorded pro games). */
export const getCounterFreshness = () => (counterFresh ??= counterFreshness(getCounters(), getPatchIndex(),
  newestPatch(getPatchNotes().patches.map((p) => p.patch), getProGames().games.map((g) => g.patch))));

// Pro Builds: the full records load in the browser on /pro-builds/ (lib/pro-builds-bundle.ts); pages get only the
// per-champion summary (games, players, newest patch) the drawer shows beside its "View Pro Builds" link.
let buildIndex: ChampionBuilds[] | undefined;
export const getBuildGames = () => [...new Set(load("pro-builds.json").builds.map((b) => b.game))];
/** Every game a stored build belongs to: the tracked games plus the archive records kept with the builds (LCK playoffs). */
/** Winners of the archived game records (LCK 2026 playoffs, stored with Pro Builds), apart from the tracked events. */
export const getArchiveResults = () => {
  const tracked = new Set(getProGames().games.map((g) => g.id));
  return resultsFromGames((load("pro-builds.json").games ?? []).filter((g) => !tracked.has(g.id)), []);
};
export const getBuildGameRecords = () => [...getProGames().games, ...(load("pro-builds.json").games ?? [])];
/** Players of one team in the recorded builds (latest team per player id), by role, with their recorded game count. */
export function getTeamPlayers(team: string) {
  const games = new Map(getBuildGameRecords().map((g) => [g.id, g]));
  const latest = new Map<number, { id: number; name: string; role: Role; team: string; date: string; games: number }>();
  for (const b of load("pro-builds.json").builds) {
    const g = games.get(b.game);
    if (!g) continue;
    const cur = latest.get(b.playerId);
    const next = !cur || g.date >= cur.date ? { id: b.playerId, name: b.player, role: b.role, team: g[b.side].team, date: g.date, games: (cur?.games ?? 0) + 1 } : { ...cur, games: cur.games + 1 };
    latest.set(b.playerId, next);
  }
  return [...latest.values()].filter((p) => p.team === team).sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || b.games - a.games);
}
export const getBuildIndex = () => (buildIndex ??= championIndex(load("pro-builds.json").builds, getBuildGameRecords()));

// Everything the interactive Draft Room needs in the browser.
export function getDraftData() {
  return {
    champions: getChampions(),
    botPairings: getBotPairings(),
    midJungle: getMidJungle(),
    topPicks: getTopPicks(),
    proDrafts: getProDrafts(),
    shells: getLibrary().shells,
    pool: getPool(),
    events: getMeta().events,
    counters: getCounters(),
    newestPatch: getCounterFreshness().newest ?? undefined, // DPM rows older than this are marked historical
    archiveResults: getArchiveResults(), // LCK playoff winners: historical context on counters, never lifts one
    counterFreshness: getCounterFreshness(),
    proposed: getProposed().records,
    priority: priorityMarks(getPriority()), // a label on rows, never read by the ranking
    // Lane row labels (Top, Mid, Bot, Support), never read by the ranking.
    laneUsage: Object.fromEntries(LANE_ROLES.map((r) => [r, ((t) => topUsageMarks(t.selections, t.dpm, t.blind, undefined, t.duos))(getLaneDraft(r))])) as Record<LaneRole, TopUsageMarks>,
    jungleBoard: getJungleBoard(), // Jungle composition responses (a label, General Draft Logic over the enemy board)
    matchupBook: getMatchupBook(), // the Counter card's kit read (General Draft Logic over the stored kits, never a score)
  };
}

let facts: FactBook | undefined;
const getFactBook = () => (facts ??= factBook(getChampions()));
let matchups: MatchupBook | undefined;
/** The stored kit facts the Counter card's kit read compares (lib/matchup-read.ts). */
export const getMatchupBook = () => (matchups ??= matchupBook(getChampions()));

/** The kit facts the Draft Room reads the enemy board with, and each jungler's observed composition responses (all patches). */
export function getJungleBoard(): { facts: FactBook; responses: Record<string, CompResponse[]> } {
  const j = getLaneDraft("JUNGLE");
  const ordered = j.selections.filter((s) => s.turn);
  const responses: Record<string, CompResponse[]> = {};
  for (const id of new Set(ordered.map((s) => s.champion))) {
    const r = compResponses(ordered.filter((s) => s.champion === id), ordered, j.context ?? {});
    if (r.length) responses[id] = r;
  }
  return { facts: getFactBook(), responses };
}
export type DraftData = ReturnType<typeof getDraftData>;

// Everything the champion drawer (Comp Library, Meta) needs in the browser.
export function getDrawerData() {
  return {
    champions: getChampions(),
    botPairings: getBotPairings(),
    midJungle: getMidJungle(),
    topPicks: getTopPicks(),
    proDrafts: getProDrafts(),
    pool: getPool(),
    meta: getMeta(),
    sources: Object.fromEntries(getSources().map((s) => [s.id, s])),
    proposed: getProposed().records,
    priority: getPriority(),
    patches: getPatchIndex(),
    builds: getBuildIndex(),
    buildGames: getBuildGames(), // games with recorded builds, so a recorded game can offer its builds
    shells: getLibrary().shells.map((s) => ({ id: s.id, name: s.name, kind: s.kind, slots: Object.fromEntries(ROLES.map((r) => [r, s.slots[r].champion])) as Record<Role, string> })),
  };
}
export type DrawerData = ReturnType<typeof getDrawerData>;

// Champions whose only mid/jungle profile is a jungle one: where an old combined Mid / Jungle link without a role goes.
export const jungleOnlyIds = () => {
  const mj = getMidJungle();
  const plays = (id: string, role: "MID" | "JUNGLE") => mj.some((r) => r.anchor === id && r.role === role)
    || getChampions().some((c) => c.id === id && !c.rosterOnly && c.roles.includes(role));
  const ids = new Set([...mj.map((r) => r.anchor), ...getChampions().filter((c) => c.roles.includes("JUNGLE")).map((c) => c.id)]);
  return [...ids].filter((id) => plays(id, "JUNGLE") && !plays(id, "MID")).sort();
};

// Top lane draft usage (Synergies Top tab, Draft Room): every recorded game's top selections classified, with the games,
// players, Pro Drafts ids, per-patch priority and the DPM matchup rows they need. Observed Pro Evidence only.
const laneDrafts = new Map<LaneRole, TopDraftBundle>();
/** Observed draft usage for one lane (alan, 2026-10-13): Top, Mid, and Bot / Support with their duos. */
export function getLaneDraft(role: LaneRole): TopDraftBundle {
  const hit = laneDrafts.get(role);
  if (hit) return hit;
  const records = getBuildGameRecords();
  const book = roleBook(getChampions(), records);
  const selections = laneSelections(records, book, role);
  const bot = role === "BOT" || role === "SUPPORT";
  const duos = bot ? duoSelections(role === "BOT" ? selections : laneSelections(records, book, "BOT"), role === "SUPPORT" ? selections : laneSelections(records, book, "SUPPORT")) : undefined;
  const players: Record<string, string> = {};
  for (const b of load("pro-builds.json").builds) if (b.role === role) players[`${b.game}:${b.side}`] = b.player;
  const drafts: Record<string, string> = {};
  for (const d of getProDrafts()) {
    const id = golggGameId(d);
    if (id && d.side) drafts[`${id}:${d.side}`] = d.id;
  }
  const priority: TopDraftBundle["priority"] = {};
  const ids = new Set([...selections.map((s) => s.champion), ...(duos ?? []).flatMap((d) => [d.adc, d.support])]);
  for (const patch of [...patchesOf(getPriority()), "all"]) {
    const b = bucket(getPriority(), patch === "all" ? {} : { patch });
    priority[patch] = { games: b.games, rows: Object.fromEntries(b.rows.filter((r) => ids.has(r.id)).map((r) => [r.id, {
      presence: r.presence, picks: r.picks, bans: r.bans, topPicks: r.roleVerified ? r.rolePicks[role] ?? 0 : undefined, winRate: r.winRate, low: r.low,
    }])) };
  }
  const pairs = new Set(selections.flatMap((s) => [`${s.champion}>${s.laneOpponent}`, `${s.laneOpponent}>${s.champion}`]));
  const dpm = getCounters().dpm.filter((r) => r.role === role && pairs.has(`${r.champion}>${r.enemy}`))
    .map((r) => ({ role: r.role, champion: r.champion, enemy: r.enemy, winRate: r.winRate, games: r.games, patch: r.patch, url: r.url, rank: r.rank }));
  const events = getMeta().events.filter((e) => selections.some((s) => s.event === e.id)).map((e) => ({ id: e.id, short: e.short }));
  // General Draft Logic for every champion who plays the lane and has a kit (Locke and Zaahen have none yet).
  const saved = new Map(role === "TOP" ? getTopPicks().map((t) => [t.champion, t.identities]) : []);
  const blind = blindReads(getChampions(), saved, new Set(selections.map((s) => s.champion)), role);
  // Jungle: what the enemy board showed at each pick (only champions already picked), read from the kits.
  let context: TopDraftBundle["context"];
  if (role === "JUNGLE") {
    const kits = getFactBook();
    const byId = new Map(records.map((g) => [g.id, g]));
    context = Object.fromEntries(selections.filter((s) => s.turn).map((s) => {
      const g = byId.get(s.game)!, them = g[s.side === "blue" ? "red" : "blue"];
      const visible = s.enemySeen.map((c) => ({ champion: c, role: ROLES.find((r) => them.picks[r] === c) }));
      return [`${s.game}:${s.side}`, boardTraits(visible, kits)];
    }));
  }
  const bundle: TopDraftBundle = { role, selections, games: Object.fromEntries(records.map((g) => [g.id, brief(g)])), players, drafts, priority, dpm, events, blind, ...(duos ? { duos } : {}), ...(context ? { context } : {}) };
  laneDrafts.set(role, bundle);
  return bundle;
}
export const getTopDraft = () => getLaneDraft("TOP");
