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
- Evidence sets are events in `meta.json` `events` (LCK 2026 playoffs on 16.16, archive; Demacia Cup 2026 on 16.18 and
  Worlds 2026 once listed, refreshed daily, see below).
  Pro evidence shows event, patch and date, newest patch first (`lib/evidence.ts`). A current-meta event never edits saved
  pairings and stays off the Gen.G page (`tests/demacia-cup.test.ts`).
- Keep priority (pick/ban presence) separate from win rate, and mark small samples (`lowSample`, fewer than 5 picks).
- Tournament aggregates (`meta.json` stats: picks, bans, win rate, verified `rolePicks`; totals in `events[].games`) and
  recorded games (stored drafts and game pages, `proGames` in `lib/pool-stats.ts`) are two datasets (alan, 2026-10-10).
  Never compute one from the other. Presence = (picks + bans) / tournament games (`presenceOf`), never stored. Bans are
  champion-wide. Without an aggregate, picks / bans / presence / WR show "—". "Recorded" labels stored-game counts. Meta
  is scoped by patch (Pro Priority below): newest patch by default, "All patches" explicit; the tournament filter
  defaults to all tournaments because the patch already keeps samples apart.
  Aggregates are Gol.gg's full tournament tables (`scripts/import-golgg-tournament.mjs`, LCK 41 games, Demacia 39 as of
  2026-10-10). They are champion-wide: a stat sits under a role only when its source names the role or a recorded game
  shows it (`EventStat.roles`), never from the roster; otherwise it is marked "all roles" (Pool, drawer) or listed only on
  the Meta ALL tab. Aggregates never create Synergy records or touch saved pairings.
- **Pro Priority** (alan, 2026-10-12; `lib/pro-priority.ts`, `components/ProPriority.tsx`, `tests/pro-priority.test.ts`):
  the main Meta / Research view. Per patch, never combined by default: picks, bans, presence, pick / ban / win rate,
  role picks, blue / red picks, latest game, first rotation; role tabs All | Top | Jungle | Mid | Bot | Support with
  champion-wide bans and presence marked "all"; Priority changes against the previous patch with 10+ games, in
  percentage points (absent = 0%, small samples flagged). Denominator = unique games on the patch; presence and ban
  rate only over games with all ten bans recorded. A tournament counts from its game records only when every game is
  recorded; otherwise from its Gol.gg table only when the whole tournament was one patch (no sides, dates or order);
  otherwise it is withheld and named in the coverage line. Pick order is each team's order as the Gol.gg game page lists
  it (`pickOrder`, stored by the daily refresh, backfilled once per game), never rebuilt from the lineup; first rotation
  = B1, R1, R2. Patches show Riot's 26.xx (`patchLabel`; data keeps Gol.gg's 16.xx). Shown in the champion drawer
  (history chart, per-patch table) and as a "Pro priority · N%" label in the Draft Room when presence ≥ 30% on the
  newest patch and the champion has picks in that role: a label and a filter only, never a score, never an order.
- A low-sample champion can only be in a pool's `core` tier with a written `coreReasons` entry.
- The draft-fit score (alan, 2026-10-10) lives in `lib/recommend.ts` and
  `tests/recommend.test.ts`. Every champion who plays the open role is a candidate. The score adds saved pairings
  (a strong bonus, not a filter, except that with a bot locked only that bot's saved supports, default or
  alternative, are recommended for SUPPORT: `savedSupports`, also used by Counters, which mark others theoretical; alan,
  2026-10-10), pairwise synergy with the locked picks, the open role's needs from the comp-analysis engine ("Fixes …",
  weighted by need priority and more the later the pick; one weakness scores once; tradeoffs cost a point; each row carries
  fixes / also / tradeoffs and one `bestFix`, shown apart from best overall), matchups against the optional
  enemy picks (from champion attributes; there is no lane-matchup data), and risks (a new warning, or more holes than
  picks left). Every point comes with a written reason. Saved defaults must still lead an early draft (one pick
  locked). **Pro evidence never adds to the score** (a pro-derived alternative scores only as an alternative); it is a Pro
  label on the candidate row. A saved `botShapes` entry needs a bot whose record lists the support.
