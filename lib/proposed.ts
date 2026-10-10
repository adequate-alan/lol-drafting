// Synergy · Proposed (alan, 2026-10-10): Claude's kit-based partners for every champion and role, so a champion with
// little or no pro play (Fizz, Nunu & Willump, Shaco) still gets useful partners. Kept apart from alan's Confirmed
// records (bot-pairings / mid-jungle / top):
//   - never a saved default or alternative, and never part of the bot → support eligibility rule (savedSupports);
//   - a smaller draft-fit bonus than any saved link (lib/recommend.ts), always labelled "Proposed · kit-based";
//   - a pair alan already saved, or a pro-derived alternative, is dropped here, so a pairing is never both.
// Synergy is symmetric: a record for Nunu listing Fizz as a mid partner also reads as Nunu for Fizz.
import type { LinkData } from "./comp-links";
import type { ProposedConfidence, ProposedRecord, ProposedSynergy, Role } from "./schema";

export type ProposedTier = "preferred" | "alt";
export interface ProposedLink {
  id: string; // the partner
  role: Role; // the partner's role
  tier: ProposedTier;
  confidence: ProposedConfidence;
  reason: string;
  reverse: boolean; // read off the partner's own record
}

export const PROPOSED_LABEL = "Proposed · kit-based";
export const CONFIDENCE_LABEL: Record<ProposedConfidence, string> = { strong: "Strong kit fit", moderate: "Moderate kit fit", provisional: "Provisional" };
const CONF_RANK: Record<ProposedConfidence, number> = { strong: 0, moderate: 1, provisional: 2 };

/** True when one of alan's confirmed records (or a pro-derived alternative on one) already links the two picks. */
export function confirmedLink(a: string, ra: Role, b: string, rb: Role, data: LinkData): boolean {
  const pair = (x: Role, y: Role) => (ra === x && rb === y) || (ra === y && rb === x);
  const get = (r: Role) => (ra === r ? a : b);
  if (pair("BOT", "SUPPORT")) {
    const rec = data.botPairings.find((p) => p.champion === get("BOT"));
    return !!rec && [...rec.clashDefault, ...rec.alternatives].includes(get("SUPPORT"));
  }
  if (pair("MID", "JUNGLE")) {
    return (["MID", "JUNGLE"] as const).some((r) => {
      const rec = data.midJungle.find((m) => m.anchor === get(r) && m.role === r);
      return !!rec && [...rec.clashDefault, ...rec.alternatives].includes(get(r === "MID" ? "JUNGLE" : "MID"));
    });
  }
  if (pair("TOP", "JUNGLE") || pair("TOP", "MID")) {
    const other = ra === "TOP" ? rb : ra;
    const rec = data.topPicks.find((t) => t.champion === get("TOP"));
    return !!rec && rec.surrounding[other === "JUNGLE" ? "jungle" : "mid"].includes(get(other));
  }
  return false;
}

/** The proposed records with every pairing alan already confirmed removed (groups left empty drop out). */
export function withoutConfirmed(p: ProposedSynergy, data: LinkData): ProposedSynergy {
  const records = p.records.map((r): ProposedRecord => ({
    ...r,
    partners: r.partners.map((g) => {
      const keep = (x: { id: string }) => !confirmedLink(r.champion, r.role, x.id, g.role, data);
      return { ...g, preferred: g.preferred.filter(keep), alternatives: g.alternatives.filter(keep) };
    }).filter((g) => g.preferred.length || g.alternatives.length)
      // a group whose preferred partners were all confirmed keeps its alternatives as the proposed set
      .map((g) => (g.preferred.length ? g : { ...g, preferred: g.alternatives, alternatives: [] })),
  }));
  return { ...p, records };
}

export const recordOf = (records: ProposedRecord[], id: string, role: Role) => records.find((r) => r.champion === id && r.role === role);

