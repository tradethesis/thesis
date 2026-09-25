# Taking a side

Free, anonymous conviction on a thesis, scored forward from the moment it was taken.
Written 18 September 2026. Local only — nothing here has been deployed or committed.

## Why this exists

The app was finished enough to browse and impossible to use. Three facts, all measured
rather than guessed:

- **Nothing changed between visits.** Twelve call observations existed across forty-eight
  hours and the best call had moved +1.26%.
- **Nothing you did was recorded.** `event` had 162 rows and no query anywhere read one.
  Following was localStorage. `saved_thesis` was empty.
- **You could not reach the core action.** Every intents route requires a SIWS session and
  `useWallet.connect` hard-fails without Phantom specifically. No Phantom meant no quote, no
  review, no result — only the amount slider.

So the loop — *do something → the world responds → come back* — did not exist at any point.
More assets, more theses and more motion had all been tried and none of them touched this.

A conviction costs nothing, needs no wallet, and produces a personal result that changes on
its own. That is the whole idea.

## The rules

These are the spine. Each one should be checkable by reading a single function.

1. **Forward-only scoring.** A conviction is scored from the first `call_observation` at or
   after `takenAt`, never from the call's start. Grading somebody on a rise that happened
   before they arrived is the standard way a scoreboard like this flatters everybody.
   `scoreConviction`, `src/lib/conviction.ts`.
2. **Switching sides resets the clock.** `takeSide` rewrites `takenAt` on conflict. Credit
   for a period spent on the other side is credit for a view you did not hold.
3. **Too early is not zero.** Fewer than two observations since entry reads as
   `too_early` — never as a win, a loss or a draw.
4. **No call is not too early.** A thesis with no running call reads as `unscored`, because
   unlike "too early" it does not resolve by waiting.
5. **The basket is pinned at entry.** `basketKey` is stored with the conviction. If the
   thesis is re-weighted, the conviction is `closed` against the basket it was taken on
   rather than quietly rescored against a different one.
6. **A floor before any crowd number.** `CROWD_FLOOR = 5`. Below it no split is shown at
   all, and the headcount is printed beside every split that is.
7. **The owner comes from the server.** Session first, then the `x-thesis-anon` header,
   never a body field. Covered by `src/app/api/conviction/route.test.ts`.
8. **No notifications, badges, streaks or urgency.** "Since you last looked" renders nothing
   when nothing changed.

## Identity

Reuses the shape `saved_thesis` already modelled: `ownerKind` of `wallet` or `anon`, plus
`ownerKey`. Anonymous by default, keyed on `anonId()`; upgraded to `wallet` when a session
exists. A CHECK constrains the key to `^[A-Za-z0-9_-]{8,64}$`, and the same regex is applied
in `isValidOwner` before anything reaches Postgres.

Unique on `(ownerKind, ownerKey, thesisId)` — one live side per person per thesis.

## Where it appears

| Surface | File |
|---|---|
| Back it / Doubt it, on every card | `src/components/feed/TakeASide.tsx` |
| Your record, first tab of My theses | `src/components/mine/MyTheses.tsx` |
| Since you last looked, top of Discover | `src/components/feed/SinceYouLastLooked.tsx` |
| What people called, second view on the Leaderboard | `src/components/leaderboard/Leaderboard.tsx` |
| Scoring | `src/lib/conviction.ts` |
| Storage and forward-scored reads | `src/server/conviction.ts` |
| API | `src/app/api/conviction/route.ts` |

### The collapsed card, after the trim

The card is three things and nothing else: **the post, the basket tile, one row of actions.**
What it replaced had seven blocks — quote, heading, byline, basket strip, performance line,
conviction control, button row, social row — each defensible alone and unreadable stacked
fifty-nine times.

- **The post leads.** Avatar, name, handle, date, then the text at reading size — larger
  than anything we wrote about it. It is the thing that is actually true about the world.