- **One candidate list per open role** (alan, 2026-10-11; `lib/candidates.ts`, `tests/unified-candidates.test.ts`): the
  Draft Room shows each champion once with independent labels: Synergy (saved or proposed), Pro (games next to a locked
  pick, with count), Best fit / Best fix, Counter. There is no separate Pro Pairings or Counters list. A champion
  qualifies through any one signal; a Pro-only candidate gets the same full row, never a Synergy label, and never
  changes a saved record. Order: alan's preferred saved pairing first, then comp fit (draft fit without the saved and
  proposed bonuses), ties by number of signals. Pro game counts and counters never move a row. With a saved bot locked,
  a support outside its saved supports comes in only through games with that bot (counting only those), gets no
  Synergy, Best fit or Best fix, and one with only a counter is "Theoretical" and listed last. Filters All / Synergy /
  Pro / Best fit / Counters filter that one list.
- **Synergy · Proposed** (alan, 2026-10-10, "Complete Champion Synergy Expansion"): `data/proposed-synergy.json` holds
  Claude's kit-based partners for every playable champion and role (preferred / alternatives, a specific reason and a
  kit-fit confidence `strong` / `moderate` / `provisional` per partner). It sits inside Synergy but apart from alan's
  Confirmed records: labelled "Proposed · kit-based" with dashed styling, never a saved default or alternative, never in
  `savedSupports`, a draft-fit bonus below any saved link (`lib/recommend.ts` `proposedParts`), and a pair alan confirmed
  (or a pro-derived alternative) is dropped at load (`lib/proposed.ts` `withoutConfirmed`). A saved bot's profile never
  lists proposed supports (`shownPartners`). Confidence is about the kit fit; pro games show beside a proposal, never raise
  it. Promoting a proposal to Confirmed means alan says so and it moves into the saved record files.
  `tests/proposed-synergy.test.ts` holds coverage and separation.
- **Counters** are a fourth, separate signal (`lib/counters.ts`, `data/counters.json`, `tests/counters.test.ts`): favourable
  into the enemy lane opponent (enemy roles detected from `?vs=`, or `?vs=top:aatrox`). DPM.LOL matchup rows are the
  counter signal (alan, 2026-10-10); no DPM row, no counter. Recorded pro games only corroborate: same role on opposite
  sides, a recorded winner in `proResults`, at least 3 games, patch-weighted. Agreement lifts the strength one step
  (favorable → strong → confirmed); disagreement keeps DPM as the signal and shows the pro sample separately, never
  averaged. Never infer a counter from pro win/loss alone. Never scored, never merged into the other layers; a Counter
  label on the candidate row, with pool tier and draft-fit rank in the row detail. DPM rows come from alan as structured facts
  (`origin: "externally-provided"`); dpm.lol answers Claude's environments with a Cloudflare challenge. Never invent a
  counter or a game result.

- **Roster**: `data/champions.json` holds every champion in Riot's Data Dragon. Champions added by
  `scripts/sync-champions.mjs` (run by `.github/workflows/sync-champions.yml`; Data Dragon is unreachable from Claude's
  environments) are `rosterOnly: true` with every attribute 0: lockable, searchable and usable as enemies, never
  recommended, never in the pool. Reviewing one means setting its attributes and removing `rosterOnly`. Never type a
  roster from memory. On 2026-10-10 every roster-only champion except Zaahen got attributes and a v2 kit
  (`lib/model-v2/kits.ts`, unreviewed by alan); Zaahen and Locke wait for a kit review. Role audit (2026-10-10): Talon
  also MID, Ziggs also MID, Jayce also MID.

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

## Daily pro-data refresh (alan, 2026-10-11)

