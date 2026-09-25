# Thesis Gifts

Product redesign · 22 September 2026

## Decision

Make the first investment a personal gift. A sender chooses a reviewed stock-token pack around a future the recipient cares about, adds an X handle and a personal message, funds the gift, and sends a claim invitation. The recipient signs in with X, satisfies eligibility requirements, opens the pack, and receives the underlying tokens in a wallet they control.

The thesis makes the gift meaningful. The pack reveal makes receiving it memorable. This changes acquisition and onboarding, not the investment's payoff. There is no lottery, randomized value, new speculative gift token, or return guarantee.

## Audience and initial job

Sender: an existing investor with USDC who wants to introduce an adult friend to an investment idea through a personal gift.

Recipient: an adult in an eligible pilot market, familiar with the companies but potentially new to wallets and stock tokens. Country-level eligibility and actual market access must be established before a funded pilot; this product is not a way around distribution restrictions.

“When a friend talks about a future they believe in, let me send them a small investment expressing it, with a personal note, and without making them learn a trading terminal first.”

## Routes and shipped behavior

- `/`: public gift collection and sender composer. The environment's existing waitlist mode remains respected.
- `/gift/preview#…`: the **unfunded** recipient preview: a sealed pack torn open by drag or button, the disclosed allocation, thesis and counterargument, replay, another-gift action. Muted "Unfunded gift preview" banner.
- `/gift/[token]`: a **funded** invitation, read from the server-owned gift record. Sealed ink "A real gift" banner, so the two are never confused. Sign in with X; every outcome below has its own screen.
- `/buy/[slug]?gift=[token]`: the existing checkout in gift mode. Active only for a reserved gift; amount and allocation come from the record, never the URL.
- `/discover`: preserved idea-to-basket matching page. `/connect`: the wallet gate. `/app`: the terminal.

The catalogue wraps three existing published, buyable allocations: AI Spending Chain, Onchain Finance Rails, and Digital Advertising. Their gift titles are presentation, not new allocations. Holdings must be enabled, present in the reviewed equity mint allowlist, and sum to 10,000 basis points. Missing or unavailable baskets are omitted, never replaced with invented allocations.

**Gift budgets are $1–$1,000** (beta, 23 September; it was $10 earlier that day). A gift is opened by the recipient's own purchase through the existing buy engine, whose ordinary floor is `MIN_BASKET_RAW` ($75). Gifts get their own floor, `GIFT_MIN_USD`, and only gifts: `/api/intents` accepts a basket under $75 only after `giftPurchaseTerms` confirms a gift reserved for this wallet at this exact amount. The cost is fees — about $0.16 flat per holding (token-account rent) plus 0.1%:

| Gift | 3 holdings | 1 holding |
|---|---|---|
| $1 | ~$0.48 (48%) | ~$0.16 (16%) |
| $5 | ~$0.49 (10%) | ~$0.17 (3%) |
| $10 | ~$0.49 (5%) | ~$0.17 (2%) |

The composer shows the sender this in dollars whenever it is 6% or more. The database CHECK is `amount_usd BETWEEN 1 AND 1000`.

Preview details live in the URL fragment so they are not sent to the server or HTTP referrers. Anyone with the complete link can read them; the composer says the note is shared. The fragment is untrusted and grants no authority.

### Opening the pack

A gift unwraps in the order a real one does: **the card, the wrapping, the contents.**

1. **The card.** The invitation (or preview) leads with the sender's note and a sealed pack. No amount and no holdings are shown before opening; the terms say plainly that opening turns the USDC sent to you into stock tokens that can lose value. Anybody who would rather know first can open "Peek inside". Gift-mode checkout keeps the amount and allocation folded away the same way (`Sealed` in `BuyFlow.tsx`); the review step still lists every leg before anything is signed.
2. **The wrapping.** `PackStage` takes the whole screen: the pack, one hint, a sound toggle. The pack is a WebGL mesh (`pack-scene.ts`, three.js 0.180, built in code rather than a downloaded model so there is no third-party licence and every pack carries its own art): a puffed foil pouch with crimped seals, an iridescent clear-coated material reflecting a studio environment, and a crease normal map. Drag across the seal and the strip peels progressively from the pulled end; release past halfway or flick and it tears free, the pack bursts with light and confetti (`canvas-confetti`), and the stage fades onto the contents. A text button does the same for keyboards. Sound is synthesized (`src/lib/gift-sound.ts`), on by default, mute remembered per device. Without WebGL, or under reduced motion, the flat CSS tear (`PackRip`) stands in, and reduced motion skips the tear entirely.
3. **The contents.** Holdings fly out and turn to face you; the amount arrives here ("$25 of it, from Ana"). Then `GiftNext`: *why these* — the thesis the pack was built from, with the case against — leading to **Read the full thesis** (`/t/[slug]`), then *Explore other theses* and, last, *Send a pack*.

