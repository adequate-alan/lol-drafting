// Item history for historical Pro Builds (alan, 2026-11-10; lib/item-history.ts). Run by the daily patch-notes workflow
// after Riot's notes are read, or by hand:
//
//   npx tsx scripts/item-history.ts [--dry-run] [--verify]
//
// Regenerates `archive` and `changes` in data/item-changes.json from data/patch-notes.json and the item names in
// data/build-assets.json, keeping the hand-kept `external` records and the `ids` read from Data Dragon. With --verify (a
// GitHub runner: leagueoflegends.com and Data Dragon do not answer Claude's cloud environments) it reads the Riot page of
// every external record still pending and marks it verified only when that page shows the claim, and looks up the
// Summoner's Rift id of any item without one. A refused request or a challenge stops that step; nothing is invented.
// Prints a summary (also the run summary) with every build that holds an item its own history says it could not hold.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildPatch } from "./riot/normalize.mjs";
import { parseArticle } from "./riot/parse.mjs";
import { buildItems, checkBuild, itemHistoryFrom, itemKey, VERDICT_LABEL } from "../lib/item-history";
import { patchKey, shortPatch } from "../lib/patch";
import { Files, type ItemChanges } from "../lib/schema";

const dry = process.argv.includes("--dry-run"), verify = process.argv.includes("--verify");
const dataDir = join(process.cwd(), "data");
const raw = (f: string) => JSON.parse(readFileSync(join(dataDir, f), "utf8"));
const notes = Files["patch-notes.json"].parse(raw("patch-notes.json"));
const assets = Files["build-assets.json"].parse(raw("build-assets.json")).patches;
const champions = Files["champions.json"].parse(raw("champions.json"));
const before = Files["item-changes.json"].parse(raw("item-changes.json"));
const today = new Date().toISOString().slice(0, 10);
const report: string[] = [], warnings: string[] = [];

