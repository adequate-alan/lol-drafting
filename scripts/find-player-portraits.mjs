#!/usr/bin/env node
// Portrait discovery for professional players (alan, 2026-10-12). Separate from the match-data refresh: it never touches
// game data and a missing portrait never fails anything. For every player with recorded builds it looks up Wikidata for
// a League of Legends player item with that name and reads its image (P18) from Wikimedia Commons with the file's
// license metadata. It only REPORTS candidates (reports/player-portrait-candidates.json); a candidate becomes a portrait
// only after a person checks it is the same player and the license allows reuse, and it is added to
// data/player-portraits.json by hand. Nothing is downloaded from sites whose terms don't allow reuse.
//
//   node scripts/find-player-portraits.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dataDir = join(process.cwd(), "data");
const read = (f) => JSON.parse(readFileSync(join(dataDir, f), "utf8"));
const UA = "lol-drafting-portraits/1.0 (+https://github.com/adequate-alan/lol-drafting; one request per player)";
const get = async (url) => {
  await new Promise((r) => setTimeout(r, 400));
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
};
const LOL = /league of legends|lol\b|esports|e-sports|pro(fessional)? gamer|video game player/i;

const builds = read("pro-builds.json");
const games = new Map([...read("pro-games.json").games, ...(builds.games ?? [])].map((g) => [g.id, g]));
const players = new Map();
for (const b of builds.builds) {
  const g = games.get(b.game);
  if (!players.has(b.playerId) || g.date > players.get(b.playerId).date) players.set(b.playerId, { id: b.playerId, name: b.player, team: g[b.side].team, role: b.role, date: g.date });
}

const out = [];
for (const p of [...players.values()].sort((a, b) => a.team.localeCompare(b.team) || a.name.localeCompare(b.name))) {
  const row = { ...p, candidates: [] };
  try {
    const s = await get(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(p.name)}&language=en&type=item&limit=10&format=json`);
    const hits = (s.search ?? []).filter((h) => LOL.test(h.description ?? ""));
    if (hits.length) {
      const ents = await get(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${hits.map((h) => h.id).join("|")}&props=claims|labels|aliases|descriptions|sitelinks&languages=en|ko&format=json`);
      for (const h of hits) {
        const e = ents.entities[h.id];
        const image = e.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
        const c = { wikidata: h.id, label: e.labels?.en?.value, description: e.descriptions?.en?.value, aliases: (e.aliases?.en ?? []).map((a) => a.value),
          enwiki: e.sitelinks?.enwiki?.title, image };
        if (image) {
          const info = await get(`https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(`File:${image}`)}&prop=imageinfo|categories&iiprop=url|size|extmetadata|mime&iiurlwidth=480&format=json`);
          const page = Object.values(info.query.pages)[0], ii = page.imageinfo?.[0], m = ii?.extmetadata ?? {};
          const v = (k) => m[k]?.value?.replace(/<[^>]+>/g, "").trim();
          Object.assign(c, { file: page.title, url: ii?.url, thumb: ii?.thumburl, width: ii?.width, height: ii?.height, mime: ii?.mime,
            license: v("LicenseShortName"), licenseUrl: v("LicenseUrl"), artist: v("Artist"), credit: v("Credit"), descriptionText: v("ImageDescription"),
            dateTaken: v("DateTimeOriginal"), categories: (page.categories ?? []).map((x) => x.title), descriptionUrl: ii?.descriptionurl });
        }
        row.candidates.push(c);
      }
    }
  } catch (e) { row.error = String(e.message ?? e); }
  out.push(row);
  console.log(`${p.name} (${p.team}): ${row.candidates.length} candidate${row.candidates.length === 1 ? "" : "s"}${row.candidates.some((c) => c.image) ? ", with image" : ""}${row.error ? ` [${row.error}]` : ""}`);
}
mkdirSync("reports", { recursive: true });
writeFileSync("reports/player-portrait-candidates.json", JSON.stringify(out, null, 2) + "\n");
