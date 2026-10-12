// Turns parsed Riot patch-note sections into the structured records in data/patch-notes.json. Categories come from
// Riot's own structure and wording; values are never computed or filled in. See scripts/riot/parse.mjs.
import { allLines, blocks, classifySection, sections, slug, text } from "./parse.mjs";

// Riot's patches are labelled 26.16; the client, Data Dragon and Gol.gg call the same patch 16.16 (lib/patch.ts).
export const shortOf = (patch) => { const [a, b] = patch.split(".").map(Number); return `${a - 10}.${b}`; };
export const isTracked = (patch, first) => { const [a, b] = patch.split(".").map(Number), [c, d] = first.split(".").map(Number); return a > c || (a === c && b >= d); };

// ---------- champions ----------

const squash = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
export function championResolver(champions) {
  const by = new Map();
  for (const c of champions) {
    by.set(squash(c.name), c.id);
    by.set(squash(c.id), c.id);
    for (const a of c.aliases ?? []) if (!by.has(squash(a))) by.set(squash(a), c.id);
  }
  by.set(squash("Nunu"), by.get(squash("Nunu & Willump")) ?? "nunu-willump");
  by.set(squash("Wukong"), by.get(squash("Wukong")) ?? "wukong");
  return (name) => by.get(squash(name));
}

/** Champions named in a sentence, longest names first so "Master Yi" wins over "Yi". */
export function championsIn(sentence, champions) {
  const found = new Set();
  let s = ` ${sentence} `;
  for (const c of [...champions].sort((a, b) => b.name.length - a.name.length)) {
    const re = new RegExp(`(^|[^A-Za-z])${c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=[^A-Za-z]|$)`);
    if (re.test(s)) { found.add(c.id); s = s.replace(re, "$1 "); }
  }
  return [...found];
}

// Riot's stated intent in its own note: a champion is a buff or a nerf only when the note says so one way and not the
// other; anything mixed or unstated is an adjustment. A reviewed category (categoryBasis "reviewed") is kept by the
// refresh as long as the entry's lines are unchanged.
// First-person intent only: "indirect buffs", "since her nerfs" and the like describe history, not this patch.
const BUFF = /\bwe(?:'re| are| will be|'ll)? (?:\w+ ){0,2}(?:buffing|tuning (?:him|her|them|it) up)|\bgiv(?:e|ing) (?:him|her|them|it) (?:a |some )?(?:\w+ )?(?:buff|bump|boost|helping hand|love)\b|\b(?:moderate|small|slight|light|minor|another) buff\b|\bspace for a buff\b|\bcompensat(?:e|ion|ing)\b|\binject (?:a bit )?more power\b/i;
const NERF = /\bwe(?:'re| are| will be|'ll)? (?:\w+ ){0,2}(?:nerfing|toning|tapping|pulling back|hitting|going after|putting some restraints)|\b(?:moderate|small|slight|light|minor) nerf\b|\bdue a (?:\w+ )?nerf\b|\btoo (?:strong|reliable|performant)\b|\boverbuffed\b|\bconstrain/i;
const REWORK = /\brework|\bvisual and gameplay update\b|\bVGU\b/i;
export function championVerdict(context, summary = "") {
  const s = `${summary} ${context}`;
  if (REWORK.test(s)) return "rework";
  const b = BUFF.test(s), n = NERF.test(s);
  return b && !n ? "buff" : n && !b ? "nerf" : "adjustment";
}

// ---------- items, runes, systems ----------

const STAT = /^(?:t\d\s+)?(?:bonus\s+)?(?:attack damage|ability power|attack speed|health|mana|armor|magic resist(?:ance)?|ability haste|move(?:ment)? speed|critical strike(?: chance)?|lethality|armor penetration|magic penetration|omnivamp|life ?steal|health regen(?:eration)?|base health regen(?:eration)?|mana regen(?:eration)?|tenacity|heal and shield power|stats?)$/i;
const COST = /cost|gold|recipe|build path|combine|sell/i;
export function itemCategories(subject) {
  const cats = new Set();
  for (const g of subject.groups) for (const c of g.changes) {
    if (c.tag === "new" && !c.label) cats.add("new");
    else if (c.tag === "removed" && !c.after) cats.add("removed");
    else if (c.label && COST.test(c.label)) cats.add("cost");
    else if (c.label && STAT.test(c.label.replace(/\s*\(.*\)$/, ""))) cats.add("stats");
    else cats.add("effect");
  }
  if (/\(new\)|^new item/i.test(subject.summary ?? "")) cats.add("new");
  if (/\(removed\)|^removed/i.test(subject.summary ?? "")) cats.add("removed");
  return ["new", "removed", "stats", "cost", "effect"].filter((c) => cats.has(c));
}

