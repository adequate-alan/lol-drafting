// One-off (alan, 2026-11-14): fetch candidate team logo files for the Gen.G Finals hub from Wikipedia / Wikimedia
// Commons on a GitHub runner (both are unreachable from the cloud environments), with each file's source page and
// license metadata, for review before anything is shown on the site.
import { mkdir, writeFile } from "node:fs/promises";
const UA = { "User-Agent": "draft-assistant-logo-fetch/1.0 (static fan site; one-off)" };
const out = "assets/teams/candidates";
await mkdir(out, { recursive: true });
const api = async (host, params) => {
  const r = await fetch(`https://${host}/w/api.php?${new URLSearchParams({ format: "json", origin: "*", ...params })}`, { headers: UA });
  if (!r.ok) throw new Error(`${host} ${r.status}`);
  return r.json();
};
const manifest = [];
const TEAMS = [["geng", ["Gen.G"], ["Gen.G logo", "Gen.G Esports logo"]], ["blg", ["Bilibili Gaming"], ["Bilibili Gaming logo", "BLG logo esports"]]];
for (const [key, pages, searches] of TEAMS) {
  const files = new Map(); // title -> host
  for (const p of pages) {
    const j = await api("en.wikipedia.org", { action: "query", titles: p, prop: "images", imlimit: "max" });
    for (const pg of Object.values(j.query?.pages ?? {})) for (const i of pg.images ?? []) files.set(i.title, "en.wikipedia.org");
  }
  // Commons search is a bonus: a rate limit there (429) is respected, noted and never retried in a loop.
  for (const s of searches) {
    try {
      await new Promise((r) => setTimeout(r, 3000));
      const j = await api("commons.wikimedia.org", { action: "query", list: "search", srsearch: s, srnamespace: "6", srlimit: "8" });
      for (const h of j.query?.search ?? []) if (!files.has(h.title)) files.set(h.title, "commons.wikimedia.org");
    } catch (e) { manifest.push({ team: key, search: s, error: String(e) }); break; }
  }
  let n = 0;
  for (const [title, host] of files) {
    if (!/gen\.?g|bilibili|blg/i.test(title) || !/logo|gen\.?g|blg|bilibili/i.test(title) || /\.(ogg|webm|pdf)$/i.test(title)) continue;
    await new Promise((r) => setTimeout(r, 1500));
    let j;
    try { j = await api(host, { action: "query", titles: title, prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: "512" }); }
    catch (e) { manifest.push({ team: key, title, host, error: String(e) }); continue; }
    const info = Object.values(j.query?.pages ?? {})[0]?.imageinfo?.[0];
    if (!info) { manifest.push({ team: key, title, host, error: "no imageinfo" }); continue; }
    const meta = info.extmetadata ?? {};
    const entry = { team: key, title, host, page: info.descriptionurl, original: info.url, thumb: info.thumburl, mime: info.mime, width: info.width, height: info.height,
      license: meta.LicenseShortName?.value, usage: meta.UsageTerms?.value, artist: meta.Artist?.value?.replace(/<[^>]+>/g, "").slice(0, 200), nonFree: meta.NonFree?.value, restrictions: meta.Restrictions?.value };
    try {
      const png = await fetch(info.thumburl ?? info.url, { headers: UA });
      if (!png.ok) throw new Error(`thumb ${png.status}`);
      entry.file = `${key}-${++n}.png`;
      await writeFile(`${out}/${entry.file}`, Buffer.from(await png.arrayBuffer()));
      if (info.mime === "image/svg+xml") {
        const svg = await fetch(info.url, { headers: UA });
        if (svg.ok) { entry.svg = `${key}-${n}.svg`; await writeFile(`${out}/${entry.svg}`, Buffer.from(await svg.arrayBuffer())); }
      }
    } catch (e) { entry.error = String(e); }
    manifest.push(entry);
  }
}
await writeFile(`${out}/manifest.json`, JSON.stringify(manifest, null, 1));
console.log(JSON.stringify(manifest, null, 1));
