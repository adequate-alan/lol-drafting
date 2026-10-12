// Champion drawer (alan, 2026-10-12): the shared scouting panel's pure helpers, kept out of the component so
// tests/champion-drawer.test.ts can check them without a browser.
//
//   buildDrawerIndex(data)                 names, champions, events, pro games and event stats, built once per page
//   drawerActions(context, pick)           the footer's context-aware links (never "Use in Draft Room" inside the room)
//   pairingDetail(me, partner, data, idx)  one pairing, layer by layer: saved status, proposed reason, draft logic,
//                                          what the partner gives, tradeoffs, recorded games, cited pairings
//   gameDetail(game, data)                 one recorded game: both drafts when recorded, side, result, bans, builds, source
//   patchStats(priority, id, point)        one patch of the champion's priority history: tournaments, teams, pick order
//   savedPartners(id, role, data)          alan's saved partner groups, as the Champion Pool row lists them
//   rolesOf(id, index)                     roles with evidence first, then the roster's roles
//
// Three layers, never merged: everything here carries its layer (clash = alan's saved and proposed synergy, pro =
// recorded games and tournament tables, logic = champion attributes). Nothing here scores or changes a saved record.
import { observedFor, recordFor, savedLinks, type Slots } from "./comp-links";
import type { DrawerData } from "./data";
import { gameKey, golggGameId } from "./draft-side";
import { evidenceLine, type EventMap, type EvidenceLine } from "./evidence";
import { patchLabel } from "./patch";
import { buildParam } from "./pro-drafts-game";
import { eventStats, PARTNER_ROLE, proGames, type ProGame } from "./pool-stats";
import { handAlts } from "./pro-alternatives";
import { buildsHref, type ChampionBuilds } from "./pro-builds";
import { bucket, teamsFor, type HistoryPoint, type OrderStats, type PriorityData } from "./pro-priority";
import { proposedLink, type ProposedLink } from "./proposed";
import { synergyParts } from "./recommend";
import { ROLES, type Attr, type Champion, type ProDraft, type Role } from "./schema";

// ---------- where the drawer opened ----------
export type DrawerPage = "draft" | "pool" | "synergies" | "comps" | "meta" | "pro-drafts" | "pro-builds" | "patch-notes" | "geng" | "pinned" | "other";
export interface DrawerContext {
  page: DrawerPage;
  /** Draft Room: champions on the board, allies and enemies. The drawer never offers to lock one of them again. */
  locked?: string[];
  /** Pro Drafts: the Gol.gg game open in the panel, so "Inspect this game's build" can name it. */
  game?: number;
  /** Draft Room: the room's query, carried to Pro Builds so "Back to Draft Room" restores the draft. */
  from?: string;
}
export const OTHER: DrawerContext = { page: "other" };

export type DrawerTab = "overview" | "synergies" | "pro" | "builds" | "patch";
export const DRAWER_TABS: [DrawerTab, string][] = [["overview", "Overview"], ["synergies", "Synergies"], ["pro", "Pro"], ["builds", "Builds"], ["patch", "Patch"]];

// ---------- links into the full pages, with the context carried ----------
export const SYNERGY_TAB: Record<Role, string> = { TOP: "top", JUNGLE: "jungle", MID: "mid", BOT: "bot", SUPPORT: "support" };
export const synergiesHref = (id: string, role: Role) => `/synergies/${SYNERGY_TAB[role]}/?champ=${id}`;
export const poolHref = (id: string, role: Role) => `/pool/?role=${role}&champ=${id}`;
export const draftHref = (picks: Partial<Record<Role, string>>) => `/?${ROLES.filter((r) => picks[r]).map((r) => `${r.toLowerCase()}=${picks[r]}`).join("&")}`;
export const metaHref = (role: Role, patch?: string) => `/meta/?role=${role}${patch ? `&patch=${patchLabel(patch)}` : ""}`;
export const patchNotesHref = (id: string) => `/patch-notes/?champion=${id}`;
export const compsHref = (shellId: string) => `/comps/?kind=all#${shellId}`;
/** Pro Drafts with a game open; with a role, that team's build for the role open under it. */
export const proDraftHref = (draftId: string, build?: Role) => `/pro-drafts/?id=${draftId}${build ? `&build=${encodeURIComponent(buildParam({ id: draftId }, build))}` : ""}`;
/** Pro Builds with the champion and role, one exact game when given, and the Draft Room query to come back to. */
export const buildsLink = (id: string, role: Role, game?: number, from?: string) => `${buildsHref(id, role, game)}${from ? `&from=${encodeURIComponent(from)}` : ""}`;

