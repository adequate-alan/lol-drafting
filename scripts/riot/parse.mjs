// Parsers for Riot's official League of Legends patch notes (leagueoflegends.com), used by the daily patch-notes check
// (scripts/refresh-patch-notes.mjs). Pure functions over the HTML Riot serves: no network, no guessing. Every value
// stored is copied from the page; a line without Riot's "before ⇒ after" arrow keeps its text and no numbers.
//
// Only Summoner's Rift drafting content is kept (alan, 2026-10-12): champions, items, runes, systems, mid-patch
// updates and gameplay bug fixes. TFT, ARAM / ARAM Mayhem, Arena, League Classic, skins, events, esports and client
// sections are left out and listed in `excluded` so a run can show what it skipped.

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", hellip: "…", ndash: "–", mdash: "—" };
export function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}
/** Visible text of an HTML fragment, whitespace collapsed. */
export const text = (html) => decode(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")).replace(/[\s ]+/g, " ").trim();
const slug = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/['’.]/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export { slug };

/** Data Dragon image behind Riot's image proxy (am-a.akamaihd.net/image?f=…), or the URL as given. */
export function imageUrl(src) {
  if (!src) return undefined;
  const u = decode(src);
  const f = u.match(/[?&]f=([^&]+)/);
  return f ? decodeURIComponent(f[1]) : u;
}
const firstImg = (html) => imageUrl(html.match(/<img[^>]*\ssrc="([^"]+)"/i)?.[1]);

// ---------- the article: Next.js page data ----------

/** The patch-notes article inside a Riot page: title, publish date, revision and the rich-text body. */
export function parseArticle(pageHtml) {
  const m = pageHtml.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("No page data found (layout changed or not a Riot article page).");
  const page = JSON.parse(m[1])?.props?.pageProps?.page;
  const blade = page?.blades?.find((b) => b.type === "patchNotesRichText");
  const body = blade?.richText?.body;
  if (!page || typeof body !== "string") throw new Error("No patch-notes body on the page.");
  return {
    title: page.title,
    url: page.url,
    published: page.displayedPublishDate ?? page.analytics?.publishDate ?? null,
    rev: page.analytics?.rev ?? null,
    body,
  };
}

/** Patch-notes articles listed on Riot's patch-notes tag page: { patch: "26.16", title, url, published, rev }. */
export function parseIndex(pageHtml) {
  const m = pageHtml.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("No page data on the patch-notes index.");
  const out = [];
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== "object") return;
    const url = o.action?.payload?.url;
    const p = typeof o.title === "string" && o.title.match(/^(?:League of Legends )?Patch (\d{2})\.(\d{1,2}) Notes$/i);
    if (p && typeof url === "string") {
      out.push({ patch: `${Number(p[1])}.${Number(p[2])}`, title: o.title, url: new URL(url, "https://www.leagueoflegends.com").href.replace(/\/?$/, "/"),
        published: o.publishedAt ?? o.analytics?.publishDate ?? null, rev: o.analytics?.rev ?? null });
      return;
    }
    Object.values(o).forEach(walk);
  };
  walk(JSON.parse(m[1]));
  return [...new Map(out.map((x) => [x.patch, x])).values()];
}

// ---------- sections ----------

const KEEP = [
  [/^champions?$/i, "champion"],
  [/^items?$/i, "item"],
  [/^runes?$/i, "rune"],
  [/^(systems?|jungle|objectives?|summoner spells?|role quests?|minions?|turrets?|map|economy|gameplay)$/i, "system"],
  [/mid-?patch|hotfix|patch \d+\.\d+b\b/i, "midpatch"],
  [/^bug ?fix/i, "bugfix"],
];
// Sections that are never Summoner's Rift drafting content. Anything not matched here or in KEEP is left out too, and
// reported as unknown so a new kind of section is looked at rather than silently imported or lost.
const SKIP = /^(|patch highlights|classic|league classic|aram.*|arena|tft.*|teamfight tactics.*|upcoming skins.*|skins.*|chromas?|hall of legends|team voice|private replays|ranked 5s|updated system requirements|.*event.*|.*pass.*|esports.*|clash|swarm.*|.*client.*|.*mode.*)$/i;

/** The body split at its top-level headings: [{ title, html }]. */
export function sections(body) {
  const parts = body.split(/<header class="header-primary">\s*(<h2[^>]*>[\s\S]*?<\/h2>)\s*<\/header>/i);
  const out = [];
  for (let i = 1; i < parts.length; i += 2) out.push({ title: text(parts[i]), html: parts[i + 1] ?? "" });
  return out;
}

export function classifySection(title) {
  for (const [re, kind] of KEEP) if (re.test(title)) return kind;
  return SKIP.test(title) ? "skip" : "unknown";
}

// ---------- change lines ----------

