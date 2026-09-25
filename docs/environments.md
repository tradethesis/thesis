# Environments

Two deployments of the same code against two databases. Beta is where work lands first;
production is what tradethesis.xyz serves.

| | Production | Beta |
| --- | --- | --- |
| URL | https://tradethesis.xyz | https://beta.tradethesis.xyz |
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
DATABASE_URL="$BETA" pnpm db:push        # chains constraints.sql, then db:verify
psql "$BETA" -c "CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_key ON waitlist_signup (email);"
DATABASE_URL="$BETA" pnpm tsx scripts/calls.ts migrate
DATABASE_URL="$BETA" pnpm db:seed        # assets first — content:publish resolves symbols against it
DATABASE_URL="$BETA" pnpm content:publish
DATABASE_URL="$BETA" pnpm tsx scripts/calls.ts start
DATABASE_URL="$BETA" pnpm tsx scripts/calls.ts refresh     # one reading, so charts are not empty
DATABASE_URL="$BETA" pnpm tsx scripts/seed-basket-arguments.ts --apply
```

`content:publish` creates each basket as it publishes, using the names in
`src/server/content/baskets.ts`. `scripts/backfill-baskets.ts` is only for a database that already
holds published theses with no basket — it skips anything already attached and is safe to re-run.

Order matters twice, and both were found the hard way provisioning beta on 21 September 2026:

- **`db:seed` before `content:publish`.** Publishing resolves every symbol against the asset table
  and fails with `cbBTC is not in the asset table` if the assets are not there yet.
- **`calls.ts start` after the baskets exist.** Striking a call points its basket version at the
  series; run it first and the baskets render "Tracking begins at publication" beside a call that
  is already running. `db:verify` does not catch this — check
  `SELECT count(*) FILTER (WHERE call_id IS NOT NULL) FROM basket_version WHERE state = 'live'`.

`pnpm db:push` no longer needs `--force`, and `db:verify` now runs at the end of it: every trigger
and index in `constraints.sql` is invisible to drizzle-kit, so a bare push drops them, and the ones
whose loss is silent produce a basket displaying returns it never earned.

Use the **unpooled** string. Schema changes through pgbouncer in transaction pooling mode
are unreliable, and `db:push --force` drops the `remaining_raw` generated column every time,
which is why `constraints.sql` runs immediately after it.

## Two traps, both of which have already bitten

**`vercel env rm NAME preview` can delete the production value too.** The Neon integration
created `DATABASE_URL` with the scope *Production, Preview*. Removing the preview scope
deleted the whole record, production included, and the next production deploy failed at
`Failed to collect page data for /api/cron/calls` — a build-time env read with nothing
behind it. Beta had built fine minutes earlier on the same commit, which is what gave it
away. Add a preview-scoped value rather than removing and re-adding, and check
`vercel env ls production` afterwards.

**Never run two builds or two servers over the same output directory.** It produced HTML
referencing a `webpack-` chunk the build never wrote, so every asset 404'd, React never
hydrated, and every click silently did nothing. That looks exactly like a broken filter
button. `scripts/browser-check.cjs` now asserts no `/_next/` asset 404'd and that React
attached, before it clicks anything.

## Two things beta still needs

Both are done. DNS points `beta` at `76.76.21.21`, the certificate is issued, and the alias
is live.

Worth knowing: the **custom domain bypasses deployment protection while the raw preview URL
does not**. `beta.tradethesis.xyz` serves the app; `thesis-<hash>-sigmamain.vercel.app`
still returns 401 behind Vercel Authentication. Point test runs at the domain, not the
preview URL.

If a machine queried `beta.tradethesis.xyz` before its DNS record existed, its resolver may
hold a cached NXDOMAIN — `dig` will answer while `curl` and `ping` cannot. Pass
`HOST_RESOLVE="beta.tradethesis.xyz=76.76.21.21"` to the browser check to work around it,
or wait for the cache to expire.

## Current state

- Beta database: provisioned, 4 theses, 13 assets, 4 open calls, 0 signups
- Production database: 4 theses, 4 open calls, 0 signups
- Beta deployment: live at beta.tradethesis.xyz, browser checks pass at 320/390/768/1440
- Production: verified — pages, buy flow, browser checks at four widths
