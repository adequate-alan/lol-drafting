// Enemy flex picks (alan, 2026-11-10): enemy champions can be entered as they are revealed, without a role. The whole
// enemy lineup is placed at once from role evidence; a role the user confirms is never moved by the placement.
//
// Role evidence, never a probability:
//   - the roster's playable roles (data/champions.json, listed first = main role),
//   - recorded pro picks in each role (Observed Pro Evidence, verified role picks only): the newest patch when the
//     champion has PRO_MIN picks there, else every recorded patch, else none.
// The placement is a label on the board. It never scores a candidate: the draft-fit score and the Comp Check read the
// enemy champions, not their roles; only the Counter labels and lane matchup lines read the roles, and they say when
// the role is not confirmed.
import { ROLES, type Champion, type Role } from "./schema";

/** One enemy champion as entered. `role`: the user confirmed it. `flex`: the user limited it to these roles (2+). */
export interface EnemyPick { id: string; role?: Role; flex?: Role[] }

/** Recorded pro picks per role: the newest patch and every recorded patch. Built at load (lib/data.ts). */
export type RoleBook = Record<string, { recent?: Partial<Record<Role, number>>; all?: Partial<Record<Role, number>> }>;

export const ROLE_INFERENCE = {
  roster: [3, 2, 1.5], // weight of the roster's first, second and later roles
  pro: 4, // weight of the pro share of picks in a role (0–1)
  proMin: 3, // picks a sample needs before it counts
  proOnlyMin: 2, // pro picks that admit a role the roster doesn't list
  margin: 1.5, // a whole-lineup placement this close to the best keeps the other role plausible
} as const;

export type PlacementStatus = "confirmed" | "flex" | "likely" | "uncertain" | "unresolved";

export interface RoleSample { scope: "patch" | "all"; patch?: string; picks: Partial<Record<Role, number>>; total: number }

export interface Placement {
  id: string;
  role?: Role; // where the board shows it; none when no open role fits
  status: PlacementStatus; // confirmed by the user, limited by the user (flex), placed alone (likely), placed with plausible alternatives (uncertain)
  alternatives: Role[]; // other roles a near-best whole-lineup placement gives it
  roster: Role[];
  sample?: RoleSample; // the pro picks the weights read
  seen?: Partial<Record<Role, number>>; // every recorded pro pick by role, shown when too few to count
  flex?: Role[];
}

export interface EnemyRead {
  placements: Placement[]; // in the order the picks were entered
  byRole: Partial<Record<Role, string>>; // the board: confirmed and placed champions
  possible: Partial<Record<Role, string[]>>; // champions placed elsewhere that could play this role
  alt: Record<string, Partial<Record<Role, Partial<Record<Role, string>>>>>; // champion → role → the whole board with it there
}

const sum = (m: Partial<Record<Role, number>> | undefined) => ROLES.reduce((n, r) => n + (m?.[r] ?? 0), 0);

export function sampleOf(id: string, book: RoleBook, patch?: string): RoleSample | undefined {
  const b = book[id];
  if (b?.recent && sum(b.recent) >= ROLE_INFERENCE.proMin) return { scope: "patch", patch, picks: b.recent, total: sum(b.recent) };
  if (b?.all && sum(b.all) >= ROLE_INFERENCE.proMin) return { scope: "all", picks: b.all, total: sum(b.all) };
  return undefined;
}

/** The roles a champion is placed into automatically, each with its evidence weight (highest first). */
export function roleWeights(c: Champion, book: RoleBook, patch?: string): { role: Role; w: number }[] {
  const s = sampleOf(c.id, book, patch);
  const out: { role: Role; w: number }[] = [];
  for (const role of ROLES) {
    const k = c.roles.indexOf(role);
    const base = k < 0 ? 0 : ROLE_INFERENCE.roster[Math.min(k, ROLE_INFERENCE.roster.length - 1)];
    const proOnly = k < 0 && (book[c.id]?.all?.[role] ?? 0) >= ROLE_INFERENCE.proOnlyMin;
    if (k < 0 && !proOnly) continue;
    out.push({ role, w: base + (s ? ROLE_INFERENCE.pro * ((s.picks[role] ?? 0) / s.total) : 0) });
  }
  return out.sort((a, b) => b.w - a.w || ROLES.indexOf(a.role) - ROLES.indexOf(b.role));
}

interface Cand { id: string; options: { role: Role; w: number }[] }
interface Best { placed: number; score: number; roles: (Role | undefined)[] }

