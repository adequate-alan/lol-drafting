// Production smoke test for the GitHub Pages build. Runs in CI after each deploy (pages.yml) and locally:
//   node scripts/smoke-pages.mjs https://adequate-alan.github.io/lol-drafting/ [screenshot-dir]
// Needs playwright (CI installs it in a separate folder and passes PLAYWRIGHT_MODULE; it is not a project dependency).
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const base = process.argv[2].replace(/\/$/, "");
const shots = process.argv[3];
const browser = await chromium.launch();
const page = await browser.newPage();
const problems = [];
page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && problems.push(`console: ${m.text()}`));
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
// The "Last checked" line asks GitHub's public Actions API and falls back to the stored check; shared runner IPs often
// hit its unauthenticated rate limit (403), which is not a site failure.
page.on("response", (r) => r.status() >= 400 && !r.url().includes("ddragon.leagueoflegends.com") && !(r.url().startsWith("https://api.github.com/") && [403, 429].includes(r.status())) && problems.push(`${r.status()} ${r.url()}`));
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); };

async function open(path) {
  const res = await page.goto(base + path, { waitUntil: "networkidle" });
  return res;
}
// Shared dropdown (components/Select.tsx): open the trigger, then click the option by value.
async function choose(trigger, value) {
  await page.locator(trigger).click();
  await page.locator(`.select-menu [role=option][data-value="${value}"]`).click();
  await page.waitForTimeout(150);
}
// Pro Builds opens on its overview (alan, 2026-10-13); detailed checks open the champion with the most recorded games
// from the overview's champion browser, across every patch.
async function openBuildsChampion() {
  await open("/pro-builds/");
  const subs = await page.locator(".pick-rail li button .rail-sub:not(.rail-player)").allTextContents();
  const counts = subs.map((t) => Number(/(\d+) game/.exec(t)?.[1] ?? 0));
  await page.locator(".pick-rail li button").nth(counts.indexOf(Math.max(...counts))).click();
  await page.locator(".game-head").waitFor({ timeout: 8000 }).catch(() => {});
}
async function h1() { return (await page.locator("main h1").first().textContent())?.trim(); }

// Sections, direct loads and refreshes
const sections = [["/", "Draft Room"], ...["top", "jungle", "mid", "bot", "support"].map((t) => [`/synergies/${t}/`, "Champion Synergies"]),
  ["/comps/", "Comp Library"], ["/pool/", "Champion Pool"], ["/pro-drafts/", "Pro Drafts"], ["/pro-builds/", "Pro Builds"], ["/geng/", "Gen.G"], ["/meta/", "Meta / Research"], ["/patch-notes/", "Patch Notes"]];
for (const [path, title] of sections) {
  const res = await open(path);
  const t = await h1();
  await page.reload({ waitUntil: "networkidle" });
  const t2 = await h1();
  check(`load + refresh ${path}`, res.status() === 200 && t === title && t2 === title, `${res.status()} "${t}" / after refresh "${t2}"`);
}
// Without trailing slash (typed URL)
for (const path of ["/pool", "/meta", "/synergies/bot"]) {
  const res = await open(path);
  check(`no-slash URL ${path}`, res.status() === 200 && !!(await h1()), `${res.status()} -> ${page.url()}`);
}
// Champion Synergies (First Pick until 2026-10-10): the index forwards to the role being researched, Top in a fresh tab
// session (lib/synergy-nav.ts); old /first-pick/ links keep working, query included.
await page.evaluate(() => sessionStorage.clear());
// The combined Mid / Jungle tab (until 2026-10-12) forwards to the champion's own role tab.
for (const [from, to] of [["/synergies/", "/synergies/top/"], ["/first-pick/", "/synergies/top/"], ["/first-pick/support/", "/synergies/support/"],
  ["/first-pick/mid-jungle/?champ=fizz&role=MID", "/synergies/mid/?champ=fizz&role=MID"], ["/synergies/mid-jungle/?champ=vi&role=JUNGLE", "/synergies/jungle/?champ=vi&role=JUNGLE"],
  ["/synergies/mid-jungle/?champ=sejuani", "/synergies/jungle/?champ=sejuani"], ["/synergies/mid-jungle/", "/synergies/mid/"]]) {
  await open(from);
  await page.waitForURL((u) => u.pathname.includes("/synergies/") && u.pathname.endsWith("/") && !u.pathname.endsWith("/synergies/") && !u.pathname.includes("mid-jungle"), { timeout: 5000 }).catch(() => {});
  const u = new URL(page.url());
  check(`${from} forwards to ${to}`, u.pathname + u.search === new URL(base).pathname + to && (await h1()) === "Champion Synergies", page.url());
}
check("Champion Synergies page title names the role", (await page.title()) === "Mid · Champion Synergies · Draft Assistant", await page.title());
// One tab per role, in draft order, and each role's rail holds only that role's records
{
  await open("/synergies/jungle/");
  const tabs = await page.locator("nav.tabs a").allTextContents();
  check("synergies: tabs read Top | Jungle | Mid | Bot | Support", tabs.join("|") === "Top|Jungle|Mid|Bot|Support", tabs.join("|"));
  const jungle = await page.locator(".pick-rail .rail-name").allTextContents();
  check("synergies: Jungle rail lists Jarvan IV, not Akali", jungle.includes("Jarvan IV") && !jungle.includes("Akali"), `${jungle.length} rows`);
  await open("/synergies/mid/?champ=akali");
  const mid = await page.locator(".pick-rail .rail-name").allTextContents();
  check("synergies: Mid rail lists Akali, not Jarvan IV, with jungle partners", mid.includes("Akali") && !mid.includes("Jarvan IV")
    && /Preferred jungle/.test((await page.locator(".scout .layer.clash").first().textContent()) ?? ""), `${mid.length} rows`);
}

// CSS applied (dark navy nav)
await open("/");
const navBg = await page.locator("aside.sidebar").evaluate((e) => getComputedStyle(e).backgroundColor);
check("CSS loads under base path", navBg !== "rgba(0, 0, 0, 0)" && navBg !== "rgb(255, 255, 255)", navBg);

// Client navigation through the sidebar keeps the base path
// Sidebar label, then the page title it opens (Synergies opens Champion Synergies).
const navTargets = [["Synergies", "Champion Synergies"], "Comp Library", "Champion Pool", "Pro Drafts", "Gen.G", "Meta / Research", "Patch Notes", "Draft Room"];
for (const target of navTargets) {
  const [label, title] = Array.isArray(target) ? target : [target, target];
  await page.locator(".nav a", { hasText: label }).first().click();
  await page.waitForFunction((l) => document.querySelector("main h1")?.textContent?.trim() === l, title, { timeout: 8000 }).catch(() => {});
  const u = new URL(page.url());
  check(`nav click ${label}`, u.pathname.startsWith(new URL(base).pathname + "/") && (await h1()) === title, page.url());
}

