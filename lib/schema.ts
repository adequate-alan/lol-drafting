// Data model for /data/*.json. Three layers are kept in separate fields:
//   Clash Recommendation  -> clashDefault, alternatives, surrounding, blindGrade, pool tiers
//   Observed Pro Evidence -> observedProPairings, pro drafts, meta stats (Gol.gg sources)
//   General Draft Logic   -> champion attributes, logic.* notes, rules with layer "logic"
// A pro pairing never moves into clashDefault/alternatives automatically.
import { z } from "zod";

export const ROLES = ["TOP", "JUNGLE", "MID", "BOT", "SUPPORT"] as const;
export const Role = z.enum(ROLES);
export type Role = z.infer<typeof Role>;

const id = z.string().regex(/^[a-z0-9-]+$/);
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const ChampionId = id;
export const SourceId = id;
export type ChampionId = string;

export const Confidence = z.enum(["high", "medium-high", "medium", "low"]);
// current-meta: a later, still-running event (Demacia Cup 2026, patch 16.18). Kept apart from the LCK playoff sample.
export const Era = z.enum(["current-playoffs", "current-meta", "earlier-2026"]);
export const Status = z.enum(["current", "confirmed", "updated", "added", "downgraded", "keep"]);

// ---------- sources.json ----------
export const Source = z.object({
  id: SourceId,
  url: z.string().url(),
  type: z.enum(["golgg-game", "golgg-tournament", "golgg-champion", "golgg-team", "other"]),
  tournament: z.string().optional(),
  team: z.string().optional(),
  opponent: z.string().optional(),
  seriesGame: z.string().optional(),
  patch: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // game date, when known
  // A game's sides and winner as its Gol.gg page shows them, team names as the stored drafts write them. Each stored
  // draft citing the game inherits its side from here (lib/draft-side.ts). Set only from a read of the page.
  sides: z.object({ blue: z.string(), red: z.string(), winner: z.enum(["blue", "red"]) }).optional(),
  lastChecked: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  refreshStatus: z.enum(["verified", "not-refreshed"]), // "verified" only when Claude itself re-read the page
  origin: z.enum(["workbook", "golgg-refresh", "externally-provided"]),
  // A link and claim supplied during review that nobody in this project has confirmed on the page yet.
  // It stays not-refreshed until Claude reads the page.
  pendingClaim: z.object({
    claim: z.string(),
    providedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    providedBy: z.string().optional(),
  }).optional(),
});
export type Source = z.infer<typeof Source>;

// ---------- champions.json (General Draft Logic) ----------
const Scale = z.number().int().min(0).max(3);
export const ATTRS = [
  "engage", "frontline", "peel", "sustainedDps", "burst", "poke",
  "scaling", "lanePressure", "sidePressure", "objectiveControl",
] as const;
export type Attr = (typeof ATTRS)[number];
export const Champion = z.object({
  id: ChampionId,
  name: z.string(),
  aliases: z.array(z.string()),
  roles: z.array(Role).min(1),
  damage: z.enum(["AD", "AP", "mixed"]),
  attrs: z.object(Object.fromEntries(ATTRS.map((a) => [a, Scale])) as Record<Attr, typeof Scale>),
  flags: z.array(z.enum(["needs-setup", "needs-peel", "disengage"])),
  reviewed: z.boolean(),
  // Added from the Data Dragon roster (scripts/sync-champions.mjs) with every attribute at 0: lockable and searchable,
  // never recommended, until someone sets its attributes and removes the flag.
  rosterOnly: z.literal(true).optional(),
  note: z.string().optional(),
});
export type Champion = z.infer<typeof Champion>;

// ---------- Observed Pro Evidence ----------
export const ObservedPairing = z.object({
  champion: ChampionId,
  context: z.string(),
  era: Era,
  event: z.string().optional(), // id in meta.json events: gives the patch and dates shown beside the evidence
  proDraftIds: z.array(z.string()),
  backedByGame: z.boolean(), // true only when a recorded pro draft shows the pairing
  sources: z.array(SourceId),
});
export type ObservedPairing = z.infer<typeof ObservedPairing>;

const Duo = z.object({ bot: ChampionId, support: ChampionId });
export type Duo = z.infer<typeof Duo>;

