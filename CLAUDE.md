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
  = each team's first three picks, six per game, before the second ban phase (alan, 2026-10-13, site-wide; Top draft
  usage and Draft Room starting picks use the same definition); first pick, second rotation and last pick read the
  first-picking team per game (`firstPick`, not always blue since 2026). The order read ("usually picked early / late") is descriptive: `ORDER_READ` in
  `lib/pro-priority.ts` (5 ordered picks, early ≥ 80% first rotation, late ≥ 60% second), always shown with its fraction
  (`orderText`, "8/10 first rotation (80%)"), and never a blind-safety, counter or meta-priority claim. Patches show Riot's 26.xx (`patchLabel`; data keeps Gol.gg's 16.xx). Shown in the champion drawer
  (history chart, per-patch table) and as a "Pro priority · N%" label in the Draft Room when presence ≥ 30% on the
  newest patch and the champion has picks in that role: a label and a filter only, never a score, never an order.
- **Top draft usage** (alan, 2026-10-13; `lib/top-draft.ts`, `lib/top-blind.ts`, `components/TopDraft.tsx`,
  `components/TopRail.tsx`, `tests/top-draft.test.ts`, smoke "top:"): when pros picked each top laner. Since 2026 the
  first-picking team is not always blue: each game stores `firstPick`, the side Gol.gg marks "First Pick" (`firstPickOf`:
  exactly one side marked, and turns, when drawn, 1 | 2 | 2 against the other side's 2 | 2 | 1), read by the daily refresh
  and backfilled once (`scripts/backfill-first-pick.mjs`, Demacia and the LCK archive records in `pro-builds.json`
  `games`, which this analysis reads). Some pages draw no turns and list picks in role order (the Demacia semifinals,
  Cloud9 vs KC G2): the mark still counts (alan, 2026-10-16) but no `pickOrder` is stored (`turnsDrawn`), so those games
  show who picked first and stay out of every turn-based read. Draft order F1 S1 S2 F2 F3 S3 | bans | S4 F4 F5 S5 (`turnOf`); never inferred
  from side, winner or lineup. Each top selection is blind (enemy top not yet picked), response (picked, and every other
  role it plays visibly filled by a one-role champion) or uncertain. A response is never a counter: "repeated" needs two
  series, "supported counter" a DPM row clearing the counter thresholds; win / loss never decides. Labels need 3
  classified games, small sample under 5. Fearless eligibility only when every earlier game of the series is recorded.
  Default scope is the newest patch with 10+ classified selections. The saved `blindGrade` stays alan's and shows beside
  observed usage (disagreement is shown, never resolved); the kit read (`blindRead`) is General Draft Logic. Synergies
  Top tab: rail filters All | Blind | Response | Both | Meta priority, patch, tournament and sort in the URL; report tabs
  Overview | Draft usage | Matchups | Synergies | Pro evidence (`?view=`); a matchup opens its game in place (who picked
  first, ten picks in order, Pro Drafts and both tops' builds). Draft Room TOP rows get a label and a detail line only
  ("Often blinded" with no enemy top, "Picked into X · n" with one); never part of the order or the fit.
- **Mid, Bot and Support draft usage** (alan, 2026-10-13; the same engine, `laneSelections` / `duoSelections` in
  `lib/top-draft.ts`, `getLaneDraft(role)` in `lib/data.ts`, `tests/lane-draft.test.ts`, smoke "mid:" / "bot:"): every
  Synergies lane tab (Top, Mid, Bot, Support, and Jungle below) uses the Top report and rail. Mid adds whether the
  enemy jungler was on the board (`enemyJungle`): composition context, never a lane response. Bot and Support read what
  each pick could see of both enemy bot laners (`BotRead`: blind, after enemy ADC, after enemy support, after one enemy
  bot laner whose slot was open, full bot-lane response, or unclear when a visible champion could still play another
  lane) and when its own partner came (earlier, same turn, later; two picks in one turn are never ordered). Duos
  (`DuoShape`): blind, partially revealed, full response, split construction (the second half saw more), unclear; a
  "repeated" duo response needs two series and is never a counter (no duo lane data exists). Off Top the saved partners
  sit on Overview (no Synergies tab); Bot and Support add a Duo drafting tab and a "Duo analysis" rail filter. Findings
  for alan: `/mnt/project-files/lol-drafting/top-draft/mid-bot-support-findings.md`. After alan's review (2026-10-13) Draft
  Room shows the same labels for Mid, Bot and Support (`laneUsage` in `getDraftData`, `topUsageMarks` per lane; with the
  whole enemy bot lane locked, "Picked into ADC + Support · n" from duo responses) and the starting picks classify blind /
  response for every lane (`engineReader`); labels only, never the order or the fit. Every DPM figure names its sample,
  role, patch and population (`dpmText`); each duo game lists the bot lane in draft order (`BotLaneSequence`).
- **Jungle draft usage** (alan, 2026-10-13; the same engine, `tests/jungle-draft.test.ts`, smoke "jungle:"): tabs Overview |
  Draft usage | Mid/Jungle | Matchups | Pro evidence (`components/JungleDraft.tsx`). Each jungle selection stores its lane
  partners with turn and order (`mates`, `when`: partner before / same turn / after; same-turn picks are never ordered),
  the enemy mid at the pick and the Mid/Jungle core's completion against the enemy mid and jungler (`core`). `mateRows`
  gives Mid/Jungle (the main view: who was picked first), Top and Support partners: "Observed pairing", "Repeated" with 2+
  series, saved mids tagged beside them; never a saved pairing. Matchups add "Enemy board at the pick"
  (`lib/jungle-context.ts`, thresholds in `CONTEXT`): kit traits of champions already picked (General Draft Logic,
  unreviewed kits), against the all-jungle base rate, "potential composition responses", never the team's reason. Draft
  Room (alan's review, 2026-10-13): Jungle labels and starting-pick blind counts through `laneUsage`; with an allied mid
  locked, "With <mid> · n games" (`TopUsageMarks.withMid`, every patch, order and games per patch in the tooltip, links to
  the pair on the Jungle page via `?mate=`; its hover and the Pro evidence card say it counts every recorded game, LCK archive
  included, while the Pro label counts stored drafts only, alan 2026-10-14); with enemy picks, "Picked vs <trait> · n/m" when a jungler's composition
  response (`compResponses`: 5+ picks with the trait, half its picks, 1.5x the all-jungle rate) is on the enemy board now
  (kit facts from `lib/jungle-kits.ts`, the board read in `lib/jungle-context.ts`). Under five classified games a usage
  label shows its counts ("Blind 3/3 · small sample"), and presence carried by bans (2x picks) says so. Labels only. Findings: `/mnt/project-files/lol-drafting/top-draft/jungle-findings.md`;
  any Jungle-specific counter scoring or ranking change waits on alan.
- **Synergies patch scope** (alan, 2026-10-13; `lib/synergy-patch.ts`, `tests/synergy-patch.test.ts`): every lane tab
  opens on All patches (historical, labelled with its range), including role switches and Draft Room links without a
  patch. A patch chosen in the rail is kept for the session (sessionStorage) and carried by the role tabs until changed
  or cleared; a patch in the URL always wins. Meta priority always names the one patch it comes from (the chosen one,
  else the newest), and Draft usage shows a per-patch table under All patches.
- A low-sample champion can only be in a pool's `core` tier with a written `coreReasons` entry.
- The draft-fit score (alan, 2026-10-10) lives in `lib/recommend.ts` and
  `tests/recommend.test.ts`. Every champion who plays the open role is a candidate. The score adds saved pairings
  (a strong bonus, not a filter, except that with a bot locked only that bot's saved supports, default or
  alternative, are recommended for SUPPORT: `savedSupports`, also used by Counters, which mark others theoretical; alan,
  2026-10-10), pairwise synergy with the locked picks, the open role's needs from the comp-analysis engine ("Fixes …",
  weighted by need priority and more the later the pick; one weakness scores once; tradeoffs cost a point; each row carries
  fixes / also / tradeoffs and one `bestFix`, shown apart from best overall), matchups against the optional
  enemy picks (from champion attributes; there is no lane-matchup data), and risks (a new warning, or more holes than
  picks left). A pick is charged only for a weakness it creates, never one the earlier picks already had (alan,
  2026-10-14): before the 4th pick the draft is read with the team-wide rules on, so an inherited weakness is
  "unresolved", not "Creates" (`weaknessChanges`: creates / worsens / unresolved / improves / fixes; only Creates costs a
  point; `tests/fourth-pick.test.ts`). Every point comes with a written reason. Saved defaults must still lead an early draft (one pick
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
- **Pro meta starting picks** (alan, 2026-10-13; `lib/starting-picks.ts`, `tests/starting-picks.test.ts`, smoke "empty Draft
  Room"): with nothing locked on either team, each role tab lists the champions with recorded pro picks in that role on
  one patch (newest with picks by default, `?patch=` and a patch menu; never combined): pool tier (or "Not in pool"),
  presence, role picks, First rotation (role picks within the team's first three picks, from `pickOrder`, "N of M"),
  first overall (turn 1 from Gol.gg's First Pick mark) and blind / response only from the pick-order engine
  (`engineReader` over `lib/top-draft.ts`; every role since 2026-10-13; the Blind filter is disabled only when a role has no blind pick on the patch).
  On Top the engine's usage label ("Often blinded", "Picked into …") replaces the blind count. Views Recommended | First rotation | Blind picks |
  Pro priority. Recommended order is pool first, then first-rotation picks, role picks, presence: real counts, no score
  shown. After any lock the normal order applies; the counts stay labels (First rotation, Blind, Pro priority, with
  filters) and bring in eligible champions who already play the role, never moving another row or passing the saved-bot
  support rule. Each label opens the games behind it (`MetaEvidenceTrigger`, links to Pro Drafts with the player's build).
  Similar pro drafts / Similar comps are hidden while empty.
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
- Gol.gg's patch 16.xx is Riot's 26.xx (alan, 2026-10-12). Every Gol.gg pull (daily refresh, Pro Builds, comp discovery,
  `import-golgg-tournament`, any new importer) stores Gol.gg's spelling and compares through `lib/patch.ts` (`patchKey`,
  `samePatch`), never by string; anything a person reads (site, reports, notes) says 26.xx via `patchLabel`.
- Every source records: URL, type, tournament, team, opponent, series/game, patch, `lastChecked`, `refreshStatus`.
- When a page is re-checked, set `lastChecked` to the date and `refreshStatus: "verified"`, `origin: "golgg-refresh"`.
- A link and claim supplied during review gets `origin: "externally-provided"` (new sources) and a `pendingClaim`
  {claim, providedOn}. It stays `refreshStatus: "not-refreshed"`, `lastChecked: null`, and is never labelled as checked
  by a person, until Claude reads the page itself.
- A pro claim cites only games that directly show that exact claim. "May show it" is not enough: leave the game off
  until it is read. Remove a citation whose game shows something else; don't drop the claim.
- If Gol.gg or the web is unavailable: say the research could not be refreshed, keep the last verified data, leave
  `refreshStatus: "not-refreshed"`, and **never invent tournament data or pretend a refresh happened**.

## Daily pro-data refresh (alan, 2026-10-11; twice a day since 2026-10-12)

- `.github/workflows/refresh-pro-data.yml` runs twice a day, 8:17 AM and 8:17 PM Eastern (alan, 2026-10-12; crons 12:17 / 13:17
  and 00:17 / 01:17 UTC, a gate keeps the one matching New York's offset; schedules sit off the top of the hour because
  GitHub started the 12:00 cron 9 hours late on 2026-10-12) and on `workflow_dispatch`. It reads Gol.gg with plain requests from the GitHub runner
  (it answers there; robots.txt allows these pages) and stops, writing nothing, on any refusal or challenge. Never bypass one.
- Only the tournaments in `data/pro-games.json` `tracked` are requested, by exact Gol.gg name: Demacia Cup Global
  Invitational 2026 and Worlds 2026 (main event and play-in names). The LCK playoffs are a frozen archive. Adding a
  tournament (2027 or any other) needs alan's approval. A tournament marked `complete` is not requested again. A Worlds stage Gol.gg
  lists under a name no tracked entry has (main event, Swiss, knockouts) is named in the run report, never imported under a guess.
- Pro drafts load newest game first (`newestGameFirst` in `lib/draft-side.ts`: date, then Gol.gg game id; alan,
  2026-10-12), so every match list puts the latest game at the top.
- `data/pro-games.json` is the one game-level dataset (Gol.gg game id is the key; sides, winner, picks by role from the
  full-stats page, bans, patch, date, URL). `lib/pro-games.ts` derives drafts, sources and results at load. Games that
  miss a field or contradict their series are rejected and reported as run warnings, never filled in.
- Tournament totals are replaced only when the champion table sums to 10 picks per match-list game and, with every game
  recorded, agrees champion by champion; then `rolePicks` comes from the game pages. Never across patches.
- The updater writes only `pro-games.json`, `meta.json`, `sources.json`, `pro-builds.json` and `build-assets.json`; imported games add no pro-derived
  alternatives (alan: new pro pairings stay Pro Evidence). Derived data follows the games (alan, 2026-10-14): every chart
  and statistic is computed from them at build time, and when data changed the workflow also re-runs comp discovery
  (`scripts/discover-comps.ts`, same rules as the weekly job) and commits `discovered-comps.json` with them. A test that
  reads recorded data must survive new games (synthetic cases use a roster-only `roleBook(champions, [])`); a failed run
  commits nothing and keeps the unverified data as the `unverified-pro-data` artifact. "Last checked" counts only runs
  that ran past the time gate (`lastCheckedRun`, 15 s or longer). It commits as adequate-alan only when verified data changed,
  after test/typecheck/build, then starts `pages.yml`. A supplied game link becomes verified only when its game shows the claim.
- Tests that check fixed Demacia numbers are scoped to the known events; new imports must never be able to break them.

## Pro Builds (alan, 2026-10-12)

- Items, runes, summoner spells and skill order from recorded games on their own page, `/pro-builds/` (sidebar "Pro
  Builds" under Pro evidence; `components/views/ProBuildsView.tsx`, pieces in `components/BuildParts.tsx`). Champion
  rail with search and role, filters for tournament, patch, team and player, and three modes: Games (one player's exact
  setup: full rune page, levels 1–18 grid, overview Start / First item / Boots / Core / Situational / Final, purchase
  timeline, spells with casts, side, result, Gol.gg source), Common build (counts per field against the games that
  recorded it; full rune pages only from complete pages) and Compare (two games side by side with their differences).
  Every selection is in the URL (`champion`, `role`, `game`, `mode`, `a`, `b`, filters); `buildsHref` builds links.
  The rail search also finds players; the tournament, team and player filters are typeable (`PinPicker` in
  `components/PlayerPicker.tsx`) and each can be pinned (alan, 2026-10-12): pins live in this browser's localStorage
  only, one list per kind, list first, and pinned players and teams are starred in the game strip.
  **Pinned Players** (alan, 2026-10-12; `/pro-builds/pinned/`, `components/views/PinnedPlayersView.tsx`,
  `lib/pinned-players.ts`, `tests/pinned-players.test.ts`): Pro Builds' second view (Champions | Pinned players), a
  scouting hub per pinned player: overview list (kept with an empty state when filters leave no game), profile with
  facts, champion history, that champion's builds and the full match history; each game opens the exact Pro Builds view
  (`gameHref`, `player=<id>`). Derived from the build rows only, so newly recorded games appear on their own; never a
  career. **Pinned players in the champion drawer** (alan, 2026-10-13, "personal relevance first, broader professional
  evidence second"; `components/drawer/PinnedPlayers.tsx`, `pinnedOnChampion` in `lib/pinned-players.ts`): the drawer's
  Overview, between Synergy and Pro evidence, and the Builds tab, above the general player list, list the pinned players
  with recorded games on the champion in the role shown ("All roles" only when chosen), most recent appearance first,
  never by game count: portrait, name, team of their latest game, role, games, latest patch, "Builds →"; a player expands
  into their games (tournament, patch, date, opponent, result, role), each opening that exact build (`gameHref`, `from`
  kept), plus their profile. Hidden when no pinned player played the champion. Read from the build rows chunk, loaded
  only when something is pinned. **Match History rows expand in place** (alan, 2026-10-12): a click, Enter or Space on a row opens that game's
  exact build under it (`components/GameBuild.tsx` `GameDetail`, the same component Pro Builds renders: context line,
  spells, rune page, skill grid, item progression and timeline, Gol.gg source, "Open full Pro Builds"); one game at a
  time, named by Gol.gg game id in `?game=` and the profile's player id (`expandedRow`), never by row position, and a
  game the filters stop showing folds and leaves the URL. Never a second build renderer. Profile polish (alan,
  2026-10-12): three levels by spacing and one rule each (`.player-profile`, `.profile-section`), never cards; the
  champion table shows W–L with its sample beside it (`Rate`: "1 game" / "2 games" under 3 games, a faint rate under 5)
  and drops the Role column when every champion shares the role; secondary text is one step larger there than the
  site's smallest; the player browser is one box (search above the list) with a 2px gold selected bar. Players are keyed by Gol.gg player id (pins and the `player=` filter; old name pins migrate once, an old name
  link still matches by name), so same-name players stay apart and a team change keeps one profile.
  **Overview and navigation precedence** (alan, 2026-10-13; `lib/pro-builds-home.ts` `selectionOf`,
  `components/BuildsHome.tsx`, `tests/pro-builds-home.test.ts`, smoke "builds overview"): `/pro-builds/` with no
  champion, game or player is the overview: search (champions and players), All + five roles, a patch selector on
  All patches (alan, 2026-10-13: every Pro Builds entry point shows every patch unless a patch is chosen or in the URL;
  a chosen patch carries into the champion), pinned players (to their profiles), this browser's recently
  viewed builds and recent recorded builds (newest patch, then date, then game id; an undated game never jumps ahead),
  each opening the exact game. The rail is the champion browser and carries the patch scope into the champion. URL
  parameters always win (champion and role; a game and player without a champion resolve to that record; a game alone
  lists its builds); links from other features are those parameters. Never a default champion, never a selection
  reopened from storage: recently viewed is shortcuts only. Choosing a champion is a history entry; "← Pro Builds
  overview" and the sidebar return to the overview.
  **Default game** (alan, 2026-10-13; `defaultGame`): within the active filters, the URL's game; else a chosen player's
  newest game (never replaced by a pin); else the newest game of a pinned player on that champion and role (the pinned
  player who played it most recently, by Gol.gg id, any patch); else the newest game. Every other game stays in the
  strip; the existing star marks why. No banner or explanation. An explicit patch is never changed to reach a pin.
  LCK 2026 Season Playoffs builds were backfilled once (`scripts/backfill-lck-builds.mjs`, alan 2026-10-12); their game
  records live in `pro-builds.json` `games`, read by Pro Builds only, never by drafts, priority or totals. The daily
  refresh never requests them.
  The drawer shows only a count, players, latest patch and "View Pro Builds →" (`getBuildIndex`); Synergies and Pro
  Drafts (each pick of a recorded game) link in too. Observed Pro Evidence only: it never scores and never touches saved
  pairings, rankings, Comp Check or pool tiers.
- A rune page with only the keystone (`missing: ["full rune page"]`) shows the keystone and says the full page is
  unavailable; never fill in the rest.
- **My Role** (alan, 2026-10-12; `lib/my-role.ts`, `tests/my-role.test.ts`): Draft Room's "I'm playing" selector is the
  user's own role, saved in localStorage, never the role being picked. My slot gets a gold name and a "You" tag; when
  its champion is locked, the bar and the slot link to Pro Builds with champion, role (every patch) and `from` (the whole draft, enemy row, picked role and filter), which "Back to Draft Room" restores. "Open Pro
  Builds when I lock" (localStorage, off by default) navigates only on a confirmed lock of a new champion in my role that
  has recorded builds. From Draft Room, a champion and role without builds is an empty state, never another entry.
- `data/pro-builds.json`: one record per player per game (Gol.gg game id, side, role, player and Gol.gg player id,
  spells, final inventory slots, rune page, `skills` as one letter per ability point, purchase log `[seconds, item, buy|sell]`,
  `missing` for anything Gol.gg did not give). Read by the daily refresh from the game page (player ids) and Gol.gg's
  build answer (`POST /game/ajax.build.php`, the request the Builds tab makes; not disallowed by robots.txt), at most 45
  games a run (`scripts/golgg/builds.mjs`). A game with no builds yet goes in `unavailable` and is asked again after 3 days; a game whose builds name a missing field (Gol.gg publishes a fresh game's stats before its skill order and purchase timeline) is re-read every 3 days for 3 weeks from its date and replaced only by a fuller answer (alan, 2026-10-13). The post-deploy smoke checks the exact setup on the newest game with a recorded timeline and that a partial record says so.
- `data/build-assets.json`: names, icons, item stats and ability max ranks per game patch, from that patch's Data Dragon
  files (CommunityDragon for stat shard names), only for ids the builds use; ids a patch does not name are `unnamed`.
  Icons load from Data Dragon's CDN at the game's version, like champion icons; nothing is stored in the repo.
- One game shows exactly that player's setup; Start / Boots / Core / Later are read in order from its purchase log and
  labelled as such; Final is the end-of-game inventory, never the purchase history. "Common" counts games in the chosen
  scope (keystones, items, boots, max orders, spell pairs) and names the scope; it is never one player's build and never
  "optimal". The skill grid shows only recorded levels; max order uses Data Dragon max ranks.
- The data loads as its own browser chunk when a drawer opens (`lib/pro-builds-bundle.ts`), not in every page.
  `tests/pro-builds.test.ts` holds parsing, mapping, integrity and the refresh step.

## Player portraits (alan, 2026-10-12)

- Professional players show a photograph in Pinned Players (rail, list, profile header), Pro Builds (player filter
  options and trigger, game strip, game header, the chosen player's chip in every mode) and the Gen.G roster list,
  through one component, `components/PlayerAvatar.tsx` (`xs` 20 / `sm` 24 / `md` 36 / `lg` 48 / `xl` 104 px, the
  `--avatar-*` tokens; width and height fixed in markup, so nothing shifts while it loads). Without a checked photo it
  shows the player's initials: never a champion icon, never a generated image, never another player's photo.
- `data/player-portraits.json` (`PlayerPortraits` in `lib/schema.ts`) is the one library, keyed by Gol.gg player id:
  `provider`, name, team, `file` (`assets/players/<id>.webp`), the page it came from (`source`), `original` URL and
  width, the crop in original pixels and `checkedOn`. Two providers: `commons` (Wikimedia Commons files under a free
  license, CC BY / CC BY-SA / CC0 / public domain, with license, author and photo context; credit "Photo: author,
  license, via Wikimedia Commons") and `dpm.lol` (alan's decision, 2026-10-12: dpm.lol's pro profile photos,
  `https://dpm.lol/esport/players/<handle>.webp`, fetched on his Mac because dpm.lol challenges Claude's environments;
  dpm.lol states no reuse license, so the credit says "Photo via dpm.lol" and the Disclosure says none is claimed).
  dpm.lol's generic `nopicture.webp` is not a photo; a dpm.lol page for the handle on another team is not the player.
  Credits are in the library and the Pinned Players "Photo credits" Disclosure; the avatar has no tooltip (alan, 2026-10-13). No team logos (trademarks).
- A portrait is added by hand and only when the photo is the same person: `scripts/find-player-portraits.mjs`
  (separate from the match refresh, never run by it; a missing photo never fails an import) matches each recorded
  player to a Wikidata League of Legends player item by exact handle, reads the Commons license metadata and writes
  candidates to `reports/` (ignored by git) for review; a handle two players share (Effort) is left out.
  `scripts/build-player-portraits.mjs [--from dir]` crops and resizes each listed file to a 208px webp and regenerates
  `lib/player-portrait-images.ts` (static imports, so the files are hashed under the base path). Never commit an
  unlisted file. Runs on a GitHub runner or alan's Mac (Commons is unreachable from Claude's cloud environments).
- `tests/player-portraits.test.ts`: every entry names a recorded player id, license and source checks, files and image
  map agree and stay small, the fallback has no image, the rendered avatar has fixed size and a credit.

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
  (`parsePatch`, `patchKey`, `comparePatch`, `samePatch`, `shortPatch`) is the one normalizer. **One label site-wide**
  (alan, 2026-10-12): every page, filter, drawer, tooltip, note and report shows Riot's 26.xx (`patchLabel` at display);
  16.xx never appears in the UI. Pro data, Data Dragon versions and Gol.gg URLs keep their own spelling; `?patch=` takes
  either and writes 26.xx. The smoke job checks the main pages for a stray 16.xx.
- Draft implications (`lib/patch-implications.ts`) are analysis, labelled as such and folded under each champion
  change, apart from Riot's facts: saved pairings, pool tiers, recorded pro games before / after the patch and tournament
  presence by event patch. **A patch never changes saved pairings, pool tiers, recommendations or any score.**
- Shared lookups (`lib/patch-changes.ts`, compact index `getPatchIndex()`, also `DrawerData.patches`): `changesFor`,
  `changedSince`, `patchHref`. The champion drawer's "Patch changes" block and the hover card's latest-patch line use
  them; `components/ChangedSince.tsx` (`ChangedSince`, `PatchTag`) is the "Changed since this game" control for Pro
  Builds. It never calls an old build current or optimal.
- Daily check: `.github/workflows/refresh-patch-notes.yml`, 8:47 AM Eastern (crons 12:47 / 13:47 UTC, same offset gate as the pro refresh) and
  `workflow_dispatch` (dry run, force). `scripts/refresh-patch-notes.mjs` reads Riot's patch-notes tag page and each
  tracked patch page from the runner (leagueoflegends.com is unreachable from Claude's environments; robots.txt allows
  it), re-reads a patch only when it is new or its article revision changed, and writes `data/patch-notes.json` only
  when Summoner's Rift facts changed (an edited entry gets `corrected: true`). It stops on any refusal or challenge and
  never removes an archived patch. Commits as adequate-alan after test / typecheck / build, then starts `pages.yml`.
  Parser fixtures: `tests/fixtures/riot`, tests: `tests/patch-notes.test.ts`.

## Weekly Comp Library discovery (alan, 2026-10-12)

- `.github/workflows/discover-comps.yml` runs Sundays at 9:17 AM Eastern (cron 13:17 and 14:17 UTC, same New York gate as
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
- **Champion drawer** (alan, 2026-10-12, "interactive scouting panel"; `components/ChampionDrawer.tsx`, tabs in
  `components/drawer/`, helpers in `lib/drawer.ts`, `tests/champion-drawer.test.ts`): one shared drawer for every page.
  Sticky header (portrait, name, role, pool tier, role switches, expand control), tabs Overview | Synergies | Pro |
  Builds | Patch (the last tab is remembered for the next open), 440px on desktop (`.drawer.wide` 720px, localStorage
  `drawer:wide`), full-width sheet on phones. Less visible at once, more on demand: a partner row opens the pairing in
  place (`PairingView`: saved status or proposed reason, alan's read when it names the partner, draft logic from
  attributes, tradeoffs, the recorded games with both, "View <partner>", "Draft this pair" outside the room) with its
  own history entry, so browser Back and "Back to <champion>" return to the champion; a recorded game expands into its
  compact detail (both drafts when recorded, side, result, bans, Pro Drafts and the player's build); a patch bar or
  patch button shows that patch's exact statistics and sample; an observed pairing shows the games behind it; a patch
  change expands to every Riot line and reason. The footer is context-aware (`drawerActions`, `DrawerContext` passed by
  each page through `ChampionProvider`): never "Use in Draft Room" inside the Draft Room (locking stays the row's own
  action; Pro Builds links carry `from`), Pro Drafts leads with "Inspect this game's build" for the open game, and no
  page links to itself. Never a second build renderer: the Builds tab is a gateway (counts, latest patch, recent
  players, exact-game links). Every tab keeps the three layers in separate blocks.
- **Pro Drafts side strips** (alan, 2026-10-11): each row has a 3px strip on its far left, `--team-blue` / `--team-red`
  for the side recorded for that game (`ProDraft.side`, from the Gol.gg game page via `data/pro-games.json`; stored LCK
  drafts inherit it from their game source's `sides`, backfilled once on 2026-10-11 by `scripts/backfill-lck-sides.mjs`,
  which is not part of the daily refresh), neutral `--border-strong` when no side is recorded, with the side named on hover. The side comes from
  each game, never from team identity, listing order or which team is named first (`lib/draft-side.ts`,
  `tests/pro-sides.test.ts`); filters keep each row's side. Both sides of a game pair blue first.
- **Pro Drafts match browser** (alan, 2026-10-13; `groupGames` in `lib/draft-side.ts`, `tests/pro-sides.test.ts`, smoke
  "pro drafts"): one game is one visual unit. Each game is a `<tbody class="game-rows">` holding its blue row then its
  red row under one shared game cell (`rowSpan`; stage and game number, then tournament short name, patch and date),
  then the team cell (side strip, team name, W / L `.res` tag) and the five picks (28px `--icon-row` portraits, role
  only in the header). No opponent, read or source columns: a game a filter shows from one side keeps its game cell and
  says "vs Opponent" under the team; read notes and Gol.gg sources live in the open game's panel. A stronger rule
  separates games, none sits inside one; the whole game tints on hover, the open game is gold, and the inspected
  team's name is gold in the table and the panel. The toolbar counts games (team drafts in the tooltip) and the
  freshness line is one compact line (`ProFreshness compact`, details in its tooltip). Below 760px the same markup
  reflows into a match list (game line, two team lines with portraits only; names in the hover card and drawer).
  Rows carry no side tooltip (alan, 2026-10-13: the strip already says it); a visually hidden "Blue side:" / "Red
  side:" in the team cell names it for screen readers, and the open game labels each team's side. Champion hover cards
  stay. **Pins** (alan, 2026-10-13): Team, Champion, Tournament and Series are typeable `PinPicker`s
  (`components/PlayerPicker.tsx`, kinds `team` / `champion` / `event` / `series`); Role stays a `Select`. Team and
  tournament pins are the same localStorage lists Pro Builds uses (tournaments by event id; the URL keeps the name);
  champion and series pins are `pro-drafts:pinned-*`. Pinned items lead their menu, appear as one quiet line of
  one-click filter chips under the menus (only when something is pinned), and a pinned team is starred in the table.
  **Gol.gg-style rows** (alan, 2026-10-16; `bansOf`, `pickedFirst`, `banPhases`, `newSince` in `lib/pro-drafts-game.ts`):
  under each team name its five bans as small muted 20px portraits (Gol.gg's order, split 3 | 2 as Gol.gg draws the ban
  phases), picks stay the larger interactive portraits; bans stay compact in the open game too. A gold "1st" tag marks
  the team carrying Gol.gg's First Pick mark (from the game record, LCK archive records included), never inferred; an
  unmarked game shows none and the open game says so. A Stage menu appears once a tournament with several stages is
  chosen. Worlds games this browser had not seen on its last visit get a "New" marker and a toolbar count
  (localStorage `pro-drafts:seen-worlds`, kept for the visit in sessionStorage; the first visit flags nothing).
- **Pro Drafts game inspection** (alan, 2026-10-12; `lib/pro-drafts-game.ts`, `tests/pro-drafts-game.test.ts`): a row
  click (or its game link) opens the whole game in the panel above the table (`?id=`): both teams blue first, each with
  side strip, result, bans and five champion buttons (`gameView`; a stored draft whose other side is not stored shows
  one team and says so). Each champion is a button that opens that player's exact recorded build for that game in the
  same panel, `?build=<draft id>:<ROLE>` (`buildParam`, `buildFor`: game id + recorded side + role, never row position),
  rendered by `GameDetail` (one build renderer with Pro Builds and Pinned Players) with "Open full Pro Builds". Another
  champion swaps the build in place; Enter / Space on the open one closes it; another game row carries the role to that
  row's team (`carryBuild`); a stale `build` leaves the URL. A game with no recorded builds (LCK finals G3, 82964) says
  "No builds recorded for this game" with the buttons disabled; a missing player build says so, never filled in. The
  build rows load as their own chunk on first use. Never a second build UI.
- **Identity-first headers** (alan, 2026-10-12, DPM.LOL as the hierarchy reference, never its branding or layout): a
  player or champion page leads with the subject, on one surface, not a card: a large portrait or champion icon, a
  large Space Grotesk name (`--fs-4xl` for a player profile, `--fs-3xl` elsewhere), team and role in medium weight
  under it, metadata smaller and muted, numbers in JetBrains Mono. The Pinned Players profile is the reference
  (`.player-head`, 170–220px on desktop with the `hero` 144px avatar; `xl` on phones): name, pin, "Team · Role",
  one quiet line of recorded totals (`.player-facts`: games, W–L, win rate from 3 games and flagged under 5,
  champions, latest appearance), then one view at a time, Overview | Champions | Match history | Builds (`?view=`,
  `.tabs` buttons with roving focus; a link naming a champion opens on Champions). The same `ChampionTable` and
  `MatchTable` render in every view; a column that repeats one value on every row (team, role) is left out. The
  same principles reached Pro Builds (`.builds-head`, `GameHeader` with the `lg` avatar), the Synergies scouting
  header, the Pro Drafts open-game head (`.game-panel-head`) and the Gen.G roster strip (`xl` portraits). Team logos
  are not shown (no permitted source; trademarks) and real names are not shown (no verified source): never type
  either from memory. Comp Library and the champion drawer were left alone.
- **Champion Synergies** (`/synergies/<tab>/`, sidebar "Synergies"; alan renamed it from First Pick on 2026-10-10) is
  the champion synergy and pairing reference: rail, role tabs, saved / proposed partners, pro pairings, "Open in Draft
  Room". One tab per role, Top | Jungle | Mid | Bot | Support (alan, 2026-10-12; `components/views/synergy-tabs.ts`,
  `tests/synergy-tabs.test.ts`); each role's records stay on their own tab. Top and Support also list the Comp Library
  shells that hold the pick (folded). Old `/first-pick/…` URLs forward there with their query, and the retired
  `/synergies/mid-jungle/` forwards to Mid or Jungle by `?role=` or the champion (`components/Forward.tsx`). The name **First Pick** is
  reserved for a future blind-pick feature (blind-pick safety, counterpick vulnerability, flexibility, draft priority);
  don't reuse it for synergy content.
  **Synergies navigation** (alan, 2026-10-13; `lib/synergy-nav.ts`, `tests/synergy-nav.test.ts`, smoke "synergies nav"): the
  sidebar's Synergies link and `/synergies/` open the role being researched, never "I'm playing": Draft Room's highlighted
  role or the last Synergies tab viewed, whichever came last (sessionStorage `synergies:role`), Top otherwise. Draft Room
  keeps a chosen role tab in `?focus=` and restores the role it left highlighted on an empty board in the same tab
  (`draft-room:active-role`). Explicit role URLs and champion links are unaffected.
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
  viewport, caps its height and scrolls inside, zero layout shift). **A tooltip adds context, never repeats what is already visible** (alan, 2026-10-13): a hint that
  only restates a visible name, label or value (a portrait's player name and photo credit, say) is removed, not restyled;
  stats, builds and match context stay. Plain-text hints stay `title="…"` in markup;
  `components/TipLayer.tsx` (mounted once in the app layout) renders them in the themed `.popover.tip`, on hover, keyboard
  focus or a tap on plain text. Anything richer or with links is a `<Popover>`: hover opens, the pointer can move in,
  click pins, Enter pins and moves focus in, Escape closes and returns focus, touch opens a bottom sheet. ChampionHoverCard
  shares the surface and placement. Draft Room uses it for the Pro evidence card (`components/EvidenceCards.tsx`,
  `lib/pro-evidence.ts`, `tests/pro-evidence.test.ts`: each counted game newest first, teams, side, result, both drafts
  only when recorded; current enemy picks on the other team are an observed matchup, never a counter; pick order is not
  recorded, so no game is shown as a response), the Counter card and the comp-fit breakdown. Don't build page-specific
  tooltips.
- **Motion and interaction system** (alan, 2026-10-12, Impeccable interaction pass; `tests/interaction.test.ts`, smoke
  "Interaction and motion audit"): smooth is not the same as animated. Every duration is a token in `app/globals.css`
  "Motion": hover 100ms, tabs / selection 140ms, dropdowns / popovers 140ms in and 90ms out, drawers / sheets / mobile nav
  220ms in and 160ms out, `--ease-out` arrivals and `--ease-in` exits; no literal durations in CSS or components.
  Selecting, locking and filtering change state instantly (only a fresh lock acknowledges itself); only arriving surfaces
  move. Reduced motion keeps fades and drops movement (no global kill); JS scrolling uses `scrollBehavior()` from
  `lib/motion.ts`. The drawer exits before unmounting and returns focus to its opener; on phones it has a scrim and holds
  the page still. Every dropdown is a fixed portal placed by `menuPlace` (`components/Select.tsx`; PinPicker too), opens
  on click / typing / arrows, never on focus. Tab lists and option strips use `components/roving.ts` (one Tab stop, arrow
  keys). Hover cards swap in place between neighbours. Draft Room derives everything from the board in one `useMemo`
  and never re-keys on its own URL writes (`markOwnQuery`), so a lock keeps the tab, filter, open rows, focus and undo.
  Coarse pointers get 32-40px controls and invisible hit margins; desktop density is unchanged.
- **Phone Comp Check line** (alan, 2026-10-12): below 1180px the Draft Room shows one line under the board and in the
  pinned mini board (`CompSummaryLine`, `lib/comp-summary.ts`, `tests/comp-summary.test.ts`): the open role's top needs
  and the worst non-minor weak point, "No major weak points" when clean, "Early read" with two picks, nothing actionable
  before that. Never a score; a tap jumps to the full Comp Check.
- **Meta / Research folding** (alan, 2026-10-12): Pro priority, its filters and the Tournaments table stay open; Tournament
  comparison, both pairing tables, Recent drafts and Research notes are folded section Disclosures with counts.
- Warning severity (critical / caution) for the `lib/evaluate.ts` rule checks is a display grouping only, shown with `?legacy=1`; the Draft Room header badge counts the plan read (critical / needed / weaknesses).
- Comp Check (`components/CompCheck.tsx`) shows the comp-analysis engine (`lib/model-v2/analyze.ts`, `tests/comp-analysis.test.ts`):
  identity, win condition, ranked weak points, role needs with best fix vs best overall, timing, and the compact grid.
  Siege (`siegeOf`, alan 2026-10-10) is its own metric, not Poke: structure pressure first, then range, waveclear,
  poke and disengage; it feeds the Poke / siege identity.
  **Plan-aware Comp Check, the default since alan's approval (2026-10-14)** (`lib/model-v2/plan.ts`,
  `tests/comp-plan.test.ts`): one plan read (`usePlanRead` in `components/CompCheck.tsx`, computed once per board) drives
  the rail, the phone line (`lib/comp-summary.ts`), the header badge (`CompStatus`) and which grid cells are marked
  (`planFlags`; the numbers stay kit facts), so no two surfaces disagree. Best fix / Best overall stay the ranking's and
  say "From the recommendation ranking"; candidate-row reasons stay the ranking's. The previous rule list and the
  `lib/evaluate.ts` rule checks show only with `?legacy=1` (debugging). Known limitation: the shared identity engine
  reads Gen.G Gwen / Aatrox / Akali / Ashe / Seraphine as split (three side laners) though it was drafted to skirmish; it
  keeps its critical stall gap (test), never a lineup exception; the fix is a plan-local reading of ambiguous
  identities, never a change to the shared identity engine without alan. The read asks whether the comp is missing something its own win condition needs. Jobs per plan
  (front-to-back, dive, poke, protect, pick, skirmish, wombo, split, tempo, scaling) and every current rule re-read as
  critical, weakness or accepted tradeoff with its reason; a rule merges into a plan job only when that job is reported
  missing, so nothing is silently dropped (`merged` names the job). Bot duo reads only (Mid/Jungle pair facts showed no
  signal). alan's review (2026-10-14): following an engage is four things (`followOf`: all-in, ranged, joins, extended
  trade; kit values unchanged), so a carry who only follows from range gets a minor "ranged follow-up, not an all-in";
  the read is structural, and enemy picks only tag a finding "exploited" / "less relevant" (`exposure`), never its
  tier; with four picks a critical gap an available champion closes is "Needed from the <role>" with the champions
  that close it (saved-bot support rule applied, others theoretical), real severity only at five. Accuracy pass (alan,
  2026-10-14, "critical = a serious inability to execute the plan"): one frontliner is a frontline and missing depth is
  a weakness unless disengage covers it; protection counts points (strong protector 1.5, an engage that also protects
  0.5, a self-protecting carry 0.5); split has one splitter and the four stall with waveclear plus space (disengage,
  catch threats, globals); a carry who stops a dive alone and a covered rule whose plan job is met are weaknesses; a
  lone bruiser with an enchanter is thin, not missing; anti-engage one short is a weakness. A fixer must fix the gap
  within the same plan (`fifthPick`: fixes / switches / eases / unresolved); a pick that only changes the plan is named
  apart (`switches`), never as a fix. Kit corrections are proposed to alan, never applied to clear a warning. Never scored;
  validation: `npx tsx scripts/diagnostics/plan-validate.ts` and `plan-review.ts`.

## Commit authorship

Every commit from every thread is authored and committed as alan, so GitHub credits his account:
`git -c user.name="adequate-alan" -c user.email="54249725+adequate-alan@users.noreply.github.com" commit ...`
(or set both with `git config` in the checkout first). This is the noreply address his existing merge commits already
use. Keep the required `Co-Authored-By: Claude ...` trailers; they don't affect his attribution. Never rewrite or
force-push existing history unless alan asks.

## Commands

`npm run dev` · `npm run typecheck` · `npm test` · `npm run build` (static export to `out/`)
