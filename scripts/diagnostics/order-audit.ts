// Diagnostic only: are the site's game lists newest first? (order audit, 2026-10-24). Not imported by the site.
// Usage: npx tsx --conditions=react-server scripts/diagnostics/order-audit.ts
import { getMeta, getProDrafts, getBotPairings, getSources } from "../../lib/data";
import { proGames } from "../../lib/pool-stats";
import { hubData, recentDrafts } from "../../lib/meta-hub";
const input = { meta: getMeta(), proDrafts: getProDrafts(), botPairings: getBotPairings(), sources: Object.fromEntries(getSources().map((s) => [s.id, s])) } as any;
const g = proGames(input);
console.log("== proGames (drawer, Pool, Meta)"); g.slice(0, 18).forEach((x) => console.log("  ", x.date, x.patch, x.eventName, x.label, x.gameSource));
const r = recentDrafts(hubData(input));
console.log("== Meta recent drafts"); r.slice(0, 10).forEach((x) => console.log("  ", x.date, x.eventName, x.sides.map((s) => s.label).join(" / "), x.key));
import { newestGamesFirst, recordStamp } from "../../lib/chronology";
const bad = (name: string, rows: { date?: string }[]) => {
  const out = rows.map((x, i) => [i, x] as const).filter(([i, x]) => i && (rows[i - 1].date ?? "") < (x.date ?? "") && x.date);
  console.log(name, rows.length, "rows,", out.length, "date inversions", out.slice(0, 5).map(([i, x]) => `${rows[i - 1].date} above ${x.date} at ${i}`));
};
bad("proGames", g);
bad("recentDrafts", r);
console.log("== LCK rows"); g.filter((x) => x.eventName.includes("LCK")).slice(0, 50).forEach((x) => console.log("  ", x.date, x.label, x.gameSource));
