# LoL Drafting

Private Clash drafting dashboard: Draft Room, First Pick, Comp Library, Champion Pool, Pro Drafts, Gen.G and Meta.
See `CLAUDE.md` for the data rules.

## Local setup

```bash
npm install
npm run hash-password          # type a password (12+ characters); prints the hash
cp .env.example .env.local     # then fill in the three values
npm run dev                    # http://localhost:3000
```

`.env.local` needs:

- `AUTH_USERNAME`: the login name.
- `AUTH_PASSWORD_HASH`: the output of `npm run hash-password`.
- `SESSION_SECRET`: 32+ random characters, for example `openssl rand -base64 48`.

`.env.local` is gitignored. Never commit real values.

## Checks

```bash
npm run typecheck
npm test        # includes the locked Clash conclusions
npm run build
```

## Data

`data/*.json` is the source of truth. `docs/import-report.md` records how the workbook was migrated.
All Gol.gg sources are currently marked "not refreshed": they came from the workbook and have not been re-checked.

## Deployment

Not deployed yet. When it is, the same three environment variables go into the Vercel project settings.
