// The daily pro-data refresh: checks the tournaments listed in data/pro-games.json `tracked` on Gol.gg, imports every
// completed game not yet recorded, and refreshes the tournament aggregates. Pure over its inputs: the caller passes the
// data files and a fetch function (real HTTP in the workflow, saved pages in tests) and writes what comes back.
//
// Only tracked tournaments are ever requested, by their exact Gol.gg names. A finished tournament is not requested again.
// Saved pairings, pool tiers and proposed synergy are not inputs and cannot change here.
import { parseChampionTable, parseFullstats, parseGamePage, parseMatchlist } from "./parse.mjs";
import { buildAggregates, buildGame, championResolver, gameUrl, isComplete, pickOrderFor, seriesProblems, GOLGG, ROLES } from "./normalize.mjs";
import { assetsFor, buildFromAnswer, buildUrl, ddragonVersionFor, DDRAGON, parsePlayers, referencedIds } from "./builds.mjs";

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
 * @param data { proGames, meta, sources, champions, botPairings, proBuilds?, buildAssets? }  parsed data files (not modified)
 * @param get  async (url, { method?, body? }) => string   throws on a network or HTTP error
 * @returns { proGames, meta, sources, proBuilds, buildAssets, changed: string[], report: string[], rejected: string[] }
 */
export async function refresh(data, get, opts = {}) {
  // buildsOnly: leave games and tournament totals alone (a one-off builds backfill).
  const out = opts.buildsOnly ? { proGames: data.proGames, meta: data.meta, sources: data.sources, changed: [], report: [], rejected: [] } : await refreshGames(data, get, opts);
  const { now = new Date(), maxBuildGames = MAX_BUILD_GAMES } = opts;
  const builds = await refreshBuilds({ ...data, proGames: out.proGames }, get, now.toISOString().slice(0, 10), maxBuildGames);
  return { ...out, ...builds, changed: [...out.changed, ...builds.changed], report: [...out.report, ...builds.report], rejected: [...out.rejected, ...builds.rejected] };
}

