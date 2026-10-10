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

- A pro pairing never becomes a saved default. One pro game is not a "best pairing". Since alan's rule of 2026-10-10, a
  pro pairing (`observedProPairings`, not earlier-2026) that is not already a default or alternative becomes an
  alternative automatically: derived at load in `lib/pro-alternatives.ts`, never written to `data/`, listed in
  `proAlternatives` and noted "from pro games, not hand-saved" wherever alternatives show. It gets the alternative
  bonus and, for supports, the locked-bot eligibility like any alternative.
- Pro usage informs alan's defaults but never silently overwrites them. Ask before changing a saved-pairing field.
- Never delete valid pro evidence because it is not one of alan's saved picks. Pairings the workbook cites without a
  recorded draft stay, flagged `backedByGame: false`.
- Evidence sets are events in `meta.json` `events` (LCK 2026 playoffs on 16.16; Demacia Cup 2026 on 16.18, `ongoing`).
  Pro evidence shows event, patch and date, newest patch first (`lib/evidence.ts`). A current-meta event never edits saved
  pairings and stays off the Gen.G page (`tests/demacia-cup.test.ts`).
- Keep priority (pick/ban presence) separate from win rate, and mark small samples (`lowSample`, fewer than 5 picks).
- Tournament aggregates (`meta.json` stats: picks, bans, win rate, verified `rolePicks`; totals in `events[].games`) and
  recorded games (stored drafts and game pages, `proGames` in `lib/pool-stats.ts`) are two datasets (alan, 2026-10-10).
  Never compute one from the other. Presence = (picks + bans) / tournament games (`presenceOf`), never stored. Bans are
  champion-wide. Without an aggregate, picks / bans / presence / WR show "—". "Recorded" labels stored-game counts. Meta
  defaults to the newest tournament; "All tournaments" is explicit and names each row's tournament.
  Aggregates are Gol.gg's full tournament tables (`scripts/import-golgg-tournament.mjs`, LCK 41 games, Demacia 39 as of
  2026-10-10). They are champion-wide: a stat sits under a role only when its source names the role or a recorded game
  shows it (`EventStat.roles`), never from the roster; otherwise it is marked "all roles" (Pool, drawer) or listed only on
  the Meta ALL tab. Aggregates never create Synergy records or touch saved pairings.
- A low-sample champion can only be in a pool's `core` tier with a written `coreReasons` entry.
- Draft Room recommendations are ranked by overall draft fit (alan, 2026-10-10), in `lib/recommend.ts` and
  `tests/recommend.test.ts`. Every champion who plays the open role is a candidate. The score adds saved pairings
  (a strong bonus, not a filter, except that with a bot locked only that bot's saved supports, default or
  alternative, are recommended for SUPPORT: `savedSupports`, also used by Counters, which mark others theoretical; alan,
  2026-10-10), pairwise synergy with the locked picks, the open role's needs from the comp-analysis engine ("Fixes …",
  weighted by need priority and more the later the pick; one weakness scores once; tradeoffs cost a point; each row carries
  fixes / also / tradeoffs and one `bestFix`, shown apart from best overall), matchups against the optional
  enemy picks (from champion attributes; there is no lane-matchup data), and risks (a new warning, or more holes than
  picks left). Every point comes with a written reason. Saved defaults must still lead an early draft (one pick
  locked). **Pro evidence never adds to the score** (a pro-derived alternative scores only as an alternative); it is shown beside a recommendation and in the separate Pro
  Pairings panel. A saved `botShapes` entry needs a bot whose record lists the support.