// ---------- index ----------
export function buildDrawerIndex(data: DrawerData) {
  const games = proGames({ meta: data.meta, proDrafts: data.proDrafts, botPairings: data.botPairings, sources: data.sources });
  return {
    names: Object.fromEntries(data.champions.map((c) => [c.id, c.name])) as Record<string, string>,
    champs: Object.fromEntries(data.champions.map((c) => [c.id, c])) as Record<string, Champion>,
    events: Object.fromEntries(data.meta.events.map((e) => [e.id, e])) as EventMap,
    games,
    stats: eventStats(data.meta, games),
  };
}
export type DrawerIndex = ReturnType<typeof buildDrawerIndex>;

/** Roles the champion has pro evidence in, most games first, then the roster's other roles. */
export function rolesOf(id: string, index: DrawerIndex): Role[] {
  const n = new Map<Role, number>();
  for (const g of index.games) for (const r of ROLES) if (g.picks[r] === id) n.set(r, (n.get(r) ?? 0) + 1);
  for (const s of index.stats) if (s.stat.champion === id) for (const r of s.roles) if (!n.has(r)) n.set(r, 0);
  const evidence = [...n.entries()].sort((a, b) => b[1] - a[1] || ROLES.indexOf(a[0]) - ROLES.indexOf(b[0])).map(([r]) => r);
  const roster = (index.champs[id]?.roles ?? []).filter((r) => !n.has(r));
  return [...evidence, ...roster];
}

// ---------- footer actions ----------
export interface DrawerAction { label: string; href: string; primary?: boolean }

/**
 * The bottom actions, by where the drawer opened. At most three; the page the drawer is on never gets a link to
 * itself, and inside the Draft Room a champion is never offered for locking (the candidate row's pick is the one
 * explicit way to change the board). A Pro Drafts game that recorded builds leads with that exact build.
 */
export function drawerActions(ctx: DrawerContext, pick: { id: string; role: Role; inPool: boolean; builds?: ChampionBuilds; gameHasBuilds?: boolean; gameDraft?: string }): DrawerAction[] {
  const { id, role } = pick;
  const builds = pick.builds ? { label: "View Pro Builds", href: buildsLink(id, role, undefined, ctx.from) } : undefined;
  const pool = pick.inPool ? { label: "View in Champion Pool", href: poolHref(id, role) } : undefined;
  const syn = { label: "View Synergies", href: synergiesHref(id, role) };
  const draft = { label: "Use in Draft Room", href: draftHref({ [role]: id }) };
  // Pro Drafts: the open game's build for this champion, in the page's own build panel when the team row is known
  // (gameDraft), else on Pro Builds with that exact game.
  const game = ctx.game && pick.gameHasBuilds ? { label: "Inspect this game's build", href: pick.gameDraft ? proDraftHref(pick.gameDraft, role) : buildsHref(id, role, ctx.game) } : undefined;
  let list: (DrawerAction | undefined)[];
  switch (ctx.page) {
    case "draft": list = [builds, syn, pool]; break;
    case "pool": list = [draft, syn, builds]; break;
    case "synergies": list = [draft, pool, builds]; break;
    case "pro-drafts": list = [game ?? builds, draft, syn]; break;
    case "pro-builds": list = [draft, syn, pool]; break;
    default: list = [draft, pool ?? syn, builds];
  }
  const out = list.filter((a): a is DrawerAction => !!a).slice(0, 3);
  return out.map((a, i) => (i === 0 ? { ...a, primary: true } : a));
}

// ---------- saved partners (Synergy layer) ----------
export interface SavedGroup { label: string; ids: string[]; role: Role; kind: "default" | "alt" | "pro" | "fits" }

