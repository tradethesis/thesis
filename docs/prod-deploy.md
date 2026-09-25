# Production deploy runbook

The owner runs every production database command. Nothing here is run by an agent.
Prod database: `neondb`. Beta database: `thesis_beta` (already migrated, 24 Sep 2026).

## 0. Before starting

- Beta signed off: a funded gift opened to the tear with a Privy wallet.
- Terms page live, or the decision to launch without it recorded.
- Privy App Secret and X bearer token rotated (both were pasted in chat).

## 1. Database (about 10 min)

```sh
cd ~/thesis
vercel env pull .env.prod.local --environment=production
export DATABASE_URL="$(grep '^DATABASE_URL_UNPOOLED=' .env.prod.local | cut -d= -f2- | tr -d '"')"
psql "$DATABASE_URL" -Atc "select current_database()"   # must print: neondb
pg_dump "$DATABASE_URL" -Fc -f ~/neondb-before-$(date +%F).dump   # backup first

# Tables added since prod was last pushed (match_query, source_post_metrics, …).
# Read the prompt: if drizzle-kit proposes DROPPING or TRUNCATING anything, answer no and stop.
pnpm db:push

# Gift tables, in this order. Each file is idempotent.
for f in 2026-09-23-gifts 2026-09-24-gift-images 2026-09-24-one-to-three-holdings 2026-09-24-accept-then-fund; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f src/server/db/migrations/$f.sql || break
done
pnpm db:verify

# Tokens and theses added since (LLYx/NVOx, the metabolic-medicine thesis). Both idempotent.
# `db:seed` re-verifies every mint on chain and refuses to write if one fails.
DATABASE_URL_UNPOOLED="$DATABASE_URL" pnpm db:seed
DATABASE_URL_UNPOOLED="$DATABASE_URL" pnpm content:publish
# Start each thesis's 90-day record and link it to its basket. The daily job only takes new
# readings for calls that exist; without this step every basket reads "tracking starts soon".
DATABASE_URL_UNPOOLED="$DATABASE_URL" pnpm tsx scripts/calls.ts start
rm .env.prod.local
```

## 2. Production env vars (Vercel dashboard → Settings → Environment Variables → Production)

Status 25 Sep: already added to Production: `NEXT_PUBLIC_PRIVY_APP_ID`, `TYPESAFE_API_KEY`,
`OPENROUTER_API_KEY`, `GIFTS_LIVE`, `GIFTS_PROVISION_WALLETS`, `GIFT_ELIGIBILITY_PROVIDER=attestation`.
Still to do by hand: add the two secrets (they're sensitive and can't be copied; rotate them now
and set the new values for Production and Preview), and edit `EXECUTION_MODE` and `SITE_MODE`.

| Name | Value |
|---|---|
| `NEXT_PUBLIC_PRIVY_APP_ID` | same as Preview |
| `PRIVY_APP_SECRET` | the **rotated** secret |
| `X_API_BEARER_TOKEN` | the **rotated** token |
| `TYPESAFE_API_KEY` | same as Preview (discover search) |
| `OPENROUTER_API_KEY` | same as Preview (thesis writing, build-your-own packs) |
| `GIFTS_LIVE` | `true` |
| `GIFTS_PROVISION_WALLETS` | same as Preview |
| `GIFT_ELIGIBILITY_PROVIDER` | `attestation` (country check; beta uses `open`) |
| `SITE_MODE` | `full` (anything but `waitlist` opens the site) |
| `EXECUTION_MODE` | `live`. It is `simulation` today; with it, a gift's real USDC would buy nothing real |

## 3. Deploy

```sh
vercel deploy --prod
# The production deploy also claims beta.tradethesis.xyz. Point beta back at the latest preview
# build straight away, or beta serves production's database and live money settings.
vercel alias set <latest-preview-url> beta.tradethesis.xyz
```

First production deploy: 25 Sep 2026 (thesis-noov22dwc). Brian Armstrong's argument isn't in the
catalogue publish; it goes in with `pnpm tsx scripts/seed-coinbase-ipo-argument.ts --apply` against
the production database.

Then smoke: `/`, `/app`, `/app/leaderboard`, `/discover` (search one idea), `/gift`, one gift
preview. Crons run on production only; the first call refresh lands within a day, or trigger
`/api/cron/calls`, `/api/cron/gifts`, `/api/cron/reconcile` with `CRON_SECRET`.
