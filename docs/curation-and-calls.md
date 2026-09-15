# Curated theses and timed calls

What runs today, what is still local, and what a deploy needs. Written 15 September 2026.

## What a curated thesis is

A post someone already shared, an editorial interpretation of it, and a basket. Three things
that must never blur together:

1. **The original post and its author.** Quoted, attributed, linked, dated.
2. **Thesis editorial's interpretation.** Our reading, our chosen assets, our weights.
3. **Thesis's timed call.** Our measurable claim, scored against SPYx.

The author of the post did not pick the basket and has not endorsed it. `SourcePost` renders
that line as part of the component rather than as an optional prop, so a card cannot show
someone's words next to a basket without saying so.

### Attribution lives in the published snapshot

`sourcePost` is stored inside the immutable evidence JSON of a `thesis_version`, not looked
up from the seed files at render time. Seeds are mutable; a published version is not. What a
reader sees next to a basket is the attribution that was published with it.

`pnpm tsx scripts/verify-source-posts.ts` re-checks every stored post against the live one —
handle, text, posted timestamp — and fails if `verifiedAt` is in the future or precedes the
post. A hand-typed verification date is a claim; this makes it checkable.

### Adding one

Add to `src/server/content/curated.ts`. Do not edit `evidence.ts` or `theses.ts`; those hold
sources already verified, and the publisher merges the two sets at read time
(`ALL_SEEDS`, `evidenceFor`).

`sourcePost` enters the content hash only when present. `JSON.stringify` drops undefined
keys, so a thesis without one hashes exactly as it did before this feature existed — checked
against the three already published, which are byte-identical.

Every curated thesis passes the same gates as editorial content: three constituents, whole
percentages between 10% and 70% summing to 10,000 bps, a role and a limitation per holding,
a counterargument, a change-my-mind condition, two sources minimum, and every symbol
resolved against the verified asset table.

Constituents may now overlap across theses. Two arguments can legitimately reach the same
company; forcing a different one to avoid a repeat would mean picking a worse stock for a
presentational reason. Shared exposure is worth stating, not designing around.

## Timed calls

A call fixes model token quantities and an SPYx benchmark at the start, each from $150 of
USDC, then observes liquidation quotes through the existing Jupiter integration. 90 days.
Scoring is exact bigint relative return.

**A call is not a wager and does not touch anyone's holdings.** The deadline resolves our
claim; it sells nothing.

The `thesis_call` guard enforces this in the database, and `src/server/calls/guards.test.ts`
proves each clause in a rolled-back transaction, so the real open calls are never touched:

- a published call cannot be deleted
- rules, holdings and the starting observation are immutable
- observations cannot move backwards in time
- resolution requires a complete observation inside the deadline window
- a result must match the relative return actually observed
- a call cannot be marked unresolved before its window closes
- a resolved call cannot be changed afterwards

## What is real and what is not

| | |
| --- | --- |
| Quotes and prices | Real, live, from Jupiter |
| Baskets and weights | Real |
| Calls | Real observations, started 15 Sep, open until 14 Dec |
| Purchases | **Simulation.** `EXECUTION_MODE=simulation`: real orders are assembled and the full state machine runs, but no signature is requested and nothing is broadcast |
| X ingestion | **Manual.** Posts are curated by hand and verified against the FxTwitter mirror. There is no automatic ingestion |
| Creator positions | **None.** No thesis carries a verified creator wallet position, and every card says so |

## Running it

```bash
pnpm db:push && ./scripts/apply-constraints.sh   # core schema
pnpm tsx scripts/calls.ts migrate                # thesis_call + its guard
pnpm db:seed                                     # verified asset universe
pnpm content:publish                             # catalogue, curated included
pnpm tsx scripts/calls.ts start                  # open calls for anything unstarted
pnpm tsx scripts/calls.ts refresh                # re-observe open calls
```

`start` is additive: it never resets or backdates a call that already exists.

### Checks

```bash
pnpm test                                        # 89 tests, 7 files
pnpm tsx scripts/verify-source-posts.ts          # attribution against the live posts
pnpm tsx scripts/e2e-buy.ts                      # full buy flow against a running server
NEXT_DIST_DIR=.next-build pnpm build             # build without disturbing a dev server
BASE=http://localhost:3100 node scripts/browser-check.cjs
```

`NEXT_DIST_DIR` matters: `next dev` and `next build` both write to `.next`, and a build run
underneath a live dev server leaves it loading chunks that no longer exist.

## Deployment — not done, and what it needs

The production database (Neon) **does not have the `thesis_call` table**. A production build
fails on it, which is how this was found. Before any deploy of this work:

1. `DATABASE_URL=<neon> pnpm tsx scripts/calls.ts migrate`
2. `DATABASE_URL=<neon> pnpm content:publish` — publishes the curated thesis
3. `DATABASE_URL=<neon> pnpm tsx scripts/calls.ts start`
4. Deploy. `vercel.json` refreshes calls daily at 03:15 UTC and reconciles at 03:00 UTC.

Neither the migration nor the cron has been exercised against production. Nothing in this
document should be read as a claim that it has.