/** The best whole-lineup placement: as many champions placed as possible, then the most evidence weight. */
function solve(cands: Cand[], taken: Set<Role>, force?: { i: number; role: Role }): Best {
  let best: Best = { placed: -1, score: -Infinity, roles: [] };
  const roles: (Role | undefined)[] = [];
  const walk = (i: number, used: Set<Role>, placed: number, score: number) => {
    if (i === cands.length) {
      if (placed > best.placed || (placed === best.placed && score > best.score + 1e-9)) best = { placed, score, roles: [...roles] };
      return;
    }
    for (const o of cands[i].options) {
      if (used.has(o.role) || (force?.i === i && o.role !== force.role)) continue;
      used.add(o.role); roles.push(o.role);
      walk(i + 1, used, placed + 1, score + o.w);
      used.delete(o.role); roles.pop();
    }
    if (force?.i === i) return; // a forced champion is never left out
    roles.push(undefined);
    walk(i + 1, used, placed, score);
    roles.pop();
  };
  walk(0, new Set(taken), 0, 0);
  return best;
}

/** Duplicate ids and a second confirmation of one role are dropped (the later one is placed automatically). */
export function cleanPicks(picks: EnemyPick[]): EnemyPick[] {
  const seen = new Set<string>(), roles = new Set<Role>();
  const out: EnemyPick[] = [];
  for (const p of picks) {
    if (seen.has(p.id) || out.length >= ROLES.length) continue;
    seen.add(p.id);
    const next: EnemyPick = { id: p.id };
    if (p.role && !roles.has(p.role)) { next.role = p.role; roles.add(p.role); }
    else { const f = [...new Set(p.flex ?? [])].filter((r) => ROLES.includes(r)); if (f.length >= 2) next.flex = ROLES.filter((r) => f.includes(r)); }
    out.push(next);
  }
  return out;
}

/** Reads the whole enemy lineup: confirmed roles stay, everyone else is placed together from the evidence. */
export function readEnemy(input: EnemyPick[], champions: Champion[], book: RoleBook = {}, patch?: string): EnemyRead {
  const byId = new Map(champions.map((c) => [c.id, c]));
  const picks = cleanPicks(input.filter((p) => byId.has(p.id)));
  const taken = new Set(picks.flatMap((p) => (p.role ? [p.role] : [])));
  const open = picks.filter((p) => !p.role);
  const cands: Cand[] = open.map((p) => {
    const weights = roleWeights(byId.get(p.id)!, book, patch);
    const options = p.flex ? p.flex.map((role) => ({ role, w: weights.find((x) => x.role === role)?.w ?? 0 })).sort((a, b) => b.w - a.w) : weights;
    return { id: p.id, options };
  });
  const best = solve(cands, taken);
  const board = (roles: (Role | undefined)[]) => {
    const out: Partial<Record<Role, string>> = {};
    for (const p of picks) if (p.role) out[p.role] = p.id;
    roles.forEach((r, i) => { if (r) out[r] = cands[i].id; });
    return out;
  };
  const byRole = board(best.roles);
  const possible: EnemyRead["possible"] = {};
  const alt: EnemyRead["alt"] = {};
  const placements = picks.map((p): Placement => {
    const c = byId.get(p.id)!;
    const base = { id: p.id, roster: c.roles, sample: sampleOf(p.id, book, patch), seen: book[p.id]?.all };
    if (p.role) return { ...base, role: p.role, status: "confirmed", alternatives: [] };
    const i = cands.findIndex((x) => x.id === p.id);
    const role = best.roles[i];
    const alternatives: Role[] = [];
    for (const o of cands[i].options) {
      if (o.role === role || taken.has(o.role)) continue;
      const other = solve(cands, taken, { i, role: o.role });
      if (other.placed < best.placed || other.placed < 0) continue;
      if (!p.flex && other.score < best.score - ROLE_INFERENCE.margin) continue;
      alternatives.push(o.role);
      (possible[o.role] ??= []).push(p.id);
      (alt[p.id] ??= {})[o.role] = board(other.roles);
    }
    const status: PlacementStatus = !role ? "unresolved" : p.flex ? "flex" : alternatives.length ? "uncertain" : "likely";
    return { ...base, role, status, alternatives, flex: p.flex };
  });
  return { placements, byRole, possible, alt };
}

// ---------- editing ----------

export type RoleAction = { kind: "auto" } | { kind: "confirm"; role: Role } | { kind: "flex"; roles: Role[] } | { kind: "remove" };

/**
 * One edit to the enemy picks. Confirming a role another confirmed champion holds swaps them: that champion takes this
 * one's current role (confirmed), or goes back to automatic placement when this one had none.
 */
export function applyRole(picks: EnemyPick[], id: string, action: RoleAction, current?: Role): EnemyPick[] {
  if (action.kind === "remove") return picks.filter((p) => p.id !== id);
  return cleanPicks(picks.map((p): EnemyPick => {
    if (p.id === id) {
      if (action.kind === "confirm") return { id, role: action.role };
      if (action.kind === "flex") return action.roles.length >= 2 ? { id, flex: action.roles } : { id };
      return { id };
    }
    if (action.kind === "confirm" && p.role === action.role) return current && current !== action.role ? { id: p.id, role: current } : { id: p.id };
    return p;
  }));
}

