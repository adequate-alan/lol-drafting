# League of Legends Draft Assistant

General League of Legends drafting assistant (originally built for alan's Clash team; the UI no longer uses Clash
branding). Next.js (App Router) + TypeScript, no database, deployed as a fully static
export to GitHub Pages (https://adequate-alan.github.io/lol-drafting/).
Data is normalized JSON in `data/`, validated by zod schemas in `lib/schema.ts`.

## Source of truth

- `data/*.json` is canonical. The workbook in `workbook/` is an archive and a possible import format only.
- `npm run import:workbook -- --force` rebuilds `data/` from the workbook and **overwrites hand edits**. Do not run it
  unless alan asks; edit `data/` directly instead. Decisions the importer applies live in `scripts/migration/`.
- Every change to `data/` must keep `npm test` green.

## Three layers, never merged

Every recommendation, card and suggestion keeps these apart, in separate fields and separate UI blocks:

1. **Synergy Recommendation**: alan's saved pairings (`clashDefault`, `alternatives`, `surrounding`, pool tiers; the
   field names are historical) plus the draft-fit ranking in `lib/recommend.ts`.
2. **Observed Pro Evidence**: directly supported by Gol.gg (`observedProPairings`, `pro-drafts.json`, `geng.json`, `meta.json`), each with sources.
3. **General Draft Logic**: reasoning without recent observed evidence (`logic`, `lib/evaluate.ts` rules).

- A pro pairing never becomes a saved default or alternative automatically. One pro game is not a "best pairing".
- Pro usage informs alan's defaults but never silently overwrites them. Ask before changing a saved-pairing field.
- Never delete valid pro evidence because it is not one of alan's saved picks. Pairings the workbook cites without a
  recorded draft stay, flagged `backedByGame: false`.
- Evidence sets are events in `meta.json` `events` (LCK 2026 playoffs on 16.16; Demacia Cup 2026 on 16.18, `ongoing`).
  Pro evidence shows event, patch and date, newest patch first (`lib/evidence.ts`). A current-meta event never edits saved
  pairings and stays off the Gen.G page (`tests/demacia-cup.test.ts`).
- Keep priority (pick/ban presence) separate from win rate, and mark small samples (`lowSample`, fewer than 5 picks).
- A low-sample champion can only be in a pool's `core` tier with a written `coreReasons` entry.
- Draft Room recommendations are ranked by overall draft fit (alan, 2026-10-10), in `lib/recommend.ts` and
  `tests/recommend.test.ts`. Every champion who plays the open role is a candidate. The score adds saved pairings
  (a strong bonus, never a filter), pairwise synergy with the locked picks, team needs (engage, frontline, peel,
  sustained damage, damage mix, a fight starter; weighted more the later the pick), matchups against the optional
  enemy picks (from champion attributes; there is no lane-matchup data), and risks (a new warning, or more holes than
  picks left). Every point comes with a written reason. Saved defaults must still lead an early draft (one pick
  locked). **Pro evidence never adds to the score**; it is shown beside a recommendation and in the separate Pro
  Pairings panel. A saved `botShapes` entry needs a bot whose record lists the support.
- **Counters** are a fourth, separate signal (`lib/counters.ts`, `data/counters.json`, `tests/counters.test.ts`): favourable
  into the enemy lane opponent (enemy roles detected from `?vs=`, or `?vs=top:aatrox`). Pro evidence first (same role,
  opposite sides, recorded winner in `proResults`, at least 3 games, newer patches weigh more), DPM.LOL rows only as the
  fallback and always labelled DPM. Never scored, never merged into the other layers; pool tier first; each counter shows
  its overall draft-fit rank. dpm.lol is blocked from Claude's environments (2026-10-10): DPM rows come from alan as
  structured facts (`origin: "externally-provided"`). Never invent a counter or a game result.

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

## Locked saved pairings (enforced by `tests/locked-conclusions.test.ts`)

Change these only when alan explicitly says so, then update the test in the same commit.

- Corki → Nami. Alistar is observed only.
- Caitlyn → Bard / Karma.
- Sivir → Lulu. Karma is the observed playoff / tempo alternative; alternatives Karma, Bard, Rakan, Seraphine.
- Ezreal → Karma. Alternatives Seraphine, Bard, Milio, Neeko, Nautilus; never the default.
- Yunara → Lulu. Braum is the anti-dive option.
- Ziggs → Nautilus / Leona. No saved alternatives (no Bard, no Karma). Pyke and Camille are observed pro variants only.
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

- Gen.G black + gold design system (brand primitives `--gold`, `--charcoal`, etc. mapped to semantic tokens); every color, spacing, radius and type size is a token in `app/globals.css`
  (`:root[data-theme="light" | "dark"]`). Components use tokens only; don't add raw hex values in components.
- Gold (`--accent`) marks selection and importance. Each layer keeps its own treatment: Synergy = strongest (gold rule;
  CSS/class name `clash` is historical),
  Pro = teal evidence styling, Logic = neutral gray. Don't restyle one layer to look like another.
- Shared pieces live in `components/ui.tsx` (PageHeader, Panel, SourceBadge, ChampIcon, ChampionRow, DataTable,
  WarningBadge, Metric), `components/ChampionDrawer.tsx` (champion + role drawer, optional comp context; links in
  `lib/comp-links.ts`; data from `getDrawerData()`), `components/Sidebar.tsx` and `components/ThemeToggle.tsx`. UI font is alan's Adobe Fonts kit (Neue Haas Grotesk Text, Display for headings; `TYPEKIT_CSS` in `lib/site.ts`, Inter as fallback), JetBrains Mono (`--font-mono`) only for numbers. Champion icons are Data Dragon squares
  (`lib/champion-icons.ts`; patch resolved at build time in `next.config.ts`), loaded by the browser, with initials as
  the fallback. No champion images are stored in the repo.
- Each build writes `out/version.json` (commit SHA, `lib/build-id.mjs`); `components/UpdateNotice.tsx` polls it and offers a refresh after a new deploy.
- `scripts/smoke-pages.mjs` runs against the live Pages URL after every deploy (the `smoke` job in pages.yml).
- Warning severity (critical / caution) in the Draft Room is a display grouping only; the rules are in `lib/evaluate.ts`.

## Commit authorship

Every commit from every thread is authored and committed as alan, so GitHub credits his account:
`git -c user.name="adequate-alan" -c user.email="54249725+adequate-alan@users.noreply.github.com" commit ...`
(or set both with `git config` in the checkout first). This is the noreply address his existing merge commits already
use. Keep the required `Co-Authored-By: Claude ...` trailers; they don't affect his attribution. Never rewrite or
force-push existing history unless alan asks.

## Commands

`npm run dev` · `npm run typecheck` · `npm test` · `npm run build` (static export to `out/`)