// A bot/support duo seen in pro play, attached to a mid/jungle/top record as Observed Pro Evidence only.
// withAnchor: a cited draft also had the record's champion; otherwise the duo was seen elsewhere.
export const ObservedBotShape = z.object({
  bot: ChampionId,
  support: ChampionId,
  withAnchor: z.boolean(),
  proDraftIds: z.array(z.string()),
  sources: z.array(SourceId).min(1),
});
export type ObservedBotShape = z.infer<typeof ObservedBotShape>;

// ---------- bot-pairings.json ----------
export const BotPairing = z.object({
  champion: ChampionId,
  role: z.literal("BOT"),
  clashDefault: z.array(ChampionId).min(1),
  alternatives: z.array(ChampionId),
  alternativeNotes: z.record(z.string()).default({}),
  proAlternatives: z.array(ChampionId).optional(), // derived at load (lib/pro-alternatives.ts), never stored
  observedProPairings: z.array(ObservedPairing),
  surrounding: z.object({ jungle: z.array(ChampionId), mid: z.array(ChampionId) }),
  logic: z.object({ warning: z.string().optional() }),
  confidence: Confidence,
  identities: z.array(z.string()),
  playoffRead: z.string().optional(),
  notes: z.string().optional(),
  status: Status,
  sources: z.array(SourceId),
});
export type BotPairing = z.infer<typeof BotPairing>;

// ---------- mid-jungle.json ----------
export const MidJunglePairing = z.object({
  anchor: ChampionId,
  role: z.enum(["MID", "JUNGLE"]),
  clashDefault: z.array(ChampionId).min(1),
  alternatives: z.array(ChampionId),
  alternativeNotes: z.record(z.string()).default({}),
  proAlternatives: z.array(ChampionId).optional(), // derived at load (lib/pro-alternatives.ts), never stored
  botShapes: z.array(Duo), // Clash: only duos whose bot has a Clash record that lists the support
  observedBotShapes: z.array(ObservedBotShape),
  observedProPairings: z.array(ObservedPairing),
  history: z.array(z.object({ partner: ChampionId, era: Era, note: z.string() })),
  logic: z.object({ warning: z.string().optional() }),
  confidence: Confidence,
  identities: z.array(z.string()),
  playoffRead: z.string().optional(),
  status: Status,
  sources: z.array(SourceId),
});
export type MidJunglePairing = z.infer<typeof MidJunglePairing>;

// ---------- top.json ----------
export const BlindGrade = z.enum(["A", "A-", "B+", "B", "B-", "C+", "C"]);
export const TopPick = z.object({
  champion: ChampionId,
  blindGrade: BlindGrade,
  surrounding: z.object({ jungle: z.array(ChampionId), mid: z.array(ChampionId), botShapes: z.array(Duo) }),
  observedBotShapes: z.array(ObservedBotShape),
  observedProPairings: z.array(ObservedPairing),
  logic: z.object({ gives: z.string(), avoid: z.string() }),
  identities: z.array(z.string()),
  playoffRead: z.string().optional(),
  status: Status,
  sources: z.array(SourceId),
});
export type TopPick = z.infer<typeof TopPick>;

// ---------- proposed-synergy.json (Synergy · Proposed) ----------
// Claude's kit-based partner recommendations for every champion and role (alan, 2026-10-10: "Complete Champion Synergy
// Expansion"). Kept apart from alan's Confirmed records above: never a saved default, never part of the bot → support
// eligibility rule, a smaller draft-fit bonus than any saved link, and always labelled "Proposed · kit-based". A pairing
// already in a confirmed record is dropped at load (lib/proposed.ts), so a pair is never both. Confidence is about the
// kit-based synergy itself; pro evidence is shown beside it from recorded games and never raises it.
export const ProposedConfidence = z.enum(["strong", "moderate", "provisional"]);
export type ProposedConfidence = z.infer<typeof ProposedConfidence>;
export const ProposedPartner = z.object({ id: ChampionId, confidence: ProposedConfidence, reason: z.string().min(30).max(200) });
export type ProposedPartner = z.infer<typeof ProposedPartner>;
export const ProposedRecord = z.object({
  champion: ChampionId,
  role: Role,
  identity: z.string().min(20),
  partners: z.array(z.object({
    role: Role,
    preferred: z.array(ProposedPartner).min(1),
    alternatives: z.array(ProposedPartner),
  })).min(1),
});
export type ProposedRecord = z.infer<typeof ProposedRecord>;
export const ProposedSynergy = z.object({
  updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  basis: z.string(), // how the records were made (internal; not shown on the site)
  records: z.array(ProposedRecord),
});
export type ProposedSynergy = z.infer<typeof ProposedSynergy>;