- **No post, so the headline leads,** under a `THESIS EDITORIAL · <category>` eyebrow.
- **The tile is the basket and the way in.** Logos, tickers, and two labelled figures
  (`MODEL` and the benchmark). Tapping anywhere on it opens the buy modal over the feed.
- **The foot row** carries the post's engagement on the left and 👍 👎 ⋯ on the right.
  The overflow menu holds *Why this basket*, *Open the thesis*, *Share* and *Follow*.
- **Your verdict** gets its own line, and only on a card you have actually called.

Two things the trim deliberately did **not** take:

1. **The non-endorsement stays visible.** `Thesis editorial's basket · not <author>'s pick`,
   in the smallest type on the card. It briefly became screen-reader-only text, which put a
   named person's words directly above a basket with nothing on screen saying they did not
   choose it. That is the one ambiguity this product cannot leave standing.
2. **Counts, never a percentage.** The thumbs carry raw counts. A share of the vote is a
   claim about what people think and is gated on `CROWD_FLOOR`; a count of two is a count
   of two. The collapsed card never renders the former, and the browser check asserts it.

The thesis's own objection moved into *Why this basket* rather than sitting on the card.

### What the crowd tab ranks, and what it does not

The plan called for a leaderboard of people. It ranks **beliefs**, not people, and that is a
deliberate departure. Every owner is an anonymous browser id or a wallet address; publishing
those in a ranked table is a privacy problem dressed as a scoreboard, and a chosen display
name would need an account system this product does not have. Each row still scores every
call from its own entry, so two people on the same side can have different results.

## Five bugs found and fixed on the way

These were all upstream of the feature and all of them were part of why the app felt dead.

1. **Crypto baskets could never have a call.** `startCall` looked holdings up in
   `EQUITY_ASSETS` only, so any crypto holding threw "not on the active allowlist" — and
   because `startEditorialCalls` awaited in a bare loop with no `try`, the first throw
   stopped every thesis after it. Fixed to search equities and crypto, and to carry on past
   a failure. **Calls went from 4 to 59.**
2. **A rate limit read as a missing route.** `liteQuote` had no retry, so a 429 surfaced as
   "price unavailable" — indistinguishable from "this asset cannot be traded" and meaning
   the opposite. Now backs off up to five times. Deliberately *not* switched to the keyed
   base: that budget is reserved for orders somebody is about to sign.
3. **`refreshCalls` fired every call at once.** `Promise.all` over fifty-nine open calls is
   a burst of roughly two hundred quotes, which the free tier answers with 429s. That is how
   a job that appears to run daily produced twelve observations in two days. Now sequential.
   **Observations went from 12 to 68 in one pass and climbing.**
4. **One shared record, not one fetch per card.** `useConviction` loaded per instance, and
   the trimmed card mounts two of them — the thumbs and the verdict — so first paint fired
   118 identical `GET /api/conviction` requests and gave two halves of the same card two
   chances to disagree. The answer now lives in a module-level cache with a single in-flight
   promise. The browser check fails the build above four requests.
5. **A simulated basket read as `draft` mid-run.** `deriveIntentStatus` keyed `executing` on
   a signature, and simulation never signs, so between legs the progress screen fell through
   to the amount slider. Abandoning it there left an intent the open-basket check refused to
   look past, with the cancel button on a screen you could not reach. A basket with some legs
   finished and others still to go is now `executing`, which makes "Keep what I have"
   reachable and closes the lockout.

## Verification

```sh
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
pnpm lint && pnpm tsc --noEmit && pnpm vitest run
pnpm dev --port 3210                       # check the port is free first
BASE=http://localhost:3210 node scripts/conviction-check.cjs
```

`scripts/conviction-check.cjs` runs in a plain Chromium with **no wallet extension**, at 320,
390, 768 and 1440. If any check in it ever needs a wallet to pass, the feature has failed.
It covers: backing persists across a reload with nothing signed; switching replaces rather
than duplicates; tapping the held side clears it; no crowd split below the floor; visible
focus; reduced motion honoured; 44px targets; no horizontal overflow; and the call appearing
in Your record.