- **Counters** are a fourth, separate signal (`lib/counters.ts`, `data/counters.json`, `tests/counters.test.ts`): favourable
  into the enemy lane opponent (enemy roles detected from `?vs=`, or `?vs=top:aatrox`). DPM.LOL matchup rows are the
  counter signal (alan, 2026-10-10); no DPM row, no counter. Recorded pro games only corroborate: same role on opposite
  sides, a recorded winner in `proResults`, at least 3 games, patch-weighted. Agreement lifts the strength one step
  (favorable → strong → confirmed); disagreement keeps DPM as the signal and shows the pro sample separately, never
  averaged. Never infer a counter from pro win/loss alone. Never scored, never merged into the other layers; pool tier
  first; each counter shows its overall draft-fit rank. DPM rows come from alan as structured facts
  (`origin: "externally-provided"`); dpm.lol answers Claude's environments with a Cloudflare challenge. Never invent a
  counter or a game result.

- **Roster**: `data/champions.json` holds every champion in Riot's Data Dragon. Champions added by
  `scripts/sync-champions.mjs` (run by `.github/workflows/sync-champions.yml`; Data Dragon is unreachable from Claude's
  environments) are `rosterOnly: true` with every attribute 0: lockable, searchable and usable as enemies, never
  recommended, never in the pool. Reviewing one means setting its attributes and removing `rosterOnly`. Never type a
  roster from memory. On 2026-10-10 every roster-only champion except Zaahen got attributes and a v2 kit
  (`lib/model-v2/kits.ts`, unreviewed by alan); Zaahen and Locke wait for a kit review.

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

- Corki → Nami. Alistar is a pro-derived alternative only.
- Caitlyn → Bard / Karma.
- Sivir → Lulu. Karma is the observed playoff / tempo alternative; alternatives Karma, Bard, Rakan, Seraphine.
- Ezreal → Karma. Alternatives Seraphine, Bard, Milio, Neeko, Nautilus; never the default.
- Yunara → Lulu. Braum is the anti-dive option.
- Ziggs → Nautilus / Leona preferred; Camille and Alistar are saved alternatives (alan, 2026-10-10). No Bard, no Karma.
  Pyke is a pro-derived alternative only; Camille's LCK game stays Pro Evidence beside her saved alternative.
  General Draft Logic: "Ziggs needs reliable engage or catch somewhere else in the composition if support is not providing it."
- Xayah → Rakan. Kalista → Renata. Zeri → Yuumi.
- Viktor also plays BOT (alan, 2026-10-10): Leona + Nautilus joint preferred, Camille an alternative; his MID record is separate.
- Mel → Alistar / Pyke / Leona (preferred), alternatives Karma, Bard, Neeko, Nautilus (alan, 2026-10-10).
- Kai'Sa → Nautilus + Rakan, Aphelios → Thresh + Lulu: joint preferred, no alternatives (alan, 2026-10-10). Kai'Sa + Rell
  is not saved. Every BOT pool champion has a record (`tests/locked-conclusions.test.ts`).
- Joint preferred supports for bots outside the pool (alan, 2026-10-10; Synergy preferences, not Pro Evidence): Draven,
  Samira, Tristana → Nautilus + Rell; Kog'Maw → Lulu + Milio + Braum; Smolder, Vayne → Lulu + Milio; Nilah → Rakan + Seraphine; Senna → Tahm
  Kench + Seraphine; Swain → Nautilus + Leona (Seraphine a plain alternative); Twitch → Lulu + Yuumi; Varus → Karma +
  Nautilus; Yasuo → Rell + Alistar.
- Ahri ↔ Vi are each other's primary. Yone (mid) ↔ Maokai and Yone ↔ Sejuani are saved pairs, both ways. LeBlanc ↔ Lee Sin is saved (LeBlanc a
  secondary mid for Lee Sin; Lee Sin LeBlanc's only partner).
- Every MID / JUNGLE / TOP pool champion has a record (alan, 2026-10-10): Poppy → Orianna + Syndra; Vex → Jarvan IV +
  Sejuani; top flex blind grades Dr. Mundo B, Gragas B, Galio B-, Jax B-, Varus C+, Fiora C+, Anivia C.
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