// ---------- pro-drafts.json (Observed only) ----------
export const ProDraft = z.object({
  id: id,
  tournament: z.string(),
  seriesGame: z.string(),
  stage: z.string(),
  team: z.string(),
  opponent: z.string(),
  patch: z.string().optional(),
  picks: z.object({ TOP: ChampionId, JUNGLE: ChampionId, MID: ChampionId, BOT: ChampionId, SUPPORT: ChampionId }),
  read: z.string(), // a hand-written read of the comp; empty on drafts imported from Gol.gg
  note: z.string().optional(),
  sources: z.array(SourceId).min(1),
  // Set on drafts built from data/pro-games.json (lib/pro-games.ts): what the game page shows.
  side: z.enum(["blue", "red"]).optional(),
  won: z.boolean().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  bans: z.array(ChampionId).optional(),
});
export type ProDraft = z.infer<typeof ProDraft>;

// ---------- pro-games.json (Observed only; written by scripts/refresh-pro-data.mjs) ----------
// One record per game, both sides together, read from its Gol.gg game page (teams, sides, result, bans, picks, patch,
// date) and full-stats page (roles). The one dataset that Pro Drafts, Meta, Pool, Synergies, the Draft Room and counter
// corroboration read imported games from (lib/pro-games.ts turns it into drafts, sources and results at load).
const Picks = z.object({ TOP: ChampionId, JUNGLE: ChampionId, MID: ChampionId, BOT: ChampionId, SUPPORT: ChampionId });
// pickOrder: the side's five picks in the order the Gol.gg game page lists them, which is that team's draft order.
// Absent on games stored before 2026-10-12 until the daily refresh re-reads their page. Never derived from the lineup.
const GameSide = z.object({ team: z.string().min(1), picks: Picks, bans: z.array(ChampionId).max(5), pickOrder: z.array(ChampionId).length(5).optional() })
  .refine((s) => !s.pickOrder || [...s.pickOrder].sort().join() === Object.values(s.picks).sort().join(), "pickOrder must be the same five champions as picks");
export const ProGame = z.object({
  id: z.number().int().positive(), // Gol.gg game id: the stable key, so a game is never stored twice
  event: id, // meta.json events id
  tournament: z.string(),
  seriesId: z.number().int().positive(), // Gol.gg id of the series' first game
  series: z.string(),
  game: z.number().int().positive(),
  stage: z.string().optional(),
  date: Day,
  patch: z.string().regex(/^\d+\.\d+$/),
  blue: GameSide,
  red: GameSide,
  winner: z.enum(["blue", "red"]),
  // The side that picked first, read from the "First Pick" mark on the Gol.gg game page. Since 2026 it is not always blue,
  // so draft order is rebuilt from it, never from the side. Absent until the page has been re-read; such a game's
  // interleaved order is unknown.
  firstPick: z.enum(["blue", "red"]).optional(),
  url: z.string().url(),
  rolesUrl: z.string().url(),
  checkedOn: Day,
});
export type ProGame = z.infer<typeof ProGame>;
export const ProGames = z.object({
  // The only tournaments the daily refresh may request, by exact Gol.gg name (alan, 2026-10-11).
  tracked: z.array(z.object({ event: id, label: z.string(), names: z.array(z.string()).min(1) })),
  tournaments: z.array(z.object({
    event: id, golgg: z.string(), status: z.enum(["ongoing", "complete"]),
    series: z.number().int(), seriesPlayed: z.number().int(), games: z.number().int(), recorded: z.number().int(),
    matchlist: z.string().url(),
    lastUpdate: z.string().datetime().nullable(), // last time verified data changed
    lastCheck: z.string().datetime().nullable(), // check that produced the stored data (later checks may have found nothing)
  })),
  games: z.array(ProGame),
});
export type ProGames = z.infer<typeof ProGames>;

