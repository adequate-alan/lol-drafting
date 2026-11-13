// Links between the five champions of a comp shell, for the Comp Library drawer and its highlights.
// Two layers, never merged:
//   saved - alan's saved pairing records (clashDefault / alternatives / surrounding / botShapes).
//   pro   - recorded pro drafts and supplied game pages that show both champions on one team in these roles, plus
//           observed pairings on the champion's record. A shared pro game never counts as a saved link.
import { PARTNER_ROLE, type ProGame } from "./pool-stats";
import { ROLES, type BotPairing, type MidJunglePairing, type ObservedPairing, type Role, type TopPick } from "./schema";

export interface LinkData { botPairings: BotPairing[]; midJungle: MidJunglePairing[]; topPicks: TopPick[] }
export type Slots = Record<Role, string>;

export interface SavedLink { role: Role; kind: "default" | "alt" | "fits"; text: string }
export interface ProLink { role: Role; games: ProGame[]; observed: ObservedPairing[] }

const KIND_RANK = { default: 0, alt: 1, fits: 2 } as const;
const label = (r: Role) => r.toLowerCase();

/** The pairing record for a champion in a role, if alan saved one. */
export function recordFor(id: string, role: Role, data: LinkData) {
  if (role === "BOT") return data.botPairings.find((b) => b.champion === id);
  if (role === "TOP") return data.topPicks.find((t) => t.champion === id);
  if (role === "MID" || role === "JUNGLE") return data.midJungle.find((m) => m.anchor === id && m.role === role);
  return undefined;
}

/** Every saved link between two slots of the comp, strongest first. Written from the comp-mate's side. */
export function savedLinks(role: Role, slots: Slots, data: LinkData, name: (id: string) => string): SavedLink[] {
  const me = slots[role];
  const out: SavedLink[] = [];
  const add = (r: Role, kind: SavedLink["kind"], text: string) => { if (r !== role) out.push({ role: r, kind, text }); };
  const bot = data.botPairings.find((b) => b.champion === slots.BOT);
  // Bot lane: the bot's own record lists its supports.
  if (bot && (role === "BOT" || role === "SUPPORT")) {
    const other = role === "BOT" ? "SUPPORT" : "BOT";
    if (bot.clashDefault.includes(slots.SUPPORT)) add(other, "default", `Saved pairing: ${name(slots.SUPPORT)} is the preferred support for ${name(slots.BOT)}`);
    else if (bot.alternatives.includes(slots.SUPPORT)) add(other, "alt", `Saved pairing: ${name(slots.SUPPORT)} is an alternative support for ${name(slots.BOT)}${bot.alternativeNotes[slots.SUPPORT] ? ` (${bot.alternativeNotes[slots.SUPPORT]})` : ""}`);
  }
  // Mid / jungle records, anchored on either side.
  for (const r of ["MID", "JUNGLE"] as const) {
    const rec = data.midJungle.find((m) => m.anchor === slots[r] && m.role === r);
    const p = PARTNER_ROLE[r];
    if (!rec || (role !== r && role !== p)) continue;
    if (rec.clashDefault.includes(slots[p])) add(role === r ? p : r, "default", `Saved pairing: ${name(slots[p])} is the primary ${label(p)} for ${name(slots[r])}`);
    else if (rec.alternatives.includes(slots[p])) add(role === r ? p : r, "alt", `Saved pairing: ${name(slots[p])} is a secondary ${label(p)} for ${name(slots[r])}${rec.alternativeNotes[slots[p]] ? ` (${rec.alternativeNotes[slots[p]]})` : ""}`);
  }
  // Surrounding comps on bot and top records.
  const around: [Role, { jungle: string[]; mid: string[] } | undefined][] = [["BOT", bot?.surrounding], ["TOP", data.topPicks.find((t) => t.champion === slots.TOP)?.surrounding]];
  for (const [anchorRole, s] of around) {
    if (!s) continue;
    for (const r of ["JUNGLE", "MID"] as const) {
      if (!s[r === "JUNGLE" ? "jungle" : "mid"].includes(slots[r])) continue;
      if (role === anchorRole) add(r, "fits", `Saved comp: ${name(slots[r])} fits around ${name(slots[anchorRole])}`);
      else if (role === r) add(anchorRole, "fits", `Saved comp: ${name(me)} fits around ${name(slots[anchorRole])}`);
    }
  }
  // Bot-lane shapes on mid / jungle / top records, only for duos the bot's own record lists (CLAUDE.md).
  const listed = bot ? [...bot.clashDefault, ...bot.alternatives].includes(slots.SUPPORT) : false;
  if (listed) for (const r of ["MID", "JUNGLE", "TOP"] as const) {
    const shapes = r === "TOP" ? data.topPicks.find((t) => t.champion === slots.TOP)?.surrounding.botShapes
      : data.midJungle.find((m) => m.anchor === slots[r] && m.role === r)?.botShapes;
    if (!shapes?.some((d) => d.bot === slots.BOT && d.support === slots.SUPPORT)) continue;
    const text = `Saved comp: ${name(slots.BOT)} + ${name(slots.SUPPORT)} bot lane for ${name(slots[r])}`;
    if (role === r) { add("BOT", "fits", text); add("SUPPORT", "fits", text); }
    else if (role === "BOT" || role === "SUPPORT") add(r, "fits", text);
  }
  return out.sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || ROLES.indexOf(a.role) - ROLES.indexOf(b.role));
}

/** Pro evidence between this slot and each comp-mate. `exclude` drops the comp's own source draft. */
export function proLinks(role: Role, slots: Slots, games: ProGame[], data: LinkData, exclude?: string): ProLink[] {
  const me = slots[role];
  const mine = games.filter((g) => g.picks[role] === me && (!exclude || g.draftId !== exclude));
  const observed = observedFor(me, role, data);
  return ROLES.filter((r) => r !== role).map((r) => ({
    role: r,
    games: mine.filter((g) => g.picks[r] === slots[r]),
    observed: observed.filter((o) => o.champion === slots[r]),
  })).filter((l) => l.games.length || l.observed.length);
}

/** Observed pro pairings recorded for a champion in a role (a support reads them off the bot records). */
export function observedFor(id: string, role: Role, data: LinkData): ObservedPairing[] {
  if (role === "SUPPORT") return data.botPairings.flatMap((b) => b.observedProPairings.filter((o) => o.champion === id).map((o) => ({ ...o, champion: b.champion })));
  return recordFor(id, role, data)?.observedProPairings ?? [];
}
