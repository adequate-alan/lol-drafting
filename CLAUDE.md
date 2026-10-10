# LoL Clash drafting site

Private, single-user drafting dashboard for alan's Clash team. Next.js (App Router) + TypeScript, no database.
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

## Security

- One user. Login checks `AUTH_USERNAME` and a scrypt `AUTH_PASSWORD_HASH`; the session is a signed HttpOnly cookie
  (`SESSION_SECRET`). `proxy.ts` and `requireSession()` in `app/(app)/layout.tsx` both enforce it on the server.
- Data files are read only on the server (`lib/data.ts`, `server-only`); nothing goes in `public/`.
- Never commit `.env*` files (only `.env.example` with empty values), password hashes, secrets or tokens.
- Do not create or deploy a Vercel project without alan's go-ahead.

## Commands

`npm run dev` · `npm run typecheck` · `npm test` · `npm run build` · `npm run hash-password`