- `.github/workflows/refresh-pro-data.yml` runs daily at 8 AM Eastern (cron 12:00 and 13:00 UTC, a gate keeps the one
  matching New York's offset) and on `workflow_dispatch`. It reads Gol.gg with plain requests from the GitHub runner
  (it answers there; robots.txt allows these pages) and stops, writing nothing, on any refusal or challenge. Never bypass one.
- Only the tournaments in `data/pro-games.json` `tracked` are requested, by exact Gol.gg name: Demacia Cup Global
  Invitational 2026 and Worlds 2026 (main event and play-in names). The LCK playoffs are a frozen archive. Adding a
  tournament (2027 or any other) needs alan's approval. A tournament marked `complete` is not requested again.
- `data/pro-games.json` is the one game-level dataset (Gol.gg game id is the key; sides, winner, picks by role from the
  full-stats page, bans, patch, date, URL). `lib/pro-games.ts` derives drafts, sources and results at load. Games that
  miss a field or contradict their series are rejected and reported as run warnings, never filled in.
- Tournament totals are replaced only when the champion table sums to 10 picks per match-list game and, with every game
  recorded, agrees champion by champion; then `rolePicks` comes from the game pages. Never across patches.
- The updater writes only `pro-games.json`, `meta.json`, `sources.json`, `pro-builds.json` and `build-assets.json`; imported games add no pro-derived
  alternatives (alan: new pro pairings stay Pro Evidence). It commits as adequate-alan only when verified data changed,
  after test/typecheck/build, then starts `pages.yml`. A supplied game link becomes verified only when its game shows the claim.
- Tests that check fixed Demacia numbers are scoped to the known events; new imports must never be able to break them.

## Pro Builds (alan, 2026-10-12)

- Items, runes, summoner spells and skill order from recorded games, in the shared champion drawer
  (`components/ProBuilds.tsx`, so every page that opens a champion has it; tabs Builds | Runes | Skills | Games, a game
  strip to switch players, filters for tournament, patch, team and player). Observed Pro Evidence only: it never scores
  and never touches saved pairings, rankings, Comp Check or pool tiers.
- `data/pro-builds.json`: one record per player per game (Gol.gg game id, side, role, player and Gol.gg player id,
  spells, final inventory slots, rune page, `skills` as one letter per ability point, purchase log `[seconds, item, buy|sell]`,
  `missing` for anything Gol.gg did not give). Read by the daily refresh from the game page (player ids) and Gol.gg's
  build answer (`POST /game/ajax.build.php`, the request the Builds tab makes; not disallowed by robots.txt), at most 45
  games a run (`scripts/golgg/builds.mjs`). A game with no builds yet goes in `unavailable` and is asked again after 3 days.
- `data/build-assets.json`: names, icons, item stats and ability max ranks per game patch, from that patch's Data Dragon
  files (CommunityDragon for stat shard names), only for ids the builds use; ids a patch does not name are `unnamed`.
  Icons load from Data Dragon's CDN at the game's version, like champion icons; nothing is stored in the repo.
- One game shows exactly that player's setup; Start / Boots / Core / Later are read in order from its purchase log and
  labelled as such; Final is the end-of-game inventory, never the purchase history. "Common" counts games in the chosen
  scope (keystones, items, boots, max orders, spell pairs) and names the scope; it is never one player's build and never
  "optimal". The skill grid shows only recorded levels; max order uses Data Dragon max ranks.
- The data loads as its own browser chunk when a drawer opens (`lib/pro-builds-bundle.ts`), not in every page.
  `tests/pro-builds.test.ts` holds parsing, mapping, integrity and the refresh step.

## Patch Notes (alan, 2026-10-12)

- `/patch-notes/` (sidebar "Patch Notes", under Meta / Research): Riot's official League of Legends patch notes from
  26.16 on, Summoner's Rift drafting content only (champions, items, runes, systems, mid-patch updates, gameplay bug
  fixes). TFT, ARAM / ARAM Mayhem, Arena, League Classic, skins, events, esports and client sections stay out and are
  listed per patch (`excluded`). Latest patch by default, prev / next, search, kind and champion filters (a champion
  shows its whole history), Compare patches (changes after `from` through `to`) and "What's changed since 26.16?".
- `data/patch-notes.json` (`PatchNotes` in `lib/schema.ts`) holds Riot's facts only: every line keeps Riot's full
  `text` and the exact `before` / `after` around its "⇒"; a value Riot didn't write is left out, never filled in or
  computed. Riot's reason is `context`. Champion buff / nerf / adjustment / rework follows Riot's stated intent:
  `categoryBasis: "reviewed"` once a person checked it (26.16–26.20 on 2026-10-12), `"riot-wording"` when the daily
  check classified it from first-person wording (unclear wording stays "adjustment").
- **One patch, two spellings**: Riot writes 26.16, the client / Data Dragon / Gol.gg write 16.16. `lib/patch.ts`
  (`parsePatch`, `patchKey`, `comparePatch`, `samePatch`, `shortPatch`) is the one normalizer; the site shows Riot's
  label. Pro data keeps its own spelling.
- Draft implications (`lib/patch-implications.ts`) are analysis, labelled as such and folded under each champion
  change, apart from Riot's facts: saved pairings, pool tiers, recorded pro games before / after the patch and tournament
  presence by event patch. **A patch never changes saved pairings, pool tiers, recommendations or any score.**
