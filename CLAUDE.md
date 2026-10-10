# LoL Clash drafting site

Drafting dashboard for alan's Clash team. Next.js (App Router) + TypeScript, no database, deployed as a fully static
export to GitHub Pages (https://adequate-alan.github.io/lol-drafting/).
Data is normalized JSON in `data/`, validated by zod schemas in `lib/schema.ts`.

## Source of truth

- `data/*.json` is canonical. The workbook in `workbook/` is an archive and a possible import format only.
- `npm run import:workbook -- --force` rebuilds `data/` from the workbook and **overwrites hand edits**. Do not run it
  unless alan asks; edit `data/` directly instead. Decisions the importer applies live in `scripts/migration/`.
- Every change to `data/` must keep `npm test` green.

## Three layers, never merged

Every recommendation, card and suggestion keeps these apart, in separate fields and separate UI blocks:

1. **Clash Recommendation**: what alan wants to play (`clashDefault`, `alternatives`, `surrounding`, pool tiers).
2. **Observed Pro Evidence**: directly supported by Gol.gg (`observedProPairings`, `pro-drafts.json`, `geng.json`, `meta.json`), each with sources.
3. **General Draft Logic**: reasoning without recent observed evidence (`logic`, `lib/evaluate.ts` rules).

- A pro pairing never becomes a Clash default or alternative automatically. One pro game is not a "best pairing".
- Pro usage informs alan's defaults but never silently overwrites them. Ask before changing a Clash field.
- Never delete valid pro evidence because it is not one of alan's Clash picks. Pairings the workbook cites without a
  recorded draft stay, flagged `backedByGame: false`.
- Keep priority (pick/ban presence) separate from win rate, and mark small samples (`lowSample`, fewer than 5 picks).
- A low-sample champion can only be in a pool's `core` tier with a written `coreReasons` entry.
- Clash bot/support eligibility is a hard rule (`lib/suggest.ts`, `tests/clash-eligibility.test.ts`): with BOT locked,
  only that bot's `clashDefault` + `alternatives` can be Clash supports (and the reverse with SUPPORT locked). Pro
  pairings and bot-lane shapes on other records can only boost an eligible pick, never add one, and a Clash default
  always ranks above an alternative. A Clash `botShapes` entry needs a bot with a Clash record that lists the support.

## Gol.gg research rules

- Gol.gg is the primary external source for pro drafts, picks, bans and team stats.
- Every source records: URL, type, tournament, team, opponent, series/game, patch, `lastChecked`, `refreshStatus`.
- When a page is re-checked, set `lastChecked` to the date and `refreshStatus: "verified"`, `origin: "golgg-refresh"`.
- A link and claim supplied during review gets `origin: "externally-provided"` (new sources) and a `pendingClaim`
  {claim, providedOn}. It stays `refreshStatus: "not-refreshed"`, `lastChecked: null`, and is never labelled as checked
  by a person, until Claude reads the page itself.
- A pro claim cites only games that directly show that exact claim. "May show it" is not enough: leave the game off
  until it is read. Remove a citation whose game shows something else; don't drop the claim.
- If Gol.gg or the web is unavailable: say the research could not be refreshed, keep the last verified data, leave
  `refreshStatus: "not-refreshed"`, and **never invent tournament data or pretend a refresh happened**.

## Locked Clash conclusions (enforced by `tests/locked-conclusions.test.ts`)

Change these only when alan explicitly says so, then update the test in the same commit.

- Corki → Nami. Alistar is observed only.
- Caitlyn → Bard / Karma.
- Sivir → Lulu. Karma is the observed playoff / tempo alternative; alternatives Karma, Bard, Rakan, Seraphine.
- Ezreal → Karma. Alternatives Seraphine, Bard, Milio, Neeko, Nautilus; never the default.
- Yunara → Lulu. Braum is the anti-dive option.
- Ziggs → Nautilus / Leona. No Clash alternatives (no Bard, no Karma). Pyke and Camille are observed pro variants only.
  General Draft Logic: "Ziggs needs reliable engage or catch somewhere else in the composition if support is not providing it."
- Xayah → Rakan. Kalista → Renata. Zeri → Yuumi.
- Skarner + Locke is the current pairing. Azir + Skarner is an earlier-2026 tendency only, never the current Gen.G default.

## Hosting and security

- Static export only (`output: "export"`, base path `/lol-drafting` in `lib/site.ts`), deployed by
  `.github/workflows/pages.yml` on every push to `main`. No server runtime: no middleware/proxy, API routes, server
  actions, `next/headers` or server `searchParams`; pages read URL filters with `useSearchParams` in a client view.
  `tests/static-site.test.ts` enforces this.
- The site is public by alan's choice (2026-10-10): there is no login, and every page and its data can be read.
  Don't add fake client-side password protection.
- Data files are read at build time by `lib/data.ts` (`server-only`); nothing goes in `public/`.
- Never commit `.env*` files, secrets or tokens.

## UI

- Gen.G-inspired design system: every color, spacing, radius and type size is a token in `app/globals.css`
  (`:root[data-theme="light" | "dark"]`). Components use tokens only; don't add raw hex values in components.
- Gold (`--accent`) marks selection and importance. Each layer keeps its own treatment: Clash = strongest (gold rule),
  Pro = teal evidence styling, Logic = neutral gray. Don't restyle one layer to look like another.
- Shared pieces live in `components/ui.tsx` (PageHeader, Panel, SourceBadge, ChampIcon, ChampionRow, DataTable,
  WarningBadge, Metric), `components/Sidebar.tsx` and `components/ThemeToggle.tsx`. Champion tiles are monograms;
  no champion images are bundled.
- Warning severity (critical / caution) in the Draft Room is a display grouping only; the rules are in `lib/evaluate.ts`.

## Commands

`npm run dev` · `npm run typecheck` · `npm test` · `npm run build` (static export to `out/`)