const UA = "lol-drafting-item-history/1.0 (+https://github.com/adequate-alan/lol-drafting; daily, a few pages)";
async function get(url: string): Promise<string> {
  await new Promise((r) => setTimeout(r, 2000));
  const res = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { "User-Agent": UA, "Accept-Language": "en-US" } });
  const text = await res.text();
  if (res.headers.get("cf-mitigated") || /challenge-platform|cf-chl|<title>Just a moment/i.test(text)) throw new Error(`${url}: answered with a bot challenge. Not bypassed.`);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}.`);
  return text;
}

const next: ItemChanges = structuredClone(before);
if (verify) {
  try {
    // External claims: verified only when Riot's own page lists the item as removed (or the claimed change).
    for (const c of next.external.filter((x) => x.refreshStatus !== "verified")) {
      const article = parseArticle(await get(c.source.url));
      const built = buildPatch(c.patch, { ...article, url: c.source.url }, champions, { now: new Date().toISOString() });
      const entry = built.patch.entries.find((e) => e.kind === "item" && itemKey(e.subject) === itemKey(c.item));
      const lines = entry?.groups.flatMap((g) => g.changes) ?? [];
      const shows = c.type === "removed" ? !!entry && (entry.categories?.includes("removed") || lines.some((l) => /\bremoved\b/i.test(l.text)))
        : !!entry;
      if (!shows) { warnings.push(`${c.item} (${c.patch}): Riot's page does not show this ${c.type} under Items; left pending.`); continue; }
      Object.assign(c, { origin: "riot-patch-notes", refreshStatus: "verified", lastChecked: today,
        lines: lines.map(({ label, before: b, after: a, text }) => (b || a ? { label, before: b, after: a } : { label, text })),
        ...(entry!.context ? { context: entry!.context } : {}), ...(entry!.anchor ? { source: { ...c.source, anchor: entry!.anchor } } : {}) });
      delete c.pendingClaim;
      report.push(`${c.item} (${c.patch}): verified on Riot's page.`);
    }
    // Summoner's Rift ids for items the build files don't name (map 11, the Summoner's Rift id range, one match).
    const missing = [...next.external, ...itemHistoryFrom(notes, assets, next).changes].filter((c) => !c.itemId && !next.ids[c.item]);
    if (missing.length) {
      const versions: string[] = JSON.parse(await get("https://ddragon.leagueoflegends.com/api/versions.json"));
      const files = new Map<string, Record<string, { name: string; maps?: Record<string, boolean> }>>();
      for (const c of missing) {
        // A removed item is looked up on the patch before its removal; anything else on its own patch.
        const [maj, min] = shortPatch(c.patch).split(".").map(Number);
        const want = c.type === "removed" ? `${maj}.${min - 1}.` : `${maj}.${min}.`;
        const ver = versions.find((v) => v.startsWith(want));
        if (!ver) { warnings.push(`${c.item}: no Data Dragon version for ${want}x.`); continue; }
        if (!files.has(ver)) files.set(ver, JSON.parse(await get(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/en_US/item.json`)).data);
        const hits = Object.entries(files.get(ver)!).filter(([id, it]) => itemKey(it.name) === itemKey(c.item) && it.maps?.["11"] && Number(id) < 10000);
        if (hits.length === 1) { next.ids[c.item] = { id: hits[0][0], source: `Data Dragon ${ver}`, checkedOn: today }; report.push(`${c.item}: Summoner's Rift id ${hits[0][0]} (Data Dragon ${ver}).`); }
        else warnings.push(`${c.item}: ${hits.length} Summoner's Rift ids in Data Dragon ${ver}; left without an id.`);
      }
    }
  } catch (e) { warnings.push(`Verification stopped: ${(e as Error).message} Kept the last verified data.`); }
}
for (const c of next.external) if (!c.itemId && next.ids[c.item]) c.itemId = next.ids[c.item].id;
Object.assign(next, itemHistoryFrom(notes, assets, next));

// Every recorded build against the history: a held item that could not have been bought is a data-quality flag.
const builds = Files["pro-builds.json"].parse(raw("pro-builds.json"));
const games = new Map([...Files["pro-games.json"].parse(raw("pro-games.json")).games, ...(builds.games ?? [])].map((g) => [g.id, g]));
let flagged = 0, changed = 0;
for (const b of builds.builds) {
  const g = games.get(b.game);
  if (!g) continue;
  const a = assets[g.patch];
  const check = checkBuild(next, g, buildItems(b).map((id) => ({ id, name: a?.items[id]?.name ?? "" })));
  if (check?.marks.length) changed += 1;
  for (const q of check?.quality ?? []) { flagged += 1; warnings.push(`Game ${b.game} ${b.player} (${b.champion}): ${q.quality}`); }
}

const out = JSON.stringify(next, null, 2) + "\n";
const same = out === JSON.stringify(before, null, 2) + "\n";
const lines = [
  `## Item history`, "",
  `${next.changes.length} item changes from Riot's notes ${patchKey(next.archive.first)}–${patchKey(next.archive.latest)}, ${next.external.length} from earlier patches (${next.external.filter((c) => c.refreshStatus !== "verified").length} pending a read of Riot's page).`,
  ...next.changes.filter((c) => c.patch === next.archive.latest).map((c) => `- ${c.patch} ${c.item}: ${VERDICT_LABEL[c.type]} (${c.basis})${c.itemId ? "" : ", no item id yet"}`),
  `${changed} of ${builds.builds.length} recorded builds hold an item changed since their game; ${flagged} data-quality flag${flagged === 1 ? "" : "s"}.`,
  ...report, ...(warnings.length ? ["", "Warnings:", ...warnings.map((w) => `- ${w}`)] : []),
  "", same ? "Item history unchanged." : dry ? "Item history would change (dry run, nothing written)." : "Item history updated.",
];
console.log(lines.join("\n"));
for (const w of warnings) console.log(`::warning title=Item history::${w.replace(/\n/g, " ")}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${!same && !dry}\n`);
if (!same && !dry) writeFileSync(join(dataDir, "item-changes.json"), out);