- Shared lookups (`lib/patch-changes.ts`, compact index `getPatchIndex()`, also `DrawerData.patches`): `changesFor`,
  `changedSince`, `patchHref`. The champion drawer's "Patch changes" block and the hover card's latest-patch line use
  them; `components/ChangedSince.tsx` (`ChangedSince`, `PatchTag`) is the "Changed since this game" control for Pro
  Builds. It never calls an old build current or optimal.
- Daily check: `.github/workflows/refresh-patch-notes.yml`, 8:30 AM Eastern (same offset gate as the pro refresh) and
  `workflow_dispatch` (dry run, force). `scripts/refresh-patch-notes.mjs` reads Riot's patch-notes tag page and each
  tracked patch page from the runner (leagueoflegends.com is unreachable from Claude's environments; robots.txt allows
  it), re-reads a patch only when it is new or its article revision changed, and writes `data/patch-notes.json` only
  when Summoner's Rift facts changed (an edited entry gets `corrected: true`). It stops on any refusal or challenge and
  never removes an archived patch. Commits as adequate-alan after test / typecheck / build, then starts `pages.yml`.
  Parser fixtures: `tests/fixtures/riot`, tests: `tests/patch-notes.test.ts`.

## Weekly Comp Library discovery (alan, 2026-10-12)

- `.github/workflows/discover-comps.yml` runs Sundays at 9 AM Eastern (cron 13:00 and 14:00 UTC, same New York gate as
  the daily refresh) and on `workflow_dispatch`. It downloads nothing: `scripts/discover-comps.ts` reads the lineups the
  daily refresh stored for the tracked tournaments (`data/pro-games.json`), runs `lib/comp-discovery.ts` and writes only
  `data/discovered-comps.json` and `reports/comp-discovery.md`, committing (after test/typecheck/build) only when the
  library data changed, then starting `pages.yml`. The report is also the run summary and an artifact.
- Deterministic and idempotent, no model calls; every threshold is in `DISCOVERY`. Each lineup joins the closest
  observed shell or discovered comp: five same champions = existing (a replay), same primary identity with 3+ shared
  champions, or same primary + secondary with 4+ roles doing the same job and 2+ shared champions = an observed
  variation, otherwise a new group. Templates never take observed lineups. A new group becomes an Observed Pro Comp only
  when the comp check reads all five champions (Locke / Zaahen lineups go to the report), finds an identity and no major
  weak point, the identities don't clash, and it has 2+ games from 2+ teams or a primary identity no observed library
  comp has. Everything else is "Proposed comps for review" in the report. Win/loss never decides. Additions are sticky
  (a comp that later fails is listed in the report, never removed).
