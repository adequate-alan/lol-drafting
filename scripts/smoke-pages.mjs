// Production smoke test for the GitHub Pages build. Runs in CI after each deploy (pages.yml) and locally:
//   node scripts/smoke-pages.mjs https://adequate-alan.github.io/lol-drafting/ [screenshot-dir]
// Needs playwright (CI installs it with --no-save; it is not a project dependency).
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const base = process.argv[2].replace(/\/$/, "");
const shots = process.argv[3];
const browser = await chromium.launch();
const page = await browser.newPage();
const problems = [];
page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && problems.push(`console: ${m.text()}`));
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("response", (r) => r.status() >= 400 && !r.url().includes("ddragon.leagueoflegends.com") && problems.push(`${r.status()} ${r.url()}`));
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); };

async function open(path) {
  const res = await page.goto(base + path, { waitUntil: "networkidle" });
  return res;
}
async function h1() { return (await page.locator("main h1").first().textContent())?.trim(); }

// Sections, direct loads and refreshes
const sections = [["/", "Draft Room"], ["/first-pick/bot/", "First Pick"], ["/first-pick/mid-jungle/", "First Pick"], ["/first-pick/top/", "First Pick"],
  ["/comps/", "Comp Library"], ["/pool/", "Champion Pool"], ["/pro-drafts/", "Pro Drafts"], ["/geng/", "Gen.G"], ["/meta/", "Meta / Research"]];
for (const [path, title] of sections) {
  const res = await open(path);
  const t = await h1();
  await page.reload({ waitUntil: "networkidle" });
  const t2 = await h1();
  check(`load + refresh ${path}`, res.status() === 200 && t === title && t2 === title, `${res.status()} "${t}" / after refresh "${t2}"`);
}
// Without trailing slash (typed URL)
for (const path of ["/pool", "/meta", "/first-pick/bot"]) {
  const res = await open(path);
  check(`no-slash URL ${path}`, res.status() === 200 && !!(await h1()), `${res.status()} -> ${page.url()}`);
}
// First Pick index forwards to Bot
await open("/first-pick/");
await page.waitForURL(/first-pick\/bot\/$/, { timeout: 5000 }).catch(() => {});
check("/first-pick/ forwards to Bot tab", /\/lol-drafting\/first-pick\/bot\/$/.test(page.url()) || page.url().endsWith("/first-pick/bot/"), page.url());

// CSS applied (dark navy nav)
await open("/");
const navBg = await page.locator("aside.sidebar").evaluate((e) => getComputedStyle(e).backgroundColor);
check("CSS loads under base path", navBg !== "rgba(0, 0, 0, 0)" && navBg !== "rgb(255, 255, 255)", navBg);

// Client navigation through the sidebar keeps the base path
const navTargets = ["First Pick", "Comp Library", "Champion Pool", "Pro Drafts", "Gen.G", "Meta / Research", "Draft Room"];
for (const label of navTargets) {
  await page.locator(".nav a", { hasText: label }).first().click();
  await page.waitForFunction((l) => document.querySelector("main h1")?.textContent?.trim() === l, label, { timeout: 8000 }).catch(() => {});
  const u = new URL(page.url());
  check(`nav click ${label}`, u.pathname.startsWith(new URL(base).pathname + "/") && (await h1()) === label, page.url());
}

// Filters in the URL
await open("/pro-drafts/?team=Gen.G&id=lck26po-finals-g1-geng");
const card = await page.locator("main .panel-head h2").first().textContent();
check("Pro Drafts filter + selected game from URL", /Gen\.G vs/.test(card ?? ""), card);
await open("/first-pick/bot/?champ=ziggs");
check("First Pick ?champ=ziggs selects Ziggs", (await page.locator("main").textContent()).includes("Ziggs"), "");

