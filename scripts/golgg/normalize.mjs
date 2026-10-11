// Turns parsed Gol.gg pages into the normalized records of data/pro-games.json and checks them. A record is built only
// from what the two pages of a game show (page-game: teams, sides, result, bans, picks, patch, date, stage, game number;
// page-fullstats: the role of every champion). Nothing is inferred: a missing or contradictory field rejects the game.

export const ROLES = ["TOP", "JUNGLE", "MID", "BOT", "SUPPORT"];
const ROLE_OF = { TOP: "TOP", JUNGLE: "JUNGLE", MID: "MID", ADC: "BOT", BOT: "BOT", SUPPORT: "SUPPORT" };
export const GOLGG = "https://gol.gg";
export const gameUrl = (id, page = "page-game") => `${GOLGG}/game/stats/${id}/${page}/`;

const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
// Gol.gg spellings that differ from the roster's names.
const EXTRA = { nunu: "nunu-willump", nunuwillump: "nunu-willump", monkeyking: "wukong", renata: "renata-glasc" };

/** Champion name or Gol.gg icon name -> roster id, or undefined. */
export function championResolver(champions) {
  const byName = new Map();
  for (const c of champions) for (const n of [c.id, c.name, ...(c.aliases ?? [])]) byName.set(norm(n), c.id);
  for (const [k, v] of Object.entries(EXTRA)) if (!byName.has(k) && champions.some((c) => c.id === v)) byName.set(k, v);
  return (name) => (name ? byName.get(norm(name)) : undefined);
}

/**
 * One game record from a parsed page-game and page-fullstats. Returns { game } or { problems }.
 * `expect` = { tournament, event, seriesId, teams?: [a, b] } from the match list the game was found through.
 */
export function buildGame(id, page, stats, expect, resolve, checkedOn) {
  const problems = [];
  const need = (ok, msg) => { if (!ok) problems.push(msg); return ok; };
  need(page.tournament === expect.tournament, `tournament is "${page.tournament}", expected "${expect.tournament}"`);
  need(/^\d{4}-\d{2}-\d{2}$/.test(page.date ?? ""), "no date");
  need(/^\d+\.\d+$/.test(page.patch ?? ""), "no patch");
  need(Number.isInteger(page.game) && page.game > 0, "no game number");
  need(!!page.series, "no series name");
  need(page.seriesGames.some((g) => g.id === id && g.n === page.game), "game is not in its own series menu");
  need(!!stats, "no full-stats table (roles)");
  const sides = {};
  for (const color of ["blue", "red"]) {
    const p = page[color];
    if (!need(!!p?.team, `${color} side: no team`)) continue;
    need(p.result === "WIN" || p.result === "LOSS", `${color} side: no result`);
    need(p.picks?.length === 5, `${color} side: ${p.picks?.length ?? 0} picks`);
    const picks = {};
    for (const { champion, role } of stats?.[color] ?? []) {
      const r = ROLE_OF[role], c = resolve(champion);
      if (!need(!!r, `${color} side: unknown role "${role}"`) || !need(!!c, `unknown champion "${champion}"`)) continue;
      need(!picks[r], `${color} side: two champions in ${r}`);
      picks[r] = c;
    }
    need(ROLES.every((r) => picks[r]), `${color} side: roles missing (${ROLES.filter((r) => !picks[r]).join(", ")})`);
    // The picks shown in draft order must be the same five champions the full-stats table places in roles.
    const drafted = (p.picks ?? []).map(resolve);
    need(drafted.every(Boolean) && drafted.length === 5 && drafted.every((c) => Object.values(picks).includes(c)),
      `${color} side: draft picks and role table disagree`);
    const bans = (p.bans ?? []).map((b) => ({ b, id: resolve(b) }));
    for (const x of bans) need(!!x.id, `unknown banned champion "${x.b}"`);
    need(bans.length <= 5, `${color} side: ${bans.length} bans`);
    sides[color] = { team: p.team, picks, bans: bans.map((x) => x.id).filter(Boolean), result: p.result };
  }
  if (sides.blue && sides.red) {
    need(sides.blue.team !== sides.red.team, "both sides name the same team");
    need((sides.blue.result === "WIN") !== (sides.red.result === "WIN"), "result is not one win and one loss");
    const all = [...Object.values(sides.blue.picks), ...Object.values(sides.red.picks)];
    need(new Set(all).size === 10, "a champion is picked twice");
    const bans = [...sides.blue.bans, ...sides.red.bans];
    need(!bans.some((b) => all.includes(b)), "a banned champion was also picked");
    if (expect.teams) need([sides.blue.team, sides.red.team].sort().join("|") === [...expect.teams].sort().join("|"),
      `teams ${sides.blue.team} / ${sides.red.team} do not match the match list (${expect.teams.join(" / ")})`);
  }
  if (problems.length) return { problems };
  const side = (s) => ({ team: s.team, picks: s.picks, bans: s.bans });
  return {
    game: {
      id, event: expect.event, tournament: page.tournament, seriesId: expect.seriesId, series: page.series, game: page.game,
      stage: page.stage, date: page.date, patch: page.patch, blue: side(sides.blue), red: side(sides.red),
      winner: sides.blue.result === "WIN" ? "blue" : "red", url: gameUrl(id), rolesUrl: gameUrl(id, "page-fullstats"), checkedOn,
    },
  };
}

