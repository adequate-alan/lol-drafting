// Run inside a dpm.lol champion Build page (see README.md): waits for the matchups, clicks "Full List", reads the rows
// it shows, fetches the page's own data request from the browser cache and returns one page object as JSON. Reads only;
// never computes a value. Keep it under the javascript tool's 45 s limit (the wait is capped at 15 s).
const slug = location.pathname.match(/\/champions\/([^/]+)\/build/)[1];
const lane = new URLSearchParams(location.search).get("lane") || "top";
const LANE = { top: "TOP", jungle: "JUNGLE", middle: "MIDDLE", bottom: "BOTTOM", utility: "UTILITY" }[lane];
const ROLE = { top: "TOP", jungle: "JUNGLE", middle: "MID", bottom: "BOT", utility: "SUPPORT" }[lane];
const patch = new URLSearchParams(location.search).get("timeframe");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const leaf = (t) => [...document.querySelectorAll("span,div,p,button")].find((e) => e.children.length === 0 && e.textContent.trim() === t);
let full = null, waited = 0;
for (let i = 0; i < 15 && !full; i++) { full = leaf("Full List"); if (!full) { await sleep(1000); waited++; } }
if (full) { full.click(); await sleep(1500); }
const rows = (c) => (c ? [...c.parentElement.querySelectorAll('a[href^="/champions/"]')].map((a) => ({ slug: a.getAttribute("href").split("/")[2], delta: a.innerText.replace(/\s+/g, " ").trim().split(" ")[0] })) : []);
const ui = [...rows(leaf("GOOD AGAINST")), ...rows(leaf("BAD AGAINST"))];
let out;
if (!full) out = { notReady: true, waited, slug, lane };
else {
  const dataRequest = `https://dpm.lol/v1/builds/${slug}?lane=${lane}&tier=emerald_plus&timeframe=${patch}&gameMode=ranked`;
  const data = ((await (await fetch(dataRequest, { cache: "force-cache" })).json()).enemyMatchups || {})[LANE] || [];
  const shown = new Map(ui.map((u) => [u.slug, u.delta]));
  out = {
    champion: slug, role: ROLE, url: `https://dpm.lol/champions/${slug}/build`, lane, dataRequest, fullListRows: ui.length,
    uiUnmatched: ui.filter((u) => !data.find((d) => d.championName === u.slug)).map((u) => u.slug),
    matchups: data.map((d) => ({ enemy: d.championName, games: d.count, winRate: d.winrate == null ? undefined : Math.round(d.winrate * 10000) / 100,
      ...(shown.has(d.championName) ? { delta: shown.get(d.championName), inFullList: true } : { inFullList: false }) })),
  };
}
JSON.stringify(out);
