# Data changes after the workbook import

`data/` is canonical. Changes made by hand after the import are logged here; re-running the importer would undo them.

## 2026-10-10: DPM.LOL lane matchups (counters)

`data/counters.json` now holds 2,066 DPM.LOL lane-matchup rows for the 87 pool champions (patch 16.20, ranked solo
queue, Emerald+, all regions), browser-collected from dpm.lol in alan's own browser on his Mac (dpm.lol answers Claude's
cloud environments with a Cloudflare challenge). Each row is the pool champion's win rate against that lane opponent,
`origin: "dpm-ingest"`; `dpmStatus.note` records the browser collection. Opponents outside the current 88 champions were
dropped; a later re-ingest can add them once the full roster lands. 246 rows clear the display thresholds (300+ games,
52%+). No duo-vs-duo rows and no pro results were added.

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
