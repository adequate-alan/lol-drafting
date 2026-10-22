# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primarily alan, for his own drafting. The site is designed to be useful to anyone interested in League of Legends drafting, including teammates and other players, and is not framed around Clash. Users come to analyze champion pairings, synergies, counters, team compositions and draft decisions.

## Product Purpose

A general League of Legends drafting assistant. It ranks every champion for the open role by overall draft fit (alan's saved synergy, pairwise synergy with locked picks, the comp's open needs, matchups against optional enemy picks, risks), explains each point in writing, and keeps pro evidence and lane counters beside the ranking rather than inside it. Success is a draft decision made quickly with its reasons visible, without the tool overriding alan's own preferences.

## Positioning

Recommendations start from alan's own saved pairings and pool, not from global win rates or pro popularity. Three layers stay separate in data and on screen: Saved synergy (alan's confirmed preferences, strongest), Pro pairings (Gol.gg-recorded games with event, patch, date and source), and General draft logic (kit-based reasoning, including "Proposed synergy"). DPM.LOL lane counters are a fourth, unscored signal.

## Operating Context

- Used while preparing or making draft decisions, on desktop or phone; scanning beats reading.
- Sections: Draft Room, Champion Synergies, Comp Library, Champion Pool, Pro Drafts, Gen.G, Meta.
- Pro data refreshes daily from Gol.gg (Demacia Cup 2026, Worlds 2026); LCK 2026 playoffs are a frozen archive. Counter data is DPM.LOL ranked Emerald+ rows supplied from alan's browser.
- alan reviews engine and data checkpoints himself before roster-wide changes; he will not do screenshot or manual data-entry workflows.

## Capabilities and Constraints

- Static export on GitHub Pages: no server, no login, no database; public by alan's choice. Data is JSON in the repo, read at build time.
- Pro evidence never adds to a recommendation's score and never becomes a saved default; one pro game is never a "best pairing". Tournament aggregates and recorded games are separate datasets; missing aggregates show "—".
- Every roster champion is lockable; roster-only champions are never recommended.
- "First Pick" is reserved for a future blind-pick feature (blind safety, counterpick vulnerability, flexibility, draft priority).
- Pages must not get busier with each feature: new data enriches existing elements through hover card, expansion or drawer.

## Brand Commitments

- Name "Draft Assistant", subtitle "League drafting tool"; general League tool with Gen.G identity, no Clash branding in the UI.
- No Riot logos or trademarks beyond the footer's Riot fan-project notice; GenRang (Gen.G's mascot) only as a small brand accent, with the Gen.G credit kept in the footer.
- Copy never names Claude, AI or how a recommendation was produced. Vocabulary: Saved synergy, Proposed synergy, Pro pairing.
- Design reference: alan's other site, Adequate (dense, information-first). Visual system lives in app/globals.css and CLAUDE.md, not here.

## Evidence on Hand

- data/*.json: champions (173, Data Dragon 16.20.1), saved and proposed synergy, pro-games, meta, sources, counters (6,792 DPM lane rows, patch 16.20, collected 2026-10-22; the 2026-10-10 snapshot archived in data/dpm-history).
- workbook/ and /mnt/project-files/Clash_LCK_2026_Playoffs_FULL_Revamp.xlsx: the original drafting workbook (archive).
- Absent, never to be fabricated: lane-matchup data beyond DPM rows, duo counter rows, LCK game dates, Demacia full tournament aggregates where Gol.gg lacks them, kits for Locke and Zaahen.

## Product Principles

1. alan's saved preferences lead; everything else informs, nothing overwrites them.
2. Every recommendation shows its reasons and its source layer.
3. Never invent data: missing is shown as missing.
4. Density and speed over decoration; one cohesive app, not seven dashboards.
5. Pro evidence is context, never a score.

## Accessibility & Inclusion

Target WCAG 2.2 AA where practical: sufficient color contrast, visible keyboard focus, accessible interactive controls, and usability across desktop and mobile in both light and dark themes. This is a design and implementation standard to evaluate against, not a claim that the site already complies.
