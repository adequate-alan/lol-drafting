#!/usr/bin/env node
// Load a Gol.gg tournament's aggregate tables into data/meta.json: the picks-and-bans table (picks, bans, wins per
// champion) and the match list (total games). These are tournament aggregates only: nothing here reads or writes the
// recorded drafts, saved pairings or pool tiers, and nothing is inferred from recorded games.
//
//   node scripts/import-golgg-tournament.mjs --event <meta event id> --picks <page.html|table.json>
//        [--matchlist <page.html|matches.json>] [--games N] [--checked YYYY-MM-DD] [--verified] [--write]
//
// Gol.gg is unreachable from Claude's cloud environments, so the pages are saved elsewhere (alan's Mac) and passed in.
// --verified marks the sources as re-read by Claude (refreshStatus "verified"); leave it off for pages a person supplied.
// Without --write it prints what would change and touches nothing.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]);
  return acc;
}, []));
const fail = (m) => { console.error(m); process.exit(1); };
if (!args.event || !args.picks) fail("usage: --event <id> --picks <file> [--matchlist <file>] [--games N] [--checked YYYY-MM-DD] [--verified] [--write]");

const dataDir = join(process.cwd(), "data");
const read = (f) => JSON.parse(readFileSync(join(dataDir, f), "utf8"));
const meta = read("meta.json"), sources = read("sources.json"), champions = read("champions.json");
const event = meta.events.find((e) => e.id === args.event) ?? fail(`unknown event ${args.event}`);
const isMain = event.name === meta.tournament.name;

