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
