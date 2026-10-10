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
check("no Clash wording on the Draft Room", !/Clash/.test(await text("body")), "");
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
  check("meta: Demacia Cup shown as ONGOING current meta", /Current meta · Demacia Cup/.test(await page.locator("main").textContent()) && (await page.locator(".current-event .badge").first().textContent())?.trim() === "ONGOING", "");
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