/** alan's saved partners for this champion in this role, as the Champion Pool row lists them. */
export function savedPartners(id: string, role: Role, data: DrawerData): SavedGroup[] {
  const partner = PARTNER_ROLE[role];
  if (role === "BOT") {
    const b = data.botPairings.find((x) => x.champion === id);
    return b ? [{ label: "Preferred", ids: b.clashDefault, role: "SUPPORT", kind: "default" }, { label: "Alternatives", ids: handAlts(b), role: "SUPPORT", kind: "alt" },
      { label: "From pro games", ids: b.proAlternatives ?? [], role: "SUPPORT", kind: "pro" },
      { label: "Jungle around", ids: b.surrounding.jungle, role: "JUNGLE", kind: "fits" }, { label: "Mid around", ids: b.surrounding.mid, role: "MID", kind: "fits" }] : [];
  }
  if (role === "SUPPORT") {
    const pref = data.botPairings.filter((b) => b.clashDefault.includes(id)).map((b) => b.champion);
    const alt = data.botPairings.filter((b) => b.alternatives.includes(id) && !b.proAlternatives?.includes(id)).map((b) => b.champion);
    const pro = data.botPairings.filter((b) => b.proAlternatives?.includes(id)).map((b) => b.champion);
    return [{ label: "Preferred with", ids: pref, role: "BOT", kind: "default" }, { label: "Alternative for", ids: alt, role: "BOT", kind: "alt" }, { label: "From pro games", ids: pro, role: "BOT", kind: "pro" }];
  }
  if (role === "TOP") {
    const t = data.topPicks.find((x) => x.champion === id);
    return t ? [{ label: "Jungle", ids: t.surrounding.jungle, role: "JUNGLE", kind: "fits" }, { label: "Mid", ids: t.surrounding.mid, role: "MID", kind: "fits" }] : [];
  }
  const m = data.midJungle.find((x) => x.anchor === id && x.role === role);
  return m ? [{ label: "Primary", ids: m.clashDefault, role: partner, kind: "default" }, { label: "Secondary", ids: handAlts(m), role: partner, kind: "alt" },
    { label: "From pro games", ids: m.proAlternatives ?? [], role: partner, kind: "pro" }] : [];
}

/** Bot + support duos a mid / jungle / top record saves around the champion (Synergy), as pairs. */
export function savedBotShapes(id: string, role: Role, data: DrawerData): { bot: string; support: string }[] {
  if (role === "TOP") return data.topPicks.find((t) => t.champion === id)?.surrounding.botShapes ?? [];
  if (role === "MID" || role === "JUNGLE") return data.midJungle.find((m) => m.anchor === id && m.role === role)?.botShapes ?? [];
  return [];
}

// ---------- one pairing ----------
const TRAITS: [Attr, string][] = [["engage", "Engage"], ["peel", "Peel"], ["frontline", "Frontline"], ["poke", "Poke"], ["lanePressure", "Lane pressure"],
  ["scaling", "Scaling"], ["sustainedDps", "Sustained damage"], ["burst", "Burst"], ["sidePressure", "Side pressure"], ["objectiveControl", "Objective control"]];
export const FLAG_TEXT: Record<Champion["flags"][number], string> = {
  "needs-setup": "needs setup: someone else has to start fights",
  "needs-peel": "needs peel: weak when dived",
  disengage: "has disengage",
};

export interface PairingDetail {
  /** alan's saved link, from either side's record. `pro`: a pro-derived alternative, never hand-saved. */
  saved?: { kind: "default" | "alt" | "fits" | "pro"; text: string; note?: string };
  proposed?: ProposedLink;
  /** A saved read on the record that names the partner (alan's own words). */
  read?: string;
  logic: string[]; // draft logic for the pair, from champion attributes
  gives: string[]; // the partner's strongest traits, "Engage 3"
  tradeoffs: string[];
  games: ProGame[]; // recorded games with both on one team in these roles, newest first
  observed: EvidenceLine[]; // cited pairings without a recorded draft
}

