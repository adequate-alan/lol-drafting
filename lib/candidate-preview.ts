// Candidate preview and comparison (alan, 2026-10-19, "Candidate Comparison and Preview"): what one candidate for the
// open role would do to the plan-aware Comp Check, read before anything is locked. The preview reads the board with the
// candidate in the open role through the same analyzePlan the real Comp Check uses and compares the two reads; no new
// rule, threshold or number. General Draft Logic only: it never feeds a score, never moves a row, never writes to the
// board, its URL or its stored copy. Up to three candidates per role can be compared; the comparison is kept for this
// browser tab (sessionStorage), apart from the stored board, and Clear draft empties it.
import { IDENTITY_LABEL, type Draft, type SavedBotRecord } from "./model-v2/analyze";
import type { ChampionKit } from "./model-v2/schema";
import { analyzePlan, type PlanFinding, type PlanRead } from "./model-v2/plan";
import { ROLES, type Role } from "./schema";

export const COMPARE_MAX = 3;
export const COMPARE_KEY = "draft-room:compare";

export interface Gap { id: string; label: string; tier: PlanFinding["tier"]; severity: PlanFinding["severity"]; source: PlanFinding["source"] }
export type PlanShift = "keeps" | "shifts" | "starts" | "loses" | "none";
export interface PreviewEffect {
  champion: string;
  role: Role;
  read: PlanRead;      // the board with the candidate in the open role
  plan: { kind: PlanShift; from?: string; to?: string };
  adds: string[];      // the plan's jobs the candidate meets that the board does not (plan kept)
  missing: string[];   // the plan's jobs still unmet with the candidate (its plan, kept or new)
  fixed: Gap[];        // gaps on the board now that the candidate closes within the plan (or a general rule that stops)
  open: Gap[];         // gaps on the board now that stay
  created: Gap[];      // real gaps the candidate's board has that the board now does not
  dropped: Gap[];      // gaps that go away only because the comp reads as a different plan: never a fix
}

const gapOf = (x: PlanFinding): Gap => ({ id: x.id, label: x.label, tier: x.tier, severity: x.severity, source: x.source });
// A gap that matters: critical, needed from the last pick, or a weakness that is not minor. Accepted tradeoffs and
// minor points stay in the Comp Check itself.
const real = (p: PlanRead) => [...p.weaknesses, ...p.more].filter((x) => x.tier !== "accepted" && !(x.tier === "weakness" && x.severity === "minor"));
const planLabel = (p: PlanRead) => (p.identity.primary ? IDENTITY_LABEL[p.identity.primary.id] : undefined);
const TIER_ORDER = { critical: 0, needed: 1, weakness: 2, accepted: 3 } as const;
const byTier = (a: Gap, b: Gap) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier];

/** The board with one candidate in the open role. The board passed in is never changed. */
export const withCandidate = (draft: Draft, role: Role, champion: string): Draft => ({ ...draft, [role]: champion });

/**
 * What a candidate does to the plan read. `before` is the read of the board as it is (the Comp Check's own read).
 * A gap counts as fixed only when the comp keeps its plan, or when it is a general rule that no longer fires at all
 * (the fifth-pick rule in lib/model-v2/plan.ts); one that goes away because the comp reads as another plan is `dropped`.
 */
export function previewEffect(before: PlanRead, draft: Draft, role: Role, champion: string, kits: ChampionKit[],
  enemyIds: string[] = [], botPairings: SavedBotRecord[] = []): PreviewEffect {
  const read = analyzePlan(withCandidate(draft, role, champion), kits, enemyIds, botPairings);
  const from = planLabel(before), to = planLabel(read);
  const kind: PlanShift = before.confidence === "none" ? (read.confidence === "none" ? "none" : to ? "starts" : "none")
    : !to ? (from ? "loses" : "none") : !from ? "starts" : from === to ? "keeps" : "shifts";
  const after = real(read);
  const afterAll = [...read.weaknesses, ...read.more, ...read.accepted];
  const present = (x: PlanFinding) => afterAll.some((y) => (y.id === x.id || y.replaces?.includes(x.id)) && y.tier !== "accepted");
  const fixed: Gap[] = [], open: Gap[] = [], dropped: Gap[] = [];
  for (const x of real(before)) {
    if (present(x)) open.push(gapOf(x));
    else if (kind === "shifts" && x.source === "plan") dropped.push(gapOf(x));
    else fixed.push(gapOf(x));
  }
  const had = new Set(real(before).flatMap((x) => [x.id, ...(x.replaces ?? [])]));
  const created = after.filter((y) => !had.has(y.id) && !(y.replaces ?? []).some((r) => had.has(r))).map(gapOf);
  const met = new Set(before.plan?.jobs.filter((j) => j.met).map((j) => j.id) ?? []);
  const jobs = read.plan?.jobs ?? [];
  return {
    champion, role, read, plan: { kind, from, to },
    adds: kind === "keeps" ? jobs.filter((j) => j.met && !met.has(j.id)).map((j) => j.label) : [],
    missing: jobs.filter((j) => !j.met && !j.unread).map((j) => j.label),
    fixed: fixed.sort(byTier), open: open.sort(byTier), created: created.sort(byTier), dropped: dropped.sort(byTier),
  };
}

