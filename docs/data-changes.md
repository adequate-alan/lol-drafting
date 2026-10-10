# Data changes after the workbook import

`data/` is canonical. Changes made by hand after the import are logged here; re-running the importer would undo them.

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