/** One change line as Riot wrote it: label, the value before and after the ⇒ arrow, a NEW / REMOVED tag. */
export function parseLine(html) {
  let tag;
  const tagged = html.match(/<span[^>]*background[^>]*>\s*(?:<strong>)?\s*(?:&nbsp;|\s)*([A-Za-z ]+?)(?:&nbsp;|\s)*(?:<\/strong>)?\s*<\/span>/i);
  if (tagged) {
    const t = tagged[1].trim().toLowerCase();
    if (["new", "removed", "updated"].includes(t)) tag = t;
    html = html.replace(tagged[0], "");
  }
  const full = text(html);
  const line = { text: full };
  if (tag) line.tag = tag;
  const lab = full.match(/^([^:⇒]{1,90}?):\s+([\s\S]*)$/);
  const rest = lab ? lab[2] : full;
  if (lab) line.label = lab[1].trim();
  const arrow = rest.split("⇒");
  if (arrow.length === 2) {
    const before = arrow[0].trim(), after = arrow[1].trim();
    if (before) line.before = before;
    if (after) line.after = after;
  } else if (lab) {
    line.value = rest.trim();
  }
  return line;
}

/** Ordered pieces of a section: subject icons, headings (h3/h4), context quotes, list items and arrow paragraphs. */
function tokens(html) {
  const re = /<a[^>]*class="reference-link"[^>]*>\s*<img[^>]*src="([^"]+)"|<h3[^>]*class="[^"]*change-title[^"]*"[^>]*>([\s\S]*?)<\/h3>|<h4[^>]*>([\s\S]*?)<\/h4>|<blockquote[^>]*>([\s\S]*?)<\/blockquote>|<li[^>]*>([\s\S]*?)<\/li>|<p[^>]*>((?:(?!<\/p>)[\s\S])*?⇒(?:(?!<\/p>)[\s\S])*?)<\/p>|<p[^>]*class="[^"]*summary[^"]*"[^>]*>([\s\S]*?)<\/p>|<p>((?:(?!<\/p>|reference-link)[\s\S])*?)<\/p>/gi;
  const out = [];
  for (const m of html.matchAll(re)) {
    if (m[1] != null) out.push({ t: "icon", src: imageUrl(m[1]) });
    else if (m[2] != null) out.push({ t: "title", name: text(m[2]), id: m[0].match(/\sid="([^"]+)"/)?.[1] });
    else if (m[3] != null) out.push({ t: "h4", name: text(m[3]), icon: firstImg(m[0]) });
    else if (m[4] != null) out.push({ t: "context", text: text(m[4]) });
    else if (m[5] != null) out.push({ t: "line", html: m[5] });
    else if (m[6] != null) out.push({ t: "line", html: m[6] });
    else if (m[7] != null) out.push({ t: "summary", text: text(m[7]) });
    else if (m[8] != null && text(m[8])) out.push({ t: "para", text: text(m[8]) });
  }
  return out;
}

// Headings that are display or client notes, not gameplay (e.g. 26.20's "Scoreboard Cleanup" under Items).
const NOT_GAMEPLAY = /scoreboard|tooltip|\bhud\b|visual|clarity|audio|sound|vfx|sfx|icon/i;

/**
 * Subjects in one section, in page order: [{ name, anchor, icon, context[], summary, groups: [{ title, icon, changes }] }].
 * An h3 title starts a subject and its h4s are groups (abilities, base stats). Without an h3, or outside the Champions
 * section when an h4 carries its own context quote, the h4 itself is the subject (Systems, grouped items).
 */
export function blocks(sectionHtml, { champions = false } = {}) {
  const toks = tokens(sectionHtml);
  const out = [];
  let cur, group, icon;
  const start = (s) => { cur = s; group = s.groups[0]; out.push(s); };
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t === "icon") { icon = t.src; continue; }
    if (t.t === "title") { start({ name: t.name, anchor: t.id, icon, context: [], groups: [{ changes: [] }] }); icon = undefined; continue; }
    if (t.t === "h4") {
      const ownSubject = !cur?.anchor || (!champions && toks[i + 1]?.t === "context");
      if (ownSubject) start({ name: t.name, icon: t.icon, context: [], groups: [{ changes: [] }] });
      else { group = { title: t.name, icon: t.icon, changes: [] }; cur.groups.push(group); }
      continue;
    }
    if (!cur) continue;
    if (t.t === "context") cur.context.push(t.text);
    else if (t.t === "summary") cur.summary = t.text;
    else if (t.t === "line") group.changes.push(parseLine(t.html));
    // A plain paragraph right under a heading carries Riot's reasoning when there is no quote (some system notes).
    else if (t.t === "para" && !cur.context.length && !group.changes.length && !/:$/.test(t.text)) cur.context.push(t.text);
  }
  return out
    .map((s) => ({ ...s, groups: s.groups.filter((g) => g.changes.length) }))
    .filter((s) => s.groups.length && !NOT_GAMEPLAY.test(s.name));
}

/** Every list line in a section, for bug-fix lists (no subjects). */
export const allLines = (sectionHtml) => [...sectionHtml.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => parseLine(m[1]));
