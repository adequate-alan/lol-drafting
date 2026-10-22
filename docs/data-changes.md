# Data changes after the workbook import

`data/` is canonical. Changes made by hand after the import are logged here; re-running the importer would undo them.

## 2026-10-22: DPM.LOL lane matchups refreshed (counters)

`data/counters.json` now holds 6,792 DPM.LOL lane-matchup rows for the same 87 pool champion/roles (patch 16.20 / Riot's
26.20, ranked solo queue, Emerald+, all regions), collected on 2026-10-22 in the desktop app's built-in browser from each
champion's Build page: the page's own data request after clicking "Full List" (`scripts/dpm-collect/README.md`). The
2026-10-10 rows are archived whole in `data/dpm-history/16.20-2026-10-10.json.gz`. Stored by `scripts/ingest-dpm.ts`
after `scripts/dpm-validate.ts` (87/87 pages, 0 problems; 709 reciprocal pairs sum to 100% within 0.06 points on
average, one jungle pair under 300 games 1.5 points off) and `scripts/dpm-compare.ts`.

Two fields are new: `shown` (DPM's Full List displayed the row; 3,468 of 6,792) and `delta` (the +/- DPM shows beside
those rows: DPM's own relative figure, stored apart from the win rate and never read as one). By role: TOP 1,815,
MID 1,639, SUPPORT 1,335, JUNGLE 1,102, BOT 901.

| | 2026-10-10 | 2026-10-22 |
| --- | --- | --- |
| Matchup rows | 4,212 | 6,792 |
| Rows with 300+ games | 1,817 | 4,184 |
| Qualifying counters (300+ games, 52%+) | 408 | 956 |
| Strong counters (300+ games, 54%+) | 173 | 376 |
| Pool champion/roles with a qualifying counter | 68 | 84 |
| Enemy champion/roles with a qualifying response | 154 | 263 |

692 counters are newly supported, almost all because their samples crossed 300 games (games on shared rows grew ×6 at
the median: the first collection was three days into the patch, this one twelve days later); 144 disappeared (the
early win rate drifted under 52% on the larger sample), 65 weakened from strong to favourable and 26 strengthened. The
largest moves among rows with 300+ games in both (Nocturne vs Vi 43.9% → 51.2%, Galio vs Hwei 50.4% → 43.9%) are
regression of early samples of 300–400 games (standard error about 2.7 points), not read as meta shifts. Thresholds,
scoring, saved pairings, pool tiers and kits are unchanged; rows under 300 games stay preliminary.

## 2026-10-10: DPM.LOL lane matchups (counters)

`data/counters.json` holds 4,212 DPM.LOL lane-matchup rows for the 87 pool champions (patch 16.20, ranked solo queue,
Emerald+, all regions), browser-collected from dpm.lol in alan's own browser on his Mac (dpm.lol answers Claude's cloud
environments with a Cloudflare challenge). Each row is the pool champion's win rate against that lane opponent,
`origin: "dpm-ingest"`; `dpmStatus.note` records the browser collection. By role: MID 992, TOP 910, SUPPORT 869,
JUNGLE 742, BOT 699. 408 rows clear the display thresholds (300+ games, 52%+). No duo-vs-duo rows and no pro results.

This second pass replaced the first one (2,066 rows, 246 above the thresholds) whole: it was re-fetched after the roster
grew to 173 champions, so every lane opponent DPM lists now maps to a champion, and numbers moved slightly with the
fresh fetch.

`delta` is omitted: DPM returns none for lane matchups. When DPM does give one it is a fraction (0.03), while
`describeEvidence` expects win-rate points (3); convert before storing.

## 2026-10-10: citation corrections supplied during review

| Record | Before | After | Why |
| --- | --- | --- | --- |
| Ziggs + Pyke (observed) | cites game 82627 | unchanged; source given a pending claim (see cleanup below) | HLE drafted Ziggs + Pyke in HLE vs Gen.G game 82627. |
| Ziggs + Camille (observed) | cites game 82627 | cites game 82413 | Camille is top lane in 82627. DK vs BNK FearX game 82413 has DK Varus / Kindred / Taliyah / Ziggs / Camille. |
| Ezreal + Nautilus (observed) | cites 82625, 82695, 82416 | cites 82383, 82416 | 82625 has Gen.G Ezreal + Karma and 82695 has DK Ezreal + Seraphine. KT vs DK game 82383 has KT Ezreal + Nautilus. 82416 (KT side not recorded) is kept until it can be checked. |
| sources.json | — | added `golgg-game-82413`, `golgg-game-82383` | Superseded by the cleanup below. |

Ziggs and Ezreal record-level `sources` also gained 82413 and 82383. No Clash field changed.

## 2026-10-10: source status cleanup

| Record | Before | After | Why |
| --- | --- | --- | --- |
| Ezreal + Nautilus (observed) | cites 82383, 82416 | cites 82383 only | 82416 was kept on "may show it"; a pro claim cites only games that directly show it. Re-add after the page is read. |
| golgg-game-82627, 82413, 82383 | `userVerified` (labelled "checked by alan") | `pendingClaim` {claim, providedOn}; 82413 and 82383 `origin: "externally-provided"` | The links were supplied during review, not personally re-checked. All stay `not-refreshed` until Claude can read Gol.gg. |

## 2026-10-10: Kai'Sa + Rell removed from Clash blocks

| Record | Before | After | Why |
| --- | --- | --- | --- |
| Lissandra (MID) `botShapes` | included Kai'Sa + Rell | removed | Kai'Sa has no Clash record, so no Clash record permits Rell with her. alan asked not to create one. |
| Ambessa (TOP) `surrounding.botShapes` | included Kai'Sa + Rell | removed | Same. |

The importer now drops (with a warning) any Clash bot shape whose bot has no Clash record, and `tests/data-integrity.test.ts` requires every Clash shape's bot to have a record that lists the support.
