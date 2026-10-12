// Temporary review screenshots for the Impeccable refinement pass (removed before merge).
//   node scripts/review-shots.mjs <base-url> <out-dir>
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const base = process.argv[2].replace(/\/$/, "");
const dir = process.argv[3];
const browser = await chromium.launch();
const sizes = { desk: { width: 1440, height: 900 }, tab: { width: 820, height: 1100 }, phone: { width: 390, height: 844 } };
const pages = [
  ["draft-empty", "/"],
  ["draft", "/?top=ambessa&jungle=skarner&mid=ahri&bot=sivir&vs=renekton,,,ezreal,karma"],
  ["draft-early", "/?bot=jhin"],
  ["synergies", "/synergies/bot/?champ=sivir&role=BOT"],
  ["comps", "/comps/"],
  ["pool", "/pool/"],
  ["pro-drafts", "/pro-drafts/"],
  ["geng", "/geng/"],
  ["meta", "/meta/"],
];
const report = [];
for (const theme of ["light", "dark"]) {
  for (const [size, vp] of Object.entries(sizes)) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, hasTouch: size === "phone" });
    await ctx.addInitScript((t) => localStorage.setItem("theme", t), theme);
    const page = await ctx.newPage();
    for (const [name, path] of pages) {
      await page.goto(base + path, { waitUntil: "networkidle" });
      await page.waitForTimeout(300);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (over > 0) report.push(`${theme} ${size} ${name}: page ${over}px too wide`);
      await page.screenshot({ path: `${dir}/${name}-${size}-${theme}.png`, fullPage: size !== "desk" ? false : true });
      if (size !== "desk") await page.screenshot({ path: `${dir}/${name}-${size}-${theme}-full.png`, fullPage: true });
    }
    // Interaction states (desktop + phone only)
    if (size !== "tab") {
      await page.goto(base + "/?top=ambessa&jungle=skarner&mid=ahri", { waitUntil: "networkidle" });
      const bot = page.locator(".draft-slot.role-BOT input, .draft-slot.role-BOT .slot-body").first();
      await bot.click().catch(() => {});
      await page.waitForTimeout(300);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (over > 0) report.push(`${theme} ${size} picker open: page ${over}px too wide`);
      await page.screenshot({ path: `${dir}/state-picker-${size}-${theme}.png` });
      await page.goto(base + "/?bot=sivir", { waitUntil: "networkidle" });
      const row = page.locator(".cand-row, .rec-row, [data-candidate]").first();
      if (size === "desk") {
        const chip = page.locator("main .champ-chip, main [data-champion]").first();
        await chip.hover().catch(() => {});
        await page.waitForTimeout(600);
        await page.screenshot({ path: `${dir}/state-hover-${size}-${theme}.png` });
        const pro = page.getByText(/Pro · \d+/).first();
        if (await pro.count()) { await pro.hover().catch(() => {}); await page.waitForTimeout(500); await page.screenshot({ path: `${dir}/state-procard-${size}-${theme}.png` }); }
      }
      await page.goto(base + "/?bot=sivir", { waitUntil: "networkidle" });
      await page.locator(".draft-slot.role-BOT .slot-body").first().click().catch(() => {});
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${dir}/state-drawer-${size}-${theme}.png` });
      await page.goto(base + "/pool/", { waitUntil: "networkidle" });
      await page.locator(".select-trigger").first().click().catch(() => {});
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${dir}/state-select-${size}-${theme}.png` });
    }
    await ctx.close();
  }
}
await browser.close();
const fs = await import("node:fs");
fs.writeFileSync(`${dir}/report.txt`, report.join("\n") + "\n");
console.log(report.join("\n") || "no overflow");