It only ever reveals what already exists. In a preview, the disclosed allocation. In a funded gift, it plays once per session **over holdings the chain has confirmed** — never during a purchase, where it would be a progress animation over something not yet true. No counters, rarity or jackpot effects.

### The packs

Each pack is presentation over a real, reviewed, buyable basket whose every holding is on the allowlist (`src/server/gifts/catalogue.ts`); a basket that stops qualifying simply drops out. Four today: The AI optimist, A new money era, Made for the internet, and **The long game** (QQQx, SPYx, GLDx — a broad first investment). Other qualifying baskets repeat the same large-cap names and were left out to keep the collection distinct. No memecoin pack: gifts are stock tokens, and a memecoin can go to zero within hours of being opened.

### Photos and packs people build

- **A photo in the middle of the pack.** The browser squares it, caps it at 768px and re-encodes it (webp or jpeg), which also drops its EXIF — no GPS or camera serial travels into a gift (`src/lib/gift-image.ts`). It stays in the sender's tab until they sign in; then `POST /api/gifts/images` stores it in Postgres (`gift_image`, ≤300 KB, magic-byte checked, deduped by SHA-256, 20 uploads/hour/wallet) and the gift records `center_image_id`, which freezes with the other terms. `GET /api/gifts/images/[id]` serves it (browser cache one hour, never the CDN, so a takedown — setting `removed_at` — works within the hour). A shared preview link cannot carry a photo and shows the pack's art. **Moderation is beta-level:** signed-in uploads only, rate limits, unguessable ids, takedown by id. An automated classifier is required before a public launch.
- **Build your own pack.** The sender picks **one to three** stock tokens from the enabled allowlist, sets the split, and writes the belief, why these, and the other side. It is published as a public thesis under their wallet through `createThesis` (the same rules as /app/create), and `gift_pack_design` names and colours it. Custom packs are addressed as `my-<thesis slug>` and qualify by exactly the curated rule (`resolveGiftPack`). Publishing needs `OPENROUTER_API_KEY`; without it the builder says it isn't switched on.
- **One to three holdings.** The engine, the thesis schema and the database now accept 1–3 holdings with per-count bounds: 1 → 100%, 2 → 10–90% each, 3 → 10–70% each (`weightBoundsBps` in `src/lib/money/allocate.ts`; `basket_allocation_check` in constraints.sql; migration `2026-09-24-one-to-three-holdings.sql`). Curated baskets stay at three. Also fixed: publishing a genuinely new allocation used to fail for want of a basket name; `createThesis` now derives one.
- **Finding the recipient without paying X (accept-then-fund).** `findRecipient` tries, in order: Privy's own records (`getByTwitterUsername` — free, anyone who has signed in here with X); X's API only if a token is set and it answers (it is pay-per-use and answers `402 credits depleted` with no credits); otherwise **accept-then-fund**. The gift moves `draft → awaiting_recipient`, the sender shares the link, and the recipient accepts by signing in with X: the verified identity token's username must equal the handle, and the gift binds that account's stable id and its embedded wallet (`awaiting_recipient → wallet_provisioned`). The sender's page polls and moves to paying the moment they accept; `/gift/send/[id]` lets them come back, and a lost link can be reissued (the old one stops working). The amount and contents stay hidden throughout. `X_API_BEARER_TOKEN` is now optional.
- **Built packs ask for one line.** The builder takes the belief, the holdings and a category; the case for and the case against are drafted from them (`draftCase`), then the full thesis rules are checked. /app/create still asks authors to write both.
- **Fixed on the way:** the send flow's derived idempotency keys (`<uuid>:confirm`, `<uuid>:fund:<signature>`) were refused by the server's key format, so a real send could not have got past confirming the recipient. The stubbed browser suite could not see it; `http.test.ts` now pins the real shapes.

## Architecture decision · 23 September 2026

Written before any financial state was implemented. Provider capabilities below were read from the
installed SDK's type definitions (`@privy-io/node` 0.35.0) and current provider documentation, not
assumed.

### What was verified about the providers

- **Privy cannot resolve a stranger's X handle.** `users().getByTwitterUsername` and
  `getByTwitterSubject` only find people who have already signed up to this Privy app. There is no
  Privy lookup for someone who has not.