- Gen.G ivory + champagne gold + black design system (alan, 2026-10-10: no navy; light mode is the strongest Gen.G look,
  dark mode is warm near-black; primitives `--ivory`, `--champagne`, `--black`, etc. mapped to semantic tokens; role
  colors only in the small role marker; Pro evidence a muted gray-teal); every color, spacing, radius and type size is a token in `app/globals.css`
  (`:root[data-theme="light" | "dark"]`). Components use tokens only; don't add raw hex values in components.
- Gold (`--accent`) marks selection and importance. Each layer keeps its own treatment: Synergy = strongest (gold rule;
  CSS/class name `clash` is historical),
  Pro = muted gray-teal evidence styling, Logic = neutral gray. Don't restyle one layer to look like another.
- Shared pieces live in `components/ui.tsx` (PageHeader, Panel, SourceBadge, ChampIcon, ChampionRow, DataTable,
  WarningBadge, Metric), `components/ChampionDrawer.tsx` (champion + role drawer, optional comp context; links in
  `lib/comp-links.ts`; data from `getDrawerData()`), `components/ChampionInteraction.tsx` (ChampionProvider + ChampionHoverCard; `InteractiveChampion`
  in `components/InteractiveChampion.tsx` makes Chip/Duo hover-for-card, click-for-drawer inside a provider; zero layout
  shift: no scale, no border-width or padding change on hover), `components/Select.tsx` (the one dropdown for every filter menu; no native `<select>`, no per-page dropdown styles; the Draft Room champion picker is separate), `components/Sidebar.tsx` and `components/ThemeToggle.tsx`. Type (alan, 2026-10-10): Space Grotesk (`--font-display`; titles, nav, tabs, buttons, labels, champion names; OFL, self-hosted from `assets/fonts` via `next/font/local` in `app/layout.tsx`), Inter (`--font`) for body copy, JetBrains Mono (`--font-mono`) only for numbers. No font CDN (the Adobe Fonts kit was removed). Champion icons are Data Dragon squares
  (`lib/champion-icons.ts`; patch resolved at build time in `next.config.ts`), loaded by the browser, with initials as
  the fallback. No champion images are stored in the repo.
- GenRang (Gen.G's mascot, alan 2026-10-10) is a brand accent only: sidebar foot, Gen.G page header, Draft Room empty
  state. `components/GenRang.tsx` imports `assets/genrang*.webp` (cropped from Gen.G's artwork: figure only, never the
  sponsor logos). The footer credits Riot and Gen.G; keep both lines.
- Each build writes `out/version.json` (commit SHA, `lib/build-id.mjs`); `components/UpdateNotice.tsx` polls it and offers a refresh after a new deploy.
- `scripts/smoke-pages.mjs` runs against the live Pages URL after every deploy (the `smoke` job in pages.yml).
- Warning severity (critical / caution) in the Draft Room is a display grouping only; the rules are in `lib/evaluate.ts`.
- Comp Check (`components/CompCheck.tsx`) shows the comp-analysis engine (`lib/model-v2/analyze.ts`, `tests/comp-analysis.test.ts`):
  identity, win condition, ranked weak points, role needs with best fix vs best overall, timing, and the compact grid.
  Siege (`siegeOf`, alan 2026-10-10) is its own metric, not Poke: structure pressure first, then range, waveclear,
  poke and disengage; it feeds the Poke / siege identity.

## Commit authorship

Every commit from every thread is authored and committed as alan, so GitHub credits his account:
`git -c user.name="adequate-alan" -c user.email="54249725+adequate-alan@users.noreply.github.com" commit ...`
(or set both with `git config` in the checkout first). This is the noreply address his existing merge commits already
use. Keep the required `Co-Authored-By: Claude ...` trailers; they don't affect his attribution. Never rewrite or
force-push existing history unless alan asks.

## Commands

`npm run dev` · `npm run typecheck` · `npm test` · `npm run build` (static export to `out/`)
