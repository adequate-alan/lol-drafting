// Diagnostic only (Worlds Swiss review, 2026-10-23): Swiss vs Play-In pro priority, first rotation, blind picks,
// Mid/Jungle and Bot/Support pairs, and the plan-aware read of every Swiss lineup. Nothing here is imported by the site.
// Usage: npx tsx scripts/diagnostics/worlds-review.ts out.json
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bucket, priorityData } from "../../lib/pro-priority";
import { laneSelections, roleBook, LANE_ROLES } from "../../lib/top-draft";
import { analyzePlan } from "../../lib/model-v2/plan";
import { Files } from "../../lib/schema";
import { kits, nameOf, champions } from "./load";
import { scopeKey } from "../../lib/tournament-scope";

const raw = (f: string) => JSON.parse(readFileSync(join(process.cwd(), "data", f), "utf8"));
const meta = Files["meta.json"].parse(raw("meta.json"));
const pg = Files["pro-games.json"].parse(raw("pro-games.json"));
const drafts = raw("pro-drafts.json");
const d = priorityData(meta, pg, drafts);
const SC = { swiss: "worlds-2026:swiss", playin: "worlds-2026-play-in", worlds: "worlds-2026-all" } as const;
const out: Record<string, unknown> = {};
for (const [k, t] of Object.entries(SC)) {
  const b = bucket(d, { patch: "16.20", tournaments: [t] });
  out[k] = { games: b.games, banGames: b.banGames, orderGames: b.orderGames, rows: b.rows.map((r) => ({ id: r.id, name: nameOf(r.id), picks: r.picks, bans: r.bans, presence: r.presence, wins: r.wins, rolePicks: r.rolePicks, first: r.order.firstRotation, known: r.order.known, firstPick: r.order.firstPick })) };
}
const games = pg.games.filter((g) => g.event.startsWith("worlds-2026"));
const book = roleBook(champions, pg.games);
const phase = (g: { event: string; stage?: string }) => scopeKey(g.event, g.stage) === SC.swiss ? "swiss" : g.event === SC.playin ? "playin" : "other";
const sel: Record<string, unknown[]> = {};
for (const role of LANE_ROLES) sel[role] = laneSelections(games, book, role).map((s) => ({ phase: phase(s), champ: nameOf(s.champion), team: s.team, opp: s.laneOpponent && nameOf(s.laneOpponent), usage: s.usage, turn: s.turn, rotation: s.rotation, why: s.why, game: s.game }));
out.selections = sel;
const pairs = (a: "MID" | "BOT", b: "JUNGLE" | "SUPPORT") => games.flatMap((g) => (["blue", "red"] as const).map((side) => ({ phase: phase(g), pair: `${nameOf(g[side].picks[a])} + ${nameOf(g[side].picks[b])}`, team: g[side].team, won: g.winner === side, game: g.id })));
out.midJungle = pairs("MID", "JUNGLE"); out.botSupport = pairs("BOT", "SUPPORT");
out.swissLineups = games.filter((g) => phase(g) === "swiss").flatMap((g) => (["blue", "red"] as const).map((side) => {
  const other = side === "blue" ? "red" : "blue";
  const r = analyzePlan(g[side].picks, kits, Object.values(g[other].picks));
  return { game: g.id, side, team: g[side].team, opp: g[other].team, won: g.winner === side, first: g.firstPick === side, url: g.url, date: g.date,
    picks: Object.fromEntries(Object.entries(g[side].picks).map(([k, v]) => [k, nameOf(v)])), bans: g[side].bans.map(nameOf),
    order: g[side].pickOrder?.map(nameOf), headline: r.headline, primary: r.identity.primary?.id, secondary: r.identity.secondary?.id, win: r.winCondition,
    critical: r.critical.map((x) => x.label), weak: r.weaknesses.map((x) => `${x.tier}: ${x.label}`), accepted: r.accepted.map((x) => x.label) };
}));
writeFileSync(process.argv[2] ?? "worlds-review.json", JSON.stringify(out, null, 1));
console.log("ok", (out.swiss as { games: number }).games, (out.playin as { games: number }).games);
