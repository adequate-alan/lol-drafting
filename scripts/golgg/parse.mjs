// Parsers for Gol.gg pages: tournament match list, champion table, game page and full-stats page. Pure functions over
// HTML strings, shared by scripts/import-golgg-tournament.mjs (manual) and scripts/refresh-pro-data.mjs (daily).
// They read only what a page shows; anything missing comes back undefined for the caller to reject, never guessed.

export const decode = (s) => s.replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
export const text = (html) => decode(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
export const num = (s) => { const m = String(s ?? "").replace(/,/g, "").match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : undefined; };
const attr = (html, name) => { const m = html.match(new RegExp(`${name}=["']([^"']*)["']`, "i")); return m ? decode(m[1]) : undefined; };

/** Every table as { head: string[], rows: { cells: string[], raw: string[] }[] }. */
export function tables(html) {
  return [...html.matchAll(/<table[\s\S]*?<\/table>/gi)].map(([t]) => {
    const trs = [...t.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map(([tr]) => [...tr.matchAll(/<t([hd])[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) => ({ th: m[1].toLowerCase() === "h", raw: m[2] })));
    const headRow = trs.find((r) => r.length && r.every((c) => c.th)) ?? [];
    return { head: headRow.map((c) => text(c.raw)), rows: trs.filter((r) => r !== headRow && r.some((c) => !c.th)).map((r) => ({ cells: r.map((c) => text(c.raw)), raw: r.map((c) => c.raw) })) };
  });
}

/** The tournament champion table (picks, bans, wins, losses, win rate per champion), or undefined if the page has none. */
export function parseChampionTable(html) {
  const t = tables(html).find((x) => x.head.some((h) => /^picks?$/i.test(h)) && x.head.some((h) => /^bans?$/i.test(h)));
  if (!t) return undefined;
  const col = (re) => t.head.findIndex((h) => re.test(h));
  const c = { name: Math.max(col(/champion/i), 0), picks: col(/^picks?$/i), bans: col(/^bans?$/i), wins: col(/^wins?$/i), losses: col(/^loss/i), wr: col(/win ?rate|^wr$/i) };
  const rows = t.rows.map((r) => {
    // The champion cell is often an icon link; its title or alt carries the name when the text is empty.
    const name = r.cells[c.name] || (attr(r.raw[c.name], "(?:title|alt)") ?? "").replace(/ stats$/i, "");
    return { name, picks: num(r.cells[c.picks]), bans: num(r.cells[c.bans]), wins: c.wins >= 0 ? num(r.cells[c.wins]) : undefined,
      losses: c.losses >= 0 ? num(r.cells[c.losses]) : undefined, winRate: c.wr >= 0 ? num(r.cells[c.wr]) : undefined };
  }).filter((r) => r.name);
  return { head: t.head, rows };
}

/**
 * Series in a tournament match list, newest first as Gol.gg lists them. A played series has a score ("2 - 1"); an
 * upcoming one shows "-". `id` is the Gol.gg game id the row links to (game 1 of the series).
 */
export function parseMatchlist(html) {
  const caption = (html.match(/<caption>([\s\S]*?)<\/caption>/i) ?? [])[1];
  const series = [];
  for (const [tr] of html.matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
    const link = tr.match(/game\/stats\/(\d+)\/page-(summary|preview|game)/i);
    if (!link) continue;
    const tds = [...tr.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)].map((m) => ({ cls: attr(m[1], "class") ?? "", text: text(m[2]) }));
    if (tds.length < 7) continue;
    const score = tds[2].text.match(/^(\d+)\s*-\s*(\d+)$/);
    const won = (td) => /text_victory/.test(td.cls), lost = (td) => /text_defeat/.test(td.cls);
    series.push({
      id: Number(link[1]), title: tds[0].text, team1: tds[1].text, team2: tds[3].text,
      score: score ? [Number(score[1]), Number(score[2])] : undefined,
      winner: won(tds[1]) && lost(tds[3]) ? tds[1].text : won(tds[3]) && lost(tds[1]) ? tds[3].text : undefined,
      stage: tds[4].text, patch: /^\d+\.\d+$/.test(tds[5].text) ? tds[5].text : undefined,
      date: /^\d{4}-\d{2}-\d{2}$/.test(tds[6].text) ? tds[6].text : undefined,
    });
  }
  return { caption: caption && text(caption), series };
}

function sidePanel(html, color) {
  // The header line ("<a ...>Team</a> - WIN"), then the Bans and Picks rows of that side's panel.
  const start = html.search(new RegExp(`class="col-12 ${color}-line-header"`));
  if (start < 0) return undefined;
  const end = color === "blue" ? html.search(/class="col-12 red-line-header"/) : html.search(/class=['"]playersInfosLine/);
  const block = html.slice(start, end > start ? end : undefined);
  const header = block.match(/^[^>]*>([\s\S]*?)<\/div>/);
  const headText = header ? text(header[1]) : "";
  const result = (headText.match(/-\s*(WIN|LOSS)\s*$/) ?? [])[1];
  const team = headText.replace(/\s*-\s*(WIN|LOSS)\s*$/, "").trim();
  const cell = (label) => block.match(new RegExp(`<div class="col-2">${label}([\\s\\S]*?)<div class="col-10">([\\s\\S]*?)</div>`, "i"));
  const icons = (html) => [...html.matchAll(/<img[^>]*src='[^']*champions_icon\/([^'./]+)\.png'/gi)].map((x) => decode(x[1]));
  const row = (label) => { const m = cell(label); return m ? icons(m[2]) : undefined; };
  const picks = cell("Picks");
  // The Picks row marks the team that picked first (first.png beside the label) and splits the picks into the turns
  // Gol.gg draws with "|": 1 | 2 | 2 for the first-picking team, 2 | 2 | 1 for the other.
  const firstPick = picks ? /alt=['"]First Pick['"]/i.test(picks[1]) : undefined;
  const pickGroups = picks ? picks[2].split(/&nbsp;\|&nbsp;|\s\|\s/).map((g) => icons(g).length) : undefined;
  return { team: team || undefined, result, bans: row("Bans"), picks: row("Picks"), firstPick, pickGroups };
}

/** A game page (page-game): series, tournament, date, stage, patch, game number, the series' games and both sides. */
export function parseGamePage(html) {
  const h1 = (html.match(/<h1>([^<]*)<\/h1>/) ?? [])[1];
  const tournament = (html.match(/<a href='[^']*tournament-stats\/[^']*'>([^<]*)<\/a>/) ?? [])[1];
  const when = html.match(/(\d{4}-\d{2}-\d{2})\s*\(([^)]*)\)\s*<\/div>/);
  const patch = (html.match(/>\s*v(\d+\.\d+)\s*</) ?? [])[1];
  const nav = [...html.matchAll(/<li class='nav-item game-menu-button(-active)?'><a class='nav-link' href='[^']*game\/stats\/(\d+)\/page-game\/'[^>]*>Game (\d+)<\/a>/g)]
    .map((m) => ({ active: !!m[1], id: Number(m[2]), n: Number(m[3]) }));
  const active = nav.find((g) => g.active);
  const draftMode = (html.match(/\(\w+\)\s*-\s*([A-Za-z ]+Draft)/) ?? [])[1];
  return {
    series: h1 && decode(h1).trim(), tournament: tournament && decode(tournament), draftMode,
    date: when?.[1], stage: when?.[2].trim() || undefined, patch, game: active?.n,
    seriesGames: nav.map(({ id, n }) => ({ id, n })),
    blue: sidePanel(html, "blue"), red: sidePanel(html, "red"),
  };
}

/** The full-stats page (page-fullstats): each side's champions with the role Gol.gg lists for them. */
export function parseFullstats(html) {
  const t = html.match(/<table class='completestats[\s\S]*?<\/table>/i);
  if (!t) return undefined;
  // The icon file name ("KSante.png"), not the alt text: Gol.gg leaves the apostrophe in alt='K'Sante' unescaped.
  const champs = [...t[0].match(/<thead>[\s\S]*?<\/thead>/i)?.[0].matchAll(/<th>\s*<img[^>]*src='[^']*champions_icon\/([^'./]+)\.png'/gi) ?? []].map((m) => decode(m[1]));
  const roleRow = t[0].match(/<tr><td>Role<\/td>([\s\S]*?)<\/tr>/i);
  if (!roleRow) return undefined;
  const cells = [...roleRow[1].matchAll(/<td class='(blue|red)-header'[^>]*>([^<]*)<\/td>/gi)].map((m) => ({ side: m[1].toLowerCase(), role: m[2].trim() }));
  if (cells.length !== champs.length) return undefined;
  const out = { blue: [], red: [] };
  cells.forEach((c, i) => out[c.side].push({ champion: champs[i], role: c.role }));
  return out;
}