- **Privy can create a wallet for an X account before its owner signs up.** `users().create` accepts
  a linked account of type `twitter_oauth` with required `subject`, `username` and `name`, plus
  `wallets: [{ chain_type: "solana" }]`. Privy documents this as the mechanism for distributing assets
  to users before they sign up; the wallet appears in their account on first login.
- **The stable X account ID therefore has to come from X.** `GET https://api.x.com/2/users/by/username/{username}`
  with an app-only Bearer token returns `id`, `username` and `name`. No Bearer token is configured.
- **Privy verifies the recipient server-side.** `utils().auth().verifyIdentityToken(token)` returns
  the user with linked accounts, including the Twitter `subject`. The existing Solana sign-in session
  proves control of a wallet and nothing about an X account.

### D1 · Denomination: a USDC budget, converted when the recipient opens it

The sender funds the exact budget in USDC, plus a fixed SOL allowance for the recipient's network
fees and token-account rent. Nothing is bought at send time. When the recipient opens the pack, their
own wallet buys the reviewed allocation through the existing buy engine, at that moment's prices.

- **Prices are fixed at opening**, by the recipient's own purchase.
- **Market movement before opening: none** — the gift is USDC until then.
- **Fees:** the sender pays the funding transfer and the SOL allowance; swap fees at opening come out
  of the budget. The recipient receives what the budget buys, and copy says so.
- Rejected: buying token quantities at send time. It puts the sender, not the holder, in the position
  of acquiring stock tokens for somebody else's jurisdiction, and it makes every unclaimed gift a
  volatile, freezable asset sitting in limbo.

### D2 · Custody: no escrow. Funds go to a wallet only the recipient's X account can use

On confirmation of the resolved account, the server pregenerates a Privy user keyed to the **stable X
subject** with an embedded Solana wallet, created **with no additional signers**. The sender's own
wallet then transfers the USDC and SOL allowance directly to that address. Thesis holds no key,
signs nothing and broadcasts nothing, preserving the invariant the rest of the codebase keeps
(`src/server/solana/rpc.ts` excludes `sendTransaction`).

Rejected: a program or treasury that holds funds and releases them on proof of identity. That is a
custom escrow, it would be unaudited, and the brief rules out labelling it production-ready.

### D3 · Refunds: none, by construction — said before funding

Once funded, the USDC belongs to the recipient's wallet. Nobody, including Thesis, can move it back.
The sender is told this before signing: *"A gift can't be recalled once it's sent."* There is no
refunding or refunded state because there is no mechanism that could make one true. The protection
against sending to the wrong person is upstream: the handle is resolved to a stable account, and the
sender confirms the resolved name and picture before funding.

- An **ineligible recipient** keeps the USDC; they cannot open it into stock tokens where they live.
- An **unclaimed gift** stays in the recipient's wallet indefinitely. The *invitation link* can
  expire; funds cannot.

### D4 · Identity: the X subject, never the handle

The gift binds the stable X account ID at resolution. A renamed handle leaves the subject unchanged,
so the gift follows the person. A reassigned handle belongs to a different subject, so its new owner
sees the wrong-account state. A client-supplied handle, subject, wallet, URL fragment or unsigned
JSON never authorizes anything.

At claim the server requires both: a verified Privy identity token whose Twitter `subject` equals the
gift's, **and** an embedded Solana wallet on that same Privy user equal to the gift's destination.

### D5 · Eligibility

**Hackathon policy: anyone can open a gift.** `GIFT_ELIGIBILITY_PROVIDER=open` is an explicit
setting, written down as a decision rather than left as a default: there is no check of where the
recipient lives. The claim screen no longer asks for a country or a declaration.

This must change before a public launch. The issuer does not offer these tokens to US persons or in
its listed restricted countries, so a real launch needs a real check at opening (where stock tokens are
acquired). The `ineligible` outcome and its "you keep the USDC" screen are still built for that day.
Sending is unaffected either way: it moves USDC, not stock tokens.

### D6 · State machine

```
draft ─► recipient_resolved ─► wallet_provisioned ─► funding_pending ─► funded
                                                          │                │
                                                          ▼                ▼
                                                     reconciling     claim_reserved ─► delivering ─► claimed
                                                                                          │
                                                                                          ▼
                                                                                   claimed_partial
cancelled   ◄── only from draft, recipient_resolved or wallet_provisioned
failed      ◄── funding evidence contradicts the gift (wrong amount, mint, destination or signer)
```

The unfunded preview is outside this machine.

- **Atomic transitions.** Every change is a compare-and-set on `(id, state)`. Two callers racing for
  the same transition: one wins, the other is told what the state now is.
- **Ledger.** Each transition appends a `gift_event` row with a unique idempotency key. A retried
  request with the same key returns the recorded outcome instead of acting twice.
