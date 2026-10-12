// Pro Builds (alan, 2026-10-12): one player's setup in one recorded game, read from Gol.gg, plus the Riot Data Dragon
// names and icons the site shows for it. Pure functions; scripts/golgg/refresh.mjs does the requests.
//
// Gol.gg's Builds tab (page-builds) loads each player's build with a POST to /game/ajax.build.php (game_id, player_id),
// the same request a browser makes when the tab opens. robots.txt does not disallow it. The answer is
//   [[{ spell1, spell2, item0..item6, perkprimarystyle, perksubstyle, perk0..perk5, statperk0..2, skillorder,
//       spell1Casts..spell4Casts, summoner1Casts, summoner2Casts, ... }], [{ build_time, typeEvent, itemId }, ...]]
// Player ids and names come from the game page (page-game) the refresh already reads. Nothing is inferred: a field the
// answer leaves out stays out of the record and the site shows it as not recorded.
import { decode } from "./parse.mjs";
import { GOLGG } from "./normalize.mjs";

export const buildUrl = `${GOLGG}/game/ajax.build.php`;
export const buildsPageUrl = (id) => `${GOLGG}/game/stats/${id}/page-builds/`;
export const DDRAGON = "https://ddragon.leagueoflegends.com";

/** Players on a game page, by side, in Gol.gg's order: { blue: [{ champion, playerId, player }], red: [...] }. */
export function parsePlayers(html) {
  const tablesHtml = [...html.matchAll(/<table class='playersInfosLine[\s\S]*?<\/table>/gi)].map((m) => m[0]);
  if (tablesHtml.length !== 2) return undefined;
  const side = (t) => [...t.matchAll(/champions_icon\/([^'./]+)\.png'\/><\/a>&nbsp;<a class='link-blanc' href='[^']*player-stats\/(\d+)\/[^']*'[^>]*>([^<]*)<\/a>/g)]
    .map((m) => ({ champion: decode(m[1]), playerId: Number(m[2]), player: decode(m[3]).trim() }));
  return { blue: side(tablesHtml[0]), red: side(tablesHtml[1]) };
}

const SKILL = { 1: "Q", 2: "W", 3: "E", 4: "R" };
const int = (v) => (v == null || v === "" || !/^-?\d+$/.test(String(v)) ? undefined : Number(v));
const casts = (...vs) => { const n = vs.map(int); return n.every((x) => x != null) ? n : undefined; };

/**
 * One player's build from the ajax.build.php answer. Returns { build, missing } or { problems }.
 * `who` = { game, side, role, champion, player, playerId, checkedOn } from the stored game and its page.
 */
export function buildFromAnswer(answer, who) {
  const s = Array.isArray(answer) && Array.isArray(answer[0]) ? answer[0][0] : undefined;
  if (!s || typeof s !== "object") return { problems: [`${who.player} (${who.champion}): no build in the answer`] };
  const missing = [];
  const build = { game: who.game, side: who.side, role: who.role, champion: who.champion, player: who.player, playerId: who.playerId };

  const spells = [int(s.spell1), int(s.spell2)];
  if (spells.every((x) => x > 0)) {
    build.spells = spells;
    const c = casts(s.summoner1Casts, s.summoner2Casts);
    if (c) build.spellCasts = c;
  } else missing.push("summoner spells");

  const slots = [0, 1, 2, 3, 4, 5].map((i) => int(s[`item${i}`]));
  if (slots.every((x) => x != null)) {
    build.final = slots;
    if (int(s.item6)) build.trinket = int(s.item6);
  } else missing.push("final items");

  const perks = [0, 1, 2, 3, 4, 5].map((i) => int(s[`perk${i}`])), shards = [0, 1, 2].map((i) => int(s[`statperk${i}`]));
  const primary = int(s.perkprimarystyle), secondary = int(s.perksubstyle);
  if (primary && secondary && perks.every((x) => x > 0)) {
    build.runes = { primary, keystone: perks[0], primaryRunes: perks.slice(1, 4), secondary, secondaryRunes: perks.slice(4, 6) };
    if (shards.every((x) => x > 0)) build.runes.shards = shards; else missing.push("stat shards");
  } else missing.push("runes");

  const order = String(s.skillorder ?? "").split(";").filter(Boolean);
  if (order.length && order.every((x) => SKILL[x])) {
    build.skills = order.map((x) => SKILL[x]).join("");
    const c = casts(s.spell1Casts, s.spell2Casts, s.spell3Casts, s.spell4Casts);
    if (c) build.skillCasts = c;
  } else missing.push("skill order");

  // Purchase log: buys and sells in game time (seconds). An undo removes the step it undoes, as in the game client.
  // ITEM_DESTROYED (components merged into an item, potions drunk) is not a purchase and is left out.
  const events = Array.isArray(answer[1]) ? answer[1] : [];
  const log = [];
  for (const e of events) {
    const t = int(e?.build_time), item = int(e?.itemId);
    if (t == null || item == null) continue;
    if (e.typeEvent === "ITEM_UNDO") { log.pop(); continue; }
    if (item <= 0) continue;
    if (e.typeEvent === "ITEM_PURCHASED") log.push([t, item, "buy"]);
    else if (e.typeEvent === "ITEM_SOLD") log.push([t, item, "sell"]);
  }
  if (log.length) build.purchases = log; else missing.push("purchase timeline");
  if (missing.length) build.missing = missing;
  return { build, missing };
}

/** Every Data Dragon id a set of builds refers to, for one patch. */
export function referencedIds(builds) {
  const items = new Set(), runes = new Set(), trees = new Set(), spells = new Set(), champions = new Set();
  for (const b of builds) {
    for (const i of [...(b.final ?? []), b.trinket, ...(b.purchases ?? []).map((p) => p[1])]) if (i) items.add(i);
    if (b.runes) {
      trees.add(b.runes.primary); trees.add(b.runes.secondary);
      for (const r of [b.runes.keystone, ...b.runes.primaryRunes, ...b.runes.secondaryRunes, ...(b.runes.shards ?? [])]) runes.add(r);
    }
    for (const s of b.spells ?? []) spells.add(s);
    champions.add(b.champion);
  }
  return { items, runes, trees, spells, champions };
}

const plain = (html) => decode(String(html ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "")).replace(/[ \t]+/g, " ").split("\n").map((l) => l.trim()).filter(Boolean);
// Stat shards are not in Data Dragon's rune trees; CommunityDragon's perks list names them. Icons resolve under
// Data Dragon's shared perk-images path, which hosts the same StatMods files.
const shardIcon = (iconPath) => (iconPath ?? "").replace(/^\/lol-game-data\/assets\/v1\//, "");

/**
 * Names, icons and short stats for exactly the ids in `ref`, from one patch's Data Dragon files.
 * Returns { assets, unknown } where `unknown` lists ids the files do not name (kept off the site, reported).
 */
export function assetsFor(ref, version, files, resolve) {
  const { item, runesReforged, summoner, championFull, cdragonPerks } = files;
  const unknown = [];
  const items = {};
  for (const id of [...ref.items].sort((a, b) => a - b)) {
    const it = item.data[String(id)];
    if (!it) { unknown.push(`item ${id}`); continue; }
    const tags = it.tags ?? [];
    const stats = plain((String(it.description).match(/<stats>([\s\S]*?)<\/stats>/i) ?? [])[1]);
    items[id] = {
      name: it.name, gold: it.gold?.total ?? 0, ...(stats.length ? { stats } : {}), ...(it.plaintext ? { text: it.plaintext } : {}),
      ...(it.from?.length ? { from: it.from.map(Number) } : {}),
      kind: tags.includes("Trinket") ? "trinket" : tags.includes("Boots") ? "boots" : it.consumed ? "consumable"
        : !(it.into?.length) && (it.gold?.total ?? 0) >= 2000 ? "completed" : (it.gold?.total ?? 0) <= 500 && !it.from?.length ? "starter-or-component" : "component",
    };
  }
  const runes = {}, trees = {};
  const byRune = new Map();
  for (const t of runesReforged) for (const [row, slot] of t.slots.entries()) for (const r of slot.runes) byRune.set(r.id, { r, tree: t.id, row });
  for (const id of [...ref.trees].sort()) {
    const t = runesReforged.find((x) => x.id === id);
    if (!t) { unknown.push(`rune tree ${id}`); continue; }
    trees[id] = { name: t.name, icon: t.icon, rows: t.slots.map((s) => s.runes.map((r) => r.id)) };
    // Every rune of a tree in use, so the page can show the unpicked options subdued.
    for (const row of t.slots) for (const r of row.runes) runes[r.id] = { name: r.name, icon: r.icon, short: plain(r.shortDesc).join(" ") };
  }
  for (const id of [...ref.runes].sort()) {
    if (runes[id]) continue;
    if (byRune.has(id)) { const { r } = byRune.get(id); runes[id] = { name: r.name, icon: r.icon, short: plain(r.shortDesc).join(" ") }; continue; }
    const shard = cdragonPerks?.find((p) => p.id === id);
    if (shard && /StatMods/i.test(shard.iconPath ?? "")) { runes[id] = { name: shard.name, icon: shardIcon(shard.iconPath), short: plain(shard.shortDesc).join(" "), shard: true }; continue; }
    unknown.push(`rune ${id}`);
  }
  const spells = {};
  const byKey = new Map(Object.values(summoner.data).map((s) => [Number(s.key), s]));
  for (const id of [...ref.spells].sort((a, b) => a - b)) {
    const s = byKey.get(id);
    if (!s) { unknown.push(`summoner spell ${id}`); continue; }
    spells[id] = { name: s.name, icon: s.image.full, cooldown: s.cooldownBurn };
  }
  const abilities = {};
  const champs = new Map(Object.values(championFull.data).map((c) => [resolve(c.name) ?? resolve(c.id), c]));
  for (const id of [...ref.champions].sort()) {
    const c = champs.get(id);
    if (!c || c.spells?.length !== 4) { unknown.push(`abilities for ${id}`); continue; }
    abilities[id] = Object.fromEntries(["Q", "W", "E", "R"].map((k, i) => [k, { name: c.spells[i].name, icon: c.spells[i].image.full, maxrank: c.spells[i].maxrank }]));
  }
  return { assets: { ddragon: version, items, runes, trees, spells, abilities }, unknown };
}

/** The Data Dragon version for a game patch ("16.18" -> "16.18.1"), from Riot's versions list. */
export function ddragonVersionFor(patch, versions) {
  return versions.find((v) => v.startsWith(`${patch}.`));
}

/** JSON with two-space indents, but every array of plain values on one line (purchase steps, rune rows, item slots). */
export function compactJson(v) {
  return JSON.stringify(v, null, 2).replace(/\[\s*\n[^\[\]{}]*?\]/g, (m) => m.replace(/\s*\n\s*/g, " ").replace(/\[ /, "[").replace(/ \]$/, "]")) + "\n";
}
