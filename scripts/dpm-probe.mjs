// One-time access test (alan, 2026-10-22): does dpm.lol answer a GitHub-hosted runner's ordinary request, the way Gol.gg
// does? Reads robots.txt, then one champion's Build page, and reports what came back. It stops at the first refusal or
// challenge and never retries around one: no browser emulation, no cookies, no header tricks. Writes nothing to data/.
//
//   node scripts/dpm-probe.mjs            prints a Markdown report (the workflow appends it to the run summary)
const UA = "lol-drafting-dpm-probe/1.0 (+https://github.com/adequate-alan/lol-drafting; one-time access test, 2 pages)";
const BASE = "https://dpm.lol";
const out = [];
const say = (s = "") => { out.push(s); };

function challenged(res, body) {
  const h = (k) => res.headers.get(k) ?? "";
  if (h("cf-mitigated")) return `cf-mitigated: ${h("cf-mitigated")}`;
  if (/just a moment|challenge-platform|cf-chl|attention required/i.test(body)) return "Cloudflare challenge page";
  if (res.status === 403 || res.status === 429 || res.status === 503) return `HTTP ${res.status}`;
  return null;
}

async function get(path) {
  const url = `${BASE}${path}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(30000) });
    const body = await res.text();
    return { url, res, body };
  } catch (e) {
    return { url, error: String(e?.cause?.code ?? e?.message ?? e) };
  }
}

say("## DPM.LOL access test from a GitHub runner");
say();
let verdict = "works";
for (const path of ["/robots.txt", "/champions/Jayce/build"]) {
  const r = await get(path);
  if (r.error) { say(`- \`${path}\`: network error (${r.error})`); verdict = "network error"; break; }
  const why = challenged(r.res, r.body);
  say(`- \`${path}\`: HTTP ${r.res.status}, ${r.res.headers.get("content-type") ?? "no content type"}, ${r.body.length.toLocaleString()} bytes, server ${r.res.headers.get("server") ?? "?"}${why ? `, **refused: ${why}**` : ""}`);
  if (why) { verdict = `refused (${why})`; break; }
  if (path === "/robots.txt") {
    say("");
    say("```");
    say(r.body.slice(0, 1500).trim());
    say("```");
    const blocked = /Disallow:\s*\/champions/i.test(r.body) || /Disallow:\s*\/\s*$/im.test(r.body);
    if (blocked) { verdict = "robots.txt disallows champion pages"; say("- robots.txt disallows the champion pages: stopping."); break; }
  } else {
    // What the page carries, so a collector could be written from the same data the 2026-10-10 browser read used.
    const next = r.body.includes("__NEXT_DATA__");
    const flight = r.body.includes("self.__next_f");
    const words = ["matchup", "winRate", "winrate", "counters", "games"].filter((w) => r.body.includes(w));
    say(`- Page data: ${next ? "__NEXT_DATA__ present" : flight ? "Next.js streamed data present" : "no embedded page data found"}; words seen: ${words.join(", ") || "none"}`);
  }
}
say();
say(`**Result: ${verdict}.** Nothing was written to the repository.`);
console.log(out.join("\n"));