export function pairingDetail(me: { id: string; role: Role }, partner: { id: string; role: Role }, data: DrawerData, index: DrawerIndex): PairingDetail {
  const name = (x: string) => index.names[x] ?? x;
  const slots = Object.fromEntries(ROLES.map((r) => [r, r === me.role ? me.id : r === partner.role ? partner.id : ""])) as Slots;
  const link = savedLinks(me.role, slots, data, name).find((l) => l.role === partner.role);
  // A pro-derived alternative sits in the record's alternatives list but was never hand-saved.
  const bot = me.role === "BOT" ? me.id : partner.role === "BOT" ? partner.id : undefined;
  const sup = me.role === "SUPPORT" ? me.id : partner.role === "SUPPORT" ? partner.id : undefined;
  const botRec = bot && sup ? data.botPairings.find((b) => b.champion === bot) : undefined;
  const mj = (["MID", "JUNGLE"] as const).map((r) => data.midJungle.find((m) => m.anchor === slots[r] && m.role === r)).find((m) => m && m.proAlternatives?.includes(slots[PARTNER_ROLE[m.role]]));
  const proDerived = (botRec && sup && botRec.proAlternatives?.includes(sup)) || !!mj;
  const note = botRec && sup ? botRec.alternativeNotes[sup] : undefined;
  const saved = link ? { kind: proDerived && link.kind === "alt" ? "pro" as const : link.kind, text: link.text.replace(/^Saved (pairing|comp): /, "").replace(/\s*\([^)]*\)$/, ""), note } : undefined;
  const proposed = saved ? undefined : proposedLink(data.proposed, me.id, me.role, partner.id, partner.role);
  // A saved read counts when it names the other champion of the pair.
  const mine = recordFor(me.id, me.role, data), theirs = recordFor(partner.id, partner.role, data);
  const read = [[mine?.playoffRead, name(partner.id)], [theirs?.playoffRead, name(me.id)]].find(([t, n]) => t && n && t.includes(n))?.[0];
  const a = index.champs[me.id], b = index.champs[partner.id];
  const logic = a && b ? synergyParts(a, me.role, [{ role: partner.role, champ: b }]).map((p) => p.text) : [];
  const gives = b ? [...TRAITS].filter(([k]) => b.attrs[k] >= 2).sort((x, y) => b.attrs[y[0]] - b.attrs[x[0]]).slice(0, 3).map(([k, l]) => `${l} ${b.attrs[k]}`) : [];
  const tradeoffs: string[] = [];
  if (b) for (const f of b.flags) if (f !== "disengage") tradeoffs.push(`${b.name} ${FLAG_TEXT[f]}`);
  if (a) for (const f of a.flags) if (f !== "disengage") tradeoffs.push(`${a.name} ${FLAG_TEXT[f]}`);
  const warning = mine && "warning" in mine.logic ? mine.logic.warning : mine && "avoid" in mine.logic ? `Avoid ${mine.logic.avoid}` : undefined;
  if (warning) tradeoffs.push(warning);
  const games = index.games.filter((g) => g.picks[me.role] === me.id && g.picks[partner.role] === partner.id && !g.pending);
  const cited = new Set(games.flatMap((g) => g.sources));
  const observed = observedFor(me.id, me.role, data).filter((o) => o.champion === partner.id && !o.proDraftIds.some((d) => games.some((g) => g.draftId === d)))
    .map((o) => evidenceLine(o, index.events, data.sources)).filter((l) => !l.pairing.sources.every((s) => cited.has(s)));
  return { saved, proposed, read, logic, gives, tradeoffs, games, observed };
}

// ---------- one recorded game ----------
export interface GameDetail {
  game: ProGame;
  gameId: number; // Gol.gg game id, 0 when the game is not named
  draft?: ProDraft; // the champion's team, when the draft is recorded
  other?: ProDraft; // the opponent's draft, only when recorded too
  side?: "blue" | "red";
  won?: boolean;
  hasBuilds: boolean; // data/pro-builds.json has this game
  url?: string;
  verified: boolean;
  checked?: string | null;
}

export function gameDetail(g: ProGame, data: Pick<DrawerData, "proDrafts" | "sources" | "buildGames">): GameDetail {
  const draft = g.draftId ? data.proDrafts.find((d) => d.id === g.draftId) : undefined;
  const other = draft ? data.proDrafts.find((d) => d.id !== draft.id && gameKey(d) === gameKey(draft) && d.team === draft.opponent) : undefined;
  const src = g.sources.map((id) => data.sources[id]).find((s) => s?.type === "golgg-game") ?? (g.gameSource ? data.sources[g.gameSource] : undefined);
  const gameId = Number(/^golgg-(\d+)-(blue|red)$/.exec(g.draftId ?? "")?.[1] ?? 0) || (draft ? golggGameId(draft) : 0) || Number(/^golgg-game-(\d+)$/.exec(g.gameSource ?? "")?.[1] ?? 0);
  return {
    game: g, gameId, draft, other, side: draft?.side, won: draft?.won, hasBuilds: !!gameId && data.buildGames.includes(gameId),
    url: src?.url, verified: src?.refreshStatus === "verified", checked: src?.lastChecked,
  };
}

// ---------- one patch of the priority history ----------
export interface PatchStats {
  point: HistoryPoint;
  events: { id: string; short: string; games: number; table: boolean; ongoing: boolean }[];
  teams: { team: string; picks: number; wins: number }[];
  order?: OrderStats;
}

export function patchStats(priority: PriorityData, id: string, point: HistoryPoint): PatchStats {
  const b = bucket(priority, { patch: point.patch });
  const events = priority.contributions.filter((c) => c.patch === point.patch).map((c) => {
    const t = priority.tournaments.find((x) => x.id === c.event);
    return { id: c.event, short: t?.short ?? c.event, games: c.games, table: c.kind === "table", ongoing: t?.status === "ongoing" };
  });
  const order = point.row?.order.known ? point.row.order : undefined;
  return { point, events, teams: teamsFor(b, id), order };
}