// ---------- pro-builds.json + build-assets.json (Observed only; written by scripts/refresh-pro-data.mjs) ----------
// One player's setup in one recorded game (data/pro-games.json id), read from Gol.gg's build answer for that game and
// player: summoner spells, the final inventory, the rune page, the order of ability points and the purchase log in
// game seconds. A field Gol.gg did not give is absent and named in `missing`; nothing is filled in.
const ItemId = z.number().int().nonnegative();
export const ProBuild = z.object({
  game: z.number().int().positive(),
  side: z.enum(["blue", "red"]),
  role: z.enum(ROLES),
  champion: ChampionId,
  player: z.string().min(1),
  playerId: z.number().int().positive(),
  spells: z.tuple([z.number().int().positive(), z.number().int().positive()]).optional(),
  spellCasts: z.tuple([z.number().int(), z.number().int()]).optional(),
  final: z.array(ItemId).length(6).optional(), // inventory slots at the end of the game, 0 = empty slot
  trinket: z.number().int().positive().optional(),
  // A full page has the three minor primary runes, the secondary tree and its two runes. When the source gives only the
  // keystone, the rest stays absent ("full rune page" in `missing`) and the site says the full page is unavailable.
  runes: z.object({
    primary: z.number().int(), keystone: z.number().int(), primaryRunes: z.array(z.number().int()).length(3).optional(),
    secondary: z.number().int().optional(), secondaryRunes: z.array(z.number().int()).length(2).optional(),
    shards: z.array(z.number().int()).length(3).optional(),
  }).optional(),
  // The ability given each point, in order: one per champion level for most champions; some (Viktor, Aphelios) record
  // more points than levels, so this is the order of points, not a level number.
  skills: z.string().regex(/^[QWER]{1,30}$/).optional(),
  skillCasts: z.tuple([z.number().int(), z.number().int(), z.number().int(), z.number().int()]).optional(),
  purchases: z.array(z.tuple([z.number().int().nonnegative(), z.number().int().positive(), z.enum(["buy", "sell"])])).optional(),
  missing: z.array(z.string()).optional(),
  checkedOn: Day,
});
export type ProBuild = z.infer<typeof ProBuild>;
export const ProBuilds = z.object({
  builds: z.array(ProBuild),
  unavailable: z.array(z.object({ game: z.number().int().positive(), checkedOn: Day, reason: z.string() })),
  // Game records for builds from an archive tournament the daily refresh does not track (the LCK 2026 Season Playoffs,
  // backfilled once by scripts/backfill-lck-builds.mjs, alan 2026-10-12). Read by Pro Builds only: they are not in
  // pro-games.json, so they never feed Pro Drafts, Pro Priority, tournament totals or saved pairings.
  games: z.array(ProGame).optional(),
});
export type ProBuilds = z.infer<typeof ProBuilds>;
// Professional player portraits (alan, 2026-10-12), keyed by Gol.gg player id. Only photographs whose license allows
// reuse (Wikimedia Commons free licenses), each with its source page, author and license for attribution, checked by a
// person against the player before it is listed. The image itself is a local crop in assets/players/<playerId>.webp.
// A player without an entry shows initials, never a champion icon or another player's photo.
// Two providers: a Wikimedia Commons file under a free license (author, license and photo context recorded for the
// credit), or a dpm.lol profile photo (alan's decision, 2026-10-12: used at his request; dpm.lol states no reuse
// license, so the credit names dpm.lol and the page it came from and claims nothing more).
const PortraitBase = {
  playerId: z.number().int().positive(),
  name: z.string().min(1),
  team: z.string().min(1), // team when the portrait was checked (context only)
  file: z.string().regex(/^assets\/players\/\d+\.webp$/),
  source: z.string().url(), // the page the photo was taken from (Commons file page, dpm.lol profile)
  original: z.string().url(), // the image file itself
  originalWidth: z.number().int().positive(), // its width in pixels (the crop is in these pixels)
  crop: z.object({ left: z.number().int().nonnegative(), top: z.number().int().nonnegative(), size: z.number().int().positive() }), // square, original pixels
  checkedOn: Day,
};
export const PlayerPortrait = z.discriminatedUnion("provider", [
  z.object({
    ...PortraitBase,
    provider: z.literal("commons"),
    license: z.string().min(1), // e.g. "CC BY-SA 4.0"
    licenseUrl: z.string().url().optional(),
    author: z.string().min(1),
    photo: z.string().optional(), // what the photo shows, from its description (event, year)
  }),
  z.object({ ...PortraitBase, provider: z.literal("dpm.lol") }),
]);
export type PlayerPortrait = z.infer<typeof PlayerPortrait>;
export const PlayerPortraits = z.object({ portraits: z.array(PlayerPortrait) });
export type PlayerPortraits = z.infer<typeof PlayerPortraits>;
// Names, icons and short stats from the game patch's Data Dragon files, for exactly the ids the builds use.
const Named = { name: z.string().min(1), icon: z.string().min(1) };
export const PatchAssets = z.object({
  ddragon: z.string().regex(/^\d+\.\d+\.\d+$/),
  items: z.record(z.object({
    name: z.string().min(1), gold: z.number(), stats: z.array(z.string()).optional(), text: z.string().optional(),
    from: z.array(z.number().int()).optional(), kind: z.enum(["completed", "boots", "component", "starter-or-component", "consumable", "trinket"]),
  })),
  runes: z.record(z.object({ ...Named, short: z.string(), shard: z.boolean().optional() })),
  trees: z.record(z.object({ ...Named, rows: z.array(z.array(z.number().int())) })),
  spells: z.record(z.object({ ...Named, cooldown: z.string().optional() })),
  abilities: z.record(z.object(Object.fromEntries(["Q", "W", "E", "R"].map((k) => [k, z.object({ ...Named, maxrank: z.number().int().positive() })])) as
    Record<"Q" | "W" | "E" | "R", z.ZodObject<{ name: z.ZodString; icon: z.ZodString; maxrank: z.ZodNumber }>>)),
  unnamed: z.array(z.string()).optional(), // ids this patch's files do not name: shown by id, not asked for again
});
export type PatchAssets = z.infer<typeof PatchAssets>;
export const BuildAssets = z.object({ patches: z.record(PatchAssets) });
export type BuildAssets = z.infer<typeof BuildAssets>;

