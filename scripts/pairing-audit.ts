// Pairing audit (alan, 2026-11-13): every same-team pairing in the recorded games, by role pair, against the saved
// Synergy records. Read-only; prints a report. Run: npx tsx scripts/pairing-audit.ts [--role BOT+SUPPORT]
import { getBotPairings, getMidJungle, getPairGames, getTopPicks } from "../lib/data";
import { evidenceOf, newestPatchOf, type PairGame } from "../lib/pairings";
import { patchLabel } from "../lib/patch";
import type { Role } from "../lib/schema";

const rows = getPairGames();
const newest = newestPatchOf(rows);
const games = new Set(rows.map((r) => r.game)).size;
console.log(`${games} games, ${rows.length} team drafts, newest patch ${patchLabel(newest)}`);
const PAIRS: [Role, Role][] = [["BOT", "SUPPORT"], ["MID", "JUNGLE"], ["TOP", "JUNGLE"], ["TOP", "MID"]];
const bots = getBotPairings(), mj = getMidJungle(), top = getTopPicks();
function saved(a: Role, x: string, b: Role, y: string): string | undefined {
  if (a === "BOT") { const r = bots.find((p) => p.champion === x); return r?.clashDefault.includes(y) ? "default" : r?.proAlternatives?.includes(y) ? "pro-alt" : r?.alternatives.includes(y) ? "alt" : undefined; }
  if (a === "MID") {
    for (const [anchor, role, partner] of [[x, "MID", y], [y, "JUNGLE", x]] as const) {
      const r = mj.find((m) => m.anchor === anchor && m.role === role);
      if (r?.clashDefault.includes(partner)) return `default(${role})`;
      if (r?.proAlternatives?.includes(partner)) return `pro-alt(${role})`;
      if (r?.alternatives.includes(partner)) return `alt(${role})`;
    }
    return undefined;
  }
  const t = top.find((p) => p.champion === x);
  return t?.surrounding[b === "JUNGLE" ? "jungle" : "mid"].includes(y) ? "saved" : undefined;
}
for (const [a, b] of PAIRS) {
  const by = new Map<string, PairGame[]>();
  for (const r of rows) if (r.picks[a] && r.picks[b]) { const k = `${r.picks[a]}|${r.picks[b]}`; by.set(k, [...(by.get(k) ?? []), r]); }
  const list = [...by.entries()].map(([k, l]) => ({ k, e: evidenceOf(k.split("|")[1], l, newest) })).sort((p, q) => q.e.teams.length - p.e.teams.length || q.e.games.length - p.e.games.length);
  console.log(`\n== ${a} + ${b}: ${list.length} distinct pairs`);
  const fresh = list.filter((x) => !saved(a, x.k.split("|")[0], b, x.k.split("|")[1]) && x.e.teams.length >= 2);
  console.log(`New, not saved, 2+ teams: ${fresh.length}`);
  for (const x of fresh.slice(0, 15)) console.log(`  ${x.k.replace("|", " + ")}: ${x.e.games.length} games, ${x.e.teams.length} teams, ${x.e.series} series, ${x.e.wins}-${x.e.losses}, ${x.e.current} on ${patchLabel(newest)}; ids ${x.e.games.map((g) => g.game).join(" ")}`);
}
