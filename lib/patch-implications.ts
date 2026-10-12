// Draft implications of a champion's patch change: analysis, shown apart from Riot's facts and labelled as such. It
// only connects the change to what this site already holds (alan's saved pairings and pool tiers, recorded pro games
// and tournament aggregates by patch) and never changes any of them: a patch never edits a saved pairing, a pool tier
// or the draft-fit score.
import { comparePatch, patchKey } from "./patch";
import { TIERS, eventStats, presenceOf, proGames, type PoolInput } from "./pool-stats";
import type { BotPairing, MidJunglePairing, TopPick } from "./schema";
import { handAlts } from "./pro-alternatives";

export interface ImplicationInput extends PoolInput { midJungle: MidJunglePairing[]; topPicks: TopPick[] }
export interface Implications { saved: string[]; pool: string[]; pro: string[] }

const list = (ids: string[], name: (id: string) => string) => ids.map(name).join(", ");
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Precomputed once per build: the pro games and tournament stats every champion's implications read. */
export function implicationContext(input: ImplicationInput) {
  const games = proGames(input);
  return { input, games, stats: eventStats(input.meta, games) };
}
export type ImplicationContext = ReturnType<typeof implicationContext>;

export function implicationsFor(id: string, patch: string, ctx: ImplicationContext, name: (id: string) => string): Implications {
  const { input } = ctx;
  const saved: string[] = [];
  const bot = input.botPairings.find((b) => b.champion === id);
  if (bot) saved.push(`Saved bot record: ${list(bot.clashDefault, name)} preferred${handAlts(bot).length ? `; ${list(handAlts(bot), name)} alternative` : ""}.`);
  const supportFor = (key: (b: BotPairing) => string[]) => input.botPairings.filter((b) => key(b).includes(id)).map((b) => b.champion);
  const prefFor = supportFor((b) => b.clashDefault), altFor = supportFor(handAlts);
  if (prefFor.length) saved.push(`Preferred support for ${list(prefFor, name)}.`);
  if (altFor.length) saved.push(`Saved alternative support for ${list(altFor, name)}.`);
  for (const m of input.midJungle.filter((r) => r.anchor === id))
    saved.push(`Saved ${m.role.toLowerCase()} record: ${list(m.clashDefault, name)} primary${handAlts(m).length ? `; ${list(handAlts(m), name)} secondary` : ""}.`);
  const partnerOf = input.midJungle.filter((r) => r.anchor !== id && (r.clashDefault.includes(id) || handAlts(r).includes(id)));
  if (partnerOf.length) saved.push(`Saved partner for ${partnerOf.map((r) => `${name(r.anchor)} ${r.role.toLowerCase()}`).join(", ")}.`);
  const top = input.topPicks.find((t: TopPick) => t.champion === id);
  if (top) saved.push(`Saved top record with ${list([...top.surrounding.jungle, ...top.surrounding.mid], name)}.`);

  const pool: string[] = [];
  for (const p of input.pool) for (const [t, label] of TIERS) if (p[t].includes(id)) pool.push(`${label} ${p.role.toLowerCase()}`);

  // Recorded games (stored drafts) before this patch and from it on, counted apart from tournament aggregates.
  const pro: string[] = [];
  const mine = ctx.games.filter((g) => Object.values(g.picks).includes(id) && g.patch);
  const before = mine.filter((g) => comparePatch(g.patch!, patch) < 0), after = mine.filter((g) => comparePatch(g.patch!, patch) >= 0);
  if (mine.length) pro.push(`Recorded pro games: ${before.length} before ${patchKey(patch)}, ${after.length} on ${patchKey(patch)} or later.`);
  // Tournament aggregates by event patch: presence is (picks + bans) / games, champion-wide.
  const stats = ctx.stats.filter((s) => s.stat.champion === id).sort((a, b) => comparePatch(a.event.patch, b.event.patch));
  if (stats.length) pro.push(`Tournament presence: ${stats.map((s) => {
    const pres = presenceOf(s);
    return `${s.event.short} (${patchKey(s.event.patch)}) ${pres != null ? pct(pres) : "—"}${s.stat.lowSample ? "*" : ""}`;
  }).join(" · ")}${stats.some((s) => s.stat.lowSample) ? " (* fewer than 5 picks)" : ""}.`);
  return { saved, pool, pro };
}