// ---------- comp-shells.json ----------
export const CompShell = z.object({
  id: id,
  name: z.string(),
  kind: z.enum(["observed", "generalized"]),
  observedBy: z.string().optional(),
  proDraftId: z.string().optional(),
  slots: z.object(Object.fromEntries(ROLES.map((r) => [r, z.object({
    champion: ChampionId,
    job: z.string(),
    swaps: z.array(ChampionId),
  })])) as Record<Role, z.ZodObject<{ champion: typeof ChampionId; job: z.ZodString; swaps: z.ZodArray<typeof ChampionId> }>>),
  identities: z.array(z.string()),
  winCondition: z.string(),
  why: z.string(),
  difficulty: z.enum(["easy", "easy-medium", "medium", "hard"]),
  sources: z.array(SourceId),
});
export type CompShell = z.infer<typeof CompShell>;

// ---------- discovered-comps.json (written only by the weekly discovery, scripts/discover-comps.ts) ----------
// Observed Pro Comps the weekly review added (lib/comp-discovery.ts), and observed variations filed under library comps.
// Lineups are Observed Pro Evidence (each game is a data/pro-games.json record, referenced by Gol.gg id and side);
// identity, jobs, win condition, strengths, weak points and difficulty are the comp check's read (General Draft Logic).
const Identity = z.enum(["front-to-back", "dive", "pick", "poke", "protect", "skirmish", "wombo", "split", "tempo", "scaling"]);
const LineupRef = z.object({ game: z.number().int().positive(), side: z.enum(["blue", "red"]) });
export const DiscoveredComp = z.object({
  id: id,
  name: z.string().min(1),
  addedOn: Day,
  primary: Identity,
  secondary: Identity.nullable(),
  tags: z.array(z.string()),
  slots: z.object(Object.fromEntries(ROLES.map((r) => [r, z.object({ champion: ChampionId, job: z.string().min(1).max(16) })])) as Record<Role, z.ZodObject<{ champion: typeof ChampionId; job: z.ZodString }>>),
  winCondition: z.string().min(1),
  why: z.string().min(1),
  timing: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.object({ label: z.string(), severity: z.enum(["major", "moderate", "minor"]) })),
  difficulty: z.enum(["easy", "medium", "hard"]),
  games: z.array(LineupRef).min(1),
});
export type DiscoveredComp = z.infer<typeof DiscoveredComp>;
export const DiscoveredComps = z.object({
  lastAddition: Day.nullable(),
  comps: z.array(DiscoveredComp),
  variations: z.array(z.object({ of: id, picks: Picks, addedOn: Day, games: z.array(LineupRef).min(1) })),
});
export type DiscoveredComps = z.infer<typeof DiscoveredComps>;

