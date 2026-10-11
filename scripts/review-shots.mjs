// Temporary: design review screenshots for the design-system cleanup branch.
const { chromium } = await import("playwright");
const base = process.argv[2].replace(/\/$/, "");
const dir = process.argv[3];
const browser = await chromium.launch();
const pages = [
  ["/?top=ambessa&jungle=vi&bot=ziggs&vs=top:renekton,bot:sivir,support:lulu", "draft"],
  ["/", "empty"],
  ["/synergies/bot/?champ=sivir", "syn-bot"],
  ["/synergies/mid-jungle/?champ=ahri&role=MID", "syn-mid"],
  ["/comps/", "comps"],
  ["/pool/", "pool"],
  ["/pro-drafts/", "prodrafts"],
  ["/meta/", "meta"],
  ["/geng/", "geng"],
];
const sizes = [[1440, 900, "d"], [1024, 768, "t"], [390, 844, "m"]];
for (const theme of ["light", "dark"]) {
  for (const [w, h, tag] of sizes) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: tag === "m", isMobile: tag === "m" });
    const page = await ctx.newPage();
    await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
    for (const [path, name] of pages) {
      await page.goto(base + path, { waitUntil: "networkidle" });
      await page.waitForTimeout(600);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (over > 0) console.log(`OVERFLOW ${name} ${tag} ${theme}: ${over}px`);
      await page.screenshot({ path: `${dir}/${name}-${tag}-${theme}.jpg`, type: "jpeg", quality: 72, fullPage: tag !== "m", clip: undefined });
    }
    // Interactions
    if (tag === "d") {
      await page.goto(base + "/comps/", { waitUntil: "networkidle" });
      const n = page.locator(".lu-champ").nth(3); await n.hover(); await page.waitForTimeout(500);
      await page.screenshot({ path: `${dir}/x-hover-comps-${theme}.jpg`, type: "jpeg", quality: 72 });
      await n.click(); await page.waitForTimeout(500);
      await page.screenshot({ path: `${dir}/x-drawer-${theme}.jpg`, type: "jpeg", quality: 72 });
      await page.goto(base + "/pool/?q=locke", { waitUntil: "networkidle" });
      await page.click("tr.pool-row"); await page.waitForTimeout(300);
      await page.screenshot({ path: `${dir}/x-pool-open-${theme}.jpg`, type: "jpeg", quality: 72 });
      await page.goto(base + "/meta/?role=SUPPORT", { waitUntil: "networkidle" });
      await page.locator(".hub-table.tall tr.click-row").first().click().catch(() => {}); await page.waitForTimeout(300);
      await page.screenshot({ path: `${dir}/x-meta-open-${theme}.jpg`, type: "jpeg", quality: 72, fullPage: true });
      await page.goto(base + "/?bot=sivir&vs=renekton,,,ezreal,karma", { waitUntil: "networkidle" });
      await page.locator(".fit-toggle").first().click().catch(() => {}); await page.waitForTimeout(300);
      await page.screenshot({ path: `${dir}/x-draft-expanded-${theme}.jpg`, type: "jpeg", quality: 72, fullPage: true });
      await page.evaluate(() => scrollTo(0, 900)); await page.waitForTimeout(400);
      await page.screenshot({ path: `${dir}/x-draft-mini-${theme}.jpg`, type: "jpeg", quality: 72 });
      await page.goto(base + "/synergies/bot/?champ=sivir", { waitUntil: "networkidle" });
      await page.locator(".pick-card .champ-btn", { hasText: "Lulu" }).first().hover(); await page.waitForTimeout(500);
      await page.screenshot({ path: `${dir}/x-hover-syn-${theme}.jpg`, type: "jpeg", quality: 72 });
    }
    if (tag === "m") {
      await page.goto(base + "/comps/", { waitUntil: "networkidle" });
      await page.locator(".lu-champ").first().tap(); await page.waitForTimeout(500);
      await page.screenshot({ path: `${dir}/x-sheet-${theme}.jpg`, type: "jpeg", quality: 72 });
      await page.goto(base + "/", { waitUntil: "networkidle" });
      await page.locator('input[aria-label="TOP champion"]').tap().catch(() => {}); await page.waitForTimeout(300);
      await page.screenshot({ path: `${dir}/x-picker-m-${theme}.jpg`, type: "jpeg", quality: 72 });
    }
    await ctx.close();
  }
}
await browser.close();