/** Every proposed partner of a champion in a role, own record first, then other records that name it. */
export function proposedPartners(records: ProposedRecord[], id: string, role: Role, partnerRole?: Role): ProposedLink[] {
  const out: ProposedLink[] = [];
  const seen = new Set<string>();
  const push = (l: ProposedLink) => { const k = `${l.id}|${l.role}`; if (!seen.has(k)) { seen.add(k); out.push(l); } };
  const own = recordOf(records, id, role);
  for (const g of own?.partners ?? []) {
    if (partnerRole && g.role !== partnerRole) continue;
    for (const [tier, list] of [["preferred", g.preferred], ["alt", g.alternatives]] as const)
      for (const p of list) push({ id: p.id, role: g.role, tier, confidence: p.confidence, reason: p.reason, reverse: false });
  }
  for (const r of records) {
    if (r.champion === id || (partnerRole && r.role !== partnerRole)) continue;
    for (const g of r.partners) {
      if (g.role !== role) continue;
      for (const [tier, list] of [["preferred", g.preferred], ["alt", g.alternatives]] as const)
        for (const p of list) if (p.id === id) push({ id: r.champion, role: r.role, tier, confidence: p.confidence, reason: p.reason, reverse: true });
    }
  }
  return out.sort((x, y) => Number(x.reverse) - Number(y.reverse) || (x.tier === y.tier ? 0 : x.tier === "preferred" ? -1 : 1) || CONF_RANK[x.confidence] - CONF_RANK[y.confidence]);
}

/** The proposed link between two picks, either direction. A preferred link on either side wins. */
export function proposedLink(records: ProposedRecord[], a: string, ra: Role, b: string, rb: Role): ProposedLink | undefined {
  return proposedPartners(records, a, ra, rb).filter((l) => l.id === b).sort((x, y) => (x.tier === y.tier ? 0 : x.tier === "preferred" ? -1 : 1))[0];
}

/** Partner roles a role's profile covers, most important first (alan's brief: bot ↔ support, mid ↔ jungle, jungle ↔ top). */
export const PARTNER_ROLES: Record<Role, Role[]> = { BOT: ["SUPPORT"], SUPPORT: ["BOT", "JUNGLE"], MID: ["JUNGLE", "TOP"], JUNGLE: ["MID", "TOP", "SUPPORT"], TOP: ["JUNGLE", "MID"] };

/** alan's confirmed links that reach this champion from other records (a support has no record of its own: its
 *  confirmed bots are the bot records that list it). */
export function confirmedReverse(id: string, role: Role, data: LinkData): { label: string; ids: string[]; role: Role }[] {
  const out: { label: string; ids: string[]; role: Role }[] = [];
  const add = (label: string, ids: string[], r: Role) => { if (ids.length) out.push({ label, ids, role: r }); };
  if (role === "SUPPORT") {
    add("Preferred with", data.botPairings.filter((b) => b.clashDefault.includes(id)).map((b) => b.champion), "BOT");
    add("Alternative for", data.botPairings.filter((b) => b.alternatives.includes(id) && !b.proAlternatives?.includes(id)).map((b) => b.champion), "BOT");
  }
  if (role === "MID" || role === "JUNGLE") {
    const other: Role = role === "MID" ? "JUNGLE" : "MID";
    add("Primary for", data.midJungle.filter((m) => m.role === other && m.clashDefault.includes(id)).map((m) => m.anchor), other);
    add("Secondary for", data.midJungle.filter((m) => m.role === other && m.alternatives.includes(id) && !m.proAlternatives?.includes(id)).map((m) => m.anchor), other);
    add("Fits around (top)", data.topPicks.filter((t) => t.surrounding[role === "MID" ? "mid" : "jungle"].includes(id)).map((t) => t.champion), "TOP");
  }
  return out;
}

export interface ProposedCard {
  kind: "proposed";
  id: string;
  role: Role;
  identity?: string; // the proposed record's draft identity (Claude's read)
  links: ProposedLink[];
  confirmed: { label: string; ids: string[]; role: Role }[];
}

/** A First Pick / Draft Room profile for a champion and role, built from the proposed layer plus any confirmed links. */
export function proposedCard(id: string, role: Role, records: ProposedRecord[], data: LinkData): ProposedCard {
  const order = PARTNER_ROLES[role];
  const at = (r: Role) => (order.includes(r) ? order.indexOf(r) : order.length);
  const links = proposedPartners(records, id, role).sort((a, b) => at(a.role) - at(b.role));
  return { kind: "proposed", id, role, identity: recordOf(records, id, role)?.identity, links, confirmed: confirmedReverse(id, role, data) };
}

/** Proposed partners to show on a champion's profile. A bot's saved record alone decides its supports (alan's hard
 *  rule), so a saved bot never lists proposed supports; the support's own profile still shows the proposal. */
export function shownPartners(records: ProposedRecord[], id: string, role: Role, savedBots: { champion: string }[]): ProposedLink[] {
  const links = proposedPartners(records, id, role);
  return role === "BOT" && savedBots.some((b) => b.champion === id) ? links.filter((l) => l.role !== "SUPPORT") : links;
}