- **One transaction funds one gift.** The funding signature is unique across gifts.
- **Evidence, not claims.** Funding is `funded` only when a confirmed transaction shows the gift's
  USDC amount leaving the sender's wallet and arriving at the gift's destination.
- **Uncertainty is its own state.** A submitted funding transaction whose status cannot be read moves
  to `reconciling`, keeps its signature, and is re-read. The sender is never asked to send again while
  one is outstanding — that is how gifts get funded twice.
- **Claim reserved before delivery.** `funded → claim_reserved` binds the verified subject and wallet
  first; delivery happens after, through the existing buy engine, whose intent records its own
  reconciled legs. A partial fill leaves the unspent USDC in the recipient's wallet: `claimed_partial`.

### D7 · Invitation links

A 128-bit random invitation ID, stored only as a SHA-256 hash. It opens the invitation page and
confers nothing else. The page shows the sender's name, pack and note, as the unfunded preview
already does, because the sender chose to share the link. Analytics never receive note or handle.

### D8 · Recovery after opening

The embedded wallet is the recipient's, not the X account's. After opening, the recipient is asked to
add a second sign-in method (email or passkey, via Privy account linking) and shown key export. Live
delivery must not launch until this path has been exercised end to end.

## Implementation status · 23 September 2026

**Nothing here has moved real funds, and no funded gift or claim has been exercised end to end.**

### Built and tested

| Piece | Where | Verified by |
|---|---|---|
| State machine, no refund states | `src/server/gifts/lifecycle.ts` | `lifecycle.test.ts` |
| Identity judgement (subject + embedded wallet) | `identity.ts`, `providers.ts#identityOf` | `identity.test.ts` |
| Funding evidence from chain | `funding.ts` | `funding.test.ts` (stub chain) |
| Unsigned funding transaction | `funding-tx.ts` | `funding.test.ts` |
| Compare-and-set transitions, ledger, replay | `repository.ts` | `gifts.db.test.ts` (local DB) |
| Workflow and every typed outcome | `service.ts` | `gifts.db.test.ts` |
| Schema, guards, append-only ledger | `src/server/db/migrations/2026-09-23-gifts.sql` | `gifts.db.test.ts` |
| Routes, reconciler | `src/app/api/gifts/**`, `src/app/api/cron/gifts` | route smoke + browser suite |
| Sender live flow UI | `GiftSend.tsx` | `scripts/gift-check.cjs` (stubbed API) |
| Funded invitation UI | `GiftInvitation.tsx` | `claim-screens.test.tsx`, `gift-check.cjs` |
| Pack tear (3D tilt, foil, peel, confetti, card fly-out) | `PackRip.tsx`, `gifts.css` | `gift-check.cjs` |
| Opening sounds and mute | `src/lib/gift-sound.ts` | `gift-check.cjs` (mute remembered) |
| X-only sign-in at gift checkout | `GiftSignIn` in `src/components/buy/SignIn.tsx` | `gift-check.cjs` |

Tested cases include: identity mismatch, renamed handle, reassigned handle, wallet binding and an external wallet at the same address, exact-amount funding, wrong amount/destination/sender/token, failed transaction, invalid allocation version, duplicate create and duplicate funding submission, one signature funding two gifts, two same-person claims racing, a different person racing a reservation, partial fill, expiry, recovery after an uncertain transfer, frozen terms, and the append-only ledger.

### Gated: what live gifting still needs

The page reads `GET /api/gifts/readiness` and shows each missing piece in plain words. No path substitutes a stand-in in production.

| Variable | What it enables | State here |
|---|---|---|
| `GIFTS_LIVE=1` | The master switch. Every other piece can be configured and gifting stays off until this is set | beta: set |
| `X_API_BEARER_TOKEN` | Resolving a handle to a stable X account ID before funding | **missing** (the owner adds it) |
| `GIFTS_PROVISION_WALLETS=1` | Creating the recipient's Privy user and Solana wallet (a lasting side effect in Privy) | beta: set |
| `GIFT_ELIGIBILITY_PROVIDER=open` | Who can open a gift. `open` = anyone; see D5 | beta: set |
| `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_SECRET` | Server-side identity-token verification | present |
| `PRIVY_JWT_VERIFICATION_KEY` | Optional; the SDK fetches it otherwise | — |
| `CRON_SECRET` | The reconciler at `/api/cron/gifts` | present |

The Privy app must also have **identity tokens enabled** and **Twitter/X** as a login method.

### Not exercised

