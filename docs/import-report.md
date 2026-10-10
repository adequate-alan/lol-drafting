# Workbook import report

Source: `workbook/Clash_LCK_2026_Playoffs_FULL_Revamp.xlsx`, sheets used: 9/9 (START HERE, EXACT DRAFTS, GENG PATTERNS, BOT PAIRINGS, MID-JGL, TOP, PLAYOFF META, CHAMP POOL, COMP SHELLS).

Champions: 88 · Sources: 39 (all `not-refreshed`, origin workbook) · Pro drafts: 30 team-games from 18 of 41 games · Bot pairings: 15 · Mid/jungle: 21 · Top: 11 · Comp shells: 14 · Meta stats: 21

## Decisions applied during import

- Merged GENG PATTERNS into EXACT DRAFTS: 30 unique team-games (4 Gen.G finals games were in both sheets).
- Sivir: Sheet listed 'Lulu / Karma' as a joint default. alan: Lulu is the default; Karma's recent pro usage does not make it the default.
- Ezreal: Sheet listed 'Karma / Seraphine' as a joint default. alan: Karma is the default; Seraphine and Nautilus are alternatives only.
- Yunara: alan: keep Braum available as the anti-dive option.
- Ziggs: Sheet secondary column held Camille, Bard, Karma. alan: no Clash alternatives; Pyke and Camille are observed pro variants only; Bard and Karma removed.
- Azir: Sheet primary was 'Skarner / Jarvan IV'. alan: Azir+Skarner must not be presented as current, so Skarner moves to history.
- Top-lane picks/WR stored once in meta.json (TOP sheet values merged; bans unknown for champions without a PLAYOFF META row).
- Gen.G never repeated a MID/JUNGLE pairing in recorded games; no combination pattern stored.
- Gen.G never repeated a BOT/SUPPORT pairing in recorded games; no combination pattern stored.

## Warnings

- Observed ezreal + nautilus is cited by the workbook but not shown in any recorded draft (kept, flagged unbacked)
- Observed ziggs + pyke is cited by the workbook but not shown in any recorded draft (kept, flagged unbacked)
- Observed ziggs + camille is cited by the workbook but not shown in any recorded draft (kept, flagged unbacked)
- Bot shape "Seraphine" in MID-JGL Galio names one champion, not a duo; skipped
- Bot shape "Jhin" in MID-JGL Galio names one champion, not a duo; skipped
