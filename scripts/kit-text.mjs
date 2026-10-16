// Prints Riot's official ability text for the champions named on the command line (Data Dragon champion files, plus
// the client's game data mirrored by CommunityDragon for the fuller descriptions), as Markdown for the job summary.
// Read-only: writes nothing to data/. It runs on a GitHub runner (.github/workflows/kit-text.yml) because Data Dragon
// is not reachable from Claude's environments; kit proposals are written from this text, never from memory.
const names = process.argv.slice(2);
if (!names.length) throw new Error("Name at least one champion");
const json = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
};
const clean = (s = "") => s.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const [version] = await json("https://ddragon.leagueoflegends.com/api/versions.json");
const roster = Object.values((await json(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`)).data);
const out = [`# Official ability text · Data Dragon ${version}`, ""];
for (const name of names) {
  const entry = roster.find((c) => c.name.toLowerCase() === name.toLowerCase() || c.id.toLowerCase() === name.toLowerCase());
  if (!entry) { out.push(`## ${name}`, "", "Not in Data Dragon's roster.", ""); continue; }
  const c = (await json(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion/${entry.id}.json`)).data[entry.id];
  out.push(`## ${c.name} — ${c.title}`, "", `Source: https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion/${entry.id}.json`, "",
    `Tags: ${c.tags.join(", ")} · resource: ${c.partype} · info ${JSON.stringify(c.info)}`,
    `Stats: ${JSON.stringify(c.stats)}`, "",
    `**Passive · ${c.passive.name}**: ${clean(c.passive.description)}`, "");
  c.spells.forEach((s, i) => out.push(`**${"QWER"[i]} · ${s.name}** (cooldown ${s.cooldownBurn}; cost ${s.costBurn} ${clean(s.costType)}; range ${s.rangeBurn}): ${clean(s.description)}`,
    "", `Tooltip: ${clean(s.tooltip)}`, ""));
  try {
    const g = await json(`https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champions/${c.key}.json`);
    out.push(`Client game data: https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champions/${c.key}.json`, "",
      `Roles: ${(g.roles ?? []).join(", ")} · tactical info ${JSON.stringify(g.tacticalInfo ?? {})} · playstyle ${JSON.stringify(g.playstyleInfo ?? {})}`, "",
      `Passive: ${clean(g.passive?.description)}`, "");
    for (const s of g.spells ?? []) out.push(`${s.spellKey?.toUpperCase()} · ${s.name}: ${clean(s.dynamicDescription || s.description)}`, "");
  } catch (e) { out.push(`Client game data unavailable: ${e.message}`, ""); }
}
console.log(out.join("\n"));
