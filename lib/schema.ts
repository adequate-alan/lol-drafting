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
export const ChampionId = id;
export const SourceId = id;
export type ChampionId = string;

export const Confidence = z.enum(["high", "medium-high", "medium", "low"]);
export const Era = z.enum(["current-playoffs", "earlier-2026"]);
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
  lastChecked: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  refreshStatus: z.enum(["verified", "not-refreshed"]), // "verified" only when Claude itself re-read the page
  origin: z.enum(["workbook", "golgg-refresh", "user-verified"]),
  // alan checked this page himself. Kept apart from refreshStatus, which records Claude's own checks.
  userVerified: z.object({
    by: z.string(),
    on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    claim: z.string(),
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
  note: z.string().optional(),
});
export type Champion = z.infer<typeof Champion>;

// ---------- Observed Pro Evidence ----------
export const ObservedPairing = z.object({
  champion: ChampionId,
  context: z.string(),
  era: Era,
  proDraftIds: z.array(z.string()),
  backedByGame: z.boolean(), // true only when a recorded pro draft shows the pairing
  sources: z.array(SourceId),
});
export type ObservedPairing = z.infer<typeof ObservedPairing>;

const Duo = z.object({ bot: ChampionId, support: ChampionId });
export type Duo = z.infer<typeof Duo>;

// ---------- bot-pairings.json ----------
export const BotPairing = z.object({
  champion: ChampionId,
  role: z.literal("BOT"),
  clashDefault: z.array(ChampionId).min(1),
  alternatives: z.array(ChampionId),
  alternativeNotes: z.record(z.string()).default({}),
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
  botShapes: z.array(Duo),
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
  observedProPairings: z.array(ObservedPairing),
  logic: z.object({ gives: z.string(), avoid: z.string() }),
  identities: z.array(z.string()),
  playoffRead: z.string().optional(),
  status: Status,
  sources: z.array(SourceId),
});
export type TopPick = z.infer<typeof TopPick>;

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
  read: z.string(),
  note: z.string().optional(),
  sources: z.array(SourceId).min(1),
});
export type ProDraft = z.infer<typeof ProDraft>;

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
  role: Role,
  flexRole: Role.optional(),
  picks: z.number().int(),
  bans: z.number().int().nullable(),
  presence: z.number().nullable(),
  winRate: z.number().min(0).max(1),
  lowSample: z.boolean(),
  roleUsage: z.record(z.number().int()),
  priorityRead: z.string().optional(),
  note: z.string().optional(),
  sources: z.array(SourceId),
});
export type MetaStat = z.infer<typeof MetaStat>;
export const Meta = z.object({
  tournament: z.object({
    name: z.string(), games: z.number().int(), draftMode: z.string(), patch: z.string(),
    final: z.string(), recordedGames: z.number().int(), sources: z.array(SourceId),
  }),
  stats: z.array(MetaStat),
  changes: z.array(z.object({ topic: z.string(), note: z.string() })),
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

export const Files = {
  "champions.json": z.array(Champion),
  "sources.json": z.array(Source),
  "bot-pairings.json": z.array(BotPairing),
  "mid-jungle.json": z.array(MidJunglePairing),
  "top.json": z.array(TopPick),
  "pro-drafts.json": z.array(ProDraft),
  "comp-shells.json": z.array(CompShell),
  "pool.json": z.array(PoolEntry),
  "meta.json": Meta,
  "geng.json": z.array(GenGPattern),
  "rules.json": z.array(Rule),
} as const;