// The keystones on Summoner's Rift: game structure, not values.
const KEYSTONES = new Set(["press the attack", "lethal tempo", "fleet footwork", "conqueror", "electrocute", "dark harvest", "hail of blades",
  "summon aery", "arcane comet", "phase rush", "grasp of the undying", "aftershock", "guardian", "glacial augment", "unsealed spellbook", "first strike", "predator"]);
export function runeCategory(name) {
  if (KEYSTONES.has(name.toLowerCase())) return "keystone";
  return /shard/i.test(name) ? "shard" : "minor";
}

const SYSTEM_RULES = [
  ["jungle", /jungle|camp|smite|\bpets?\b|scuttle|gromp|krug|raptor|wolves|blue buff|red buff/i],
  ["objectives", /dragon|drake|baron|nashor|herald|grub|atakhan|elder|\bvoid\b|objective/i],
  ["minions", /minion|wave|cannon|super minion/i],
  ["turrets", /turret|tower|plating|\bplates?\b|inhibitor|nexus|structure/i],
  ["summoners", /flash|teleport|ignite|exhaust|barrier|cleanse|ghost|\bheal\b|summoner/i],
  ["role-quests", /role quest|\bquests?\b/i],
  ["map-economy", /gold|bount|experience|\bxp\b|\bmap\b|brush|ward|vision|economy|income|starting item|support item|world atlas/i],
];
export function systemCategory(subject) {
  for (const [cat, re] of SYSTEM_RULES) if (re.test(subject.name)) return cat;
  const all = subject.groups.flatMap((g) => g.changes.map((c) => c.text)).join(" ");
  for (const [cat, re] of SYSTEM_RULES) if (re.test(all)) return cat;
  return "other";
}

// Bug fixes: kept only when they change Summoner's Rift gameplay. Client, cosmetic, audio, store and mode fixes stay out.
const COSMETIC = /classic|\bskins?\b|chroma|practice tool|\bstore\b|collection|client|sort(ing)? (option|effect)|replay|spectator|debug|tab buttons?|rune page|portrait|homepage|icons? fail|sound|audio|volume|camera|tooltip|description|\bVFX\b(?![^.]*hitbox)|aram|arena|mayhem|swarm|\btft\b/i;
const GAMEPLAY = /\bitems?\b|rune|dragon|baron|herald|grub|atakhan|minion|turret|ward|smite|jungle|damage|cooldown|shield|heal|stack|hitbox|omnivamp|teleport|recall|flash|role quest|boots|homeguard|attack|ability|\b[QWER]\b|\(\s*[QWER]\s*\)|passive/i;
export function gameplayFix(line, champions) {
  if (COSMETIC.test(line.text)) return false;
  return championsIn(line.text, champions).length > 0 || GAMEPLAY.test(line.text);
}

