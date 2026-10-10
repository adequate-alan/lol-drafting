# League of Legends Draft Assistant

League of Legends drafting assistant: Draft Room (recommendations ranked by synergy, team needs and matchups), First Pick, Comp Library, Champion Pool, Pro Drafts, Gen.G and Meta.
See `CLAUDE.md` for the data rules.

Live at https://adequate-alan.github.io/lol-drafting/ (GitHub Pages). The site is fully static and public: anyone with
the link can read every page and the data behind it. There is no login.

## Local setup

```bash
npm install
npm run dev        # http://localhost:3000/lol-drafting/
```

## Checks

```bash
npm run typecheck
npm test           # includes the locked saved pairings, the draft-fit ranking and the static-site guard
npm run build      # static export to out/
```

## Deployment

Every push to `main` runs `.github/workflows/pages.yml`: install, tests, typecheck, static build, then deploy to
GitHub Pages. The site lives under the `/lol-drafting` base path (`lib/site.ts`), so links go through `next/link` and
pages read URL filters in the browser (`useSearchParams`), never on a server.

## Data

`data/*.json` is the source of truth. `docs/import-report.md` records how the workbook was migrated.
All Gol.gg sources are currently marked "not refreshed": they came from the workbook and have not been re-checked.