// ---------- comp-review.json (alan's reviewed Comp Library decisions; changed only when he approves) ----------
// Pro swaps: champion substitutions pro teams played inside a library comp, approved by alan with the games behind them.
// Observed Pro Evidence, kept apart from a slot's `swaps` (General Draft Logic). Supporting lineups: recorded lineups
// alan accepted as evidence for a comp outside the tracked tournaments (the discovery files the tracked ones itself).
// Historical: slots whose champion pros have stopped picking in that role; the page shows the last patch it was picked.
// Variants: see below.
export const CompReview = z.object({
  proSwaps: z.array(z.object({ comp: id, role: Role, champion: ChampionId, approvedOn: Day, games: z.array(LineupRef).min(2) })),
  supporting: z.array(z.object({ comp: id, approvedOn: Day, games: z.array(LineupRef).min(1) })),
  historical: z.array(z.object({ comp: id, roles: z.array(Role).min(1), approvedOn: Day })),
  // Named variants: a comp shown inside its parent's card (same win condition, different execution), keeping its own
  // lineup, swaps, sources and evidence. Never deleted, never merged into the parent's lineup.
  variants: z.array(z.object({ comp: id, parent: id, name: z.string(), approvedOn: Day })).default([]),
  // Champions whose lineups discovery keeps out of new comps and variations until alan reviews what they unlock
  // (alan, 2026-10-16, after Locke's and Zaahen's kits). Comp Check still reads them; only the library waits.
  heldChampions: z.array(z.object({ champion: ChampionId, since: Day, reason: z.string() })).default([]),
});
export type CompReview = z.infer<typeof CompReview>;

// ---------- pool.json ----------
export const PoolEntry = z.object({
  role: Role,
  core: z.array(ChampionId),
  depth: z.array(ChampionId),
  flex: z.array(ChampionId),
  coreReasons: z.record(z.string()),
  changed: z.string(),
  sources: z.array(SourceId),
});
export type PoolEntry = z.infer<typeof PoolEntry>;

