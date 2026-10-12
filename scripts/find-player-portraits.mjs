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

const builds = read("pro-builds.json");
const games = new Map([...read("pro-games.json").games, ...(builds.games ?? [])].map((g) => [g.id, g]));
const players = new Map();
for (const b of builds.builds) {
  const g = games.get(b.game);
  if (!players.has(b.playerId) || g.date > players.get(b.playerId).date) players.set(b.playerId, { id: b.playerId, name: b.player, team: g[b.side].team, role: b.role, date: g.date });
}

// Every person on Wikidata who plays League of Legends (Q223341) or is a professional gamer described as one, with
// labels, aliases, teams and image. A player matches only an item whose label or alias is exactly their name.
const SPARQL = `SELECT ?item ?itemLabel ?itemDescription ?image
  (GROUP_CONCAT(DISTINCT ?alias; separator="|") AS ?aliases) (GROUP_CONCAT(DISTINCT ?teamLabel; separator="|") AS ?teams) WHERE {
  ?item wdt:P31 wd:Q5 .
  { ?item wdt:P2416 wd:Q223341 } UNION { ?item wdt:P641 wd:Q223341 } UNION { ?item wdt:P106 wd:Q4379701 . ?item schema:description ?d . FILTER(LANG(?d) = "en" && CONTAINS(LCASE(?d), "league of legends")) }
  OPTIONAL { ?item wdt:P18 ?image }
  OPTIONAL { ?item skos:altLabel ?alias . FILTER(LANG(?alias) IN ("en", "ko", "mul")) }
  OPTIONAL { ?item wdt:P54 ?team . ?team rdfs:label ?teamLabel . FILTER(LANG(?teamLabel) = "en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul,ko". }
} GROUP BY ?item ?itemLabel ?itemDescription ?image`;
const sparql = await get(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(SPARQL)}`);
const people = new Map();
for (const b of sparql.results.bindings) {
  const id = b.item.value.split("/").pop();
  const e = people.get(id) ?? { wikidata: id, label: b.itemLabel?.value, description: b.itemDescription?.value, aliases: new Set(), teams: new Set(), images: new Set() };
  for (const a of (b.aliases?.value ?? "").split("|").filter(Boolean)) e.aliases.add(a);
  for (const t of (b.teams?.value ?? "").split("|").filter(Boolean)) e.teams.add(t);
  if (b.image) e.images.add(decodeURIComponent(b.image.value.split("/").pop()).replace(/_/g, " "));
  people.set(id, e);
}
console.log(`${people.size} League of Legends players on Wikidata.`);
const norm = (x) => x.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");

const out = [];
mkdirSync("reports/portrait-candidates", { recursive: true });
for (const p of [...players.values()].sort((a, b) => a.team.localeCompare(b.team) || a.name.localeCompare(b.name))) {
  const row = { ...p, candidates: [] };
  try {
    const hits = [...people.values()].filter((e) => [e.label, ...e.aliases].some((n) => n && norm(n) === norm(p.name)));
    for (const e of hits) {
      const c = { wikidata: e.wikidata, label: e.label, description: e.description, aliases: [...e.aliases], teams: [...e.teams], images: [] };
      for (const image of e.images) {
        const info = await get(`https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(`File:${image}`)}&prop=imageinfo|categories&iiprop=url|size|extmetadata|mime&iiurlwidth=800&format=json`);
        const page = Object.values(info.query.pages)[0], ii = page.imageinfo?.[0], m = ii?.extmetadata ?? {};
        const v = (k) => m[k]?.value?.replace(/<[^>]+>/g, "").trim();
        const img = { file: page.title, url: ii?.url, thumb: ii?.thumburl, thumbWidth: ii?.thumbwidth, thumbHeight: ii?.thumbheight, width: ii?.width, height: ii?.height,
          license: v("LicenseShortName"), licenseUrl: v("LicenseUrl"), usageTerms: v("UsageTerms"), artist: v("Artist"), credit: v("Credit"),
          descriptionText: v("ImageDescription"), dateTaken: v("DateTimeOriginal"), categories: (page.categories ?? []).map((x) => x.title), descriptionUrl: ii?.descriptionurl };
        // A copy of the 800px Commons thumbnail, for checking the person and choosing the crop.
        if (img.thumb) {
          const res = await fetch(img.thumb, { headers: { "User-Agent": UA } });
          if (res.ok) { img.local = `reports/portrait-candidates/${p.id}-${e.wikidata}.${img.thumb.split(".").pop().toLowerCase().slice(0, 4)}`; writeFileSync(img.local, Buffer.from(await res.arrayBuffer())); }
        }
        c.images.push(img);
      }
      row.candidates.push(c);
    }
  } catch (e) { row.error = String(e.message ?? e); }
  out.push(row);
  console.log(`${p.name} (${p.team}): ${row.candidates.map((c) => `${c.wikidata} ${c.label} [${c.teams.join(", ")}] ${c.images.length} image(s)`).join("; ") || "no match"}${row.error ? ` [${row.error}]` : ""}`);
}
mkdirSync("reports", { recursive: true });
writeFileSync("reports/player-portrait-candidates.json", JSON.stringify(out, null, 2) + "\n");