- Discovered comps render as Pro cards in Comp Library (`lib/comp-library.ts`); their identity, jobs, win condition,
  strengths, weak points and difficulty are the comp check's read (General Draft Logic, labelled "Comp check read" in
  Details). Observed variations of any comp sit behind "N observed variations". The page shows "Library reviewed" (last
  successful run, GitHub's public Actions API) and "Last addition" (stored `lastAddition`). Never hand-edit
  `discovered-comps.json`; tests in `tests/comp-discovery.test.ts`.

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
- Kai'Sa → Nautilus + Rakan joint preferred, Alistar an alternative; Aphelios → Thresh + Lulu joint preferred, Milio an
  alternative (alan, 2026-10-10). Kai'Sa + Rell is not saved. Every BOT pool champion has a record (`tests/locked-conclusions.test.ts`).
- Joint preferred supports for bots outside the pool (alan, 2026-10-10; Synergy preferences, not Pro Evidence): Draven,
  Samira, Tristana → Nautilus + Rell; Kog'Maw → Lulu + Milio + Braum; Smolder, Vayne → Lulu + Milio; Nilah → Rakan + Seraphine; Senna → Tahm
  Kench + Seraphine; Swain → Nautilus + Leona (Seraphine a plain alternative); Twitch → Lulu + Yuumi; Varus → Karma +
  Nautilus; Yasuo → Rell + Alistar.
- Ahri ↔ Vi are each other's primary. Yone (mid) ↔ Maokai and Yone ↔ Sejuani are saved pairs, both ways. LeBlanc ↔ Lee Sin is saved (LeBlanc a
  secondary mid for Lee Sin; Lee Sin LeBlanc's only partner).
- Every MID / JUNGLE / TOP pool champion has a record (alan, 2026-10-10): Poppy → Orianna + Syndra; Vex → Jarvan IV +
  Sejuani; top flex blind grades Dr. Mundo B, Gragas B, Galio B-, Jax B-, Varus C+, Fiora C+, Anivia C.
- One saved alternative for each record that had none (alan, 2026-10-10; `SAVED_ALTERNATIVES` in the locked test):
  Draven, Samira → Alistar; Kog'Maw → Tahm Kench; Nilah → Rell; Senna, Smolder → Karma; Tristana → Lulu; Twitch →
  Milio; Varus → Bard; Vayne → Braum; Yasuo → Nautilus. Yone → Wukong; Maokai, Wukong → Orianna; Sejuani, Trundle →
  Syndra; LeBlanc, Sylas → Jarvan IV; Aatrox → Ahri; Xin Zhao → Yasuo; Twisted Fate → Nocturne; Poppy → Viktor; Vex → Vi.
- Skarner + Locke is the current pairing. Azir + Skarner is an earlier-2026 tendency only, never the current Gen.G default.

## User-facing copy

- The site never names Claude, AI or how a recommendation was produced (alan, 2026-10-10). Vocabulary: **Saved
  synergy** (alan's confirmed preferences), **Proposed synergy** (unconfirmed kit-based recommendations), **Pro pairing**
  (supported by recorded professional games). Confidence and source distinctions stay. Attribution belongs in code
  comments, internal data notes and docs only. Follow-up alan floated: shorten the "Proposed · kit-based" badge to
  "Proposed", with the tooltip carrying the distinction.

## Design review with Impeccable (alan, 2026-10-11)

Impeccable (github.com/pbakaus/impeccable) is the design-review method for frontend work. Audit finds what is
inconsistent, critique finds what is ineffective, polish improves what already works.

- **Check availability first.** Only invoke an Impeccable command after verifying it is available in the current
  environment. If it is not, say so plainly; never substitute a generic review and call it Impeccable. Claude's cloud
  environments can't reach the npm registry, so `npx impeccable install` and the plugin route fail there; clone the
  GitHub repo and run its bundled launcher (`plugin/skills/impeccable/scripts/impeccable context|detect`) and reference
  files instead, and state that route in the report. Nothing from Impeccable is committed to this repo except `PRODUCT.md` at the root (product facts from `/impeccable init`, alan 2026-10-11: audience, purpose, constraints, WCAG 2.2 AA target; no visual rules), which the launcher loads for every audit, critique and polish.
- **`/impeccable audit`** (technical assessment): use when evaluating an existing page, introducing major UI changes or
  hunting inconsistencies across components. Covers spacing, typography, alignment, responsiveness, accessibility and
  design-system consistency. Run before significant redesigns and after substantial frontend changes to catch
  regressions. Not for minor text edits, data updates or backend-only changes.
- **`/impeccable critique`** (design and usability): use when judging whether a layout communicates and supports the
  drafting workflow: hierarchy, density, navigation, readability, usability. Run when adding pages, restructuring
  layouts or choosing between competing approaches. Focus on whether the design works, not only whether it looks polished.
- **`/impeccable polish`** (targeted refinement): after functionality and layout are settled. Refine spacing, type,
  color, borders, alignment and interaction states selectively; preserve the design language and density.
- **Workflow for major frontend changes:** audit → critique where layout or hierarchy is in question → structural or
  functional changes → polish → validate against this design system and run the tests (unit, typecheck, build, smoke,
  screenshots in both themes at desktop, tablet and phone). The commands are complementary, not mandatory for every task.
- **Principles:** never redesign whole pages without clear justification; consistency, readability, density and
  usability before decoration; preserve branding, functionality and architecture; no unnecessary whitespace, animation,
  gradients or visual complexity; weigh each finding against what the site is for instead of implementing every
  recommendation.

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

- **Don't make pages busier with each feature** (alan, 2026-10-11). New data should make existing elements more useful
  through hover (ChampionHoverCard), expansion (`components/Disclosure.tsx`, row detail) or the drawer, not a new
  permanent panel. Explanatory footnotes, method notes and research sections go behind a Disclosure.
  Folding must not hide evidence a drafting decision rests on: a recommendation's reasons, its pro evidence and
  counters, warnings and Comp Check stay visible; a collapsed section always shows its count in the summary.
- **The 2026-10-11 design is the baseline** (alan, PR #59). No broad redesigns and no changes for visual novelty.
  Before a UI change, say how it helps a drafter (usability, density, consistency, clarity); if it doesn't, skip it.
  Use Impeccable audit / critique / polish for targeted refinements (see above). Data, calculations and features stay.
- Design system (2026-10-11 cleanup): `app/globals.css` is one consolidated file (tokens → base → shell → type →
  primitives → interaction → pages → motion). Extend a primitive before adding page CSS; no inline `style` for spacing.
  Uppercase only for page titles (h1) and role codes; every other label shares the sentence-case `.label` style. Source
  links carry their refresh status in the tooltip; only a pending external claim is marked inline ("· pending").
  Every page that shows champions wraps them in `ChampionProvider`, so hover card, drawer and mobile sheet match.
  Contrast (Impeccable pass, 2026-10-12): every text token, `--text-faint` included, is at least 4.5:1 on the page
  surfaces in both themes, and the light focus ring is deep champagne (3:1 minimum); express a quieter state with a token
  colour, never by stacking opacity on faint text. On phones each team row fits 390px without scrolling (the slot being
  picked fills the row) and every locked slot keeps its own Change button.
  Risk tags use the caution amber; oxblood is enemy and Counters only. No eyebrow labels, hero-metric strips or side
  stripes thicker than 1px (Impeccable craft floor), except the Pro Drafts draft-side strip below.
- **Pro Drafts side strips** (alan, 2026-10-11): each row has a 3px strip on its far left, `--team-blue` / `--team-red`
  for the side recorded for that game (`ProDraft.side`, from the Gol.gg game page via `data/pro-games.json`; stored LCK
  drafts inherit it from their game source's `sides`, backfilled once on 2026-10-11 by `scripts/backfill-lck-sides.mjs`,
  which is not part of the daily refresh), neutral `--border-strong` when no side is recorded, with the side named on hover. The side comes from
  each game, never from team identity, listing order or which team is named first (`lib/draft-side.ts`,
  `tests/pro-sides.test.ts`); filters keep each row's side. Both sides of a game pair blue first.
- **Champion Synergies** (`/synergies/<tab>/`, sidebar "Synergies"; alan renamed it from First Pick on 2026-10-10) is
  the champion synergy and pairing reference: rail, role tabs, saved / proposed partners, pro pairings, "Open in Draft
  Room". One tab per role, Top | Jungle | Mid | Bot | Support (alan, 2026-10-12; `components/views/synergy-tabs.ts`,
  `tests/synergy-tabs.test.ts`); each role's records stay on their own tab. Top and Support also list the Comp Library
  shells that hold the pick (folded). Old `/first-pick/…` URLs forward there with their query, and the retired
  `/synergies/mid-jungle/` forwards to Mid or Jungle by `?role=` or the champion (`components/Forward.tsx`). The name **First Pick** is
  reserved for a future blind-pick feature (blind-pick safety, counterpick vulnerability, flexibility, draft priority);
  don't reuse it for synergy content.
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
- **Popovers and tooltips** (alan, 2026-10-11): one foundation, `components/Popover.tsx`. Every hint, hover card and
  popover uses the `.popover` surface (tokens only, both themes) and its placement (fixed portal, flips to stay in the
  viewport, caps its height and scrolls inside, zero layout shift). Plain-text hints stay `title="…"` in markup;
  `components/TipLayer.tsx` (mounted once in the app layout) renders them in the themed `.popover.tip`, on hover, keyboard
  focus or a tap on plain text. Anything richer or with links is a `<Popover>`: hover opens, the pointer can move in,
  click pins, Enter pins and moves focus in, Escape closes and returns focus, touch opens a bottom sheet. ChampionHoverCard
  shares the surface and placement. Draft Room uses it for the Pro evidence card (`components/EvidenceCards.tsx`,
  `lib/pro-evidence.ts`, `tests/pro-evidence.test.ts`: each counted game newest first, teams, side, result, both drafts
  only when recorded; current enemy picks on the other team are an observed matchup, never a counter; pick order is not
  recorded, so no game is shown as a response), the Counter card and the comp-fit breakdown. Don't build page-specific
  tooltips.
- **Phone Comp Check line** (alan, 2026-10-12): below 1180px the Draft Room shows one line under the board and in the
  pinned mini board (`CompSummaryLine`, `lib/comp-summary.ts`, `tests/comp-summary.test.ts`): the open role's top needs
  and the worst non-minor weak point, "No major weak points" when clean, "Early read" with two picks, nothing actionable
  before that. Never a score; a tap jumps to the full Comp Check.
- **Meta / Research folding** (alan, 2026-10-12): Pro priority, its filters and the Tournaments table stay open; Tournament
  comparison, both pairing tables, Recent drafts and Research notes are folded section Disclosures with counts.
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
