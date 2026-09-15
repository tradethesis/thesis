# Environments

Two deployments of the same code against two databases. Beta is where work lands first;
production is what tradethesis.xyz serves.

| | Production | Beta |
| --- | --- | --- |
| URL | https://tradethesis.xyz | `beta.tradethesis.xyz` (DNS pending) |
| Vercel target | `--prod` | preview |
| Database | Neon `neondb` | Neon `thesis_beta`, same project |
| Env file | `.env.production.local` | `.env.beta.local` |
| Execution | `simulation` | `simulation` |

The databases are genuinely separate, not two schemas in one. Beta can be wiped, reseeded
or broken without touching the live catalogue, the open calls, or a single waitlist signup.

## Deploying

```bash
# beta first
vercel deploy --yes                     # preview, uses the Preview env vars
vercel alias set <preview-url> beta.tradethesis.xyz

# then production, once beta looks right
vercel deploy --prod --yes
```

Preview env vars are set separately from production (`vercel env add NAME preview`), which
is what points beta at `thesis_beta`. A preview deploy cannot reach the production database
unless someone changes that.

## Provisioning a fresh beta database

```bash
BETA="$(grep '^DATABASE_URL_UNPOOLED=' .env.beta.local | cut -d= -f2-)"
DATABASE_URL="$BETA" pnpm db:push --force
psql "$BETA" -f src/server/db/constraints.sql
psql "$BETA" -c "CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_key ON waitlist_signup (email);"
DATABASE_URL="$BETA" pnpm tsx scripts/calls.ts migrate
DATABASE_URL="$BETA" pnpm db:seed
DATABASE_URL="$BETA" pnpm content:publish
DATABASE_URL="$BETA" pnpm tsx scripts/calls.ts start
```

Use the **unpooled** string. Schema changes through pgbouncer in transaction pooling mode
are unreliable, and `db:push --force` drops the `remaining_raw` generated column every time,
which is why `constraints.sql` runs immediately after it.

## Two things beta still needs

1. **DNS.** Namecheap → `tradethesis.xyz` → Advanced DNS → add
   `A  beta  76.76.21.21`. Until then `vercel alias set` cannot issue a certificate, and the
   beta URL is the raw `thesis-<hash>-sigmamain.vercel.app`.
2. **A decision on deployment protection.** Preview deployments are behind Vercel
   Authentication by default, so only someone signed in to the Vercel team can open them.
   That is right for internal work and wrong for sharing a link with a tester. It is a
   project setting in the Vercel dashboard (Settings → Deployment Protection), not
   something the CLI changes.

Until protection is decided, beta is reachable only to the Vercel team, and nothing about it
has been verified end to end through the browser.

## Current state

- Beta database: provisioned, 4 theses, 13 assets, 4 open calls, 0 signups
- Production database: 4 theses, 4 open calls, 0 signups
- Beta deployment: built and deployed, behind SSO, not verified through the browser
- Production: verified — pages, buy flow, browser checks at four widths
