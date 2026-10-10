# Data changes after the workbook import

`data/` is canonical. Changes made by hand after the import are logged here; re-running the importer would undo them.

## 2026-10-10: citation corrections verified by alan on Gol.gg

| Record | Before | After | Why |
| --- | --- | --- | --- |
| Ziggs + Pyke (observed) | cites game 82627 | unchanged; source marked checked by alan | HLE drafted Ziggs + Pyke in HLE vs Gen.G game 82627. |
| Ziggs + Camille (observed) | cites game 82627 | cites game 82413 | Camille is top lane in 82627. DK vs BNK FearX game 82413 has DK Varus / Kindred / Taliyah / Ziggs / Camille. |
| Ezreal + Nautilus (observed) | cites 82625, 82695, 82416 | cites 82383, 82416 | 82625 has Gen.G Ezreal + Karma and 82695 has DK Ezreal + Seraphine. KT vs DK game 82383 has KT Ezreal + Nautilus. 82416 (KT side not recorded) is kept until it can be checked. |
| sources.json | — | added `golgg-game-82413`, `golgg-game-82383`; `userVerified` on 82627 | Both new sources are `origin: "user-verified"` and stay `not-refreshed` until Claude reads them. |

Ziggs and Ezreal record-level `sources` also gained 82413 and 82383. No Clash field changed.
