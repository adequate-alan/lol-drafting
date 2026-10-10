// Suggestions for open roles, kept in three separate lists that are never merged:
//   clash  - from alan's pairing records (clashDefault, alternatives, surrounding roles)
//   pro    - what recorded pro teams played next to the locked picks
//   logic  - pool champions that fix an active General Draft Logic warning
import { FIXES, warnings, type Draft } from "./evaluate";
import { ROLES, type BotPairing, type Champion, type CompShell, type MidJunglePairing, type PoolEntry, type ProDraft, type Role, type TopPick } from "./schema";

export interface SuggestData {
  champions: Champion[];
  botPairings: BotPairing[];
  midJungle: MidJunglePairing[];
  topPicks: TopPick[];
  proDrafts: ProDraft[];
  shells: CompShell[];
  pool: PoolEntry[];
}

export interface Suggestion { champion: string; score: number; reasons: string[] }
export type ByRole = Partial<Record<Role, Suggestion[]>>;

const openRoles = (draft: Draft) => ROLES.filter((r) => !draft[r]);
const locked = (draft: Draft) => new Set(Object.values(draft).filter(Boolean) as string[]);

function collector(draft: Draft) {
  const out: Partial<Record<Role, Map<string, Suggestion>>> = {};
  const taken = locked(draft);
  const add = (role: Role, champion: string, score: number, reason: string) => {
    if (draft[role] || taken.has(champion)) return;
    const m = (out[role] ??= new Map());
    const s = m.get(champion) ?? { champion, score: 0, reasons: [] };
    s.score += score;
    if (!s.reasons.includes(reason)) s.reasons.push(reason);
    m.set(champion, s);
  };
  const result = (limit = 6): ByRole => Object.fromEntries(openRoles(draft).map((r) => [
    r, [...(out[r]?.values() ?? [])].sort((a, b) => b.score - a.score || a.champion.localeCompare(b.champion)).slice(0, limit),
  ]));
  return { add, result };
}

export function clashSuggestions(draft: Draft, data: SuggestData): ByRole {
  const { add, result } = collector(draft);
  const name = (id: string) => data.champions.find((c) => c.id === id)?.name ?? id;
  // A bot-lane shape only counts when it fits what is already locked in the bot lane, so a shape
  // like "Ezreal + Karma" never suggests Karma next to a locked Ziggs.
  const addShape = (d: { bot: string; support: string }, from: string) => {
    if (draft.BOT && draft.BOT !== d.bot) return;
    if (draft.SUPPORT && draft.SUPPORT !== d.support) return;
    add("BOT", d.bot, 2, `Bot shape for ${name(from)}`);
    add("SUPPORT", d.support, 2, `Bot shape for ${name(from)}`);
  };
  for (const role of ROLES) {
    const id = draft[role];
    if (!id) continue;
    if (role === "BOT") {
      const r = data.botPairings.find((b) => b.champion === id);
      r?.clashDefault.forEach((s) => add("SUPPORT", s, 3, `Clash default with ${name(id)}`));
      r?.alternatives.forEach((s) => add("SUPPORT", s, 1, `Clash alternative with ${name(id)}`));
      r?.surrounding.jungle.forEach((j) => add("JUNGLE", j, 2, `Fits ${name(id)}`));
      r?.surrounding.mid.forEach((m) => add("MID", m, 2, `Fits ${name(id)}`));
    }
    if (role === "SUPPORT") {
      for (const b of data.botPairings) {
        if (b.clashDefault.includes(id)) add("BOT", b.champion, 3, `${name(id)} is its Clash default`);
        else if (b.alternatives.includes(id)) add("BOT", b.champion, 1, `${name(id)} is a Clash alternative`);
      }
    }
    if (role === "MID" || role === "JUNGLE") {
      const r = data.midJungle.find((m) => m.anchor === id && m.role === role);
      const other: Role = role === "MID" ? "JUNGLE" : "MID";
      r?.clashDefault.forEach((p) => add(other, p, 3, `Primary pair for ${name(id)}`));
      r?.alternatives.forEach((p) => add(other, p, 1, `Secondary pair for ${name(id)}`));
      r?.botShapes.forEach((d) => addShape(d, id));
    }
    if (role === "TOP") {
      const r = data.topPicks.find((t) => t.champion === id);
      r?.surrounding.jungle.forEach((j) => add("JUNGLE", j, 2, `Fits ${name(id)}`));
      r?.surrounding.mid.forEach((m) => add("MID", m, 2, `Fits ${name(id)}`));
      r?.surrounding.botShapes.forEach((d) => addShape(d, id));
    }
  }
  return result();
}

export function proSuggestions(draft: Draft, proDrafts: ProDraft[]): ByRole {
  const { add, result } = collector(draft);
  const lockedRoles = ROLES.filter((r) => draft[r]);
  for (const d of proDrafts) {
    const hits = lockedRoles.filter((r) => d.picks[r] === draft[r]);
    if (!hits.length) continue;
    for (const role of openRoles(draft)) add(role, d.picks[role], 1, `${d.team} ${d.seriesGame}`);
  }
  return result();
}

export function logicSuggestions(draft: Draft, data: SuggestData): ByRole {
  const { add, result } = collector(draft);
  const active = warnings(draft, data.champions);
  const byId = new Map(data.champions.map((c) => [c.id, c]));
  for (const role of openRoles(draft)) {
    const entry = data.pool.find((p) => p.role === role);
    const candidates = entry ? [...entry.core, ...entry.depth] : [];
    for (const w of active) {
      const fix = FIXES[w.id];
      if (!fix) continue;
      for (const id of candidates) {
        const c = byId.get(id);
        if (c && fix.test(c)) add(role, id, entry!.core.includes(id) ? 2 : 1, fix.label);
      }
    }
  }
  return result(5);
}

export function similarProDrafts(draft: Draft, proDrafts: ProDraft[], limit = 6) {
  const lockedRoles = ROLES.filter((r) => draft[r]);
  const all = locked(draft);
  return proDrafts
    .map((d) => ({
      draft: d,
      sameRole: lockedRoles.filter((r) => d.picks[r] === draft[r]).length,
      anyRole: ROLES.filter((r) => all.has(d.picks[r])).length,
    }))
    .filter((x) => x.anyRole > 0)
    .sort((a, b) => b.sameRole - a.sameRole || b.anyRole - a.anyRole)
    .slice(0, limit);
}

export function similarShells(draft: Draft, shells: CompShell[], limit = 4) {
  const lockedRoles = ROLES.filter((r) => draft[r]);
  return shells
    .map((s) => ({
      shell: s,
      exact: lockedRoles.filter((r) => s.slots[r].champion === draft[r]).length,
      swap: lockedRoles.filter((r) => s.slots[r].swaps.includes(draft[r]!)).length,
    }))
    .filter((x) => x.exact + x.swap > 0)
    .sort((a, b) => b.exact - a.exact || b.swap - a.swap)
    .slice(0, limit);
}