// ---------- meta.json ----------
export const MetaStat = z.object({
  champion: ChampionId,
  // Tournament aggregate (a Gol.gg tournament table), never counted from the drafts stored in this repo. picks, bans,
  // wins and winRate are champion-wide for the event: Gol.gg does not say which role a pick or ban was in. `role` is a
  // role a source names for the champion (the workbook's listing); without it, the champion's roles come from verified
  // rolePicks or from recorded games (lib/pool-stats eventStats). Presence is derived: (picks + bans) / event games.
  role: Role.optional(),
  flexRole: Role.optional(),
  picks: z.number().int(),
  bans: z.number().int().nullable(), // champion-level: a ban has no role
  wins: z.number().int().optional(),
  winRate: z.number().min(0).max(1).nullable(), // null when the champion was only banned
  lowSample: z.boolean(),
  rolePicks: z.record(Role, z.number().int()).optional(), // verified picks per role, only when a source states them
  priorityRead: z.string().optional(),
  note: z.string().optional(),
  sources: z.array(SourceId),
});
export type MetaStat = z.infer<typeof MetaStat>;
// A tournament evidence set. The LCK playoffs are the main sample (meta.tournament + meta.stats); a current-meta event
// such as the Demacia Cup is a separate, newer sample with its own stats and notes. Neither ever edits saved pairings.
export const MetaEvent = z.object({
  id: id,
  name: z.string(),
  short: z.string(),
  kind: z.enum(["playoffs", "current-meta"]),
  patch: z.string(),
  draftMode: z.string(),
  status: z.enum(["complete", "ongoing"]),
  startDate: Day.optional(),
  endDate: Day.optional(),
  scope: z.string(),
  games: z.number().int().optional(), // total games played in the event, when known (needed for pick rates)
  statsComplete: z.boolean().default(false), // true only when stats list every champion picked or banned
  // Facts about the event itself (dates, who plays) supplied during review from a non-Gol.gg page.
  provided: z.object({ url: z.string().url(), claim: z.string(), providedOn: Day, providedBy: z.string() }).optional(),
  stats: z.array(MetaStat).default([]),
  notes: z.array(z.object({ topic: z.string(), note: z.string(), sources: z.array(SourceId) })).default([]),
  sources: z.array(SourceId),
});
export type MetaEvent = z.infer<typeof MetaEvent>;
export const Meta = z.object({
  tournament: z.object({
    name: z.string(), games: z.number().int(), draftMode: z.string(), patch: z.string(),
    final: z.string(), recordedGames: z.number().int(), sources: z.array(SourceId),
  }),
  stats: z.array(MetaStat),
  changes: z.array(z.object({ topic: z.string(), note: z.string() })),
  events: z.array(MetaEvent).min(1),
});
export type Meta = z.infer<typeof Meta>;

// ---------- geng.json ----------
export const GenGPattern = z.object({
  kind: z.enum(["recurring-pick", "combination", "role-flex", "context"]),
  title: z.string(),
  detail: z.string(),
  era: Era,
  proDraftIds: z.array(z.string()),
  sources: z.array(SourceId),
});
export type GenGPattern = z.infer<typeof GenGPattern>;

// ---------- rules.json ----------
export const Rule = z.object({ id: id, layer: z.enum(["clash", "logic"]), text: z.string() });
export type Rule = z.infer<typeof Rule>;

// ---------- counters.json (Counters: a fourth, separate signal) ----------
// Lane counters for an enemy pick. Never scored into the draft-fit ranking, never merged into Synergy, Pro Pairings or
// General Draft Logic. Pro counter evidence is derived from recorded drafts plus per-game results listed here; DPM.LOL
// rows are SoloQ matchup data ingested into the repo (never fetched by the browser) and always labelled DPM.
const DuoPair = z.object({ bot: ChampionId, support: ChampionId });
const DpmFields = {
  winRate: z.number().min(0).max(1), // the counter side's win rate in this matchup
  delta: z.number().optional(), // win-rate points above the counter's own average, when DPM shows it
  games: z.number().int().positive(),
  patch: z.string(),
  rank: z.string().optional(), // DPM's rank filter, e.g. "Emerald+"
  url: z.string().url(),
  updated: Day,
  origin: z.enum(["dpm-ingest", "externally-provided"]), // ingested by Claude, or supplied as structured facts
  providedBy: z.string().optional(),
};
export const DpmMatchup = z.object({ role: Role, enemy: ChampionId, champion: ChampionId, ...DpmFields });
export type DpmMatchup = z.infer<typeof DpmMatchup>;
export const DpmDuoMatchup = z.object({ enemy: DuoPair, duo: DuoPair, ...DpmFields });
export type DpmDuoMatchup = z.infer<typeof DpmDuoMatchup>;
// Which team won a recorded game, so a lane result can count. Only from a source that shows the result.
export const ProResult = z.object({ game: SourceId, winner: z.string(), sources: z.array(SourceId).min(1) });
export type ProResult = z.infer<typeof ProResult>;
export const Counters = z.object({
  updated: Day,
  dpmStatus: z.object({ reachable: z.boolean(), checkedOn: Day, note: z.string() }),
  proResults: z.array(ProResult),
  dpm: z.array(DpmMatchup),
  dpmDuos: z.array(DpmDuoMatchup),
});
export type Counters = z.infer<typeof Counters>;