// ---------- parsing ----------
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const text = (html) => decode(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

/** Every table as { head: string[], rows: { cells: string[], raw: string[] }[] }. */
function tables(html) {
  return [...html.matchAll(/<table[\s\S]*?<\/table>/gi)].map(([t]) => {
    const trs = [...t.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map(([tr]) => [...tr.matchAll(/<t([hd])[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) => ({ th: m[1].toLowerCase() === "h", raw: m[2] })));
    const headRow = trs.find((r) => r.length && r.every((c) => c.th)) ?? [];
    return { head: headRow.map((c) => text(c.raw)), rows: trs.filter((r) => r !== headRow && r.some((c) => !c.th)).map((r) => ({ cells: r.map((c) => text(c.raw)), raw: r.map((c) => c.raw) })) };
  });
}

const num = (s) => { const m = String(s ?? "").replace(/,/g, "").match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : undefined; };

function parsePicks(file) {
  const src = readFileSync(file, "utf8");
  if (file.endsWith(".json")) {
    const j = JSON.parse(src);
    // A saved page dump ({ totalGames, sources: { championlist, picksandbans, matchlist }, champions: [...] }) or a bare
    // list. Rows with no pick and no ban are the champion list's zeros and carry nothing.
    const list = Array.isArray(j) ? j : j.champions ?? j.rows;
    return { totalGames: j.totalGames ?? j.games, urls: j.sources, fetchedAt: j.fetchedAt, head: j.headers,
      rows: list.map((r) => ({ name: r.champion ?? r.name, picks: num(r.picks), bans: num(r.bans), wins: num(r.wins), losses: num(r.losses), winRate: num(r.winRate ?? r.winrate ?? r.winRateShown) }))
        .filter((r) => (r.picks ?? 0) + (r.bans ?? 0) > 0) };
  }
  const t = tables(src).find((x) => x.head.some((h) => /^picks?$/i.test(h)) && x.head.some((h) => /^bans?$/i.test(h)));
  if (!t) fail(`${file}: no table with Picks and Bans columns`);
  const col = (re) => t.head.findIndex((h) => re.test(h));
  const c = { name: Math.max(col(/champion/i), 0), picks: col(/^picks?$/i), bans: col(/^bans?$/i), wins: col(/^wins?$/i), losses: col(/^loss/i), wr: col(/win ?rate|^wr$/i) };
  const rows = t.rows.map((r) => {
    // The champion cell is often an icon link; its title or alt carries the name when the text is empty.
    const name = r.cells[c.name] || decode((r.raw[c.name].match(/(?:title|alt)=["']([^"']+)["']/i) ?? [])[1] ?? "").replace(/ stats$/i, "");
    return { name, picks: num(r.cells[c.picks]), bans: num(r.cells[c.bans]), wins: c.wins >= 0 ? num(r.cells[c.wins]) : undefined,
      losses: c.losses >= 0 ? num(r.cells[c.losses]) : undefined, winRate: c.wr >= 0 ? num(r.cells[c.wr]) : undefined };
  }).filter((r) => r.name);
  const games = src.match(/(\d+)\s+games?\b/i);
  return { head: t.head, rows, pageGames: games ? Number(games[1]) : undefined };
}

function parseMatchlist(file) {
  const src = readFileSync(file, "utf8");
  if (file.endsWith(".json")) {
    const j = JSON.parse(src);
    if (j.totalGames != null) return { totalGames: j.totalGames, matches: j.matches?.length };
    const list = Array.isArray(j) ? j : j.matches;
    return { totalGames: list.reduce((n, m) => n + (m.games ?? (num(m.scoreA) ?? 0) + (num(m.scoreB) ?? 0)), 0), matches: list.length };
  }
  // Each series row shows its score as "3 - 1"; total games is the sum of both sides over every series.
  let total = 0, matches = 0;
  const patches = new Set(), dates = [];
  for (const t of tables(src)) for (const r of t.rows) {
    const score = r.cells.find((x) => /^\d+\s*-\s*\d+$/.test(x));
    if (!score) continue;
    const [a, b] = score.split("-").map(Number);
    total += a + b; matches += 1;
    for (const x of r.cells) { if (/^\d+\.\d+$/.test(x)) patches.add(x); const d = x.match(/\d{4}-\d{2}-\d{2}/); if (d) dates.push(d[0]); }
  }
  dates.sort();
  return { totalGames: total, matches, patches: [...patches], firstDate: dates[0], lastDate: dates.at(-1) };
}

// ---------- champion names ----------
const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
const byName = new Map();
for (const c of champions) for (const n of [c.id, c.name, ...(c.aliases ?? [])]) byName.set(norm(n), c.id);
byName.set("nunu", "nunu"); byName.set("wukong", byName.get("wukong") ?? "wukong");

// ---------- merge ----------
const picks = parsePicks(args.picks);
const ml = args.matchlist ? parseMatchlist(args.matchlist) : undefined;
const games = args.games ? Number(args.games) : ml?.totalGames ?? picks.totalGames;
const report = { event: event.id, columns: picks.head, rows: picks.rows.length, matchlist: ml, totalGames: games, pageGames: picks.pageGames, unmatched: [], changes: [], dropped: [], warnings: [] };
if (!games) report.warnings.push("No total game count: presence stays empty. Pass --matchlist or --games.");
if (ml && picks.pageGames && picks.pageGames !== ml.totalGames) report.warnings.push(`Picks page says ${picks.pageGames} games, match list sums to ${ml.totalGames}.`);
if (isMain && games && games !== meta.tournament.games) report.warnings.push(`meta.tournament.games changes ${meta.tournament.games} -> ${games}.`);

const day = args.checked && args.checked !== true ? args.checked : (picks.fetchedAt ?? new Date().toISOString()).slice(0, 10);
if (games && picks.rows.length) {
  // Every game has 10 picks and (in pro play) 10 bans, so the table must add up to the game count.
  const sp = picks.rows.reduce((n, r) => n + r.picks, 0), sb = picks.rows.reduce((n, r) => n + r.bans, 0);
  if (sp !== 10 * games) report.warnings.push(`Picks add up to ${sp}, expected ${10 * games} for ${games} games.`);
  if (sb !== 10 * games) report.warnings.push(`Bans add up to ${sb}, expected ${10 * games} for ${games} games.`);
}
const slug = isMain ? "" : `-${event.id}`;
const ensureSource = (kind, url) => {
  const id = `golgg-tournament-${kind}${slug}`;
  let s = sources.find((x) => x.id === id);
  if (!s) { s = { id, url, type: "golgg-tournament", tournament: event.name, patch: event.patch }; sources.push(s); }
  if (args.verified) Object.assign(s, { lastChecked: day, refreshStatus: "verified", origin: "golgg-refresh" });
  else Object.assign(s, { lastChecked: null, refreshStatus: "not-refreshed", origin: s.origin ?? "externally-provided" });
  return id;
};
const enc = encodeURIComponent(event.name);
const urls = picks.urls ?? {};
const pbId = ensureSource("picksandbans", urls.picksandbans ?? `https://gol.gg/tournament/tournament-picksandbans/${enc}/`);
const mlId = ml || urls.matchlist ? ensureSource("matchlist", urls.matchlist ?? `https://gol.gg/tournament/tournament-matchlist/${enc}/`) : undefined;
// The table with wins and losses is Gol.gg's tournament champion list; the picks-and-bans page only has tooltips.
const clId = urls.championlist ? ensureSource("championlist", urls.championlist) : undefined;
const statSources = clId ? [clId, pbId] : [pbId];

const list = isMain ? meta.stats : event.stats;
const next = [];
for (const r of picks.rows) {
  const id = byName.get(norm(r.name));
  if (!id) { report.unmatched.push(r.name); continue; }
  if (r.picks == null || r.bans == null) { report.warnings.push(`${r.name}: missing picks or bans`); continue; }
  const wins = r.wins ?? (r.winRate != null && r.picks ? Math.round((r.winRate > 1 ? r.winRate / 100 : r.winRate) * r.picks) : undefined);
  if (r.wins != null && r.losses != null && r.wins + r.losses !== r.picks) report.warnings.push(`${r.name}: wins ${r.wins} + losses ${r.losses} != picks ${r.picks}`);
  if (wins == null && r.picks) report.warnings.push(`${r.name}: no wins or win rate`);
  const old = list.find((s) => s.champion === id);
  const stat = {
    champion: id, ...(old?.role ? { role: old.role } : {}), ...(old?.flexRole ? { flexRole: old.flexRole } : {}),
    picks: r.picks, bans: r.bans, ...(wins != null ? { wins } : {}), winRate: r.picks && wins != null ? Math.round((wins / r.picks) * 10000) / 10000 : null,
    lowSample: r.picks < 5, ...(old?.rolePicks ? { rolePicks: old.rolePicks } : {}),
    ...(old?.priorityRead ? { priorityRead: old.priorityRead } : {}), ...(old?.note ? { note: old.note } : {}),
    sources: statSources,
  };
  if (old && (old.picks !== stat.picks || old.bans !== stat.bans || Math.abs((old.winRate ?? 0) - (stat.winRate ?? 0)) > 0.005)) {
    report.changes.push(`${id}: ${old.picks}/${old.bans ?? "-"}/${old.winRate ?? "-"} -> ${stat.picks}/${stat.bans}/${stat.winRate ?? "-"}`);
  }
  next.push(stat);
}
for (const old of list) if (!next.some((s) => s.champion === old.champion)) report.dropped.push(old.champion);
// A champion we had that the table lacks is kept, not deleted, and reported for a person to look at.
for (const old of list) if (!next.some((s) => s.champion === old.champion)) next.push(old);
next.sort((a, b) => b.picks + (b.bans ?? 0) - (a.picks + (a.bans ?? 0)) || a.champion.localeCompare(b.champion));

console.log(JSON.stringify(report, null, 2));
if (report.unmatched.length) fail(`Unmatched champion names: ${report.unmatched.join(", ")}. Add an alias in data/champions.json, then re-run.`);
if (!args.write) { console.log("Dry run: nothing written. Add --write to apply."); process.exit(0); }

if (isMain) { meta.stats = next; if (games) meta.tournament.games = games; }
else event.stats = next;
if (games) event.games = games;
event.statsComplete = report.dropped.length === 0;
event.sources = [...new Set([...(clId ? [clId] : []), pbId, ...(mlId ? [mlId] : []), ...event.sources])];
writeFileSync(join(dataDir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
writeFileSync(join(dataDir, "sources.json"), JSON.stringify(sources, null, 2) + "\n");
console.log(`Wrote ${next.length} stats for ${event.id}${games ? ` (${games} games)` : ""}.`);