- A completed X OAuth sign-in. The real Privy modal was opened in a browser; the OAuth round trip cannot be automated honestly.
- Handle resolution against X, wallet provisioning against Privy, a real funding transfer, a real claim, and delivery through the buy engine for a gift.
- Recovery: linking email/passkey and key export are wired to Privy's own flows but have not been run.
- The migration has been applied to the **local** database only. It is not chained into `pnpm db:push`, deliberately; applying it anywhere else is an explicit step.

### Before a funded pilot

1. Add `X_API_BEARER_TOKEN`, enable identity tokens in Privy, and run one $10 gift end to end on a test account.
2. Before any public launch, replace `GIFT_ELIGIBILITY_PROVIDER=open` with a real check (D5).
3. Exercise recovery (second login method, export) on a real recipient account.
4. Schedule `/api/cron/gifts` so an uncertain transfer is reconciled without anybody pressing "check again".
5. Add abuse and rate limits on gift creation and handle lookup (each lookup spends X API budget).

## Experience principles

- The allocation is disclosed; the suspense is presentation, not a random financial payout.
- The sender's message and the recipient's identity lead. Research supports the experience.
- Stock tokens represent economic exposure and can lose value. Do not describe them as stablecoins or direct shareholder ownership.
- No wallet wall before previewing the gift. Authentication has a purpose when actual claim authorization exists.
- Prioritize a readable phone experience, 44 px controls, accessible focus, keyboard access, and reduced-motion support.
- Reveal animations use opacity and transforms; holding amounts do not count up like prizes.
- No fabricated traction, balances, transfers, prices, or claim success.

## Pilot and decision criteria

Start in one verified eligible market with adult recipients. Recruit 20 senders spending their own money; the experiment should not depend on subsidized gifts.

Measure paid sender conversion, recipient claim completion, support burden, time to first successful claim, net cost per claimed gift, recipient self-funded purchases, repeat senders, and recipient-to-sender conversion. A preview open is not activation; an unfunded demo is not a gift sent. A claim followed by an immediate exit is different evidence from a self-funded investment.

The central hypothesis is that a trusted sender plus a meaningful pack lowers first-investment friction. The reveal is an acquisition interaction, not evidence of long-term retention.

## Featured packs (24 Sep 2026)

Chosen by research fit (`docs/curated-thesis-research.md`), never by return. "The AI optimist" now
backs subject 1, *Intelligence becomes a utility* (NVDAx 40 / MSFTx 30 / AMZNx 30). The earlier
MSFTx/NVDAx/PLTRx pack shares 65% of its weight and puts an application outside that subject's scope,
so it is unfeatured but still opens for gifts already sent. Onchain finance stays unfeatured. Subjects
3–6 (power, robotics, appetite drugs, security) have no verified allowlisted assets and stay research-only.

## Invitation, opening and interest (24 Sep 2026)

- **Invitation:** the real 3D pack sits on the page (`PackPreview3D`), locked so it can't be torn
  there, turning toward the pointer on a glow in the pack's colour. The note is a gift tag. There's
  no site header or footer on recipient pages. The flat artwork is the fallback without WebGL or
  with reduced motion.
- **One-tap open:** "Open it" reserves the gift, then the full-screen stage runs the whole purchase
  behind a waiting pack (`useOpenGift`) and tears it by itself once the chain confirms. There is no
  checkout page. A live gift purchase can only be signed while it is attached to the gift
  (`prepareLeg`).
- **Opened page:** a full-width reveal with the torn pack and the holdings rising from it, one
  card per confirmed holding with a Proof link, and "Open it again" to replay the 3D tear.
- **Interest line on pack cards:** English Wikipedia human page views for the companies' articles,
  the last 7 days against the 7 before (`server/gifts/attention.ts`), cached for a day and left
  off when unavailable. It measures attention on the companies, never returns, and the footnote
  says so.
- **New packs, research (24 Sep):** of research subjects 3–6, only appetite drugs (LLYx + NVOx,
  both genuine Backed mints, about 2% round-trip cost at $5) have enough liquidity. Power,
  robotics and security tokens have no route or cost 65–91% on a round trip. Enabling LLYx/NVOx
  is an allowlist change and waits for the owner's go-ahead.

## Rip first, claim after (25 Sep 2026)

Anyone with the link can tap "Rip it open" and tear the pack, with no sign-in. Afterwards the
page shows the amount, the stocks and their share ("about $2.00, before fees, at claim"), and
says plainly that nothing is bought until the claim. "Sign in with X to claim $N" is the only
gate. Claiming reserves the gift for the named account, then buys it inline on the same screen
(no second pack) and lands on the confirmed "Opened" page. Ripping is remembered for the browser
session; "Rip it again" replays it. The amount is hidden until the rip, so the surprise is kept.