async function refreshGames(data, get, { now = new Date() } = {}) {
  const today = now.toISOString().slice(0, 10);
  const proGames = clone(data.proGames), meta = clone(data.meta), sources = clone(data.sources);
  const resolve = championResolver(data.champions);
  const report = [], rejected = [], changed = new Set();

  const isOpen = (t) => proGames.tournaments.find((x) => x.event === t.event)?.status !== "complete";
  for (const t of proGames.tracked) if (!isOpen(t)) report.push(`${t.label}: finished, not requested again.`);
  if (!proGames.tracked.some(isOpen)) return { proGames, meta, sources, changed: [], report, rejected };

  // Which tracked names Gol.gg lists this season (one request for every tournament).
  const listed = JSON.parse(await get(urls.list, { method: "POST", body: `season=S${Number(today.slice(0, 4)) - 2010}` }));
  if (!Array.isArray(listed)) throw new Error("Gol.gg tournament list is not a list");
  const listedNames = new Set(listed.map((x) => x.trname));
  // A later stage of a tracked tournament (alan, 2026-10-23: Worlds 2026 knockouts without another code change): a
  // listed name the tournament's `discover` pattern matches becomes its own tracked event, kept in the file. Any other
  // Worlds name no tracked tournament names is reported, never imported under a guessed event.
  const known = new Set(proGames.tracked.flatMap((t) => t.names));
  for (const n of [...listedNames].sort()) {
    if (known.has(n)) continue;
    const parent = proGames.tracked.find((t) => t.discover && isOpen(t) && new RegExp(t.discover).test(n));
    if (parent) {
      const event = stageEvent(parent.event, n, proGames.tracked);
      proGames.tracked.push({ event, label: n, names: [n], auto: true });
      known.add(n);
      changed.add(event);
      report.push(`Gol.gg lists "${n}": tracked from now on as a stage of ${parent.label} (${event}).`);
    } else if (/\b(worlds|world championship)\b/i.test(n) && n.includes(today.slice(0, 4))) report.push(`Gol.gg lists "${n}", which no tracked tournament names: not imported.`);
  }
  const open = proGames.tracked.filter(isOpen);

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
    // The side that picked first is read the same way (stored once; a page without a clear mark leaves it unset).
    let ordered = 0;
    for (const g of proGames.games.filter((x) => x.event === t.event && (!x.blue.pickOrder || !x.red.pickOrder || !x.firstPick))) {
      const got = pickOrderFor(g, parseGamePage(await get(gameUrl(g.id))), resolve);
      if (got.problems) { rejected.push(`${g.series} game ${g.game} (${gameUrl(g.id)}): pick order not stored, ${got.problems.join("; ")}`); continue; }
      if (!got.firstPick && !g.firstPick) rejected.push(`${g.series} game ${g.game} (${gameUrl(g.id)}): the page does not mark which side picked first.`);
      // A page that draws no turns lists the picks in role order: that is not a draft order, so none is kept.
      const changed = g.blue.pickOrder?.join() !== got.blue?.join() || g.red.pickOrder?.join() !== got.red?.join() || (!!got.firstPick && g.firstPick !== got.firstPick);
      if (got.blue && got.red) { g.blue.pickOrder = got.blue; g.red.pickOrder = got.red; } else { delete g.blue.pickOrder; delete g.red.pickOrder; }
      if (got.firstPick) g.firstPick = got.firstPick;
      if (changed) ordered += 1;
    }
    if (ordered) report.push(`${t.label}: pick order and first pick stored for ${ordered} earlier game${ordered > 1 ? "s" : ""}.`);

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
    const done = isComplete(series, today, { untilFinal: t.untilFinal });
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

/** A connection that failed or timed out (after the caller's retries), as opposed to an answer: a refusal, an HTTP error or a challenge page. */
export const isNetworkFault = (e) => e?.name === "TimeoutError" || e?.name === "AbortError" || (e?.name === "TypeError" && /fetch failed/i.test(e?.message ?? ""));

/** The event id of a discovered stage: the parent's id plus the stage words of the Gol.gg name ("worlds-2026-knockout-stage"). */
export function stageEvent(parent, name, tracked) {
  const year = parent.match(/\d{4}/)?.[0] ?? "";
  const words = name.toLowerCase().replace(/\b(worlds|world championship)\b/g, "").replace(year, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  let id = `${parent}-${words || "stage"}`, n = 2;
  while (tracked.some((t) => t.event === id)) id = `${parent}-${words || "stage"}-${n++}`;
  return id;
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

// ---------- Pro Builds ----------
// Each recorded game of a tracked tournament gets every player's build once (11 requests: the game page for player
// ids, then one build answer per player). A run takes at most `maxBuildGames` games so a backfill spreads over days.
// A game Gol.gg has no builds for is noted in `unavailable` and asked again after RETRY_DAYS. Gol.gg also publishes a
// fresh game's stats before its timeline (skill order, purchases), so a game whose stored builds name a missing field
// is asked again after RETRY_DAYS, for PARTIAL_WINDOW_DAYS from its date; the stored builds are replaced only when
// the new answer leaves fewer fields missing. Nothing is ever filled in.
export const MAX_BUILD_GAMES = 45;
const RETRY_DAYS = 3;
const PARTIAL_WINDOW_DAYS = 21;
const daysBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;
const missingCount = (builds) => builds.reduce((n, b) => n + (b.missing?.length ?? 0), 0);

/**
 * `only`: fetch builds for exactly these game records instead of the tracked tournaments' games (a one-off archive
 * backfill, scripts/backfill-lck-builds.mjs). Archive games stored in `proBuilds.games` keep their order and assets.
 */
export async function refreshBuilds(data, get, today, maxBuildGames, { only } = {}) {
  const proBuilds = clone(data.proBuilds ?? { builds: [], unavailable: [] });
  const buildAssets = clone(data.buildAssets ?? { patches: {} });
  const report = [], rejected = [], changed = new Set();
  const resolve = championResolver(data.champions);
  const tracked = new Set(data.proGames.tracked.map((t) => t.event));
  const stored = new Map();
  for (const b of proBuilds.builds) stored.set(b.game, [...(stored.get(b.game) ?? []), b]);
  const have = new Set(stored.keys());
  const waiting = new Map(proBuilds.unavailable.map((u) => [u.game, u]));
  const allGames = [...data.proGames.games, ...(proBuilds.games ?? [])];
  // A recorded game with a missing field is re-read while Gol.gg may still complete it (a game without a date is not).
  const partial = (g) => have.has(g.id) && missingCount(stored.get(g.id)) > 0 && daysBetween(g.date, today) <= PARTIAL_WINDOW_DAYS
    && daysBetween(stored.get(g.id).reduce((d, b) => (b.checkedOn > d ? b.checkedOn : d), ""), today) >= RETRY_DAYS;
  const todo = (only ?? data.proGames.games.filter((g) => tracked.has(g.event))).filter((g) => partial(g) || (!have.has(g.id)
    && !(waiting.has(g.id) && daysBetween(waiting.get(g.id).checkedOn, today) < RETRY_DAYS)));
  const batch = todo.slice(0, maxBuildGames);

  let added = 0, completed = 0, fault;
  for (const g of batch) {
    // Builds are read after the games: a dropped connection here (Gol.gg drops sockets; a run on 2026-10-23 lost every
    // new Worlds game to one reset during builds) ends the builds pass and keeps the games and builds read so far. The
    // games left wait for the next run. A refusal or challenge still stops everything.
    let players;
    try { players = parsePlayers(await get(gameUrl(g.id))); } catch (e) { if (!isNetworkFault(e)) throw e; fault = e; break; }
    const fresh = [], problems = [];
    for (const side of ["blue", "red"]) {
      if (fault) break;
      const list = players?.[side] ?? [];
      if (list.length !== 5) { problems.push(`${side} side: ${list.length} players on the game page`); continue; }
      for (const p of list) {
        const champion = resolve(p.champion);
        const role = ROLES.find((r) => g[side].picks[r] === champion);
        if (!champion || !role) { problems.push(`${side} side: ${p.champion} is not one of the recorded picks`); continue; }
        const who = { game: g.id, side, role, champion, player: p.player, playerId: p.playerId };
        // A failed request stops the run (nothing written); an answer that is not JSON is a missing build.
        let body;
        try { body = await get(buildUrl, { method: "POST", body: `game_id=${g.id}&player_id=${p.playerId}` }); } catch (e) { if (!isNetworkFault(e)) throw e; fault = e; break; }
        let answer;
        try { answer = JSON.parse(body); } catch { answer = undefined; }
        const built = buildFromAnswer(answer, who);
        fresh.push(built.build ?? { ...who, missing: ["build"] });
      }
    }
    if (fault) break; // this game's builds are incomplete: nothing of it is kept
    if (have.has(g.id)) {
      // Re-read of a partial record: the stored builds stand unless the new answer is more complete; either way the
      // game was checked today, so it waits RETRY_DAYS before the next read.
      const old = stored.get(g.id);
      const better = !problems.length && missingCount(fresh) < missingCount(old);
      if (better) { proBuilds.builds = proBuilds.builds.filter((b) => b.game !== g.id); proBuilds.builds.push(...fresh); completed += 1; }
      for (const b of better ? fresh : old) b.checkedOn = today;
      continue;
    }
    if (problems.length || !fresh.some((b) => !b.missing?.includes("build"))) {
      rejected.push(`Builds for ${g.series} game ${g.game} (${gameUrl(g.id, "page-builds")}): ${problems.join("; ") || "no build data on Gol.gg yet"}`);
      waiting.set(g.id, { game: g.id, checkedOn: today, reason: problems.join("; ") || "no build data yet" });
      continue;
    }
    waiting.delete(g.id);
    for (const b of fresh) b.checkedOn = today;
    proBuilds.builds.push(...fresh);
    added += 1;
  }
  const order = new Map(allGames.map((g, i) => [g.id, i]));
  proBuilds.builds.sort((a, b) => (order.get(a.game) ?? 0) - (order.get(b.game) ?? 0) || a.side.localeCompare(b.side) || ROLES.indexOf(a.role) - ROLES.indexOf(b.role));
  proBuilds.unavailable = [...waiting.values()].sort((a, b) => a.game - b.game);
  if (added) { report.push(`Pro builds: ${added} game${added > 1 ? "s" : ""} added (${proBuilds.builds.length} player builds stored).`); changed.add("pro-builds"); }
  if (completed) { report.push(`Pro builds: ${completed} partial game${completed > 1 ? "s" : ""} completed with fields Gol.gg has since published.`); changed.add("pro-builds"); }
  if (!same(proBuilds.builds, data.proBuilds?.builds ?? [])) changed.add("pro-builds");
  if (fault) report.push(`Pro builds: the connection to Gol.gg failed (${fault.cause?.code ?? fault.name}) after ${added + completed} game${added + completed === 1 ? "" : "s"}; the other games are read on the next run.`);
  if (todo.length > batch.length) report.push(`Pro builds: ${todo.length - batch.length} more game${todo.length - batch.length > 1 ? "s" : ""} left for the next run.`);
  if (!same(proBuilds.unavailable, data.proBuilds?.unavailable ?? [])) changed.add("pro-builds");

  // Names and icons for every id the stored builds use, per game patch, from that patch's Data Dragon files.
  const patchOf = new Map(allGames.map((g) => [g.id, g.patch]));
  const byPatch = new Map();
  for (const b of proBuilds.builds) { const p = patchOf.get(b.game); if (p) byPatch.set(p, [...(byPatch.get(p) ?? []), b]); }
  let versions;
  for (const [patch, list] of [...byPatch.entries()].sort()) {
    const ref = referencedIds(list), cur = buildAssets.patches[patch];
    // Ids that patch's files did not name are listed in `unnamed` and not asked for again.
    const no = new Set(cur?.unnamed ?? []);
    const covered = cur && [...ref.items].every((i) => cur.items[i] || no.has(`item ${i}`)) && [...ref.runes].every((r) => cur.runes[r] || no.has(`rune ${r}`))
      && [...ref.trees].every((t) => cur.trees[t] || no.has(`rune tree ${t}`)) && [...ref.spells].every((x) => cur.spells[x] || no.has(`summoner spell ${x}`))
      && [...ref.champions].every((c) => cur.abilities[c] || no.has(`abilities for ${c}`));
    if (covered) continue;
    versions ??= JSON.parse(await get(`${DDRAGON}/api/versions.json`));
    const version = ddragonVersionFor(patch, versions);
    if (!version) { rejected.push(`Pro builds: Data Dragon has no files for patch ${patch}; names and icons not updated.`); continue; }
    const base = `${DDRAGON}/cdn/${version}/data/en_US`;
    const files = {
      item: JSON.parse(await get(`${base}/item.json`)), runesReforged: JSON.parse(await get(`${base}/runesReforged.json`)),
      summoner: JSON.parse(await get(`${base}/summoner.json`)), championFull: JSON.parse(await get(`${base}/championFull.json`)),
      cdragonPerks: JSON.parse(await get(CDRAGON_PERKS)),
    };
    const { assets, unknown } = assetsFor(ref, version, files, resolve);
    if (unknown.length) assets.unnamed = unknown;
    if (unknown.length) rejected.push(`Pro builds ${patch}: Data Dragon ${version} does not name ${unknown.join(", ")}; shown by id only.`);
    if (!same(assets, cur)) { buildAssets.patches[patch] = assets; changed.add("build-assets"); report.push(`Pro builds: names and icons for patch ${patch} from Data Dragon ${version}.`); }
  }
  return { proBuilds, buildAssets, changed: [...changed], report, rejected };
}

// Stat shard names (Data Dragon's rune trees leave the shards out). CommunityDragon serves Riot's own game data files.
export const CDRAGON_PERKS = "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perks.json";