const DATE = /(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}(?:, \d{4})?)/;
function isoDay(s, year) {
  const m = s?.match(DATE)?.[1];
  if (!m) return null;
  const d = /\//.test(m) ? new Date(`${year}/${m.split("/").slice(0, 2).join("/")}`) : new Date(/\d{4}/.test(m) ? m : `${m}, ${year}`);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---------- the patch ----------

/**
 * One patch record from an article ({ title, url, published, rev, body }). `now` stamps new entries; `previous` (the
 * stored record) keeps its timestamps and reviewed categories for entries whose content is unchanged.
 * Returns { patch, warnings }.
 */
export function buildPatch(patchLabel, article, champions, { now, previous } = {}) {
  const resolve = championResolver(champions);
  const year = Number(article.published?.slice(0, 4)) || 2000 + Number(patchLabel.split(".")[0]);
  const warnings = [], excluded = [], midPatch = [], entries = [];
  let bugfixLeftOut = 0;
  const add = (e) => {
    let id = e.id, n = 2;
    while (entries.some((x) => x.id === id)) id = `${e.id}-${n++}`;
    entries.push({ ...e, id });
  };

  const fromSubject = (kind, s, mid) => {
    const base = {
      kind, subject: s.name, ...(s.anchor ? { anchor: s.anchor } : {}), ...(s.icon ? { icon: s.icon } : {}),
      ...(s.context.length ? { context: s.context.join("\n\n") } : {}),
      groups: s.groups.map((g) => ({ ...(g.title ? { title: g.title } : {}), ...(g.icon ? { icon: g.icon } : {}), changes: g.changes })),
      ...(mid ? { midPatch: mid } : {}),
    };
    if (kind === "champion") {
      const ref = resolve(s.name);
      if (!ref) warnings.push(`${patchLabel}: champion "${s.name}" is not in data/champions.json; kept without a link.`);
      return { id: `champion-${ref ?? slug(s.name)}`, ...base, ...(ref ? { ref } : {}), category: championVerdict(base.context ?? "", s.summary), categoryBasis: "riot-wording" };
    }
    if (kind === "item") {
      // Items are keyed by name (Riot's own label); the Data Dragon id is kept when the page's icon carries it.
      const itemId = s.icon?.match(/\/img\/item\/(\d+)\.png/)?.[1];
      return { id: `item-${slug(s.name)}`, ...base, ref: slug(s.name), ...(itemId ? { itemId } : {}), categories: itemCategories(s) };
    }
    if (kind === "rune") return { id: `rune-${slug(s.name)}`, ...base, ref: slug(s.name), category: runeCategory(s.name) };
    const affects = s.groups.flatMap((g) => g.changes).filter((c) => /affected champions?/i.test(c.label ?? ""))
      .flatMap((c) => (c.value ?? "").split(/,\s*/)).map((n) => resolve(n.trim())).filter(Boolean);
    return { id: `system-${slug(s.name)}`, ...base, category: systemCategory(s), ...(affects.length ? { affects } : {}) };
  };

  for (const sec of sections(article.body)) {
    const kind = classifySection(sec.title);
    if (kind === "skip") { if (sec.title) excluded.push(sec.title); continue; }
    if (kind === "unknown") { excluded.push(sec.title); warnings.push(`${patchLabel}: section "${sec.title}" is not a known Summoner's Rift section; left out.`); continue; }
    if (kind === "bugfix") {
      const lines = allLines(sec.html);
      const kept = lines.filter((l) => gameplayFix(l, champions));
      bugfixLeftOut += lines.length - kept.length;
      if (kept.length) add({ id: "system-bug-fixes", kind: "system", subject: "Bug fixes", category: "bugfix",
        groups: [{ changes: kept }], affects: [...new Set(kept.flatMap((l) => championsIn(l.text, champions)))] });
      continue;
    }
    if (kind === "midpatch") {
      const mid = { title: sec.title, date: isoDay(sec.title, year) ?? isoDay(text(sec.html).slice(0, 300), year) };
      midPatch.push(mid);
      for (const s of blocks(sec.html)) {
        const k = resolve(s.name) ? "champion" : /\/img\/item\//.test(s.icon ?? "") ? "item" : KEYSTONES.has(s.name.toLowerCase()) ? "rune" : "system";
        add(fromSubject(k, s, mid));
      }
      continue;
    }
    for (const s of blocks(sec.html, { champions: kind === "champion" })) add(fromSubject(kind, s));
  }

  // Timestamps and reviewed categories survive while an entry's content is unchanged.
  const prev = new Map((previous?.entries ?? []).map((e) => [e.id, e]));
  const canon = (v) => Array.isArray(v) ? v.map(canon) : v && typeof v === "object"
    ? Object.fromEntries(Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => [k, canon(v[k])])) : v;
  const content = (e) => JSON.stringify(canon([e.subject, e.groups, e.context ?? null, e.midPatch ?? null]));
  for (const e of entries) {
    const p = prev.get(e.id);
    const same = p && content(p) === content(e);
    e.updatedAt = same ? p.updatedAt : now;
    if (same && p.categoryBasis === "reviewed") { e.category = p.category; e.categoryBasis = "reviewed"; }
    if (p && !same) e.corrected = true; // Riot edited this entry after it was first stored
    else if (same && p.corrected) e.corrected = true;
  }

  return {
    warnings,
    patch: {
      patch: patchLabel, short: shortOf(patchLabel), title: article.title, url: article.url,
      published: article.published ? article.published.slice(0, 10) : null, rev: article.rev,
      midPatch, excluded, ...(bugfixLeftOut ? { bugfixesLeftOut: bugfixLeftOut } : {}), entries,
    },
  };
}