// ---------- patch-notes.json (official facts from Riot's patch notes) ----------
// Riot's own record of what changed, read by scripts/refresh-patch-notes.mjs (daily, .github/workflows/
// refresh-patch-notes.yml) from leagueoflegends.com. Summoner's Rift content only. Every value is copied from the page:
// `before` / `after` are the two sides of Riot's "⇒" and `text` is the whole line as Riot wrote it; a missing value is
// left out, never filled in. Draft implications are analysis and live in lib/patch-changes.ts, never in this file.
const PatchLabel = z.string().regex(/^2\d\.\d{1,2}$/); // Riot's label, "26.16"; the pro-data spelling is `short`, "16.16"
export const PatchChangeLine = z.object({
  text: z.string().min(1),
  label: z.string().optional(),
  before: z.string().optional(),
  after: z.string().optional(),
  value: z.string().optional(), // a labelled line without an arrow ("Bug Fix: …", "Affected Champions: …")
  tag: z.enum(["new", "removed", "updated"]).optional(),
});
export const PatchEntry = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  kind: z.enum(["champion", "item", "rune", "system"]),
  subject: z.string(), // Riot's name for the champion / item / rune / system heading
  ref: z.string().optional(), // champion id (champions.json), item or rune name slug
  itemId: z.string().optional(), // Data Dragon item id, when the page's icon carries it
  anchor: z.string().optional(), // the heading's id on Riot's page
  icon: z.string().url().optional(),
  category: z.enum(["buff", "nerf", "adjustment", "rework", "keystone", "minor", "shard",
    "jungle", "objectives", "minions", "turrets", "summoners", "role-quests", "map-economy", "other", "bugfix"]).optional(),
  categories: z.array(z.enum(["new", "removed", "stats", "cost", "effect"])).optional(), // items
  // Champions: "riot-wording" when read from Riot's note by the daily check, "reviewed" once a person checked it.
  categoryBasis: z.enum(["riot-wording", "reviewed"]).optional(),
  context: z.string().optional(), // Riot's stated reason, verbatim
  affects: z.array(ChampionId).optional(), // champions a system change or bug fix names
  groups: z.array(z.object({ title: z.string().optional(), icon: z.string().url().optional(), changes: z.array(PatchChangeLine).min(1) })).min(1),
  midPatch: z.object({ title: z.string(), date: Day.nullable() }).optional(),
  corrected: z.boolean().optional(), // Riot edited this entry after it was first stored
  updatedAt: z.string().datetime(),
});
export type PatchEntry = z.infer<typeof PatchEntry>;
export const PatchNote = z.object({
  patch: PatchLabel,
  short: z.string().regex(/^1\d\.\d{1,2}$/),
  title: z.string(),
  url: z.string().url(),
  published: Day.nullable(),
  rev: z.string().nullable(),
  midPatch: z.array(z.object({ title: z.string(), date: Day.nullable() })),
  excluded: z.array(z.string()), // section headings left out (other modes, skins, client)
  bugfixesLeftOut: z.number().int().optional(),
  entries: z.array(PatchEntry),
  updatedAt: z.string().datetime(),
});
export type PatchNote = z.infer<typeof PatchNote>;
export const PatchNotes = z.object({ firstPatch: PatchLabel, source: z.string().url(), patches: z.array(PatchNote) });
export type PatchNotes = z.infer<typeof PatchNotes>;

export const Files = {
  "champions.json": z.array(Champion),
  "sources.json": z.array(Source),
  "bot-pairings.json": z.array(BotPairing),
  "mid-jungle.json": z.array(MidJunglePairing),
  "top.json": z.array(TopPick),
  "pro-drafts.json": z.array(ProDraft),
  "pro-games.json": ProGames,
  "pro-builds.json": ProBuilds,
  "player-portraits.json": PlayerPortraits,
  "build-assets.json": BuildAssets,
  "comp-shells.json": z.array(CompShell),
  "discovered-comps.json": DiscoveredComps,
  "comp-review.json": CompReview,
  "pool.json": z.array(PoolEntry),
  "meta.json": Meta,
  "geng.json": z.array(GenGPattern),
  "rules.json": z.array(Rule),
  "counters.json": Counters,
  "proposed-synergy.json": ProposedSynergy,
  "patch-notes.json": PatchNotes,
} as const;
