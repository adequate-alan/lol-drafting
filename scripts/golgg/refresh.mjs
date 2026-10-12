// The daily pro-data refresh: checks the tournaments listed in data/pro-games.json `tracked` on Gol.gg, imports every
// completed game not yet recorded, and refreshes the tournament aggregates. Pure over its inputs: the caller passes the
// data files and a fetch function (real HTTP in the workflow, saved pages in tests) and writes what comes back.
//
// Only tracked tournaments are ever requested, by their exact Gol.gg names. A finished tournament is not requested again.
// Saved pairings, pool tiers and proposed synergy are not inputs and cannot change here.
import { parseChampionTable, parseFullstats, parseGamePage, parseMatchlist } from "./parse.mjs";
import { buildAggregates, buildGame, championResolver, gameUrl, isComplete, pickOrderFor, seriesProblems, GOLGG } from "./normalize.mjs";

const enc = encodeURIComponent;
export const urls = {
  list: `${GOLGG}/tournament/ajax.trlist.php`,
  matchlist: (name) => `${GOLGG}/tournament/tournament-matchlist/${enc(name)}/`,
  championlist: (name) => `${GOLGG}/champion/list/season-ALL/split-ALL/tournament-${enc(name)}/`,
  picksandbans: (name) => `${GOLGG}/tournament/tournament-picksandbans/${enc(name)}/`,
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = (x) => JSON.parse(JSON.stringify(x));

/**
 * @param data { proGames, meta, sources, champions, botPairings }  parsed data files (not modified)
 * @param get  async (url, { method?, body? }) => string   throws on a network or HTTP error
 * @returns { proGames, meta, sources, changed: string[], report: string[], rejected: string[] }
 */
export async function refresh(data, get, { now = new Date() } = {}) {
  const today = now.toISOString().slice(0, 10);
  const proGames = clone(data.proGames), meta = clone(data.meta), sources = clone(data.sources);
  const resolve = championResolver(data.champions);
  const report = [], rejected = [], changed = new Set();

  const open = proGames.tracked.filter((t) => proGames.tournaments.find((x) => x.event === t.event)?.status !== "complete");
  for (const t of proGames.tracked) if (!open.includes(t)) report.push(`${t.label}: finished, not requested again.`);
  if (!open.length) return { proGames, meta, sources, changed: [], report, rejected };

  // Which tracked names Gol.gg lists this season (one request for every tournament).
  const listed = JSON.parse(await get(urls.list, { method: "POST", body: `season=S${Number(today.slice(0, 4)) - 2010}` }));
  if (!Array.isArray(listed)) throw new Error("Gol.gg tournament list is not a list");
  const listedNames = new Set(listed.map((x) => x.trname));

  for (const t of open) {
    const names = t.names.filter((n) => listedNames.has(n));
    if (!names.length) { report.push(`${t.label}: not listed on Gol.gg yet.`); continue; }
    if (names.length > 1) { rejected.push(`${t.label}: several Gol.gg tournaments match (${names.join(", ")}); skipped.`); continue; }
    const name = names[0];
    const before = clone({ games: proGames.games.filter((g) => g.event === t.event), state: proGames.tournaments.find((x) => x.event === t.event), event: meta.events.find((e) => e.id === t.event), sources });

    const ml = parseMatchlist(await get(urls.matchlist(name)));
    if (ml.caption !== `${name} results`) throw new Error(`${name}: match list page has caption "${ml.caption}"`);
    const played = ml.series.filter((s) => s.score);
    const totalGames = played.reduce((n, s) => n + s.score[0] + s.score[1], 0);

    // New games: a played series with fewer recorded games than its score.
    const added = [];
    for (const s of played) {
      const have = new Set(proGames.games.filter((g) => g.seriesId === s.id).map((g) => g.id));
      if (have.size >= s.score[0] + s.score[1]) continue;
      const first = parseGamePage(await get(gameUrl(s.id)));
      const ids = first.seriesGames.map((g) => g.id);
      if (!ids.length) { rejected.push(`${s.title} (${s.date}): no games in the series menu.`); continue; }
      const fresh = [];
      for (const id of ids) {
        if (have.has(id) || proGames.games.some((g) => g.id === id)) continue;
        const page = id === s.id ? first : parseGamePage(await get(gameUrl(id)));
        if (!page.blue?.result || !page.red?.result) continue; // not finished yet
        const stats = parseFullstats(await get(gameUrl(id, "page-fullstats")));
        const built = buildGame(id, page, stats, { tournament: name, event: t.event, seriesId: s.id, teams: [s.team1, s.team2] }, resolve, today);
        if (built.problems) { rejected.push(`${s.title} game ${page.game ?? "?"} (${gameUrl(id)}): ${built.problems.join("; ")}`); continue; }
        fresh.push(built.game);
      }
      const problems = seriesProblems(s, [...proGames.games, ...fresh]);
      if (problems.length) { rejected.push(...problems); continue; }
      added.push(...fresh);
    }
    proGames.games.push(...added);
    proGames.games.sort((a, b) => a.event.localeCompare(b.event) || a.date.localeCompare(b.date) || a.seriesId - b.seriesId || a.game - b.game);
    if (added.length) report.push(`${t.label}: ${added.length} new game${added.length > 1 ? "s" : ""} recorded.`);

    // Pick order for games stored before it was recorded: their game page is re-read once. A page that no longer shows
    // the stored teams, picks and bans leaves the game as it is.
    let ordered = 0;
    for (const g of proGames.games.filter((x) => x.event === t.event && (!x.blue.pickOrder || !x.red.pickOrder))) {
      const got = pickOrderFor(g, parseGamePage(await get(gameUrl(g.id))), resolve);
      if (got.problems) { rejected.push(`${g.series} game ${g.game} (${gameUrl(g.id)}): pick order not stored, ${got.problems.join("; ")}`); continue; }
      g.blue.pickOrder = got.blue;
      g.red.pickOrder = got.red;
      ordered += 1;
    }
    if (ordered) report.push(`${t.label}: pick order stored for ${ordered} earlier game${ordered > 1 ? "s" : ""}.`);

    // The event the site shows; created the first time a tracked tournament has games.
    let event = meta.events.find((e) => e.id === t.event);
    const patches = [...new Set(played.map((s) => s.patch).filter(Boolean))];
    if (!event && totalGames) {
      event = { id: t.event, name, short: t.label, kind: "current-meta", patch: patches.sort().at(-1) ?? "", draftMode: added[0] ? (await draftMode(get, added[0].id)) : "",
        status: "ongoing", startDate: played.map((s) => s.date).sort()[0], scope: `${name}, imported daily from Gol.gg. Pro evidence only: it never changes saved pairings.`,
        statsComplete: false, stats: [], notes: [], sources: [] };
      meta.events.push(event);
    }

    // Tournament aggregates: re-read when the game total moved, never merged across patches.
    if (event && totalGames && (event.games !== totalGames || added.length || !event.stats.length)) {
      if (patches.length > 1) rejected.push(`${t.label}: games span patches ${patches.join(", ")}; tournament totals left as they were.`);
      else {
        const ids = Object.fromEntries(["championlist", "picksandbans", "matchlist"].map((k) => [k, `golgg-tournament-${k}-${t.event}`]));
        const agg = buildAggregates(parseChampionTable(await get(urls.championlist(name))), totalGames,
          proGames.games.filter((g) => g.event === t.event), resolve, [ids.championlist, ids.picksandbans], event.stats);
        if (agg.problems) rejected.push(`${t.label} tournament totals not updated: ${agg.problems.slice(0, 5).join("; ")}${agg.problems.length > 5 ? ` (+${agg.problems.length - 5} more)` : ""}`);
        else {
          ensureSources(sources, t.event, name, today);
          event.stats = agg.stats;
          event.games = totalGames;
          event.statsComplete = true;
          if (patches[0]) event.patch = patches[0];
          event.sources = [...new Set([ids.championlist, ids.picksandbans, ids.matchlist, ...event.sources])];
          report.push(`${t.label}: tournament totals for ${totalGames} games${agg.rolesVerified ? ", with picks per role" : ""}.`);
        }
      }
    }

    // Supplied game links (pending claims) become verified once their game is recorded and shows the claimed duo.
    for (const g of added) confirmClaims(sources, g, data.botPairings, today, rejected);

    const series = ml.series;
    const done = isComplete(series, today);
    if (event && done && event.status !== "complete") { event.status = "complete"; event.endDate = series.map((s) => s.date).filter(Boolean).sort().at(-1); }
    const state = { event: t.event, golgg: name, status: done ? "complete" : "ongoing", series: series.length, seriesPlayed: played.length, games: totalGames,
      recorded: proGames.games.filter((g) => g.event === t.event).length, matchlist: urls.matchlist(name) };
    const i = proGames.tournaments.findIndex((x) => x.event === t.event);
    const prev = i >= 0 ? proGames.tournaments[i] : undefined;
    const merged = { ...state, lastUpdate: prev?.lastUpdate ?? null, lastCheck: prev?.lastCheck ?? null };
    if (i >= 0) proGames.tournaments[i] = merged; else proGames.tournaments.push(merged);

    const after = { games: proGames.games.filter((g) => g.event === t.event), state: merged, event, sources };
    if (!same(before, after)) { changed.add(t.event); merged.lastUpdate = now.toISOString(); }
    if (done && prev?.status !== "complete") report.push(`${t.label}: finished; kept as historical evidence.`);
    if (!added.length && !changed.has(t.event)) report.push(`${t.label}: no new completed games (${played.length}/${series.length} series played, ${totalGames} games).`);
  }

  // The check time is stored only alongside a data change, so a quiet day writes nothing.
  if (changed.size) for (const x of proGames.tournaments) if (open.some((t) => t.event === x.event)) x.lastCheck = now.toISOString();
  return { proGames, meta, sources, changed: [...changed], report, rejected };
}

async function draftMode(get, id) {
  return parseGamePage(await get(gameUrl(id))).draftMode ?? "";
}

function ensureSources(sources, event, name, today) {
  for (const kind of ["championlist", "picksandbans", "matchlist"]) {
    const id = `golgg-tournament-${kind}-${event}`;
    let s = sources.find((x) => x.id === id);
    if (!s) { s = { id, url: urls[kind](name), type: "golgg-tournament", tournament: name }; sources.push(s); }
    // The champion list and match list are read on every update; the picks-and-bans page holds the same numbers as
    // tooltips and is cited, not re-read.
    if (kind !== "picksandbans") Object.assign(s, { lastChecked: today, refreshStatus: "verified", origin: "golgg-refresh" });
    else if (!s.refreshStatus) Object.assign(s, { lastChecked: null, refreshStatus: "not-refreshed", origin: "golgg-refresh" });
  }
}

function confirmClaims(sources, game, botPairings, today, rejected) {
  const s = sources.find((x) => x.id === `golgg-game-${game.id}`);
  if (!s?.pendingClaim) return;
  const duos = botPairings.flatMap((b) => b.observedProPairings.filter((o) => o.sources.includes(s.id)).map((o) => [b.champion, o.champion]));
  const shown = (bot, sup) => ["blue", "red"].some((side) => game[side].picks.BOT === bot && game[side].picks.SUPPORT === sup);
  if (!duos.length || !duos.every(([b, sup]) => shown(b, sup))) {
    rejected.push(`${s.id}: the recorded game does not show the supplied claim "${s.pendingClaim.claim}"; left pending for a person to look at.`);
    return;
  }
  delete s.pendingClaim;
  Object.assign(s, { patch: game.patch, date: game.date, lastChecked: today, refreshStatus: "verified", origin: "golgg-refresh" });
}