// Draft Room: recommendations ranked by draft fit, pro evidence kept apart
const recNames = async (role) => page.locator(`.recs .fit-role.role-${role} .fit-head .name`).allTextContents();
const text = async (sel) => (await page.locator(sel).allTextContents()).join(" ");
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
check("Pro Pairings panel is separate from Recommended Picks", (await page.locator(".rec-group.pro h3", { hasText: "Pro Pairings" }).count()) === 1, "");
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
const counterText = await text('section.counters');
check("Counters panel is separate and never invents a counter", /Counters/.test(counterText) && /vs Ornn/.test(counterText)
  && ((await page.locator("section.counters .counter-row").count()) > 0 || /No reliable counter data for Ornn/.test(counterText)), counterText.slice(0, 160));
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
// Champion icons load from Data Dragon in both themes; a failed icon falls back to initials
for (const theme of ["light", "dark"]) {
  await page.evaluate((t) => localStorage.setItem("theme", t), theme);
  await open("/?top=ambessa&jungle=skarner&mid=locke&bot=ziggs");
  await page.waitForTimeout(1500);
  const icons = await page.evaluate(() => [...document.querySelectorAll(".champ[data-icon]")].map((t) => {
    const img = t.querySelector("img");
    return { champ: t.dataset.champ, ok: !!img && img.complete && img.naturalWidth > 0, fallback: t.dataset.icon === "failed" && !!t.querySelector(".mono")?.textContent };
  }));
  const bad = icons.filter((i) => !i.ok);
  check(`champion icons load (${theme})`, icons.length > 20 && bad.length === 0,
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
  await page.click(".seg button:text-is('MID')"); r = await rows();
  check("pool: role filter", r.length > 0 && r.every((x) => x[1] === "MID"), `${r.length} MID rows`);
  await page.selectOption("select[aria-label='Pool tier']", "core"); r = await rows();
  check("pool: tier filter", r.length > 0 && r.every((x) => x[2] === "Core"), `${r.length} rows`);
  await open("/pool/?event=demacia-cup-2026");
  r = (await rows()).filter((x) => !/No verified data/.test(x[7]));
  check("pool: tournament filter shows Demacia marked ongoing", r.length > 0 && r.every((x) => /Demacia Cup/.test(x[7]) && /ongoing/i.test(x[7])), `${r.length} rows`);
  await open("/pool/?patch=16.16");
  r = (await rows()).filter((x) => x[8] !== "—");
  check("pool: patch filter", r.length > 0 && r.every((x) => x[8] === "16.16"), `${r.length} rows`);
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
  await open("/pool/?q=ahri");
  r = await rows();
  check("pool: no verified stats shows —", r.length === 1 && r[0][3] === "—" && r[0][6] === "—", r[0]?.join(" | "));
  await open("/pool/?q=galio");
  r = await rows();
  check("pool: role-specific rows stay separate (Galio top / mid)", r.length === 2 && new Set(r.map((x) => x[1])).size === 2, r.map((x) => x[1]).join(", "));
  await open("/pool/?q=locke");
  await page.click("tr.pool-row");
  const mine = await page.locator("tr.pool-detail .layer.clash").textContent();
  const pro = await page.locator("tr.pool-detail .layer.pro").textContent();
  check("pool: row detail keeps my pool apart from pro evidence", /Skarner/.test(mine) && !/Gol\.gg/.test(mine) && /Demacia Cup/.test(pro), "");
  check("pool: recent games and observed pairings render", /Recent games/.test(pro) && /Observed pairings/.test(pro), "");
  await open("/meta/");
  const ev = await page.$$eval(".hub-events tbody tr", (rs) => rs.map((r) => r.textContent));
  check("meta: tournaments listed newest first, Demacia Cup ongoing", ev.length >= 2 && /Demacia Cup/.test(ev[0]) && /Ongoing/.test(ev[0]) && /LCK Playoffs/.test(ev[1]) && /Completed/.test(ev[1]), ev.map((t) => t.slice(0, 40)).join(" | "));
  await page.click(".seg.scroll button:text-is('BOT')");
  const botRows = await page.$$eval(".hub-table.tall tbody tr", (rs) => rs.length);
  check("meta: role tabs switch the table", botRows > 0, `${botRows} BOT rows`);
  await page.selectOption(".hub-tools select", "demacia-cup-2026");
  const duos = await page.locator("text=Bot lane pairings").locator("xpath=following::table[1]").locator("tbody tr").count();
  check("meta: tournament selector filters pairings (Demacia duos)", duos === 4, `${duos} duos`);
  await page.locator(".hub-table .champ-link").first().click();
  const drawer = await page.locator(".drawer").textContent().catch(() => "");
  check("meta: champion drawer keeps my pool apart from pro evidence", /Synergy/.test(drawer) && /Pool/.test(drawer) && /Pro evidence/i.test(drawer) && /View in Champion Pool/.test(drawer), drawer.slice(0, 80));
  await page.keyboard.press("Escape");
  await open("/first-pick/bot/?champ=ezreal");
  check("pro pairings show event · patch · date (Ezreal + Karma)", /1 game · Demacia Cup · 16\.18 · Oct 3/.test(await page.locator("main").textContent()), "");
}
// Comp Library champion drawer
{
  await open("/comps/");
  await page.evaluate(() => window.scrollTo(0, 400));
  const naut = page.locator("#mage-bot-siege .comp-slot", { hasText: "Nautilus" });
  await naut.scrollIntoViewIfNeeded();
  const y = await page.evaluate(() => scrollY);
  const rowBoxes = () => page.$$eval(".comp-slot-row", (rs) => rs.map((r) => { const b = r.getBoundingClientRect(); return `${Math.round(b.top + scrollY)},${Math.round(b.height)}`; }).join("|"));
  const rows0 = await rowBoxes();
  for (const b of await page.locator("#mage-bot-siege .comp-slot, #classic-front-to-back .comp-slot").all()) { await b.hover(); await page.waitForTimeout(30); }
  await naut.hover();
  await page.waitForTimeout(350);
  const nb = await naut.boundingBox(), cb = await page.locator(".hovercard").boundingBox().catch(() => null);
  check("comps: hover card floats beside the champion, inside the viewport", !!cb && (cb.x >= nb.x + nb.width || cb.x + cb.width <= nb.x) && cb.y >= 0 && cb.y + cb.height <= 900, JSON.stringify(cb));
  check("comps: hovering champions never moves the rows", (await rowBoxes()) === rows0, "");
  // Regression: the cursor resting exactly on the boundary between two rows must not open and close the card in a loop.
  const rows = page.locator("#mage-bot-siege .comp-slot-row");
  const r2 = await rows.nth(2).boundingBox();
  await page.evaluate(() => { window.__hc = 0; new MutationObserver((ms) => { for (const m of ms) for (const n of [...m.addedNodes, ...m.removedNodes]) if (n.classList?.contains("hovercard")) window.__hc++; }).observe(document.body, { childList: true }); });
  const flips = [];
  for (const dx of [60, 300]) for (const dy of [-0.5, 0, 0.5]) {
    await page.mouse.move(r2.x + dx, r2.y + dy);
    await page.waitForTimeout(300);
    const a = await page.evaluate(() => window.__hc);
    await page.waitForTimeout(900);
    flips.push((await page.evaluate(() => window.__hc)) - a);
  }
  check("comps: cursor on a row boundary never flickers the card", flips.every((n) => n === 0) && (await rowBoxes()) === rows0, flips.join(","));
  await page.mouse.move(r2.x + 60, r2.y + 10);
  await page.waitForTimeout(300);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(250);
  check("comps: scrolling closes an open hover card", (await page.locator(".hovercard").count()) === 0, "");
  await page.evaluate((v) => window.scrollTo(0, v), y);
  await page.waitForTimeout(150);
  await naut.click();
  const drawer = page.locator(".drawer");
  await drawer.waitFor({ timeout: 5000 }).catch(() => {});
  const marks = await page.locator("#mage-bot-siege .comp-slot-row.has-saved b").allTextContents();
  check("comps: clicking Nautilus opens the drawer and marks Ziggs as Synergy", (await drawer.locator("h2").textContent()) === "Nautilus" && marks.includes("Ziggs"), marks.join(", "));
  const layers = await drawer.locator(".layer").evaluateAll((els) => els.map((e) => e.className));
  check("comps: drawer keeps Synergy, Pro and Logic separate", layers.join() === "layer clash,layer pro,layer logic", layers.join(" | "));
  await drawer.locator("[aria-label='Next champion']").click();
  check("comps: next moves through the comp in place", (await drawer.locator("h2").textContent()) === "Gnar" && page.url().endsWith("/comps/"), page.url());
  await page.keyboard.press("Escape");
  check("comps: Escape closes and keeps the scroll position", (await drawer.count()) === 0 && (await page.evaluate(() => scrollY)) === y, "");
  await naut.click();
  await page.goBack();
  await page.waitForTimeout(400);
  check("comps: Back closes the drawer without leaving the page", (await drawer.count()) === 0 && page.url().endsWith("/comps/"), page.url());
  await naut.click();
  await drawer.locator("a", { hasText: "Use in Draft Room" }).click();
  await page.waitForURL(/\?support=nautilus/, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  check("comps: Use in Draft Room loads the champion in its role", /\/lol-drafting\/\?support=nautilus$/.test(page.url()) && /Nautilus/.test(await page.locator(".draft-slots").first().textContent()), page.url());
  await open("/comps/");
  await page.locator("#mage-bot-siege .comp-slot", { hasText: "Nautilus" }).click();
  await page.locator(".drawer a", { hasText: "View in Champion Pool" }).click();
  await page.waitForURL(/champ=nautilus/, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  check("comps: View in Champion Pool opens that row", (await page.locator("tr.pool-row.open").textContent())?.includes("Nautilus") ?? false, page.url());
}
// First Pick: hover card on desktop, drawer on click
{
  await open("/first-pick/bot/?champ=sivir");
  const lulu = page.locator(".pick-card .champ-btn", { hasText: "Lulu" }).first();
  await lulu.hover();
  const card = await page.locator(".hovercard").waitFor({ timeout: 3000 }).then(() => page.locator(".hovercard").textContent()).catch(() => "");
  check("first pick: hovering Lulu shows Synergy · Default with Sivir", /Lulu/.test(card) && /Synergy · Default/.test(card) && /Peel 3/.test(card), card.slice(0, 120));
  await lulu.click();
  await page.locator(".drawer").waitFor({ timeout: 3000 }).catch(() => {});
  check("first pick: clicking a champion opens the drawer", (await page.locator(".drawer h2").textContent().catch(() => "")) === "Lulu" && (await page.locator(".hovercard").count()) === 0, "");
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
{
  const m = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await m.goto(base + "/first-pick/bot/?champ=sivir", { waitUntil: "networkidle" });
  await m.locator(".pick-card .champ-btn", { hasText: "Lulu" }).first().tap();
  await m.waitForTimeout(400);
  check("first pick at 390px: a tap opens the drawer directly", (await m.locator(".drawer").count()) === 1 && (await m.locator(".hovercard").count()) === 0, "");
  await m.close();
}
await open("/comps/");
await page.locator(".comp-slot").first().click();
await page.waitForTimeout(400); // let the slide-up finish
const sheet = await page.locator(".drawer").boundingBox().catch(() => null);
const sheetOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check("comps at 390px: drawer is a bottom sheet with no page overflow", !!sheet && sheet.width === 390 && sheet.y > 100 && Math.round(sheet.y + sheet.height) === 844 && sheetOverflow <= 0, JSON.stringify(sheet));
await page.setViewportSize({ width: 1440, height: 900 });
// Adobe Fonts kit: read its families from the kit CSS, then confirm the browser can load them on this domain
const kitCss = await fetch("https://use.typekit.net/lvt6ebv.css").then((r) => r.text()).catch(() => "");
const kitFamilies = [...new Set([...kitCss.matchAll(/font-family:\s*"?([^";]+)"?;/g)].map((m) => m[1].trim()))];
await open("/");
const kitLoaded = await page.evaluate(async (fams) => {
  const out = [];
  for (const f of fams) { try { const faces = await document.fonts.load(`16px "${f}"`); out.push(`${f}: ${faces.length ? "loaded" : "not loaded"}`); } catch (e) { out.push(`${f}: error`); } }
  return out;
}, kitFamilies);
const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
check("Adobe Fonts kit loads on this domain and is the body font", kitFamilies.length > 0 && kitLoaded.every((x) => x.endsWith("loaded") && !x.endsWith("not loaded")) && /neue-haas-grotesk-text/.test(bodyFont), `families: ${kitLoaded.join(", ") || "none found"} · body: ${bodyFont}`);
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
check("no failed requests / console errors", problems.length === 0, problems.slice(0, 10).join(" | "));
await browser.close();
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  [${r.detail}]` : ""}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