// Synergies navigation follows Draft Room's highlighted role, never "I'm playing" (alan, 2026-10-13)
{
  await page.evaluate(() => { localStorage.setItem("draft-room:my-role", "BOT"); sessionStorage.clear(); });
  await open("/?top=aatrox&focus=jungle");
  const side = () => page.locator(".nav a", { hasText: "Synergies" }).first();
  await page.waitForFunction(() => document.querySelector(".nav a[href*='/synergies/jungle']"), null, { timeout: 5000 }).catch(() => {});
  check("synergies nav: highlighted Jungle (playing Bot) links Jungle", /\/synergies\/jungle\/$/.test((await side().getAttribute("href")) ?? ""), await side().getAttribute("href"));
  await page.locator(".role-tab.role-MID").first().click();
  await page.waitForFunction(() => document.querySelector(".nav a[href*='/synergies/mid']"), null, { timeout: 5000 }).catch(() => {});
  check("synergies nav: switching the Draft Room tab to Mid updates the link and the URL", /\/synergies\/mid\/$/.test((await side().getAttribute("href")) ?? "") && page.url().includes("focus=mid"), page.url());
  await page.reload({ waitUntil: "networkidle" });
  check("synergies nav: refresh keeps the highlighted Mid tab", (await page.locator(".role-tab.role-MID.active").count()) === 1, page.url());
  await side().click();
  await page.waitForURL(/\/synergies\/mid\//, { timeout: 8000 }).catch(() => {});
  check("synergies nav: the sidebar opens Mid Synergies", new URL(page.url()).pathname.endsWith("/synergies/mid/"), page.url());
  await page.locator("nav.tabs a", { hasText: "Support" }).click();
  await page.waitForURL(/\/synergies\/support\//, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);
  check("synergies nav: a manual tab switch is kept", new URL(page.url()).pathname.endsWith("/synergies/support/") && /\/synergies\/support\/$/.test((await side().getAttribute("href")) ?? ""), page.url());
  await page.locator(".nav a", { hasText: "Draft Room" }).first().click();
  await page.waitForFunction(() => document.querySelector("main h1")?.textContent?.trim() === "Draft Room", null, { timeout: 8000 }).catch(() => {});
  await page.waitForFunction(() => document.querySelector(".nav a[href*='/synergies/mid']"), null, { timeout: 5000 }).catch(() => {});
  check("synergies nav: back in Draft Room the highlighted Mid tab returns and leads the link", (await page.locator(".role-tab.role-MID.active").count()) === 1 && /\/synergies\/mid\/$/.test((await side().getAttribute("href")) ?? ""), page.url());
  check("synergies nav: My Role is untouched", (await page.evaluate(() => localStorage.getItem("draft-room:my-role"))) === "BOT", "");
  await open("/synergies/jungle/?champ=vi");
  check("synergies nav: an explicit role URL is respected", new URL(page.url()).pathname.endsWith("/synergies/jungle/") && (await h1()) === "Champion Synergies", page.url());
  await page.evaluate(() => { localStorage.removeItem("draft-room:my-role"); sessionStorage.clear(); });
}

// Filters in the URL
await open("/pro-drafts/?team=Gen.G&id=lck26po-finals-g1-geng");
const card = await page.locator("main .panel-head h2").first().textContent();
check("Pro Drafts filter + selected game from URL", /Gen\.G vs/.test(card ?? ""), card);
await open("/synergies/bot/?champ=ziggs");
check("Champion Synergies ?champ=ziggs selects Ziggs", (await page.locator("main").textContent()).includes("Ziggs"), "");

// Draft Room: one candidate list per open role; Synergy, Pro, Fit and Counter are separate labels on each row
const recNames = async (role) => page.locator(`.recs .fit-role.role-${role} .fit-head .name`).allTextContents();
const text = async (sel) => (await page.locator(sel).allTextContents()).join(" ");
// Pro meta starting picks (alan, 2026-10-13): an empty board already lists the role's pro picks with real counts.
await open("/");
const startRows = await page.locator(".recs .fit-role.role-TOP .fit-row").count();
const startText = await text(".recs .fit-role.role-TOP");
check("empty Draft Room lists pro meta starting picks for Top", startRows > 0 && (await page.locator(".rec-empty.start").count()) === 0
  && /First rotation · \d+\/\d+ \(\d+%\)/.test(startText) && /Patch 26\.\d+/.test(startText) && !/\b16\.\d\d\b/.test(startText), `${startRows} rows`);
check("starting picks carry no score", (await page.locator(".recs .fit-role.role-TOP button.fit-score").count()) === 0, "");
await page.locator(".role-tab.role-MID").click();
check("starting picks follow the selected role (Mid)", (await page.locator(".recs .fit-role.role-MID .fit-row").count()) > 0, "");
for (const [bot, first] of [["sivir", "Lulu"], ["ezreal", "Karma"], ["corki", "Nami"]]) {
  await open(`/?bot=${bot}`);
  const c = await recNames("SUPPORT");
  check(`${bot} → ${first} first (Recommended Picks)`, c[0] === first, c.join(", "));
}
await open("/?bot=ziggs");
const zc = await recNames("SUPPORT");
check("Ziggs: Nautilus / Leona lead the recommendations", zc.slice(0, 2).sort().join() === "Leona,Nautilus", zc.join(", "));
const zigPro = await text(".layer.pro");
check("Pyke / Camille still shown as pro evidence for Ziggs", /Pyke/.test(zigPro) && /Camille/.test(zigPro), zigPro.match(/.{0,40}(Pyke|Camille).{0,40}/g)?.join(" | ") ?? "");
const why = await text(".recs .fit-role.role-SUPPORT .fit-why");
check("recommendations explain why", /Saved pairing|fight starter/.test(why), why.slice(0, 160));
check("no separate Pro Pairings list under the recommendations", (await page.locator(".rec-group").count()) === 0, "");
// Jhin with Support open: Nautilus carries its Pro signal; supports seen with Jhin in pro games get full rows, no Synergy label.
await open("/?bot=jhin");
const proRow = (n) => page.locator(".recs .fit-row", { has: page.locator(".fit-head .name", { hasText: new RegExp(`^${n}$`) }) });
check("Jhin: Nautilus shows its pro games", (await proRow("Nautilus").locator(".sig.pro").count()) === 1, await text(".recs .fit-row .sig-line"));
const proOnly = [];
for (const n of ["Leona", "Camille"]) if ((await proRow(n).locator(".sig.pro").count()) === 1 && (await proRow(n).locator(".sig.syn").count()) === 0) proOnly.push(n);
check("Jhin: pro-only supports are full rows without a Synergy label", proOnly.length === 2, proOnly.join(", "));
await page.locator(".fit-filters button", { hasText: /^Pro\d*$/ }).click();
const proRows = await page.locator(".recs .fit-row").count();
check("Pro filter shows only rows with pro games", proRows > 0 && (await page.locator(".recs .fit-row .sig.pro").count()) === proRows, `${proRows} rows`);
await page.locator(".fit-filters button", { hasText: "All" }).click();
// Pro evidence card (components/EvidenceCards.tsx on components/Popover.tsx): hovering "Pro · N games" names the games.
{
  const trigger = proRow("Nautilus").locator("button.sig.pro");
  const label = Number(((await trigger.textContent()) ?? "").match(/(\d+) game/)?.[1] ?? 0);
  await trigger.hover();
  const card = page.locator(".popover.pe");
  await card.waitFor({ timeout: 3000 }).catch(() => {});
  const games = await card.locator(".pe-game").count();
  const body = (await card.textContent().catch(() => "")) ?? "";
  check("Pro evidence card lists the counted games (up to 3) with teams, result or none, and a Gol.gg link",
    label > 0 && games === Math.min(label, 3) && / vs /.test(body) && /Win|Loss|Result not recorded|Pending/.test(body)
      && (await card.locator("a[href*='gol.gg']").count()) > 0 && (label <= 3 || /View all \d+ games/.test(body)),
    `${games} of ${label} · ${body.slice(0, 120)}`);
  check("Pro evidence card says it is observed, never part of the order", /never part of the order/.test(body) && !/counter(pick)? (proven|confirmed)/i.test(body), "");
  await card.locator("a").first().hover();
  await page.waitForTimeout(400);
  check("Pro evidence card stays open while the pointer moves into it", await card.isVisible(), "");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  check("Escape closes the Pro evidence card", (await card.count()) === 0, "");
  // Plain hints render in the themed tip, not the browser's bubble.
  await page.mouse.move(2, 2);
  const syn = proRow("Nautilus").locator("span.sig.syn").first();
  await syn.hover();
  await page.waitForTimeout(600);
  check("title hints render as the themed tip", (await page.locator(".popover.tip").count()) === 1 && (await syn.getAttribute("title")) === null,
    (await page.locator(".popover.tip").textContent().catch(() => "")) ?? "");
  await page.mouse.move(2, 2);
}
await open("/?bot=jinx&vs=ornn,jarvan-iv");
const enemyText = await text(".draft-slot.enemy .slot-name");
const vsWhy = await text(".recs .fit-why");
check("enemy picks from ?vs= load and add matchup reasons", /Ornn/.test(enemyText) && /Matchup/i.test(vsWhy), enemyText);
// Counters: a separate block for the role being picked once its lane opponent is known; enemy roles are detected from bare ids.
const enemyTop = await text('.draft-slot.enemy[data-role="TOP"] .slot-name');
const enemyJungle = await text('.draft-slot.enemy[data-role="JUNGLE"] .slot-name');
check("enemy roles detected from ?vs= (Ornn top, Jarvan IV jungle)", /Ornn/.test(enemyTop) && /Jarvan IV/.test(enemyJungle), `${enemyTop} / ${enemyJungle}`);
await page.locator(".role-tab.role-TOP").click();
const vsLine = await text(".recs .fit-context .vs");
check("open role is linked to its lane opponent (Top vs Ornn)", /vs Ornn/.test(vsLine), vsLine);
await page.locator(".fit-filters button", { hasText: "Counters" }).click();
const counterText = await text(".recs .fit-note");
check("Counters filter reads the lane opponent and never invents a counter", /(vs|for) Ornn/.test(counterText)
  && ((await page.locator(".recs .fit-row .sig.counter").count()) > 0 || /No reliable counter data for Ornn/.test(counterText)), counterText.slice(0, 160));
// Real DPM rows: Top into Aatrox has stored matchups that clear the thresholds (Fiora, Gwen, Gragas, Ornn).
await open("/?vs=top:aatrox");
await page.locator(".role-tab.role-TOP").click();
const dpmCounters = await page.locator(".recs .fit-row .sig.counter").count();
check("Counters show stored DPM matchups (Top vs Aatrox)", dpmCounters > 0 && !/No reliable counter data/.test(await text(".recs")), `${dpmCounters} counters`);
check("no Clash wording on the Draft Room", !/Clash/.test(await text("body")), "");
// Draft Room workspace: the open role drives the list, one row per champion, Comp Check rail, pinned draft bar
await open("/?bot=sivir&vs=renekton,,,ezreal,karma");
check("Bot locked: Support is the active role", (await page.locator(".draft-slot.role-SUPPORT.active").count()) === 1
  && /Support/.test(await text(".role-tab.active")), await text(".role-tab.active"));
check("Support recommendations read vs the enemy bot lane", /vs Ezreal \+ Karma/.test(await text(".recs .fit-context .vs")), await text(".recs .fit-context .vs"));
const rowNames = await page.locator(".recs .fit-head .name").allTextContents();
check("each champion appears once in the recommendation list", rowNames.length > 0 && new Set(rowNames).size === rowNames.length, rowNames.join(", "));
const recBox = await page.locator("section.recs").boundingBox();
const ccBox = await page.locator("aside.comp-check").boundingBox();
check("desktop: Comp Check is a right rail beside the recommendations", !!recBox && !!ccBox && ccBox.x > recBox.x + recBox.width - 1 && ccBox.width < recBox.width, JSON.stringify({ recBox, ccBox }));
await page.evaluate(() => window.scrollTo(0, 900));
await page.waitForTimeout(400);
check("scrolled: condensed draft bar stays visible", await page.locator(".draft-mini.show").isVisible(), "");
check("no repeated layer-explainer line", !/stay separate on every page/.test(await text("body")), "");
// Locking through the UI keeps the base path in the URL and survives a refresh
await open("/");
await page.locator('input[aria-label="BOT champion"]').fill("Sivi");
await page.locator('#champs-BOT [role="option"]').first().waitFor();
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
const afterLock = page.url();
await page.reload({ waitUntil: "networkidle" });
const lockedText = await text(".draft-slot.role-BOT .slot-name");
check("UI lock writes ?bot= under base path and survives refresh", afterLock.includes("/lol-drafting/?bot=sivir") && lockedText.includes("Sivir"), afterLock);

// Picker: a long list scrolls inside itself, not the page, and arrow keys keep the highlight in view
await open("/?bot=ziggs");
await page.locator('input[aria-label="TOP champion"]').click();
const topList = page.locator("#champs-TOP");
const lb = await topList.boundingBox();
await page.mouse.move(lb.x + 40, lb.y + 40);
await page.mouse.wheel(0, 300);
await page.waitForTimeout(300);
const pick = await topList.evaluate((el) => ({ h: el.clientHeight, sh: el.scrollHeight, top: el.scrollTop }));
check("TOP picker scrolls internally (max height, page stays put)", pick.sh > pick.h && pick.h <= 422 && pick.top > 0 && (await page.evaluate(() => scrollY)) === 0, JSON.stringify(pick));
for (let i = 0; i < 14; i++) await page.keyboard.press("ArrowDown");
await page.waitForTimeout(200);
check("picker keeps the highlighted option visible", await page.evaluate(() => {
  const l = document.querySelector("#champs-TOP"), a = l?.querySelector('[aria-selected="true"]');
  if (!l || !a) return false; const r = a.getBoundingClientRect(), b = l.getBoundingClientRect(); return r.top >= b.top - 1 && r.bottom <= b.bottom + 1;
}), "");
await page.keyboard.press("Escape");
// Locked slot: one "Change" control; Escape keeps the pick, the picker's first row removes it
await open("/?jungle=chogath&bot=ziggs");
await page.locator(".draft-slot.role-JUNGLE .slot-change").click();
await page.keyboard.press("Escape");
const kept = await text(".draft-slot.role-JUNGLE .slot-name");
await page.locator(".draft-slot.role-JUNGLE .slot-change").click();
await page.locator(".picker-list li.remove").click();
await page.waitForTimeout(200);
check("Change keeps the pick on Escape; Remove clears it", /Cho'Gath/.test(kept) && (await page.locator(".draft-slot.role-JUNGLE .slot-name").count()) === 0 && !page.url().includes("jungle="), page.url());
// My Role (alan, 2026-10-12): marks my slot, a teammate's lock stays put, my lock opens Pro Builds and the way back
// restores the draft. The preference is cleared afterwards.
await open("/?top=aatrox&vs=mid:ahri");
await page.locator(".my-role .seg button", { hasText: "Bot" }).click();
await page.locator(".my-role .check input").check();
await page.locator('input[aria-label="SUPPORT champion"]').fill("Bard");
await page.keyboard.press("Enter");
await page.waitForTimeout(500);
check("My Role: a teammate's lock stays in Draft Room", !page.url().includes("pro-builds") && (await page.locator(".draft-slot.mine.role-BOT").count()) === 1, page.url());
await page.locator(".draft-slot.role-BOT").click();
await page.locator('input[aria-label="BOT champion"]').fill("Jhin");
await page.keyboard.press("Enter");
await page.waitForURL(/pro-builds/, { timeout: 15000 }).catch(() => {});
const arrived = new URL(page.url());
await page.locator(".game-head").first().waitFor({ timeout: 15000 }).catch(() => {});
check("My Role: locking my champion opens its Pro Builds on every patch", arrived.pathname.endsWith("/pro-builds/")
  && arrived.searchParams.get("champion") === "jhin" && arrived.searchParams.get("role") === "BOT" && !arrived.searchParams.has("patch")
  && (await text(".builds-head h2")) === "Jhin", page.url());
await page.locator("a", { hasText: "Back to Draft Room" }).first().click();
await page.locator(".my-role").waitFor();
await page.waitForTimeout(400);
const backNames = (await page.locator(".team-row.ally .slot-name").allInnerTexts()).join(",");
check("My Role: Back to Draft Room restores the draft", backNames === "Aatrox,Jhin,Bard" && page.url().includes("vs=mid:ahri"), `${backNames} ${page.url()}`);
await page.evaluate(() => { localStorage.removeItem("draft-room:my-role"); localStorage.removeItem("draft-room:auto-builds"); });
// Champion icons load from Data Dragon in both themes; a failed icon falls back to initials
for (const theme of ["light", "dark"]) {
  await page.evaluate((t) => localStorage.setItem("theme", t), theme);
  await open("/?top=ambessa&jungle=skarner&mid=locke&bot=ziggs");
  await page.waitForTimeout(1500);
  // Icons inside a collapsed section load lazily when it opens, so only visible ones are checked.
  const icons = await page.evaluate(() => [...document.querySelectorAll(".champ[data-icon]")].filter((t) => !t.closest("details:not([open])")).map((t) => {
    const img = t.querySelector("img");
    return { champ: t.dataset.champ, ok: !!img && img.complete && img.naturalWidth > 0, fallback: t.dataset.icon === "failed" && !!t.querySelector(".mono")?.textContent };
  }));
  const bad = icons.filter((i) => !i.ok);
  check(`champion icons load (${theme})`, icons.length > 8 && bad.length === 0,
    `${icons.length - bad.length}/${icons.length} loaded${bad.length ? `; not loaded: ${[...new Set(bad.map((b) => b.champ))].join(", ")}` : ""}`);
  check(`icons that fail show initials (${theme})`, bad.every((b) => b.fallback), `${bad.filter((b) => b.fallback).length}/${bad.length} fell back`);
  if (shots) await page.screenshot({ path: `${shots}/draft-${theme}.png`, fullPage: true });
}
await page.evaluate(() => localStorage.removeItem("theme"));
// Theme toggle persists across reloads
await open("/");
const before = await page.evaluate(() => document.documentElement.dataset.theme);
await page.locator(".theme-toggle").click();
const after = await page.evaluate(() => document.documentElement.dataset.theme);
await page.reload({ waitUntil: "networkidle" });
const persisted = await page.evaluate(() => document.documentElement.dataset.theme);
check("theme toggle switches and persists", before !== after && persisted === after, `${before} -> ${after}, after reload ${persisted}`);
await page.locator(".theme-toggle").click();
// Champion Pool stats and the Demacia Cup evidence set
{
  const rows = () => page.$$eval("tr.pool-row", (rs) => rs.map((r) => [...r.querySelectorAll("td")].map((td) => td.textContent.trim())));
  const rank = { Core: 0, Depth: 1, "Prepared / flex": 2 };
  await open("/pool/");
  let r = await rows();
  check("pool: default sort is pool tier", r.length > 50 && r.every((x, i) => i === 0 || rank[r[i - 1][2]] <= rank[x[2]]), `${r.length} rows`);
  await page.click(".seg button:has(.role-tag:text-is('MID'))"); r = await rows();
  check("pool: role filter", r.length > 0 && r.every((x) => x[1] === "MID"), `${r.length} MID rows`);
  await choose("[role=combobox][aria-label='Pool tier']", "core"); r = await rows();
  check("pool: tier filter", r.length > 0 && r.every((x) => x[2] === "Core"), `${r.length} rows`);
  await open("/pool/?event=demacia-cup-2026");
  r = (await rows()).filter((x) => !/No verified data/.test(x[8]));
  check("pool: tournament filter shows Demacia marked ongoing", r.length > 0 && r.every((x) => /Demacia Cup/.test(x[8]) && /ongoing/i.test(x[8])), `${r.length} rows`);
  await open("/pool/?patch=16.16");
  r = (await rows()).filter((x) => x[9] !== "—");
  check("pool: patch filter (old 16.16 link shows 26.16)", r.length > 0 && r.every((x) => x[9] === "26.16"), `${r.length} rows`);
  await open("/pool/");
  await page.fill("input[type=search]", "locke"); r = await rows();
  check("pool: search", r.length === 1 && r[0][0].endsWith("Locke"), r.map((x) => x[0]).join(", "));
  await page.fill("input[type=search]", "");
  for (const [label, i] of [["Picks", 3], ["Bans", 4], ["Presence", 5], ["Win rate", 6]]) {
    await page.click(`th button.sort:has-text("${label}")`);
    const n = (await rows()).map((x) => (x[i] === "—" ? null : parseFloat(x[i])));
    const k = n.findIndex((x) => x == null), vals = n.slice(0, k < 0 ? n.length : k);
    check(`pool: sort by ${label}`, vals.length > 0 && vals.every((x, j) => j === 0 || vals[j - 1] >= x) && n.slice(vals.length).every((x) => x == null), vals.slice(0, 4).join(", "));
  }
  await open("/pool/?q=braum");
  r = await rows();
  check("pool: no verified stats shows —", r.length === 1 && r[0][3] === "—" && r[0][6] === "—", r[0]?.join(" | "));
  await open("/pool/?q=ahri");
  r = await rows();
  // Demacia role picks are verified on Gol.gg since the daily refresh, so Ahri's total sits under MID, not "all roles".
  check("pool: a total placed in a role by its source is not marked all roles (Ahri MID)", r.length === 1 && r[0][1] === "MID" && /^\d/.test(r[0][3]) && !/all roles/.test(r[0][3]), r[0]?.join(" | "));
  await open("/pool/?q=galio");
  r = await rows();
  check("pool: role-specific rows stay separate (Galio top / mid)", r.length === 2 && new Set(r.map((x) => x[1])).size === 2, r.map((x) => x[1]).join(", "));
  await open("/pool/?q=locke");
  await page.click("tr.pool-row");
  const mine = await page.locator("tr.pool-detail .layer.clash").textContent();
  const pro = await page.locator("tr.pool-detail .layer.pro").textContent();
  check("pool: row detail keeps my pool apart from pro evidence", /Skarner/.test(mine) && !/Gol\.gg/.test(mine) && /Demacia Cup/.test(pro), "");
  check("pool: tournament stats, recorded games and observed pairings render apart", /Tournament stats/.test(pro) && /Recorded games/.test(pro) && /Observed pairings/.test(pro), "");
  await open("/meta/");
  const ev = await page.$$eval(".hub-events tbody tr", (rs) => rs.map((r) => r.textContent));
  check("meta: tournaments listed newest first, Demacia Cup ongoing", ev.length >= 2 && /Demacia Cup/.test(ev[0]) && /Ongoing/.test(ev[0]) && /LCK Playoffs/.test(ev[1]) && /Completed/.test(ev[1]), ev.map((t) => t.slice(0, 40)).join(" | "));
  // Pro priority (alan, 2026-10-12): one patch at a time, newest by default, presence first.
  const patchSel = (await page.locator(".priority .hub-tools [role=combobox]").first().textContent()) ?? "";
  check("meta: Pro priority defaults to the newest patch, never combined", /\(newest\)/.test(patchSel) && /only/.test(await text(".priority .section-header")), patchSel);
  const prioRows = () => page.$$eval(".priority-table tbody tr.click-row", (rs) => rs.map((r) => [...r.querySelectorAll("td")].map((td) => td.textContent.trim())));
  const games = Number(((await text(".priority-coverage")).match(/(\d+) games/) ?? [])[1]);
  let pr = await prioRows();
  const presIdx = (await page.$$eval(".priority-table thead th", (ths) => ths.map((t) => t.textContent.trim()))).findIndex((h) => h.startsWith("Presence"));
  const pres = pr.map((c) => parseInt(c[presIdx], 10)).filter((x) => !Number.isNaN(x));
  check("meta: Pro priority sorted by presence, highest first", pres.length > 10 && pres.every((x, i) => i === 0 || x <= pres[i - 1]), pres.slice(0, 6).join(", "));
  const first = pr[0] ?? [];
  const [fp, fb] = [parseInt(first[2], 10), parseInt(first[3], 10)];
  check("meta: presence = (picks + bans) / games on the patch", games > 0 && Math.abs(Math.round(((fp + fb) / games) * 100) - parseInt(first[presIdx], 10)) <= 1, `${first.slice(0, 5).join(" | ")} of ${games}`);
  await page.click(".priority .seg.scroll button:has(.role-tag:text-is('JUNGLE'))");
  const jHead = await page.$$eval(".priority-table thead th", (ths) => ths.map((t) => t.textContent.trim()));
  check("meta: role tabs show role picks apart from champion-wide bans and presence", jHead.some((h) => /^Jungle picks/.test(h)) && jHead.some((h) => /Presence · all/.test(h)) && (await prioRows()).length > 0, jHead.join(", "));
  await open("/meta/?patch=26.16");
  const renata = (await prioRows()).find((c) => c[0].endsWith("Renata Glasc"));
  check("meta: LCK playoffs patch 26.16 from the Gol.gg table (Renata 8 picks, 1 ban, 22%, 63%)", /^8\b/.test(renata?.[2] ?? "") && /^1\b/.test(renata?.[3] ?? "") && renata?.includes("22%") && renata?.includes("63%"), renata?.join(" | "));
  check("meta: a tournament-table patch shows no side split or dates", /Gol\.gg table/.test(await text(".priority-coverage")), "");
  // Secondary research is folded, each section naming its count; Pro priority stays open
  await open("/meta/");
  const folded = await page.$$eval(".meta-hub > details.disclosure.section", (ds) => ds.map((d) => ({ open: d.open, s: d.querySelector("summary").textContent })));
  check("meta: comparison, pairings, recent drafts and notes are folded with counts", folded.length >= 5 && folded.every((d) => !d.open && /\d/.test(d.s)) && (await page.locator(".priority-table").isVisible()), folded.map((d) => d.s).join(" | "));
  await open("/meta/?view=changes");
  const moves = await text(".priority-changes");
  check("meta: Priority changes compare with the previous patch in percentage points", /pp/.test(moves) && /26\.16.*→.*26\.18/.test(await text(".priority .toolbar .count")), moves.slice(0, 80));
  await open("/meta/?patch=all");
  check("meta: All patches is an explicit, labelled choice", /All patches combined/.test(await text(".priority .section-header")), "");
  await open("/meta/");
  await page.locator(".priority-table .champ-link").first().click();
  const drawer = await page.locator(".drawer").textContent().catch(() => "");
  check("meta: champion drawer opens on Overview with Synergy, Pro evidence, Pro builds, Patch and Logic apart", /Synergy/.test(drawer) && /Pro evidence/i.test(drawer) && /Pro builds/.test(drawer) && /Patch/.test(drawer) && /Logic/.test(drawer) && /Use in Draft Room/.test(drawer), drawer.slice(0, 80));
  check("meta: the drawer has five tabs with counts", (await page.locator(".drawer-tab").allTextContents()).join("|").replace(/\d+/g, "").trim() === "Overview|Synergies|Pro|Builds|Patch", (await page.locator(".drawer-tab").allTextContents()).join("|"));
  await page.keyboard.press("Escape");
  // Pinned players in the drawer (alan, 2026-10-13): Ruler (Gol.gg id 685) has archived LCK Ashe bot games.
  await page.evaluate(() => localStorage.setItem("pro-builds:pinned-players", JSON.stringify(["685"])));
  await open("/meta/?patch=all");
  await page.locator(".priority-table .champ-link", { hasText: "Ashe" }).first().click();
  await page.locator(".dw-pinned").waitFor({ timeout: 8000 }).catch(() => {});
  const labels = await page.locator(".drawer .layer-label").allTextContents();
  const pinIdx = labels.findIndex((l) => /Pinned players/.test(l)), proIdx = labels.findIndex((l) => /Pro evidence/.test(l));
  check("drawer: a pinned player with games on the champion shows before Pro evidence (Ruler, Ashe)", pinIdx >= 0 && pinIdx < proIdx && /Ruler/.test(await text(".dw-pinned")), labels.join(" | "));
  await page.locator(".dw-pin .dw-row").first().click().catch(() => {});
  const pinGame = await page.locator(".dw-pin.open .dw-detail a.dw-row").first().getAttribute("href").catch(() => "");
  check("drawer: a pinned player's game opens that exact build (champion, role, game, player)", /champion=ashe&role=BOT&game=\d+&player=685/.test(pinGame ?? ""), pinGame);
  await page.keyboard.press("Escape");
  await page.evaluate(() => localStorage.removeItem("pro-builds:pinned-players"));
  await open("/synergies/bot/?champ=ezreal&view=pro");
  const karmaRow = await page.locator(".pro-table tr", { hasText: "Karma" }).first().innerText().catch(() => "");
  check("pro pairings show games, event, patch and date (Ezreal + Karma)", /1\s+Demacia Cup.*\s+26\.18\s+Oct 3/.test(karmaRow), karmaRow.replace(/\s+/g, " "));
}
// Comp Library champion drawer
{
  await open("/comps/?kind=all");
  await page.evaluate(() => window.scrollTo(0, 400));
  const naut = page.locator("#mage-bot-siege .lu-champ", { hasText: "Nautilus" });
  await naut.scrollIntoViewIfNeeded();
  const y = await page.evaluate(() => scrollY);
  const rowBoxes = () => page.$$eval(".lu-slot", (rs) => rs.map((r) => { const b = r.getBoundingClientRect(); return `${Math.round(b.top + scrollY)},${Math.round(b.height)}`; }).join("|"));
  const rows0 = await rowBoxes();
  for (const b of await page.locator("#mage-bot-siege .lu-champ, #classic-front-to-back .lu-champ").all()) { await b.hover(); await page.waitForTimeout(30); }
  await naut.hover();
  await page.waitForTimeout(350);
  const nb = await naut.boundingBox(), cb = await page.locator(".hovercard").boundingBox().catch(() => null);
  // The card opens below (or above) the lineup: it must not cover the hovered champion or any comp-mate's portrait.
  const lineupBox = await page.locator("#mage-bot-siege .lineup").boundingBox();
  check("comps: hover card opens clear of the lineup, inside the viewport", !!cb && !!nb && (cb.y >= nb.y + nb.height || cb.y + cb.height <= lineupBox.y) && cb.y >= 0 && cb.y + cb.height <= 900, JSON.stringify(cb));
  check("comps: hovering champions never moves the lineup", (await rowBoxes()) === rows0, "");
  // Regression: the cursor resting exactly on the boundary between two champions must not open and close the card in a loop.
  const slots = page.locator("#mage-bot-siege .lu-slot");
  const r2 = await slots.nth(2).boundingBox();
  await page.evaluate(() => { window.__hc = 0; new MutationObserver((ms) => { for (const m of ms) for (const n of [...m.addedNodes, ...m.removedNodes]) if (n.classList?.contains("hovercard")) window.__hc++; }).observe(document.body, { childList: true }); });
  const flips = [];
  for (const dy of [30, 50]) for (const dx of [-0.5, 0, 0.5]) {
    await page.mouse.move(r2.x + dx, r2.y + dy);
    await page.waitForTimeout(300);
    const a = await page.evaluate(() => window.__hc);
    await page.waitForTimeout(900);
    flips.push((await page.evaluate(() => window.__hc)) - a);
  }
  check("comps: cursor on a slot boundary never flickers the card", flips.every((n) => n === 0) && (await rowBoxes()) === rows0, flips.join(","));
  await page.mouse.move(r2.x + r2.width / 2, r2.y + 40);
  await page.waitForTimeout(300);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(250);
  check("comps: scrolling closes an open hover card", (await page.locator(".hovercard").count()) === 0, "");
  await page.evaluate((v) => window.scrollTo(0, v), y);
  await page.waitForTimeout(150);
  await naut.click();
  const drawer = page.locator(".drawer");
  await drawer.waitFor({ timeout: 5000 }).catch(() => {});
  const marks = await page.locator("#mage-bot-siege .lu-slot.has-saved .lu-name").allTextContents();
  check("comps: clicking Nautilus opens the drawer and marks Ziggs as Synergy", (await drawer.locator("h2").textContent()) === "Nautilus" && marks.includes("Ziggs"), marks.join(", "));
  const layers = await drawer.locator(".layer").evaluateAll((els) => els.map((e) => e.className.replace("dw-section ", "")));
  check("comps: drawer keeps Synergy, Pro and Logic separate", /^layer clash,layer pro,layer pro,layer logic,layer logic$/.test(layers.join()), layers.join(" | "));
  await drawer.locator("[aria-label='Next champion']").click();
  check("comps: next moves through the comp in place", (await drawer.locator("h2").textContent()) === "Gnar" && page.url().endsWith("/comps/?kind=all"), page.url());
  await page.keyboard.press("Escape");
  // The drawer plays a short exit (--dur-panel-out) before it unmounts.
  await drawer.waitFor({ state: "detached", timeout: 1000 }).catch(() => {});
  const escDrawers = await drawer.count(), escY = await page.evaluate(() => scrollY);
  check("comps: Escape closes and keeps the scroll position", escDrawers === 0 && escY === y, `${escDrawers} drawer, scrollY ${escY} vs ${y}`);
  await naut.click();
  await page.goBack();
  await page.waitForTimeout(400);
  check("comps: Back closes the drawer without leaving the page", (await drawer.count()) === 0 && page.url().endsWith("/comps/?kind=all"), page.url());
  await naut.click();
  await drawer.locator("a", { hasText: "Use in Draft Room" }).click();
  await page.waitForURL(/\?support=nautilus/, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  check("comps: Use in Draft Room loads the champion in its role", /\/lol-drafting\/\?support=nautilus$/.test(page.url()) && /Nautilus/.test(await page.locator(".draft-slots").first().textContent()), page.url());
  await open("/comps/?kind=all");
  await page.locator("#mage-bot-siege .lu-champ", { hasText: "Nautilus" }).click();
  await page.locator(".drawer a", { hasText: "View in Champion Pool" }).click();
  await page.waitForURL(/champ=nautilus/, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  check("comps: View in Champion Pool opens that row", (await page.locator("tr.pool-row.open").textContent())?.includes("Nautilus") ?? false, page.url());
  // Draft-board cards: swaps stay hidden until asked for; a swap previews in place and resets.
  await open("/comps/");
  const yp = page.locator("#yunara-protect");
  check("comps: opens on Pro comps, with All and Template one click away",
    (await page.locator("nav[aria-label='Type'] a.active").textContent()) === "Pro" && (await page.locator(".shell.generalized").count()) === 0, "");
  check("comps: filters read Type All/Pro/Template and Difficulty All/Easy/Medium/Hard",
    (await page.locator("nav[aria-label='Type'] a").allTextContents()).join() === "All,Pro,Template"
    && (await page.locator("nav[aria-label='Difficulty'] a").allTextContents()).join() === "All,Easy,Medium,Hard", "");
  check("comps: five champions across, no swap lists or source links shown by default",
    (await yp.locator(".lu-slot").count()) === 5 && (await page.locator(".swap-menu").count()) === 0 && (await yp.locator(".shell-sources").count()) === 0, "");
  const rows = await page.locator(".shell-grid > .shell").evaluateAll((els) => {
    const by = {};
    for (const e of els) (by[Math.round(e.getBoundingClientRect().top)] ??= new Set()).add(Math.round(e.querySelector(".shell-actions").getBoundingClientRect().bottom));
    return Object.values(by).map((x) => [...x]);
  });
  check("comps: action rows line up across each grid row", rows.length > 0 && rows.every((r) => r.length === 1), JSON.stringify(rows));
  await yp.locator(".lu-top .lu-swaps").click();
  await yp.locator(".swap-menu .swap-item", { hasText: "Ambessa" }).click();
  await page.waitForTimeout(200);
  const variation = await yp.locator("a", { hasText: "Use variation in Draft Room" }).getAttribute("href").catch(() => "");
  check("comps: picking a swap previews it with its own Draft Room link",
    (await yp.locator(".lu-top .lu-name").textContent()) === "Ambessa" && (await yp.locator(".shell-preview").count()) === 1 && /top=ambessa&jungle=pantheon/.test(variation ?? ""), variation ?? "");
  await yp.locator(".shell-preview button", { hasText: "Reset" }).click();
  check("comps: Reset restores the original comp", (await yp.locator(".lu-top .lu-name").textContent()) === "Rumble" && (await yp.locator(".shell-preview").count()) === 0, "");
  await yp.locator(".src-toggle", { hasText: "Details" }).click();
  check("comps: Details expands the full why plus the exact evidence and refresh status",
    /Gol\.gg game/.test((await yp.locator(".shell-sources").textContent()) ?? "") && /Why it works/.test((await yp.locator(".shell-details").textContent()) ?? ""), "");
  check("comps: the library shows its last addition", /Last addition: (\w{3} \d{1,2}, \d{4}|—)/.test((await page.locator(".pro-freshness").first().textContent()) ?? ""), "");
  const vt = page.locator(".var-toggle").first();
  if (await vt.count()) {
    await vt.click();
    const vs = page.locator(".shell-variations").first();
    check("comps: observed variations expand with their Gol.gg games", (await vs.count()) === 1 && (await vs.locator("a[href*='gol.gg/game/stats/']").count()) > 0, "");
    await vt.click();
  }
  check("comps: short job labels on the card, the full job kept in its title",
    (await yp.locator(".lu-top .lu-job").textContent()) === "Zone control" && (await yp.locator(".lu-top .lu-job").getAttribute("title")) === "Zone space and cut off exits", "");
}
// Champion Synergies: a champion with no saved record gets a Proposed profile (alan, 2026-10-10), notes inside their column
{
  await open("/synergies/mid/?champ=fizz");
  const prop = page.locator(".scout .layer.clash.proposed");
  const text = (await prop.first().textContent().catch(() => "")) ?? "";
  check("synergies: Fizz mid gets proposed jungle partners, labelled Proposed · kit-based", (await page.locator(".pick-rail a.active .rail-name").textContent().catch(() => "")) === "Fizz"
    && /Proposed jungle/.test(text) && /Proposed · kit-based/.test(text), text.slice(0, 120));
  const spill = await page.locator(".scout .prop-partner .chip-note").evaluateAll((els) => els.filter((e) => {
    const sec = e.closest(".scout-sec").getBoundingClientRect(), r = e.getBoundingClientRect();
    return r.right > sec.right + 1 || e.scrollWidth > e.clientWidth + 1;
  }).length);
  check("synergies: proposed reasons wrap inside their column", spill === 0, `${spill} overflowing`);
  await open("/synergies/support/?champ=nami");
  const conf = (await page.locator(".scout .layer.clash:not(.proposed)").first().textContent().catch(() => "")) ?? "";
  check("synergies: Support tab keeps Saved synergy (Nami with Corki) apart from Proposed", /Saved synergy/.test(conf) && /Corki/.test(conf) && (await page.locator(".scout .layer.clash.proposed").count()) === 1, conf.slice(0, 80));
}
// Top draft usage (alan, 2026-10-13): blind / response from the rebuilt draft order, matchups open their game in place,
// saved grade and pro usage side by side, Draft Room labels only.
{
  await open("/synergies/top/?champ=jax&view=matchups&patch=26.18");
  const head = (await page.locator(".top-report .scout-meta").textContent().catch(() => "")) ?? "";
  check("top: header shows the saved grade beside observed usage", /Saved blind grade/.test(head) && /(Blind|Response) \d+\/\d+/.test(head), head.slice(0, 120));
  await page.locator(".pair-list > li > button", { hasText: "Olaf" }).first().click();
  await page.locator(".pair-list .top-games > li > button", { hasText: "LGD" }).first().click();
  const game = (await page.locator(".top-game").first().textContent().catch(() => "")) ?? "";
  check("top: Jax into Olaf opens BNK FearX vs LGD with first pick, both picks and no counter claim",
    /BNK FearX.*picked first/.test(game) && /pick 7 of 10/.test(game) && (await page.locator(".top-game .draft-seq li").count()) === 10 && !/Supported counter/.test(game), game.slice(0, 160));
  check("top: the open game links to its builds", (await page.locator(".top-game a[href*='/pro-builds/']").count()) === 2, "");
  await page.locator(".top-use button", { hasText: "Response" }).click();
  await page.waitForTimeout(300);
  const rail = await page.locator(".pick-rail .rail-name").allTextContents();
  check("top: Response filter keeps response-leaning tops (K'Sante) and drops Rumble", rail.some((n) => /Sante/.test(n)) && !rail.includes("Rumble"), rail.join(","));
  await open("/?jungle=vi&focus=TOP&vs=top:rumble");
  const sigs = (await page.locator(".fit-row .sig.usage").allTextContents()).join("|");
  check("draft room: with the enemy top locked, TOP rows say what was picked into it", /Picked into Rumble · \d+/.test(sigs), sigs);
}
// Mid, Bot and Support draft usage (alan, 2026-10-13): All patches by default, a chosen patch kept while browsing, an
// explicit URL patch wins; Mid shows the enemy jungler as context; Bot and Support read the bot lane as a duo.
{
  await open("/synergies/mid/?champ=ryze&view=usage");
  const usage = (await page.locator(".top-report").textContent().catch(() => "")) ?? "";
  check("mid: Ryze opens on All patches with blind counts, the enemy jungler as context and a per-patch table",
    (await page.locator(".top-tools [aria-label=Patch]").getAttribute("data-value")) === "all" && /All patches \(26\.\d+–26\.\d+\)/.test(usage)
    && /Blind\s*\d+\/\d+/.test(usage) && /After enemy jungler/.test(usage) && (await page.locator(".by-patch tbody tr").count()) >= 2, usage.slice(0, 160));
  await choose(".top-tools [aria-label=Patch]", "26.18");
  await page.locator("nav.tabs a", { hasText: "Support" }).click();
  await page.waitForURL(/synergies\/support\//);
  await page.waitForTimeout(300);
  check("synergies: a chosen patch is kept when switching roles", /patch=26\.18/.test(page.url()), page.url());
  await open("/synergies/bot/?champ=yunara&view=duo&patch=26.16");
  check("synergies: an explicit URL patch wins over the kept one", /patch=26\.16/.test(page.url()) && (await page.locator(".top-tools [aria-label=Patch]").getAttribute("data-value")) === "26.16", page.url());
  await choose(".top-tools [aria-label=Patch]", "all");
  await open("/synergies/bot/?champ=yunara&view=duo");
  const duo = (await page.locator(".top-report").textContent().catch(() => "")) ?? "";
  check("bot: Yunara's Duo drafting lists Yunara + Lulu and a repeated response into Lucian + Milio, never a counter",
    /Yunara \+ Lulu/.test(duo) && (await page.locator(".duo-list > li", { hasText: "Lucian + Milio" }).filter({ hasText: "Repeated response" }).count()) >= 1 && !/Supported counter/.test(duo) && !/patch=/.test(page.url()), page.url());
  await page.locator(".duo-btn", { hasText: "Yunara + Lulu" }).click();
  await page.locator(".duo-games > li > button").first().click();
  const g = (await page.locator(".duo-games .top-game").first().textContent().catch(() => "")) ?? "";
  check("bot: a duo game opens with first pick, the ten picks and what the pick could see", /picked first|not marked/.test(g) && /Enemy ADC/.test(g), g.slice(0, 160));
  check("bot: the open duo game lists the bot lane in draft order with each duo's construction", (await page.locator(".duo-games .bot-seq li").count()) >= 3 && /Bot lane in draft order/.test(g), g.slice(0, 160));
  await open("/?bot=yunara&vs=bot:lucian,support:milio&focus=SUPPORT");
  const sup = (await page.locator(".fit-row .sig.usage").allTextContents()).join("|");
  check("draft room: with the enemy bot lane locked, SUPPORT rows say which duos were picked into it", /Picked into Lucian \+ Milio · \d+/.test(sup), sup);
}
// Jungle: Mid/Jungle order (who was picked first), partners open their games, the enemy board at the pick
{
  await open("/synergies/jungle/?champ=jarvan-iv&view=mates");
  const line = (await page.locator(".mate-table").first().locator("xpath=..").locator("p.small").textContent().catch(() => "")) ?? "";
  check("jungle: Mid/Jungle says how often the jungler was picked before its mid", /Picked before its mid in \d+\/\d+/.test(line), line.slice(0, 120));
  await page.locator(".mate-table .duo-btn").first().click();
  check("jungle: a Mid/Jungle pair opens its games", (await page.locator(".mate-table .duo-open .top-games > li").count()) >= 2, "");
  await open("/synergies/jungle/?champ=chogath&view=matchups");
  check("jungle: Matchups lists the enemy board at the pick as composition context", /potential composition responses/.test((await page.locator("main").textContent()) ?? ""), "");
  await open("/?mid=syndra&focus=JUNGLE");
  const mate = (await page.locator(".fit-row .sig.mate").allTextContents()).join("|");
  check("draft room: with a mid locked, Jungle rows link their pro games with that mid", /With Syndra · \d+ games?/.test(mate), mate.slice(0, 120));
  const href = (await page.locator(".fit-row .sig.mate").first().getAttribute("href").catch(() => "")) ?? "";
  check("draft room: the Mid/Jungle label opens the pair on the Jungle page", /synergies\/jungle\/\?champ=[a-z-]+&view=mates&mate=syndra/.test(href), href);
}
// Champion Synergies: hover card on desktop, drawer on click
{
  await open("/synergies/bot/?champ=caitlyn&view=pro");
  check("synergies: rail marks the selected pick", (await page.locator(".pick-rail a.active .rail-name").textContent().catch(() => "")) === "Caitlyn", "");
  check("synergies: sources start collapsed", (await page.locator(".scout-sources").count()) === 1 && !(await page.locator(".scout-sources").evaluate((d) => d.open)), "");
  await page.locator(".pick-rail input[type=search]").fill("nami");
  const railNames = await page.locator(".pick-rail .rail-name").allTextContents();
  check("synergies: rail search matches partners (nami -> Corki)", railNames.includes("Corki") && !railNames.includes("Caitlyn"), railNames.join(","));

  await open("/synergies/bot/?champ=sivir");
  const lulu = page.locator(".pick-card .champ-btn", { hasText: "Lulu" }).first();
  await lulu.hover();
  // The pointer can cross a neighbouring champion on its way (hover cards swap in place): wait for Lulu's own card.
  const card = await page.locator(".hovercard", { hasText: "Lulu" }).waitFor({ timeout: 3000 }).then(() => page.locator(".hovercard").textContent()).catch(() => page.locator(".hovercard").textContent().catch(() => ""));
  check("synergies: hovering Lulu shows Synergy · Default with Sivir", /Lulu/.test(card) && /Synergy · Default/.test(card) && /Peel 3/.test(card), card.slice(0, 120));
  await lulu.click();
  await page.locator(".drawer").waitFor({ timeout: 3000 }).catch(() => {});
  check("synergies: clicking a champion opens the drawer", (await page.locator(".drawer h2").textContent().catch(() => "")) === "Lulu" && (await page.locator(".hovercard").count()) === 0, "");
  await page.keyboard.press("Escape");
}
// Mobile navigation
await page.setViewportSize({ width: 390, height: 844 });
await open("/pool/");
const hiddenBefore = await page.locator("aside.sidebar").evaluate((e) => getComputedStyle(e).visibility);
await page.locator(".menu-btn").click();
await page.waitForTimeout(250);
await page.locator(".nav a", { hasText: "Meta / Research" }).click();
await page.waitForFunction(() => document.querySelector("main h1")?.textContent?.trim() === "Meta / Research", null, { timeout: 8000 }).catch(() => {});
check("mobile menu opens and navigates", hiddenBefore === "hidden" && (await h1()) === "Meta / Research", `sidebar ${hiddenBefore} -> ${page.url()}`);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check("no horizontal page scroll at 390px", overflow <= 0, `${overflow}px`);
await open("/pool/");
await page.locator("tr.pool-row").first().click();
const poolOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check("pool at 390px with a row open: any scroll stays inside the table", poolOverflow <= 0, `${poolOverflow}px`);
await open("/?top=ambessa&bot=ziggs&vs=renekton,,,sivir,lulu");
const draftOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check("draft room at 390px: slots scroll inside their rows, no page overflow", draftOverflow <= 0, `${draftOverflow}px`);
// Phone Comp Check summary: one line naming what the draft is missing, pinned while scrolling, jumps to the full read
{
  await open("/?top=ambessa&jungle=skarner&mid=ahri&bot=sivir&vs=renekton,,,ezreal,karma");
  const line = (await text(".cc-summary-board")).replace(/\s+/g, " ");
  check("phone Comp Check summary names the open role's needs, never a score", /^Comp Check.*Needs /.test(line) && !/\d+\s*\/\s*\d+/.test(line.replace(/AD \/ AP/, "")), line);
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.waitForTimeout(400);
  const pinned = await page.locator(".draft-mini.show .cc-summary-mini").isVisible();
  check("phone Comp Check summary stays pinned while scrolling candidates", pinned, "");
  await page.locator(".draft-mini.show .cc-summary-mini").click();
  await page.waitForTimeout(900);
  const cc = await page.locator("#comp-check").boundingBox();
  check("tapping the summary jumps to the full Comp Check", !!cc && cc.y < 300, JSON.stringify(cc));
  await open("/?bot=sivir");
  check("phone Comp Check summary waits for two picks", /Read starts at two picks/.test(await text(".cc-summary-board")), await text(".cc-summary-board"));
}
{
  const m = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await m.goto(base + "/synergies/bot/?champ=sivir", { waitUntil: "networkidle" });
  await m.locator(".pick-card .champ-btn", { hasText: "Lulu" }).first().tap();
  await m.waitForTimeout(400);
  check("synergies at 390px: a tap opens the drawer directly", (await m.locator(".drawer").count()) === 1 && (await m.locator(".hovercard").count()) === 0, "");
  await m.close();
}
await open("/comps/");
await page.locator(".lu-champ").first().click();
await page.waitForTimeout(400); // let the slide-up finish
const sheet = await page.locator(".drawer").boundingBox().catch(() => null);
const sheetOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check("comps at 390px: drawer is a bottom sheet with no page overflow", !!sheet && sheet.width === 390 && sheet.y > 100 && Math.round(sheet.y + sheet.height) === 844 && sheetOverflow <= 0, JSON.stringify(sheet));
await page.setViewportSize({ width: 1440, height: 900 });
// Fonts: Space Grotesk (titles, nav, champion names) and Inter (body) load from this site, never from a font CDN
await open("/");
const fonts = await page.evaluate(async () => {
  await document.fonts.ready;
  const h1 = getComputedStyle(document.querySelector("main h1")).fontFamily;
  const body = getComputedStyle(document.body).fontFamily;
  // next/font gives the self-hosted face a generated family name; read it from the variable the layout sets
  const family = getComputedStyle(document.documentElement).getPropertyValue("--font-grotesk").split(",")[0].trim().replace(/['"]/g, "");
  const grotesk = [...document.fonts].filter((f) => f.status === "loaded" && f.family.replace(/['"]/g, "") === family).map((f) => f.family);
  const cdn = [...document.querySelectorAll('link[rel="stylesheet"], link[rel="preconnect"]')].map((l) => l.href).filter((h) => /typekit|fonts\.googleapis|fonts\.gstatic/.test(h));
  const preload = [...document.querySelectorAll('link[rel="preload"][as="font"]')].map((l) => l.href);
  return { family, h1, body, grotesk, cdn, preload };
});
check("Space Grotesk is self-hosted, preloaded and used for titles; Inter for body", !!fonts.family && fonts.h1.replace(/['"]/g, "").startsWith(fonts.family) && fonts.grotesk.length > 0 && /^"?Inter Variable/.test(fonts.body) && fonts.cdn.length === 0 && fonts.preload.some((h) => h.includes("/lol-drafting/")), JSON.stringify(fonts).slice(0, 300));
// Refresh prompt: no prompt while the open tab matches the deploy; a newer version.json shows it
await open("/");
const ver = await page.evaluate(async (b) => (await fetch(`${b}/version.json`, { cache: "no-store" })).status, new URL(base).pathname.replace(/\/$/, ""));
await page.waitForTimeout(800);
const noPrompt = (await page.locator(".update-notice").count()) === 0;
await page.route("**/version.json*", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ id: "newer-deploy" }) }));
await page.evaluate(() => window.dispatchEvent(new Event("focus")));
const prompt = await page.locator(".update-notice", { hasText: "Site updated" }).waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
await page.unroute("**/version.json*");
check("refresh prompt only appears after a new deploy", ver === 200 && noPrompt && prompt, `version.json ${ver}, prompt before ${!noPrompt}, after ${prompt}`);
// Branding: custom mark and name in the sidebar, the fan-project notice in the footer
await page.setViewportSize({ width: 1440, height: 900 });
await open("/");
check("sidebar brand is the custom Draft Assistant mark", /^Draft Assistant/.test((await text("aside.sidebar .brand-name")) ?? "") && (await page.locator("aside.sidebar svg.brand-mark").count()) === 1, "");
check("fan-project notice in the footer", /Legal Jibber Jabber/.test((await text("footer.site-foot")) ?? "") && /does not endorse or sponsor/.test(await text("footer.site-foot")), "");
check("Gen.G trademark line in the footer", /Gen\.G and GenRang are trademarks of Gen\.G Esports/.test((await text("footer.site-foot")) ?? ""), "");
const mascotOk = async () => page.$$eval("img.genrang", (ims) => ims.length > 0 && ims.every((i) => i.complete && i.naturalWidth > 0 && i.getAttribute("src").startsWith("/lol-drafting/")));
check("GenRang loads in the sidebar under the base path", await mascotOk(), "");
// Dropdowns: one shared component, no native selects, keyboard and screen-reader behaviour, viewport-aware
{
  let natives = 0;
  for (const path of ["/pool/", "/meta/", "/pro-drafts/", "/comps/"]) { await open(path); natives += await page.locator("main select").count(); }
  check("dropdowns: no native <select> on filter pages", natives === 0, `${natives} native`);
  await open("/pro-drafts/");
  // Role is a shared Select there; Team, Champion, Tournament and Series are pinnable pickers (checked below).
  const team = page.locator(".select-field", { hasText: "Role" }).locator("[role=combobox]");
  await team.focus();
  await page.keyboard.press("ArrowDown");
  const opened = await page.locator(".select-menu[role=listbox]").isVisible();
  const look = await page.evaluate(() => {
    const m = document.querySelector(".select-menu"), sel = m?.querySelector("[aria-selected=true]");
    const cs = (e) => e && getComputedStyle(e);
    return { font: cs(m)?.fontFamily, selBg: cs(sel)?.backgroundColor, check: cs(sel?.querySelector(".select-check"))?.visibility, label: m?.getAttribute("aria-labelledby") };
  });
  await page.keyboard.press("ArrowDown");
  const activeId = await team.getAttribute("aria-activedescendant");
  await page.keyboard.press("Enter");
  // The filter lives in the URL; router.replace lands asynchronously.
  await page.waitForURL(/[?&]role=/, { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(300);
  const picked = new URL(page.url()).searchParams.get("role");
  const focused = await page.evaluate(() => document.activeElement?.getAttribute("role") === "combobox" && document.activeElement.closest(".select-field")?.textContent.startsWith("Role"));
  const menuOpen = await page.locator(".select-menu").count();
  check("dropdowns: arrows + Enter choose an option, focus stays on the trigger", opened && !!activeId && !!picked && focused && menuOpen === 0, JSON.stringify({ opened, activeId: !!activeId, picked, focused, menuOpen }));
  check("dropdowns: menu uses the display font, tinted selected row with a check, labelled for screen readers", /grotesk/i.test(look.font ?? "") && look.selBg && look.selBg !== "rgba(0, 0, 0, 0)" && look.check === "visible" && !!look.label, JSON.stringify(look));
  await page.keyboard.press("Space");
  await page.keyboard.press("Escape");
  const afterEsc = new URL(page.url()).searchParams.get("role");
  check("dropdowns: Escape closes without changing the value", (await page.locator(".select-menu").count()) === 0 && afterEsc === picked, "");
  await team.click();
  await page.locator("main h1").click();
  check("dropdowns: clicking outside closes the menu", (await page.locator(".select-menu").count()) === 0, "");
  await open("/pro-drafts/");
  const champ = page.locator(".select-field", { hasText: "Champion" }).locator("[role=combobox]");
  const tb = await champ.boundingBox();
  await page.setViewportSize({ width: 1440, height: Math.round(tb.y + tb.height + 60) });
  await champ.click();
  const flip = await page.evaluate(() => { const m = document.querySelector(".select-menu"); const r = m.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, vh: innerHeight, scrolls: m.scrollHeight > m.clientHeight }; });
  check("dropdowns: menu flips above the trigger near the bottom and scrolls inside", flip.bottom <= tb.y + 1 && flip.top >= 0 && flip.scrolls, JSON.stringify(flip));
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await open("/meta/");
  await page.locator(".hub-tools [role=combobox]").first().click();
  const mb = await page.locator(".select-menu").boundingBox();
  check("dropdowns at 390px: menu stays inside the viewport", !!mb && mb.x >= 0 && mb.x + mb.width <= 390 && mb.y >= 0 && mb.y + mb.height <= 844, JSON.stringify(mb));
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 900 });
}
// Pro Drafts match browser (alan, 2026-10-13): one game is one <tbody class="game-rows"> holding its blue row then its
// red row under one shared game cell; a one-sided view keeps the game cell and each row's recorded side (blue / red,
// neutral when unrecorded). The team cell carries the side strip and ends with a W / L result tag.
{
  await open("/pro-drafts/");
  const games = await page.$$eval(".drafts-table tbody.game-rows", (gs) => gs.map((g) => ({
    label: g.getAttribute("aria-label") ?? "", game: g.querySelector(".game-cell")?.textContent.trim() ?? "", gameCells: g.querySelectorAll(".game-cell").length,
    rows: [...g.querySelectorAll("tr")].map((r) => ({ cls: r.className, side: r.dataset.side, title: r.title, sr: r.querySelector(".team-cell .sr-only")?.textContent.trim() ?? "", team: r.querySelector(".team-name")?.textContent.trim(), vs: r.querySelector(".team-vs")?.textContent.trim() ?? "", picks: r.querySelectorAll(".pick-cell .champ").length, res: r.querySelector(".res")?.textContent.trim() })),
  })));
  const pairs = games.filter((g) => g.rows.length === 2);
  const ok = pairs.length > 0 && pairs.every((g) => g.gameCells === 1 && g.game && /pair-a/.test(g.rows[0].cls) && /pair-b/.test(g.rows[1].cls) && g.rows.every((r) => r.picks === 5 && !r.vs) && (g.label.includes(`${g.rows[0].team} vs ${g.rows[1].team}`) || g.label.includes(`${g.rows[1].team} vs ${g.rows[0].team}`)));
  check("pro drafts: both sides of a game share one game cell, five picks each, no repeated opponent", ok, `${pairs.length} games of ${games.length}`);
  const sided = pairs.filter((g) => g.rows[0].side !== "none");
  const oneEach = sided.length > 0 && sided.every((g) => g.rows[0].side === "blue" && g.rows[1].side === "red");
  check("pro drafts: a recorded game shows its blue row then its red row", oneEach, `${sided.length} sided games`);
  const results = pairs.filter((g) => g.rows.every((r) => r.res));
  check("pro drafts: a recorded game shows one W and one L", results.length > 0 && results.every((g) => g.rows.map((r) => r.res).sort().join("") === "LW"), `${results.length} with results`);
  const strip = async (side) => page.$eval(`.drafts-table tr.side-${side} .team-cell`, (td) => getComputedStyle(td).boxShadow).catch(() => "");
  const [blue, red] = [await strip("blue"), await strip("red")];
  // Computed style reads "rgb(…) 3px 0px 0px 0px inset".
  const threePx = /(^|\s)3px 0px 0px( 0px)? inset|inset 3px/;
  check("pro drafts: blue and red side strips are 3px and differ", threePx.test(blue) && threePx.test(red) && blue !== red, `${blue} | ${red}`);
  const rows = games.flatMap((g) => g.rows);
  // No hover tooltip on the strips (alan, 2026-10-13); the side is named for screen readers and in the open game.
  check("pro drafts: no side tooltip on rows, side named for screen readers", rows.every((r) => !r.title && r.sr === `${({ blue: "Blue side", red: "Red side", none: "Side not recorded" })[r.side]}:`), "");
  const icon = await page.$eval(".drafts-table .pick-cell .champ", (c) => c.getBoundingClientRect().width).catch(() => 0);
  const wl = await page.$eval(".drafts-table .res.win", (e) => { const cs = getComputedStyle(e); return { color: cs.color, bg: cs.backgroundColor, size: parseFloat(cs.fontSize) }; }).catch(() => null);
  const wlL = await page.$eval(".drafts-table .res.loss", (e) => getComputedStyle(e).color).catch(() => "");
  check("pro drafts: 28px portraits and readable W / L tags in two colours", icon === 28 && !!wl && wl.size >= 11 && wl.color !== wlL, JSON.stringify({ icon, wl, wlL }));
  check("pro drafts: no source links or read notes in the table", (await page.locator(".drafts-table .source-links, .drafts-table td.wrap").count()) === 0, "");
  check("pro drafts: the toolbar counts games", /^\d+ of \d+ games$/.test((await page.locator(".drafts-tools .count").textContent()) ?? ""), "");
  // A team seen on both sides, so the filtered view must show both colours.
  const team = [...new Set(rows.map((r) => r.team))].find((t) => ["blue", "red"].every((sd) => rows.some((r) => r.team === t && r.side === sd))) ?? "";
  await open(`/pro-drafts/?team=${encodeURIComponent(team)}`);
  const one = await page.$$eval(".drafts-table tbody.game-rows", (gs) => gs.map((g) => ({ rows: g.querySelectorAll("tr").length, side: g.querySelector("tr")?.dataset.side, vs: g.querySelector(".team-vs")?.textContent.trim() ?? "", game: !!g.querySelector(".game-cell") })));
  check("pro drafts: a one-sided view keeps each game's cell, names the opponent and keeps each row's side", one.length > 0 && one.every((g) => g.rows === 1 && g.game && /^vs /.test(g.vs)) && one.some((g) => g.side === "blue") && one.some((g) => g.side === "red"), `${team}: ${one.map((g) => g.side).join(",")}`);
}
// Pro Drafts pins (alan, 2026-10-13): teams, champions, tournaments and series can be pinned in their menus; a pin is
// listed first, shows as a one-click filter under the menus, and a pinned team is starred in the table.
{
  await open("/pro-drafts/");
  await page.evaluate(() => ["pro-builds:pinned-teams", "pro-builds:pinned-tournaments", "pro-drafts:pinned-champions", "pro-drafts:pinned-series"].forEach((k) => localStorage.removeItem(k)));
  await open("/pro-drafts/");
  const kinds = [];
  for (const label of ["Team", "Champion", "Tournament", "Series"]) {
    await page.locator(".drafts-tools .select-field", { hasText: label }).locator("[role=combobox]").click();
    const opt = page.locator(".player-menu .select-option[data-value]:not([data-value=''])").last();
    const value = await opt.getAttribute("data-value").catch(() => null);
    await opt.locator(".pin-btn").click().catch(() => {});
    // An open menu keeps its order while pinning (nothing moves under the pointer); the pin leads once it reopens.
    await page.keyboard.press("Escape");
    await page.locator(".drafts-tools .select-field", { hasText: label }).locator("[role=combobox]").click();
    const first = await page.locator(".player-menu .select-option[data-value]:not([data-value=''])").first().getAttribute("data-value").catch(() => null);
    await page.keyboard.press("Escape");
    kinds.push({ label, value, first });
  }
  check("pro drafts pins: a pinned team, champion, tournament and series is listed first in its menu", kinds.every((k) => k.value && k.first === k.value), JSON.stringify(kinds));
  const chips = await page.locator(".pinned-filters button").count();
  check("pro drafts pins: pinned items show as one-click filters", chips === 4, `${chips} chips`);
  const team = kinds[0].value;
  await page.locator(".pinned-filters button", { hasText: team }).click();
  await page.waitForURL(/[?&]team=/, { timeout: 4000 }).catch(() => {});
  check("pro drafts pins: a pinned chip filters the table and the team is starred", new URL(page.url()).searchParams.get("team") === team && (await page.locator(".drafts-table .team-line .pin-icon.on").count()) > 0, page.url());
  await page.evaluate(() => ["pro-builds:pinned-teams", "pro-builds:pinned-tournaments", "pro-drafts:pinned-champions", "pro-drafts:pinned-series"].forEach((k) => localStorage.removeItem(k)));
}
// Pro Builds page (/pro-builds/, components/views/ProBuildsView.tsx) and the links into it
{
  await open("/meta/?role=TOP");
  await page.locator(".hub-table .champ-link").first().click();
  await page.locator(".drawer-tab", { hasText: "Builds" }).click();
  const link = page.locator(".drawer .drawer-panel a", { hasText: "View Pro Builds" });
  await link.waitFor({ timeout: 5000 }).catch(() => {});
  const champ = await page.locator(".drawer h2").first().textContent().catch(() => "");
  const href = await link.getAttribute("href").catch(() => null);
  check("builds: the drawer's Builds tab counts builds, names recent players and links to the page with champion and role", !!href && /\/pro-builds\/\?champion=[\w-]+&role=TOP/.test(href) && /build/.test(await page.locator(".drawer .drawer-panel").innerText()) && (await page.locator(".drawer .dw-build").count()) >= 1, href ?? "no link");
  if (href) {
    await link.click();
    await page.waitForURL(/\/pro-builds\//, { timeout: 8000 }).catch(() => {});
    await page.locator(".game-head").waitFor({ timeout: 8000 }).catch(() => {});
    check("builds: the drawer link opens that champion in that role", (await h1()) === "Pro Builds" && (await page.locator(".builds-title h2").textContent()) === champ && /TOP/.test(await page.locator(".pick-rail li button.active").innerText()), `${champ} → ${await page.locator(".builds-title h2").textContent().catch(() => "")}`);
  }
  // The overview: /pro-builds/ with nothing asked selects no champion (alan, 2026-10-13)
  await page.evaluate(() => localStorage.removeItem("pro-builds:recently-viewed"));
  await open("/pro-builds/");
  await page.locator(".recent-builds tbody tr").first().waitFor({ timeout: 8000 }).catch(() => {});
  const home = { head: await page.locator(".builds-head").count(), active: await page.locator(".pick-rail li button.active").count(), url: page.url(),
    rows: await page.locator(".recent-builds tbody tr").count(), pinned: await page.locator(".home-section[aria-label='Pinned players']").count(),
    search: await page.locator(".builds-home-tools input[type=search]").count(), roles: await page.locator(".builds-home-tools .seg button").count(),
    patch: await page.locator(".builds-home-tools [role=combobox][aria-label='Patch']").innerText().catch(() => "") };
  check("builds overview: /pro-builds/ opens the overview with no champion selected", home.head === 0 && home.active === 0 && !/champion=/.test(home.url), JSON.stringify(home));
  check("builds overview: search, five roles plus All, every patch by default, pinned players and recent builds", home.search === 1 && home.roles === 6 && /All patches/.test(home.patch) && home.pinned === 1 && home.rows > 0, JSON.stringify(home));
  const dates = await page.$$eval(".recent-builds tbody tr", (trs) => trs.map((tr) => tr.children[5].textContent + " " + tr.children[6].textContent));
  const rowPatches = dates.map((d) => Number(d.split(" ")[0].split(".")[1]));
  check("builds overview: recent builds list every patch, newest patch first", rowPatches.length > 0 && rowPatches.every((p, i) => i === 0 || p <= rowPatches[i - 1]), dates.slice(0, 3).join(" | "));
  const firstRow = page.locator(".recent-builds tbody tr").first();
  const rowPlayer = (await firstRow.locator("td").first().locator("b").textContent())?.trim();
  const rowChamp = (await firstRow.locator(".champ-cell .champ-name").textContent())?.trim();
  await firstRow.click();
  await page.locator(".game-head").waitFor({ timeout: 8000 }).catch(() => {});
  const opened = new URL(page.url()).searchParams;
  check("builds overview: a recent build opens that exact game and player", !!opened.get("champion") && !!opened.get("game") && !!opened.get("player") && (await page.locator(".builds-title h2").textContent()) === rowChamp && (await page.locator(".game-head .game-player").innerText()).includes(rowPlayer), `${rowPlayer} ${rowChamp} → ${page.url()}`);
  const exact = page.url();
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".game-head").waitFor({ timeout: 8000 }).catch(() => {});
  check("builds: refreshing a build URL keeps the champion, game and player", page.url() === exact && (await page.locator(".builds-title h2").textContent()) === rowChamp && (await page.locator(".build-pick.active").count()) === 1, page.url());
  await page.goBack();
  await page.locator(".recent-builds").waitFor({ timeout: 8000 }).catch(() => {});
  check("builds overview: Back returns to the overview", (await page.locator(".builds-head").count()) === 0 && (await page.locator(".recent-builds tbody tr").count()) > 0, page.url());
  await page.goForward();
  await page.locator(".game-head").waitFor({ timeout: 8000 }).catch(() => {});
  await page.locator(".sidebar a, aside a, nav a", { hasText: "Pro Builds" }).first().click();
  await page.waitForTimeout(400);
  check("builds overview: the sidebar opens the overview from a champion, nothing carried over", (await page.locator(".builds-head").count()) === 0 && (await page.locator(".pick-rail li button.active").count()) === 0 && !/champion=/.test(page.url()), page.url());
  check("builds overview: the champion just viewed is a recently viewed shortcut, not reopened", (await page.locator(".home-viewed a .champ-name").first().textContent().catch(() => "")) === rowChamp, await page.locator(".home-viewed").innerText().catch(() => "none"));
  await page.locator(".pick-rail li button").first().click();
  await page.locator(".builds-head").waitFor({ timeout: 8000 }).catch(() => {});
  await page.locator(".builds-home-link").click();
  await page.waitForTimeout(400);
  check("builds: the overview link returns from a champion", (await page.locator(".builds-head").count()) === 0 && (await page.locator(".recent-builds").count()) === 1, page.url());
  await open("/pro-builds/?champion=jhin&role=BOT");
  await page.locator(".builds-head, .builds-empty").first().waitFor({ timeout: 8000 }).catch(() => {});
  check("builds: an explicit champion URL opens that champion and role", (await page.locator(".builds-title h2").textContent().catch(() => "")) === "Jhin" && /BOT/.test(await page.locator(".pick-rail li button.active").innerText().catch(() => "")), page.url());
  // Pinned players first (alan, 2026-10-13): with Ruler (Gol.gg 685) pinned, Ashe Bot opens his newest Ashe game on
  // 26.16 although newer 26.18 games exist; a chosen player, an explicit patch and unpinning are respected.
  {
    const keep = await page.evaluate(() => localStorage.getItem("pro-builds:pinned-players"));
    await page.evaluate(() => localStorage.setItem("pro-builds:pinned-players", JSON.stringify(["685"])));
    const shown = async (q) => {
      await open(`/pro-builds/?champion=ashe&role=BOT${q}`);
      await page.locator(".game-head").waitFor({ timeout: 8000 }).catch(() => {});
      return { player: (await page.locator(".build-pick.active b").first().textContent().catch(() => ""))?.trim(), head: (await page.locator(".game-head").innerText().catch(() => "")).replace(/\s+/g, " "), games: await page.locator(".build-pick").count(), url: page.url() };
    };
    const ruler = await shown("");
    check("builds: a pinned player's newest game opens first, on any patch, others still listed", ruler.player === "Ruler" && /Ruler/.test(ruler.head) && /26\.16/.test(ruler.head) && ruler.games > 2 && !/game=/.test(ruler.url), JSON.stringify(ruler));
    const chosen = await shown("&player=1931");
    check("builds: a chosen player is never replaced by a pinned one", chosen.player === "GALA", JSON.stringify(chosen));
    const patch = await shown("&patch=26.18");
    check("builds: an explicit patch stays; the pinned player's older games don't override it", patch.player !== "Ruler" && /26\.18/.test(patch.head) && /patch=26\.18/.test(patch.url), JSON.stringify(patch));
    await page.evaluate(() => localStorage.setItem("pro-builds:pinned-players", "[]"));
    const unpinned = await shown("");
    check("builds: unpinned, the newest recorded game opens", unpinned.player !== "Ruler" && /26\.18/.test(unpinned.head), JSON.stringify(unpinned));
    await page.evaluate((v) => { if (v == null) localStorage.removeItem("pro-builds:pinned-players"); else localStorage.setItem("pro-builds:pinned-players", v); }, keep);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await open("/pro-builds/");
  await page.locator(".recent-builds tbody tr").first().waitFor({ timeout: 8000 }).catch(() => {});
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("builds overview at 390px: no sideways page scroll", over <= 0, `${over}px`);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBuildsChampion();
  check("builds: the rail lists every champion and role with recorded builds", (await page.locator(".pick-rail li button").count()) > 30, `${await page.locator(".pick-rail li button").count()} entries`);
  const games = await page.locator(".build-pick").count();
  // Gol.gg publishes a fresh game's stats before its skill order and purchase timeline (the refresh re-reads such a
  // game), so the exact-setup checks run on the newest game whose purchase log is recorded, and a partial record
  // must say what the source did not give rather than show a filled-in build.
  let partialNote = null;
  for (let i = 0; i < Math.min(games, 15) && (await page.locator(".build-timeline li").count()) < 3; i++) {
    if (i > 0) { await page.locator(".build-pick").nth(i).click(); await page.waitForTimeout(150); }
    if ((await page.locator(".build-timeline li").count()) < 3) partialNote ??= await page.locator(".game-detail").innerText().catch(() => "");
  }
  if (partialNote != null) check("builds: a game whose timeline Gol.gg has not published says so, nothing filled in", /Partial record: .*not given by the source/.test(partialNote) && /Purchase log not recorded/.test(partialNote), partialNote.replace(/\s+/g, " ").slice(0, 120));
  const active = games ? await page.locator(".build-pick").evaluateAll((els) => els.findIndex((e) => e.classList.contains("active"))) : -1;
  const other = active === 1 ? 0 : 1;
  const head = await page.locator(".game-head").innerText().catch(() => "");
  const src = await page.locator(".game-head a[href*='gol.gg/game/stats/']").getAttribute("href").catch(() => null);
  check("builds: a game names player, opponent, tournament, patch, date, side, result and its Gol.gg source", games > 0 && /\bvs\b/.test(head) && /26\.\d+/.test(head) && /(Blue|Red) side/.test(head) && /Win|Loss/.test(head) && !!src, head.replace(/\s+/g, " ").slice(0, 160));
  check("builds: two summoner spells with names and casts", (await page.locator(".game-spells .build-spell").count()) === 2 && /casts/.test(await page.locator(".game-spells").innerText()), "");
  const chosen = await page.locator(".rune-page .rune-row .bicon.chosen").count(), dim = await page.locator(".rune-page .rune-row .bicon.dim").count();
  check("builds: full rune page, keystone + 3 + 2 chosen, the rest dimmed, 3 shards", chosen === 6 && dim > 8 && (await page.locator(".rune-page .rune-row.keystone .bicon.chosen").count()) === 1 && (await page.locator(".rune-shard").count()) === 3, `${chosen} chosen, ${dim} dimmed`);
  const runeTips = await page.locator(".rune-page .rune-row .bicon").evaluateAll((els) => els.filter((e) => (e.getAttribute("title") ?? "").includes("\n")).length);
  check("builds: every rune has a name and description tip", runeTips === chosen + dim, `${runeTips} tips`);
  const cols = await page.locator(".skill-grid thead th").count(), ups = await page.locator(".skill-grid td.up").count(), unreached = await page.locator(".skill-grid thead th.unreached").count();
  check("builds: level grid shows 18 levels, one mark per recorded point, unreached levels empty", cols - 1 >= 18 && ups === cols - 1 - unreached, `${cols - 1} columns, ${ups} marks, ${unreached} not reached`);
  const flow = await page.locator(".build-flow").innerText().catch(() => "");
  check("builds: overview shows start, first item, boots, core, situational and final", ["Start", "First item", "Boots", "Core", "Situational", "Final"].every((l) => flow.includes(l)), flow.replace(/\s+/g, " ").slice(0, 120));
  check("builds: purchase timeline lists shop visits in order", (await page.locator(".build-timeline li").count()) > 2, "");
  await page.waitForTimeout(800);
  const loaded = await page.locator(".game-detail .bicon img").evaluateAll((els) => els.filter((e) => e.complete && e.naturalWidth > 0).length);
  check("builds: item, rune, spell and ability icons load from Data Dragon", loaded > 20, `${loaded} icons`);
  if (games > 1) {
    await page.locator(".build-pick").nth(other).click();
    await page.waitForTimeout(200);
    check("builds: picking another game updates the whole setup and the URL", (await page.locator(".game-head").innerText()) !== head && /[?&]game=\d+/.test(page.url()), page.url());
    const shared = page.url();
    await open(shared.replace(base, ""));
    await page.locator(".game-head").waitFor({ timeout: 8000 }).catch(() => {});
    check("builds: a shared URL reopens the same game", (await page.locator(".build-pick.active").count()) === 1 && (await page.locator(".build-pick").nth(other).getAttribute("aria-selected")) === "true", "");
  }
  // Player filter: type to find a player, pin them (saved in this browser), pinned players first
  {
    const picker = page.locator(".player-picker input[aria-label='Player']");
    const first = await page.locator(".build-pick b").first().textContent();
    await picker.fill(first.slice(0, 3));
    const opts = await page.locator(".player-menu [role=option]").allTextContents();
    check("builds: typing in the player filter lists matching players", opts.length > 0 && opts.every((o) => o.toLowerCase().includes(first.slice(0, 3).toLowerCase())), opts.join(", "));
    const last = page.locator(".player-menu [role=option]").last();
    const pinned = (await last.textContent()).trim();
    await last.locator(".pin-btn").click();
    await page.keyboard.press("Escape");
    await picker.click();
    const firstOpt = (await page.locator(".player-menu [role=option]").nth(1).textContent()).trim();
    const saved = await page.evaluate(() => localStorage.getItem("pro-builds:pinned-players"));
    check("builds: a pinned player is saved by player id and listed first", firstOpt === pinned && /^\["\d+"\]$/.test(saved ?? ""), `${pinned} · first: ${firstOpt} · saved ${saved}`);
    await page.locator(".player-menu [role=option]").nth(1).click();
    await page.waitForTimeout(200);
    check("builds: choosing a player filters the games to that player", (await page.locator(".build-pick b").allTextContents()).every((p) => p === pinned) && page.url().includes("player="), page.url());
    // Pinned Players hub: the pinned player is listed, their profile shows champions and match history, a game opens
    // the exact Pro Builds view, and the pin survives a reload.
    const ids = JSON.parse(saved ?? "[]");
    await open("/pro-builds/pinned/");
    await page.locator(".pinned-table tbody tr").first().waitFor({ timeout: 8000 }).catch(() => {});
    check("pinned: the hub lists the pinned player with recorded games", (await page.locator(".pinned-table tbody tr").count()) === 1 && (await page.locator(".pinned-table tbody tr").first().innerText()).includes(pinned), "");
    await page.locator(".pinned-table tbody tr").first().click();
    await page.locator(".match-history tbody tr").first().waitFor({ timeout: 8000 }).catch(() => {});
    check("pinned: a profile shows facts, champions and the match history", page.url().includes(`player=${ids[0]}`) && (await page.locator(".player-facts").count()) === 1 && (await page.locator(".champ-history tbody tr").count()) > 0 && (await page.locator(".match-history tbody tr").count()) > 0, page.url());
    // Identity first (alan, 2026-10-12): portrait, a large name, team and role, totals in one line, in a 170-220px header
    const head = await page.$eval(".player-head", (h) => ({ height: Math.round(h.getBoundingClientRect().height), name: parseFloat(getComputedStyle(h.querySelector(".player-name")).fontSize), line: h.querySelector(".player-line")?.textContent, facts: h.querySelectorAll(".player-facts dt").length, avatar: Math.round(h.querySelector(".player-avatar").getBoundingClientRect().width) }));
    check("pinned: the profile header leads with the portrait and a large name, team and role, five totals, 170-220px tall", head.height >= 170 && head.height <= 220 && head.name >= 30 && /·/.test(head.line ?? "") && head.facts === 5 && head.avatar >= 120, JSON.stringify(head));
    const tabs = page.locator(".player-views [role=tab]");
    check("pinned: Overview | Champions | Match history | Builds tabs, Overview first", (await tabs.allInnerTexts()).map((t) => t.replace(/\s*\d+$/, "")).join("|") === "Overview|Champions|Match history|Builds" && (await tabs.first().getAttribute("aria-selected")) === "true", "");
    await tabs.nth(2).click();
    await page.waitForTimeout(150);
    check("pinned: Match history keeps the player and lists every recorded game with its filters", page.url().includes(`player=${ids[0]}`) && /view=matches/.test(page.url()) && (await page.locator(".match-history tbody tr.match-row").count()) >= 5 && (await page.locator(".builds-tools.inner .select-trigger").count()) === 2, page.url());
    await tabs.nth(3).click();
    await page.waitForTimeout(150);
    check("pinned: Builds opens the most played champion's build lines", /view=builds/.test(page.url()) && (await page.locator(".build-lines li").count()) > 0, page.url());
    await tabs.first().click();
    await page.waitForTimeout(150);
    await page.locator(".champ-history tbody tr").first().click();
    await page.waitForTimeout(200);
    check("pinned: picking a champion opens Champions with that champion's builds and games", (await page.locator(".build-lines li").count()) > 0 && page.url().includes("champion=") && /view=champions/.test(page.url()) && (await page.locator(".match-history tbody tr.match-row").count()) > 0, page.url());
    // A match expands in place into the same build view as Pro Builds (runes, skill grid, item progression), keyed by game id
    const matchRows = page.locator(".match-history tr.match-row");
    const matchCount = await matchRows.count();
    await matchRows.first().click();
    await page.locator(".match-detail .game-detail").waitFor({ timeout: 5000 }).catch(() => {});
    // The skill grid shows only when the source gave the order; a partial record says so instead (never filled in).
    const skillsShown = (await page.locator(".match-detail .skill-grid").count()) === 1 || /Skill order was not recorded/.test(await page.locator(".match-detail").innerText().catch(() => ""));
    const expandedOk = (await page.locator(".match-detail .game-detail").count()) === 1 && (await page.locator(".match-detail .rune-page").count()) === 1
      && skillsShown && (await page.locator(".match-detail .game-player").innerText()).includes(pinned)
      && (await matchRows.first().getAttribute("aria-expanded")) === "true" && /[?&]game=\d+/.test(page.url());
    check("pinned: a match row expands into that game's exact build under the row", expandedOk, page.url());
    const pageWide = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    check("pinned: an expanded build never widens the page", pageWide, "");
    if (matchCount > 1) {
      await matchRows.nth(1).click();
      await page.waitForTimeout(200);
      check("pinned: opening another match switches the one expanded build", (await page.locator(".match-detail").count()) === 1 && (await matchRows.nth(1).getAttribute("aria-expanded")) === "true" && (await matchRows.first().getAttribute("aria-expanded")) === "false", "");
    }
    await page.locator(".match-history tr.match-row[aria-expanded='true']").first().focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    check("pinned: Enter on the open row collapses it and clears the game from the URL", (await page.locator(".match-detail").count()) === 0 && !/[?&]game=/.test(page.url()), page.url());
    await matchRows.first().click();
    await page.locator(".match-detail a:has-text('Open full Pro Builds')").click();
    await page.locator(".build-pick").first().waitFor({ timeout: 8000 }).catch(() => {});
    check("pinned: Open full Pro Builds opens the exact game for that player", /\/pro-builds\/\?champion=.+&game=\d+&player=\d+/.test(page.url()) && (await page.locator(".build-pick").count()) >= 1 && (await page.locator(".game-player").innerText()).includes(pinned), page.url());
    await page.goBack();
    await page.waitForTimeout(400);
    check("pinned: Back returns to the profile, pin kept", page.url().includes("/pro-builds/pinned/") && (await page.evaluate(() => localStorage.getItem("pro-builds:pinned-players"))) === saved, page.url());
    await page.evaluate(() => localStorage.removeItem("pro-builds:pinned-players"));
    await open("/pro-builds/pinned/");
    await page.waitForTimeout(300);
    check("pinned: with no pins the hub explains how to pin", /No pinned players yet/.test(await page.locator(".builds-main").innerText()), "");
    // Player portraits: credited Commons photos load for Chovy and Ruler; a player without one shows initials, never a champion icon
    await open("/geng/");
    await page.waitForTimeout(500);
    const portraits = await page.$$eval(".team-players .player-avatar img", (xs) => xs.map((i) => ({ alt: i.alt, ok: i.complete && i.naturalWidth > 0, title: i.parentElement.getAttribute("title") })));
    const named = (n) => portraits.find((p) => p.alt.includes(n));
    check("portraits: Chovy and Ruler load, with no tooltip repeating the name or credit", ["Chovy", "Ruler"].every((n) => named(n)?.ok && named(n).title === null), JSON.stringify(portraits.map((p) => [p.alt, p.ok])));
    check("portraits: every roster avatar is a loaded photo or initials, never a champion icon", await page.$$eval(".team-players .player-avatar", (xs) => xs.length > 0 && xs.every((x) => x.classList.contains("initials") ? /^[A-Z0-9]{1,2}$/i.test(x.dataset.initials ?? "") : (x.querySelector("img")?.naturalWidth ?? 0) > 0)), "");
    // A player without a checked photo (Cryogen, FlyQuest: dpm.lol has only its placeholder for him) shows initials
    await open("/pro-builds/pinned/?player=6344");
    await page.locator(".player-head .player-avatar").waitFor({ timeout: 8000 }).catch(() => {});
    const noPhoto = await page.$eval(".player-head .player-avatar", (x) => ({ initials: x.dataset.initials, img: !!x.querySelector("img") })).catch(() => ({}));
    check("portraits: a player without a photo shows initials, no image", noPhoto.initials === "CR" && !noPhoto.img, JSON.stringify(noPhoto));
    await openBuildsChampion();
    // Teams and tournaments pin the same way (one list each, saved in this browser); a pinned team is starred in the strip.
    const teamPicker = page.locator(".player-picker input[aria-label='Team']");
    await teamPicker.click();
    const teamOpt = page.locator(".player-menu [role=option]").last();
    const team = (await teamOpt.textContent()).trim();
    await teamOpt.locator(".pin-btn").click();
    await page.keyboard.press("Escape");
    await teamPicker.click();
    const firstTeam = (await page.locator(".player-menu [role=option]").nth(1).textContent()).trim();
    await page.keyboard.press("Escape");
    const savedTeams = await page.evaluate(() => localStorage.getItem("pro-builds:pinned-teams"));
    check("builds: a pinned team is saved and listed first", firstTeam === team && (savedTeams ?? "").includes(team), `${team} · first: ${firstTeam}`);
    const eventPicker = page.locator(".player-picker input[aria-label='Tournament']");
    await eventPicker.click();
    await page.locator(".player-menu [role=option]").last().locator(".pin-btn").click();
    await page.keyboard.press("Escape");
    const savedEvents = await page.evaluate(() => localStorage.getItem("pro-builds:pinned-tournaments"));
    check("builds: a tournament can be pinned", (JSON.parse(savedEvents ?? "[]")).length === 1, savedEvents ?? "none");
    await page.evaluate(() => { localStorage.removeItem("pro-builds:pinned-teams"); localStorage.removeItem("pro-builds:pinned-tournaments"); });
  }
  await page.locator(".builds-tools [role=tab]", { hasText: "Common build" }).click();
  await page.waitForTimeout(200);
  check("builds: common build counts games with its sample, rune setups from complete pages, item frequencies", /recorded game/.test(await page.locator(".common-scope").innerText().catch(() => "")) && (await page.locator(".rune-setups li").count()) > 0 && (await page.locator(".item-freq li").count()) > 0, "");
  await page.locator(".builds-tools [role=tab]", { hasText: "Compare" }).click();
  await page.waitForTimeout(200);
  check("builds: compare shows two games side by side with their differences", games < 2 || ((await page.locator(".compare-col").count()) === 2 && (await page.locator(".diff").count()) === 1), "");
  // Pro Drafts (alan, 2026-10-12): a row opens the whole game, both teams with picks and bans; each champion is a button
  // that opens that player's exact build for that game in the panel, named by team row and role in the URL.
  await open("/pro-drafts/?tournament=" + encodeURIComponent("Demacia Cup Global Invitational 2026"));
  await page.locator(".drafts-table tbody.game-rows tr[data-side] .team-cell").first().click();
  await page.locator(".game-panel .game-team").first().waitFor({ timeout: 5000 }).catch(() => {});
  const teams = await page.$$eval(".game-panel .game-team", (ts) => ts.map((t) => ({ side: t.className.match(/side-(\w+)/)?.[1], name: t.querySelector(".game-team-name")?.textContent, picks: t.querySelectorAll(".pick-btn:not(:disabled)").length, bans: /Bans:/.test(t.textContent) })));
  check("pro drafts: the open game shows both teams, blue first, five pick buttons and bans each", teams.length === 2 && teams[0].side === "blue" && teams[1].side === "red" && teams.every((t) => t.picks === 5 && t.bans && t.name), JSON.stringify(teams));
  const pick = page.locator(".game-panel .game-team").nth(1).locator(".pick-btn").nth(3);
  const pickName = (await pick.locator(".slot-name").textContent()) ?? "";
  await pick.click();
  await page.locator(".game-build .game-detail").waitFor({ timeout: 8000 }).catch(() => {});
  const bu = new URL(page.url()).searchParams.get("build") ?? "";
  const bhead = await page.locator(".game-build .game-meta").innerText().catch(() => "");
  const pressed = await page.locator(".game-panel .pick-btn[aria-pressed='true']").count();
  check("pro drafts: a champion opens that player's build for this game in the panel (red side, BOT)", /^golgg-\d+-red:BOT$/.test(bu) && pressed === 1 && /Red side/.test(bhead) && (await page.locator(".game-build .rune-page, .game-build .skill-grid").count()) > 0, `${bu} | ${bhead.slice(0, 80)}`);
  check("pro drafts: the build header names the champion's opponent and links Gol.gg and the full Pro Builds view", /Gol\.gg source/.test(bhead) && /\/pro-builds\/\?champion=.+&role=BOT&game=\d+/.test(await page.locator(".game-build .game-meta a:last-child").getAttribute("href") ?? ""), bhead.slice(0, 80));
  const champHead = await page.locator(".game-build .game-player").innerText().catch(() => "");
  await page.locator(".game-panel .game-team").nth(0).locator(".pick-btn").nth(2).click();
  await page.waitForTimeout(250);
  const bu2 = new URL(page.url()).searchParams.get("build") ?? "";
  check("pro drafts: another champion swaps only the build, the game stays open", /^golgg-\d+-blue:MID$/.test(bu2) && (await page.locator(".game-build").count()) === 1 && (await page.locator(".game-panel > .panel-head h2").count()) === 1 && (await page.locator(".game-build .game-player").innerText()) !== champHead, `${bu2} ${pickName}`);
  await page.locator(".game-panel .pick-btn[aria-pressed='true']").focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  check("pro drafts: Enter on the open champion closes its build", !new URL(page.url()).searchParams.get("build") && (await page.locator(".game-build").count()) === 0, page.url());
  await open("/pro-drafts/?id=lck26po-finals-g3-geng");
  check("pro drafts: a game without recorded builds says so and offers no build buttons", (await page.locator(".game-panel .game-team").count()) === 2 && (await page.locator(".game-panel .pick-btn:disabled").count()) === 10 && /No builds recorded/.test(await page.locator(".game-hint").textContent().catch(() => "")), "");
}
// Patch Notes: Riot's official values, patch navigation, filters, anchors, compare, and the drawer link.
await open("/patch-notes/");
{
  const desc = await text("main .page-header .desc");
  check("patch notes: latest patch by default in Riot's spelling only, with release date", /Patch 26\.\d+/.test(desc) && !/\b16\.\d+/.test(desc) && /Released/.test(desc), desc.slice(0, 120));
  const shown = async () => (await text(".pn-meta b")).replace("Patch ", "");
  const latest = await shown();
  await page.locator(".pn-step button[aria-label='Previous patch']").click();
  await page.waitForTimeout(200);
  const prev = await shown();
  check("patch notes: previous patch button", !!prev && prev !== latest && new URL(page.url()).searchParams.get("patch") === prev, `${latest} -> ${prev}`);
  await open("/patch-notes/?patch=16.16");
  const azir = await text("#champion-azir");
  check("patch notes: 16.16 reads as 26.16 and Azir's Q shows Riot's exact before and after", (await shown()) === "26.16"
    && azir.includes("60 / 80 / 100 / 120 / 140 (+35 / 40 / 45 / 50 / 55% AP)") && azir.includes("75 / 95 / 115 / 135 / 155"), azir.slice(0, 160));
  check("patch notes: champion icons load", (await page.locator(".pn-entry .champ[data-icon='image']").count()) > 0, "");
  await page.locator(".pn-tools .seg button", { hasText: "Items" }).click();
  await page.waitForTimeout(150);
  const kinds = await page.$$eval(".pn-entry", (es) => [...new Set(es.map((e) => e.dataset.kind))]);
  check("patch notes: Items filter shows items only", kinds.join() === "item", kinds.join());
  await open("/patch-notes/?patch=26.18#champion-nautilus");
  await page.waitForTimeout(300);
  check("patch notes: an entry link scrolls to and marks the entry", (await page.locator("#champion-nautilus.pn-target").count()) === 1 && await page.locator("#champion-nautilus").isVisible(), "");
  await open("/patch-notes/?view=compare");
  check("patch notes: compare lists changed champions since the first patch", (await page.locator(".pn-compare tbody tr").count()) > 10, "");
  await open("/pool/?role=SUPPORT&champ=nautilus");
  await page.locator("#pool-SUPPORT-nautilus .champ-btn").first().click();
  await page.locator(".drawer-tab", { hasText: "Patch" }).click();
  await page.locator(".drawer .dw-change .dw-row").first().click();
  await page.locator(".drawer .dw-change.open a[href*='patch-notes']").first().waitFor({ timeout: 5000 }).catch(() => {});
  const dp = await text(".drawer .drawer-panel");
  check("drawer: Patch tab expands a change to Riot's values with a link to the patch notes", /since 26\.16/.test(dp) && /→/.test(dp) && (await page.locator(".drawer .dw-change.open a[href*='patch-notes']").count()) > 0, dp.slice(0, 120));
  // Nested pairing: a partner opens inside the drawer, Back returns to the champion without closing it
  await page.locator(".drawer-tab", { hasText: "Synergies" }).click();
  await page.locator(".drawer .dw-partner").first().click();
  await page.locator(".drawer .dw-pairing").waitFor({ timeout: 3000 }).catch(() => {});
  const pairTitle = await text(".drawer .dw-pair-title");
  await page.goBack();
  await page.waitForTimeout(300);
  check("drawer: a partner opens its pairing in place and Back returns to Nautilus", /Nautilus \+ /.test(pairTitle) && (await page.locator(".drawer").count()) === 1 && (await page.locator(".drawer .dw-pairing").count()) === 0 && (await text(".drawer h2")) === "Nautilus", pairTitle);
  await page.keyboard.press("Escape");
}
// One patch label (alan, 2026-10-12): the site writes Riot's 26.xx; Gol.gg's 16.xx stays in data and source URLs only.
for (const path of ["/", "/pool/", "/meta/", "/pro-drafts/", "/pro-builds/", "/comps/", "/synergies/bot/", "/patch-notes/"]) {
  await open(path);
  const shown = await page.evaluate(() => [document.body.innerText, ...[...document.querySelectorAll("[title],[aria-label]")].map((e) => `${e.getAttribute("title") ?? ""} ${e.getAttribute("aria-label") ?? ""}`)].join("\n"));
  const hit = shown.match(/(^|[^\d.\/])1[56]\.\d{1,2}(?![\d.])/);
  check(`patch labels: ${path} shows Riot's 26.xx only`, !hit, hit?.[0] ?? "");
}
await open("/geng/");
check("GenRang on the Gen.G page", (await page.locator(".brand-band img.genrang").count()) === 1 && await mascotOk(), "");
// Review screenshots: desktop and mobile, light and dark
if (shots) {
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => localStorage.setItem("theme", t), theme);
    for (const [w, h, tag] of [[1440, 900, "desk"], [390, 844, "mob"]]) {
      await page.setViewportSize({ width: w, height: h });
      for (const [path, name] of [["/?top=ambessa&jungle=vi&bot=ziggs&vs=top:renekton,bot:sivir,support:lulu", "draft"], ["/", "empty"], ["/geng/", "geng"], ["/synergies/bot/?champ=sivir", "synergies"], ["/pool/", "pool"], ["/meta/", "meta"], ["/pro-drafts/", "prodrafts"], ["/patch-notes/", "patchnotes"]]) {
        await open(path);
        await page.waitForTimeout(700);
        await page.screenshot({ path: `${shots}/review-${name}-${tag}-${theme}.png` });
      }
      await open("/comps/");
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${shots}/review-comps-${tag}-${theme}.png` });
      await page.locator(".lu-champ").first().click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${shots}/review-drawer-${tag}-${theme}.png` });
      await page.keyboard.press("Escape");
      for (const [q, name] of [["?champion=jarvan-iv&role=JUNGLE", "builds"], ["?champion=jarvan-iv&role=JUNGLE&mode=common", "builds-common"], ["?champion=jarvan-iv&role=JUNGLE&mode=compare", "builds-compare"]]) {
        await open(`/pro-builds/${q}`);
        await page.locator(".game-head, .common-build").first().waitFor({ timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(700);
        await page.screenshot({ path: `${shots}/review-${name}-${tag}-${theme}.png`, fullPage: true });
      }
      await open("/pool/?event=demacia-cup-2026");
      await page.locator("[role=combobox][aria-label='Tournament']").click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${shots}/review-dropdown-${tag}-${theme}.png` });
    }
  }
  await page.evaluate(() => localStorage.removeItem("theme"));
  await page.setViewportSize({ width: 1440, height: 900 });
}
// ---------- Interaction and motion audit (alan, 2026-10-12): regressions for the bugs it found ----------
{
  await page.setViewportSize({ width: 1440, height: 900 });
  // A lock keeps the same room: role tab, filter and focus survive (the room used to rebuild on every lock)
  await open("/?bot=caitlyn");
  await page.locator(".role-tab", { hasText: "Mid" }).click();
  await page.locator(".fit-filters button", { hasText: "Synergy" }).click();
  await page.evaluate(() => { document.querySelector(".draft-room").dataset.probe = "1"; });
  const enemyTop = page.locator("input[aria-label='Enemy TOP champion']");
  await enemyTop.click();
  await enemyTop.fill("Aatrox");
  await enemyTop.press("Enter");
  await page.waitForTimeout(300);
  const kept = await page.evaluate(() => ({
    same: document.querySelector(".draft-room")?.dataset.probe === "1",
    tab: document.querySelector(".role-tab.active .role-name")?.textContent,
    filter: document.querySelector(".fit-filters button.active")?.textContent ?? "",
    focus: !!document.activeElement?.closest(".draft-slot.enemy.locked"),
  }));
  check("draft room: a lock keeps the room, its tab, filter and keyboard focus", kept.same && kept.tab === "Mid" && kept.filter.startsWith("Synergy") && kept.focus, JSON.stringify(kept));
  // Clear draft offers its undo, and Undo brings the board back
  await page.locator("button", { hasText: "Clear draft" }).click();
  const undo = page.locator("button", { hasText: "Draft cleared · Undo" });
  const offered = await undo.count();
  if (offered) await undo.click();
  await page.waitForTimeout(200);
  check("draft room: Clear draft offers Undo, which restores the board", offered === 1 && /bot=caitlyn/.test(page.url()) && /vs=top:aatrox/.test(decodeURIComponent(page.url())), page.url());
  // A champion already on either team is never locked again by typing its exact name
  await open("/?bot=caitlyn&vs=mid:ahri");
  const mid = page.locator("input[aria-label='MID champion']");
  await mid.click();
  await mid.fill("Ahri");
  await mid.press("Enter");
  await page.waitForTimeout(200);
  check("draft room: typing a taken champion's name never locks it twice", !/[?&]mid=ahri/.test(page.url()), page.url());
  // Role tabs are one tab stop with arrow keys
  await open("/?bot=caitlyn");
  await page.locator(".role-tab.active").focus();
  const before = await page.locator(".role-tab.active .role-name").textContent();
  await page.keyboard.press("ArrowRight");
  const after = await page.evaluate(() => ({ tab: document.querySelector(".role-tab.active .role-name")?.textContent, focused: document.activeElement?.classList.contains("active") }));
  check("draft room: arrow keys move between role tabs", after.tab !== before && after.focused, `${before} -> ${JSON.stringify(after)}`);
  // Closing the drawer gives focus back to what opened it, after a short exit
  await open("/?bot=caitlyn&support=lulu");
  const opener = page.locator(".draft-slot.locked .slot-body").first();
  await opener.focus();
  await page.keyboard.press("Enter");
  await page.locator(".drawer").waitFor();
  const entering = await page.locator(".drawer").evaluate((d) => getComputedStyle(d).animationName);
  await page.keyboard.press("Escape");
  const closingCls = await page.locator(".drawer").evaluate((d) => d.className).catch(() => "gone");
  await page.locator(".drawer").waitFor({ state: "detached", timeout: 1000 }).catch(() => {});
  const back = await page.evaluate(() => !!document.activeElement?.closest(".draft-slot.locked"));
  check("drawer: opens with drawer-in, exits, and returns focus to its opener", entering === "drawer-in" && /closing|gone/.test(closingCls) && back && (await page.locator(".drawer").count()) === 0, `${entering} · ${closingCls} · focus back ${back}`);
  await opener.click();
  await page.locator(".drawer").waitFor();
  const roomActions = await page.locator(".drawer-foot a").allTextContents();
  check("drawer: inside the Draft Room the actions never offer Use in Draft Room", roomActions.length > 0 && !roomActions.includes("Use in Draft Room"), roomActions.join("|"));
  await page.keyboard.press("Escape");
  await page.locator(".drawer").waitFor({ state: "detached", timeout: 1000 }).catch(() => {});
  // Motion tokens: one system, reduced motion drops movement but keeps the fade
  const tokens = await page.evaluate(() => { const c = getComputedStyle(document.documentElement); return ["--dur-hover", "--dur-select", "--dur-pop", "--dur-panel"].map((t) => { const v = c.getPropertyValue(t).trim(); return Math.round(parseFloat(v) * (v.endsWith("ms") ? 1 : 1000)); }); });
  check("motion: shared duration tokens are in place", tokens.join() === "100,140,140,220", tokens.join());
  await page.emulateMedia({ reducedMotion: "reduce" });
  await opener.click();
  await page.locator(".drawer").waitFor();
  const rm = await page.locator(".drawer").evaluate((d) => ({ name: getComputedStyle(d).animationName, dur: getComputedStyle(d).animationDuration }));
  await page.keyboard.press("Escape");
  await page.locator(".drawer").waitFor({ state: "detached", timeout: 1000 }).catch(() => {});
  await page.emulateMedia({ reducedMotion: "no-preference" });
  check("motion: reduced motion keeps a short fade for the drawer", rm.name === "drawer-in" && parseFloat(rm.dur) <= 0.15, JSON.stringify(rm));
  // Pro Builds: the typeable filters open like the shared dropdown (not on focus) in a portalled, viewport-placed menu
  await openBuildsChampion();
  const player = page.locator("input[aria-label='Player']");
  await player.focus();
  await page.waitForTimeout(150);
  const onFocus = await page.locator(".player-menu").count();
  await player.click();
  const menu = await page.locator(".player-menu").evaluate((m) => ({ parent: m.parentElement?.tagName, pos: getComputedStyle(m).position })).catch(() => null);
  await page.keyboard.press("Escape");
  check("pro builds: player filter opens on click, not focus, in a fixed portalled menu", onFocus === 0 && menu?.parent === "BODY" && menu?.pos === "fixed", `${onFocus} on focus · ${JSON.stringify(menu)}`);
  // Game strip: arrow keys move between games and the detail follows
  const firstGame = page.locator(".build-pick").first();
  if (await page.locator(".build-pick").count() > 1) {
    await firstGame.focus();
    const g0 = await page.locator(".game-head .game-player b").first().textContent();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(150);
    const g1 = await page.evaluate(() => ({ sel: document.activeElement?.getAttribute("aria-selected"), url: location.search }));
    check("pro builds: arrow keys move through the game strip and select the game", g1.sel === "true" && /game=/.test(g1.url), `${g0} · ${JSON.stringify(g1)}`);
  }
  // Phones: the drawer sheet never scrolls sideways and the page behind it holds still
  await page.setViewportSize({ width: 390, height: 844 });
  await open("/?bot=caitlyn&support=lulu");
  await page.locator(".draft-slot.locked .slot-body").first().click();
  await page.locator(".drawer").waitFor();
  const sheetX = await page.evaluate(() => { const b = document.querySelector(".drawer-body"); return { over: b.scrollWidth - b.clientWidth, lock: getComputedStyle(document.documentElement).overflow, scrim: getComputedStyle(document.querySelector(".drawer-scrim")).display }; });
  check("drawer at 390px: no sideways overflow, page locked behind a scrim", sheetX.over <= 0 && sheetX.lock === "hidden" && sheetX.scrim === "block", JSON.stringify(sheetX));
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 900 });
  // Every section names itself in the tab
  await open("/pro-builds/");
  check("page titles: sections name themselves", (await page.title()) === "Pro Builds · Draft Assistant", await page.title());
}
check("no failed requests / console errors", problems.length === 0, problems.slice(0, 10).join(" | "));
await browser.close();
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  [${r.detail}]` : ""}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
