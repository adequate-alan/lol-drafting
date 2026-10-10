// Adds every champion in Riot's Data Dragon roster that data/champions.json does not have yet.
//
//   node scripts/sync-champions.mjs          writes data/champions.json
//   node scripts/sync-champions.mjs --check  exits 1 if champions are missing (writes nothing)
//
// Existing entries are never changed. A new champion is a roster-only entry: name and Data Dragon key, roles,
// a damage type, all attributes 0 and `rosterOnly: true`. Roles come from Meraki Analytics' position data when it
// answers, otherwise from the Data Dragon class tags (a rough guess). The engine never recommends a roster-only
// champion; it can still be locked, searched and picked as an enemy. Reviewing one means setting its attributes and
// deleting `rosterOnly`.
//
// Runs in GitHub Actions (.github/workflows/sync-champions.yml): ddragon.leagueoflegends.com is not reachable from
// Claude's environments.
import { readFileSync, writeFileSync } from "node:fs";

const FILE = new URL("../data/champions.json", import.meta.url);
const ATTRS = ["engage", "frontline", "peel", "sustainedDps", "burst", "poke", "scaling", "lanePressure", "sidePressure", "objectiveControl"];
// Champion ids whose Data Dragon key is not the name without punctuation (kept in step with lib/champion-icons.ts).
const ID_BY_KEY = {
  Chogath: "chogath", Kaisa: "kaisa", KSante: "ksante", Renata: "renata-glasc", MonkeyKing: "wukong", Nunu: "nunu-willump",
  Leblanc: "leblanc", Khazix: "khazix", Velkoz: "velkoz", Belveth: "belveth", KogMaw: "kog-maw", RekSai: "rek-sai",
};
const POSITION = { TOP: "TOP", JUNGLE: "JUNGLE", MIDDLE: "MID", BOTTOM: "BOT", SUPPORT: "SUPPORT" };
const TAG_ROLE = { Marksman: "BOT", Support: "SUPPORT", Mage: "MID", Assassin: "MID", Fighter: "TOP", Tank: "TOP" };

const check = process.argv.includes("--check");

async function json(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

const idFor = (key, name) => ID_BY_KEY[key] ?? name.toLowerCase().replace(/['.&]/g, "").trim().replace(/\s+/g, "-");
const keyFor = (c) => Object.entries(ID_BY_KEY).find(([, id]) => id === c.id)?.[0] ?? c.name.replace(/[^A-Za-z]/g, "");

const [version] = await json("https://ddragon.leagueoflegends.com/api/versions.json");
const roster = Object.values((await json(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`)).data);
let meraki = null;
try {
  meraki = await json("https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions.json");
} catch (e) {
  console.warn(`Meraki positions unavailable (${e.message}); roles fall back to Data Dragon class tags.`);
}

const champions = JSON.parse(readFileSync(FILE, "utf8"));
const known = new Set(champions.map((c) => c.id));
const keys = new Set(roster.map((c) => c.id));
const strays = champions.filter((c) => !keys.has(keyFor(c))).map((c) => `${c.id} (key ${keyFor(c)})`);
if (strays.length) console.warn(`Not in Data Dragon ${version} under the expected key (icons fall back to initials): ${strays.join(", ")}`);

const added = [];
for (const dd of roster) {
  const id = idFor(dd.id, dd.name);
  if (known.has(id)) continue;
  const positions = (meraki?.[dd.id]?.positions ?? []).map((p) => POSITION[p]).filter(Boolean);
  const fromTags = [...new Set(dd.tags.map((t) => TAG_ROLE[t]).filter(Boolean))];
  const roles = positions.length ? [...new Set(positions)] : fromTags.length ? fromTags : ["MID"];
  const { attack, magic } = dd.info;
  const damage = magic - attack >= 2 ? "AP" : attack - magic >= 2 ? "AD" : "mixed";
  added.push({
    id, name: dd.name, aliases: [], roles, damage,
    attrs: Object.fromEntries(ATTRS.map((a) => [a, 0])),
    flags: [], reviewed: false, rosterOnly: true,
    note: `Roster entry from Data Dragon ${version}. Roles from ${positions.length ? "Meraki Analytics positions" : "Data Dragon class tags"}; damage type from Data Dragon ratings. Attributes not reviewed.`,
  });
}

console.log(`Data Dragon ${version}: ${roster.length} champions, ${champions.length} in data, ${added.length} missing.`);
for (const c of added) console.log(`  + ${c.name} (${c.id}) ${c.roles.join("/")} ${c.damage}`);
if (check) process.exit(added.length ? 1 : 0);
if (added.length) {
  // The file is ordered by name (code-point order, so K'Sante comes before Kai'Sa).
  const all = [...champions, ...added].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  writeFileSync(FILE, JSON.stringify(all, null, 2) + "\n");
}