/** A champion typed into one enemy role slot: confirmed there, replacing whoever the board showed in it. */
export function placeInSlot(picks: EnemyPick[], role: Role, shown: string | undefined, id: string | undefined): EnemyPick[] {
  const rest = picks.filter((p) => p.id !== shown && p.id !== id).map((p) => (p.role === role ? { id: p.id } : p));
  return id ? cleanPicks([...rest, { id, role }]) : cleanPicks(rest);
}

// ---------- links ----------

const ROLE_KEYS = Object.fromEntries(ROLES.map((r) => [r.toLowerCase(), r])) as Record<string, Role>;

/** `?vs=`: entry order kept; `top:aatrox` confirmed, `jungle|support:poppy` flexible, a bare id placed automatically. */
export const enemyPicksParam = (picks: EnemyPick[]) =>
  picks.map((p) => (p.role ? `${p.role.toLowerCase()}:${p.id}` : p.flex ? `${p.flex.map((r) => r.toLowerCase()).join("|")}:${p.id}` : p.id)).join(",");

/** Reads `?vs=` (older links included: `top:aatrox,mid:ahri`, bare `ornn,jarvan-iv`). Unknown, repeated or allied ids are dropped. */
export function parseEnemyPicks(param: string | null, champions: Pick<Champion, "id">[], mine: string[] = []): EnemyPick[] {
  const ids = new Set(champions.map((c) => c.id));
  const seen = new Set(mine);
  const out: EnemyPick[] = [];
  for (const part of (param ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    const k = part.lastIndexOf(":");
    const head = k < 0 ? "" : part.slice(0, k), id = k < 0 ? part : part.slice(k + 1);
    if (!ids.has(id) || seen.has(id)) continue;
    seen.add(id);
    const roles = head.split("|").map((x) => ROLE_KEYS[x.toLowerCase()]).filter((r): r is Role => !!r);
    out.push(roles.length === 1 ? { id, role: roles[0] } : roles.length >= 2 ? { id, flex: roles } : { id });
  }
  return cleanPicks(out);
}

/** A stored or linked list made safe: known champions only, none on my team, the rules of cleanPicks. */
export function sanitizePicks(value: unknown, championIds: ReadonlySet<string>, exclude: ReadonlySet<string> = new Set()): EnemyPick[] {
  if (!Array.isArray(value)) return [];
  const out: EnemyPick[] = [];
  for (const v of value) {
    if (!v || typeof v !== "object") continue;
    const { id, role, flex } = v as Record<string, unknown>;
    if (typeof id !== "string" || !championIds.has(id) || exclude.has(id)) continue;
    const r = typeof role === "string" ? ROLES.find((x) => x === role) : undefined;
    const f = Array.isArray(flex) ? ROLES.filter((x) => flex.includes(x)) : [];
    out.push(r ? { id, role: r } : f.length >= 2 ? { id, flex: f } : { id });
  }
  return cleanPicks(out);
}

export const STATUS_LABEL: Record<PlacementStatus, string> = {
  confirmed: "Confirmed", flex: "Flex", likely: "Likely", uncertain: "Likely", unresolved: "Not placed",
};

// ---------- how a counter is claimed (alan, 2026-11-10) ----------
// The DPM evidence is the same whatever the enemy role's status; only how surely the matchup will happen changes.
// Confirmed lane opponent: Counter. Placed automatically: Potential counter. Another assignment still plausible (the
// opponent may play elsewhere, or someone else may play this lane): Conditional counter. No placed opponent: no claim.
// Never a weight on the win rate, never the score or the order.

export type CounterClaimKind = "confirmed" | "potential" | "conditional";
export interface CounterClaim { kind: CounterClaimKind; label: string; detail?: string }

const SHORT_ROLE: Record<Role, string> = { TOP: "TOP", JUNGLE: "JG", MID: "MID", BOT: "BOT", SUPPORT: "SUP" };
export const COUNTER_LABEL: Record<CounterClaimKind, string> = { confirmed: "Counter", potential: "Potential counter", conditional: "Conditional counter" };

/** How a counter against the enemy in these lane roles is labelled; undefined when no enemy is placed there. */
export function counterClaim(read: EnemyRead, lane: Role[], names: Record<string, string> = {}): CounterClaim | undefined {
  const foes = lane.flatMap((r) => { const p = read.placements.find((x) => x.role === r); return p ? [{ p, r }] : []; });
  if (!foes.length) return undefined;
  const n = (id: string) => names[id] ?? id;
  const open = foes.filter(({ p }) => p.status !== "confirmed");
  if (!open.length) return { kind: "confirmed", label: COUNTER_LABEL.confirmed };
  const mixed = open.some(({ p, r }) => p.alternatives.length > 0 || (read.possible[r] ?? []).length > 0);
  const kind: CounterClaimKind = mixed ? "conditional" : "potential";
  const detail = mixed
    ? open.map(({ p, r }) => `If ${n(p.id)} plays ${SHORT_ROLE[r]}`).join(" and ")
    : open.map(({ p, r }) => `${n(p.id)} likely ${SHORT_ROLE[r]}`).join(" · ");
  return { kind, label: COUNTER_LABEL[kind], detail };
}
