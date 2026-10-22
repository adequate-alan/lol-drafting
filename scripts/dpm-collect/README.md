# DPM.LOL lane-matchup collection

The counter data (`data/counters.json`) is a browser collection from dpm.lol: dpm.lol answers Claude's cloud
environments and GitHub-hosted runners with a Cloudflare challenge (`.github/workflows/dpm-probe.yml`, 2026-10-22), so
the pages are read in alan's own browser on his Mac (the Claude desktop app's built-in browser, normal session). A
challenge is never bypassed: if one appears, the collection stops. dpm.lol's robots.txt disallows every agent from
`/*/champions/versus` and the players' versus / synergy API, so only each champion's **Build** page is opened.

## What is read

One page per pool champion and role (`data/pool.json`, 87 pages on 2026-10-22):

```
https://dpm.lol/champions/<Slug>/build?timeframe=<patch>&lane=top|jungle|middle|bottom|utility
```

with the page's own filters at Ranked, EMERALD+, All regions and the patch (the defaults on 2026-10-22; check the
toolbar). The page requests `/v1/builds/<Slug>?lane=…&tier=emerald_plus&timeframe=<patch>&gameMode=ranked`; its
`enemyMatchups.<LANE>` list is the data: for every lane opponent, `championName` (DPM's spelling: `MonkeyKing`,
`Chogath`, `Nunu`, `Renata`), `count` (games) and `winrate` (a fraction, the page champion's win rate in that matchup).
`delta` is null in the data; the **+/-** the page shows beside each row of its Full List is DPM's own relative figure
with DPM's own baseline (Jayce vs Singed: 49.9% win rate, "+3.2%" shown), so it is stored apart (`delta`) and never
read as a win rate. "Full List" under MATCHUPS is clicked on every page; the rows it displays (DPM applies its own games
threshold) are marked `inFullList`, the list's row count is `fullListRows`, and every opponent in the data request is
kept (`inFullList: false` for the rest), so nothing DPM lists is dropped. Nothing is computed or estimated: the win
rate is DPM's fraction shown as a percentage with two decimals.

## Procedure

1. Open the first page with `preview_start` / `navigate`, wait for it, and confirm in the network log that the page's
   own `/v1/builds/...` request carries `tier=emerald_plus&timeframe=<patch>&gameMode=ranked` and the lane.
2. For each page: navigate, then take two or three tiny screenshots (`scale: 0.1`) a second apart. When the browser
   pane is hidden (no window shows the session) the page never gets an animation frame, dpm.lol's app boots on one,
   and the matchups never render; a screenshot forces a frame.
3. Run `extract-page.js` in the page (`javascript_tool`, under 45 s). It waits for "Full List", clicks it, reads the
   list, fetches the same data request from the browser cache and returns one page object:
   `{ champion, role, url, lane, dataRequest, fullListRows, matchups: [{ enemy, games, winRate, delta?, inFullList }] }`.
   Save it as `<ROLE>_<Slug>.json` in a work folder. Check the network log again for the page's own request.
4. `node scripts/dpm-collect/merge.mjs <folder> --patch 16.20 --collected YYYY-MM-DD --out dpm-export/dpm-16.20-<date>.json`
   writes the export (`DpmExport` in `lib/schema.ts`) and names any pool page still missing. Save progress every ten
   pages or so; the merge can be re-run.
5. `npx tsx scripts/dpm-validate.ts <export>`: every pool page present, every name on the roster, no duplicates, valid
   numbers, Full List counts against the rows marked shown, reciprocal pairs (A's page vs B and B's page vs A) summing
   to 100% within sampling. It exits 1 when the export must not be stored.
6. `npx tsx scripts/dpm-compare.ts <export>` (against `data/counters.json`, or `--old data/dpm-history/<file>.json.gz`):
   before-and-after counts at the site's thresholds, new / lost / weakened counters, largest moves. The numbers explain
   nothing by themselves (a longer patch means bigger samples); say what moved and why in `docs/data-changes.md`.
7. `npx tsx scripts/ingest-dpm.ts <export>` (`--dry-run` first): archives the stored rows to
   `data/dpm-history/<patch>-<collected>.json.gz`, then writes `data/counters.json`. One patch and one bracket per
   collection; it refuses partial reads and older patches. Then `npm test`, `npm run typecheck`, `npm run build`.

Thresholds (300 games, 52% favourable, 54% strong) live in `lib/counters.ts` and are not part of the collection. Rows
under 300 games stay "Preliminary" on the site, never a Counter label. The daily patch-notes workflow prints the data's
patch against the newest recognised one (`scripts/dpm-freshness.ts`) and opens an issue labelled `dpm-stale` when a
newer patch is recognised: time to collect again.