/** Series results must match the match list once every game of a series is recorded. */
export function seriesProblems(series, games) {
  if (!series.score) return [];
  const mine = games.filter((g) => g.seriesId === series.id);
  if (mine.length !== series.score[0] + series.score[1]) return [];
  const wins = (team) => mine.filter((g) => g[g.winner].team === team).length;
  const ok = wins(series.team1) === series.score[0] && wins(series.team2) === series.score[1];
  return ok ? [] : [`${series.title}: recorded wins ${wins(series.team1)}-${wins(series.team2)} disagree with the match list ${series.score.join("-")}`];
}

/**
 * Tournament aggregates from Gol.gg's champion table, checked against the match list. Returns { stats, rolesVerified }
 * or { problems }. Never computed from recorded games: recorded games are only used to cross-check the table and, when
 * every game of the event is recorded and agrees with it, to state picks per role (each game page names the role).
 */
export function buildAggregates(table, totalGames, games, resolve, sourceIds, previous = []) {
  const problems = [];
  if (!table) return { problems: ["no champion table on the page"] };
  if (!totalGames) return { problems: ["no completed games in the match list"] };
  const rows = [];
  for (const r of table.rows) {
    if ((r.picks ?? 0) + (r.bans ?? 0) === 0) continue; // the list carries every champion; zeros say nothing
    const id = resolve(r.name);
    if (!id) { problems.push(`unknown champion "${r.name}"`); continue; }
    if (r.picks == null || r.bans == null) { problems.push(`${r.name}: missing picks or bans`); continue; }
    if (r.picks && (r.wins == null || r.losses == null)) { problems.push(`${r.name}: missing wins or losses`); continue; }
    if (r.picks && r.wins + r.losses !== r.picks) problems.push(`${r.name}: wins ${r.wins} + losses ${r.losses} != picks ${r.picks}`);
    rows.push({ id, ...r });
  }
  const sp = rows.reduce((n, r) => n + r.picks, 0), sb = rows.reduce((n, r) => n + r.bans, 0);
  if (sp !== 10 * totalGames) problems.push(`picks add up to ${sp}, expected ${10 * totalGames} for ${totalGames} games (table not caught up)`);
  if (sb > 10 * totalGames) problems.push(`bans add up to ${sb}, more than ${10 * totalGames}`);
  // With every game recorded, the table must agree with the games champion by champion.
  const complete = games.length === totalGames;
  const rolePicks = new Map();
  if (complete) {
    const picks = new Map(), wins = new Map();
    for (const g of games) for (const side of ["blue", "red"]) for (const [role, c] of Object.entries(g[side].picks)) {
      picks.set(c, (picks.get(c) ?? 0) + 1);
      if (g.winner === side) wins.set(c, (wins.get(c) ?? 0) + 1);
      const rp = rolePicks.get(c) ?? {};
      rp[role] = (rp[role] ?? 0) + 1;
      rolePicks.set(c, rp);
    }
    for (const r of rows) if ((picks.get(r.id) ?? 0) !== r.picks || (r.picks && (wins.get(r.id) ?? 0) !== r.wins))
      problems.push(`${r.name}: table ${r.picks} picks / ${r.wins ?? 0} wins, recorded games ${picks.get(r.id) ?? 0} / ${wins.get(r.id) ?? 0}`);
  }
  if (problems.length) return { problems };
  const prev = new Map(previous.map((s) => [s.champion, s]));
  const stats = rows.map((r) => {
    const old = prev.get(r.id);
    return {
      champion: r.id, ...(old?.role ? { role: old.role } : {}), ...(old?.flexRole ? { flexRole: old.flexRole } : {}),
      picks: r.picks, bans: r.bans, ...(r.picks ? { wins: r.wins } : {}),
      winRate: r.picks ? Math.round((r.wins / r.picks) * 10000) / 10000 : null, lowSample: r.picks < 5,
      ...(complete && rolePicks.has(r.id) ? { rolePicks: Object.fromEntries(ROLES.filter((x) => rolePicks.get(r.id)[x]).map((x) => [x, rolePicks.get(r.id)[x]])) } : {}),
      ...(old?.priorityRead ? { priorityRead: old.priorityRead } : {}), ...(old?.note ? { note: old.note } : {}),
      sources: sourceIds,
    };
  }).sort((a, b) => b.picks + b.bans - (a.picks + a.bans) || a.champion.localeCompare(b.champion));
  return { stats, rolesVerified: complete };
}

/** Finished: every listed series is played and either a final was played or the last game is a week old. */
export function isComplete(series, today) {
  if (!series.length || series.some((s) => !s.score)) return false;
  if (series.some((s) => /^(grand )?finals?$/i.test(s.stage))) return true;
  const last = series.map((s) => s.date).filter(Boolean).sort().at(-1);
  return !!last && (Date.parse(today) - Date.parse(last)) / 86400000 >= 7;
}