/** One line for the plan: "Keeps Skirmish", "Shifts Skirmish to Dive", "Starts Dive". */
export function planText(e: PreviewEffect): string {
  const p = e.plan;
  return p.kind === "keeps" ? `Keeps ${p.to}` : p.kind === "shifts" ? `Shifts ${p.from} to ${p.to}` : p.kind === "starts" ? `Starts ${p.to}`
    : p.kind === "loses" ? `No clear plan (was ${p.from})` : "No comp read yet";
}

/** A gap in plain words: a missing plan job by its job ("Frontline"), anything else by its own label. */
export const gapText = (g: Gap) => (g.source === "plan" ? cap(g.label.replace(/^[^:]*: missing /, "")) : g.label);
export const isCritical = (g: Gap) => g.tier === "critical" || g.tier === "needed";
// Plan jobs are named through adds / missing; the gap lists name everything else, so nothing is said twice.
export const ruleGaps = (gs: Gap[]) => gs.filter((g) => g.source !== "plan");

/** The short line on the phone and in the rail: plan first, then the most important change. */
export function effectLine(e: PreviewEffect): string {
  const parts = [planText(e)];
  const fixed = ruleGaps(e.fixed).find(isCritical) ?? ruleGaps(e.fixed)[0];
  const left = e.open.find(isCritical);
  const made = e.created.find(isCritical) ?? ruleGaps(e.created)[0];
  if (e.adds.length) parts.push(`adds ${lower(e.adds[0])}`);
  else if (fixed) parts.push(`fixes ${lower(gapText(fixed))}`);
  if (left) parts.push(`${left.source === "plan" ? "still missing" : "leaves"} ${lower(gapText(left))}`);
  else if (e.plan.kind === "keeps" && e.missing.length) parts.push(`still missing ${lower(e.missing[0])}`);
  else if (made) parts.push(`${made.source === "plan" ? "missing" : "creates"} ${lower(gapText(made))}`);
  return parts.join(" · ");
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** What a candidate improves, in plain words: plan jobs it adds, then gaps it fixes (each once). */
export function improvements(e: PreviewEffect): string[] {
  return [...new Set([...e.adds, ...e.fixed.map(gapText)])];
}

/** For each compared candidate: what only it improves among those compared, and what the others improve that it
 *  leaves, which is what choosing it gives up. */
export function compareGaps(effects: PreviewEffect[]): Record<string, { only: string[]; givesUp: string[] }> {
  const out: Record<string, { only: string[]; givesUp: string[] }> = {};
  const by = new Map(effects.map((e) => [e.champion, improvements(e)]));
  for (const e of effects) {
    const mine = by.get(e.champion)!;
    const others = effects.filter((x) => x !== e).map((x) => by.get(x.champion)!);
    out[e.champion] = {
      only: others.length ? mine.filter((t) => !others.some((o) => o.includes(t))) : [],
      givesUp: [...new Set(others.flat().filter((t) => !mine.includes(t)))],
    };
  }
  return out;
}

// ---------- the comparison list ----------

export type CompareState = Partial<Record<Role, string[]>>;

/** Add or remove a champion; a fourth replaces the oldest. */
export function toggleCompare(state: CompareState, role: Role, champion: string): CompareState {
  const list = state[role] ?? [];
  const next = list.includes(champion) ? list.filter((x) => x !== champion) : [...list, champion].slice(-COMPARE_MAX);
  return withRole(state, role, next);
}
const withRole = (state: CompareState, role: Role, list: string[]): CompareState => {
  const out = { ...state };
  if (list.length) out[role] = list; else delete out[role];
  return out;
};

/** The comparison after a board change: champions now locked on either team leave, and a locked role's list closes. */
export function pruneCompare(state: CompareState, draft: Draft, taken: string[]): CompareState {
  let out: CompareState = {};
  for (const role of ROLES) {
    const list = state[role];
    if (!list || draft[role]) continue;
    out = withRole(out, role, list.filter((id) => !taken.includes(id)));
  }
  return out;
}

export const sameCompare = (a: CompareState, b: CompareState) => ROLES.every((r) => (a[r] ?? []).join() === (b[r] ?? []).join());

/** A stored comparison made safe: known champions playing nothing twice per role, at most COMPARE_MAX each. */
export function sanitizeCompare(value: unknown, championIds: ReadonlySet<string>): CompareState {
  const out: CompareState = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const role of ROLES) {
    const raw = (value as Record<string, unknown>)[role];
    if (!Array.isArray(raw)) continue;
    const list = [...new Set(raw.filter((x): x is string => typeof x === "string" && championIds.has(x)))].slice(0, COMPARE_MAX);
    if (list.length) out[role] = list;
  }
  return out;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export function readCompare(store: Store | undefined, championIds: ReadonlySet<string>): CompareState {
  try { const raw = store?.getItem(COMPARE_KEY); return raw ? sanitizeCompare(JSON.parse(raw), championIds) : {}; } catch { return {}; }
}
export function writeCompare(store: Store | undefined, state: CompareState): void {
  try { if (ROLES.some((r) => state[r]?.length)) store?.setItem(COMPARE_KEY, JSON.stringify(state)); else store?.removeItem(COMPARE_KEY); }
  catch { /* storage blocked: the comparison lasts for this page only */ }
}
export const tabStore = (): Store | undefined => { try { return window.sessionStorage; } catch { return undefined; } };