> `scripts/browser-check.cjs` is **stale** — it still targets `.cc` cards, a "Resolved"
> filter and a standalone buy page, none of which exist since the feed was rebuilt. It needs
> rewriting against the current markup; it was left alone rather than half-fixed.

## Before any deploy — production is behind the schema

`pnpm build` against `.env.production.local` **fails today**, and not because of this work:

```
relation "source_post_metrics" does not exist
  Failed to collect page data for /t/[slug]
```

The production database has not had a `drizzle-kit push` since `source_post_metrics` was
added to `schema.ts`, and it is now also missing the new `conviction` table and its three
CHECK constraints. Both are fixed by the same command, run against production by somebody
who means to:

```sh
pnpm db:push          # drizzle-kit push, then db:constraints
```

Not run tonight: the agreed scope was local only. Note the standing trap — `db:push --force`
drops the indexes and constraints that `constraints.sql` owns, which is why `db:push` chains
`db:constraints` behind it.

To build locally without touching production, point the build at the local database:

```sh
DATABASE_URL="$LOCAL" DATABASE_URL_UNPOOLED="$LOCAL" NEXT_DIST_DIR=.next-build pnpm build
```

## One demo row is in the local database

`conviction` holds a single row, `owner_key = 'demo_backdated_1'`, backdated to 16 September
so it has four observations behind it and reads as scored rather than "too early". It exists
because a fresh tap cannot be scored for about a day, and the scored state is the whole
point of the feature. Every row the automated checks left behind has been deleted.

To see it in a browser, set the anonymous id it is keyed on:

```js
localStorage.setItem("thesis.anon.v1", "demo_backdated_1")   // then open /app/my-theses
```

To remove it:

```sql
delete from conviction where owner_key = 'demo_backdated_1';
```

It scores **ahead 4.27pp** from a 16 September entry. Scored from the call's start instead
it would read as behind — the basket fell from $149.69 to $136.50 on 15–16 September, before
that entry. That gap between the two answers is the forward-only rule doing its job on real
numbers, not a contrived fixture.

## The catalogue has outgrown the free quote tier

This is the constraint behind every "Needs a refresh" on the feed, and it is a decision
rather than a bug.

Fifty-nine open calls need roughly **240 quotes per refresh** — every holding plus the
benchmark, once per call. `lite-api.jup.ag` does not give one IP that many in a window. It
was fine at four calls. Measured today: one round landed 29 of 59; the next landed 0, and a
single bare `curl` from the shell was answered `429` at the same time. Pacing helped
(sequential, 500 ms between requests, backoff on 429) and did not solve it, because the
limit is a budget, not a rate.

The keyed base `api.jup.ag` is configured (`JUP_API_KEY`) and would clear this. It is
**deliberately not used**, because `src/server/jupiter/client.ts` reserves that budget for
orders somebody is about to sign, so a valuation poll can never starve execution. That rule
was written when four calls existed. With fifty-nine it is worth revisiting — a once-a-day
cron is not a display poll — but it spends a real budget, so it is not a change to make
without deciding to.

Three ways out, in order of how little they cost:

1. Point **only the calls cron** at the keyed base and leave page rendering on lite.
2. Refresh in batches across the day rather than all fifty-nine at once.
3. Keep fewer calls open — the fifty seeded fixtures do not all need one.

Until one of them happens, the feed will keep saying "Needs a refresh" on most cards, which
is the honest reading: the last price is the most recent thing known, not the current one.

## Still open

- `source_post_metrics` has no cron, so engagement figures on cards go stale until somebody
  runs `pnpm content:metrics` by hand.
- Observations land roughly once a day, so an entry waits up to twenty-four hours before it
  can be scored at all. The UI says so rather than showing a zero.
- The crowd split cannot be seen locally without five separate browsers calling the same
  belief, which is the floor doing its job.
