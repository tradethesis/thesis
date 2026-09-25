# Claude handoff: finish Thesis Gifts

Work in `/Users/limon/thesis`. Continue the existing implementation; do not start a new app. Read this document, `docs/gifting.md`, and the current-decision sections at the top of `PRODUCT.md`, `PRD.md`, and `DESIGN.md` before editing. Inspect `git status` and the latest code: the working tree contains substantial uncommitted work by the owner and other agents. Preserve it. Existing code takes precedence over any stale file inventory below.

## The product decision

**Give someone their first investment.**

Thesis distributes existing onchain stock exposure through personal gifts. A sender selects a future the recipient cares about, chooses a budget, adds a personal message, and addresses the gift to an X account. The recipient follows an invitation, signs in with X, meets applicable eligibility requirements, and opens a themed stock pack into a wallet they control.

The thesis supplies meaning. The sender supplies trust. The reveal supplies delight. This is a distribution and onboarding product, not a novel investment payoff. Its success metric is a recipient's subsequent self-funded investment or another paid gift, not preview opens.

- Start with three reviewed stock-token allocations in one verified eligible market.
- A fixed, disclosed allocation; no randomized financial payout, rarity multiplier, lottery, staking game, or new basket token.
- No generic AI chat as the main page. No mandatory wallet gate to browse or view a gift preview.
- No claim that stock tokens are stablecoins, direct shareholder ownership, available everywhere, or guaranteed to appreciate.
- No invented partnerships, balances, recipients, revenue, testimonials, or claimed transfers.
- AI/Jev is not required for this version. Do not add it unless it serves a concrete need.

## What is already built

The public `/` route is a warm, mobile-friendly pack collection and inline sender composer. `/gift/preview#…` supports recipient preview, reveal, replay, and thesis details. The previous prompt matcher lives at `/discover`; the existing protected terminal remains `/app`. Preserve existing thesis and purchase routes and the deployment's waitlist gating.

Key files:

- `src/components/gifts/{GiftHome,GiftPack,GiftRecipient,GiftShell}.tsx`
- `src/app/gifts.css`, `src/app/page.tsx`, `src/app/gift/preview/page.tsx`
- `src/app/discover/page.tsx`
- `src/lib/gifts.ts` and its tests
- `src/server/gifts/catalogue.ts`
- `src/app/PrivyBridge.tsx`, `src/lib/wallet/privy-signer.ts`
- `docs/gifting.md`

The catalogue wraps existing published, buyable equity baskets and keeps their allocation version. The gift names are The AI optimist, A new money era, and Made for the internet. Read actual data for constituents and weights; do not invent new allocations to make a UI look populated.

The composer validates a $10–$1,000 whole-dollar budget, X handle, sender name, and optional note. Integer-cent allocation conserves the budget. Preview data lives in a URL fragment, is editable and untrusted, and confers **zero financial authority**. Values in previews are illustrative allocation amounts, not quotes or balances. A changed basket version invalidates the old preview.

There is an optional Privy Twitter sign-in/link entry. Displaying a username is not ownership verification. The existing signed Solana session does not establish control of an X identity. No real X OAuth callback, funded gift, or gift claim has been verified by the previous agent.

## What to do

First inspect the running application, not just source files. Improve and complete the existing gift experience; retain its recognizable packs, restrained typography, personal notes, and warm palette. Keep the content concise. Do not replace it with a long promotional landing page or a dense trading terminal.

### 1. Finish the UX around a real state model

Sender: select pack → set budget and recipient → write note → inspect holdings, fees and terms → authenticate and fund when available → explicitly copy/share invitation → track its status.

Recipient: invitation from a named sender → see the gift and eligibility requirements → sign in with X → prove the intended identity → establish a recoverable wallet → claim → reveal confirmed holdings → understand the thesis → access portfolio and a usable sell/exit path.

Keep the current **unfunded preview** available without authentication. It must remain visually distinct from a funded invitation. A reveal is presentation, never proof of delivery. Show the sender's note prominently and keep research secondary.

Build clear states for wrong X account, canceled sign-in, missing provider configuration, unresolved handle, ineligible recipient, invalid/expired/revoked invitation, already claimed, allocation unavailable, insufficient funds, pending/failed execution, and a transaction whose status is uncertain. Give each state an appropriate next action. Preserve forms across recoverable errors without exposing private data.

The X account is the recipient identity, not the asset custodian. Wallet recovery and export, including access after loss of the X account, must have a credible implementation before live delivery.

### 2. Implement the server-owned gift lifecycle

Inspect the existing database, authentication and execution architecture and reuse compatible parts. Write a short architecture decision in `docs/gifting.md` before implementing financial state.

Use a separate server-owned gift record with an immutable allocation version, sender identity, stable recipient X provider ID, funding denomination, note, creation and expiry timestamps, eligibility result, state, and reconciled transaction references. Protect recipient identifiers and notes; keep analytics free of their contents. Public invitation identifiers must be unguessable but must not themselves authorize asset withdrawal.

Resolve the X handle through a supported provider lookup before funding and bind the stable account ID. Handles can change or be reassigned. Verify the recipient's provider identity server-side through the configured authentication provider, and bind the destination to a wallet controlled by that user. Do not trust a client-supplied handle, provider ID, wallet address, URL payload, or unsigned JSON.

Verify current provider documentation before choosing APIs. Do not assume Privy exposes arbitrary X username resolution just because Twitter login works. If required provider access is absent, implement the typed adapter and explicit unavailable state, document the missing configuration, and complete independent work. Do not substitute a fake resolver in a live path.

Define these decisions explicitly:

- Is the gift funded as purchased token quantities or as a USDC budget converted at claim? When are prices fixed? Who bears market movement and fees? Keep product copy consistent with the choice.
- Where do funds sit before claim, who can move them, and under what conditions? Reuse a reviewed architecture where possible; do not introduce an unaudited custom escrow and label it production-ready.
- What happens with insufficient liquidity, partial fills, missing assets, uncertain transaction confirmation, expiry, or an ineligible recipient?
- What precisely may the sender reclaim, when, and who pays the costs? Do not promise a guaranteed original-dollar refund for an asset-denominated gift.

Implement funding and claim reconciliation using confirmed chain evidence. Prevent double delivery and claim/refund races through atomic state transitions, idempotency and an execution ledger. Reserve the claim before transfer. Persist transaction identifiers and recover after a crash between broadcast and confirmation. Never retry an uncertain transfer blindly.

Suggested states (adapt to the chosen model): draft → recipient verified → funding pending → funded → claim reserved → delivering → claimed; plus explicit reconciliation, expired, refunding, refunded, and failed states. Unfunded preview is outside this financial state machine.

Add migrations as reviewable files. Do not run production schema changes or move real funds. Do not deploy, broadcast transactions, or send X posts/DMs on behalf of the user without explicit authorization. A share button should prepare an invitation for the sender's action, not silently post it.

### 3. Make the gift useful after opening

Provide an honest portfolio destination showing confirmed underlying holdings, the original allocation, and the associated thesis. Existing research and terminal screens can support this; do not rebuild them unnecessarily. Never show modeled basket performance as the recipient's actual P&L.

Keep sell/withdraw disabled with a precise explanation if real exit execution isn't implemented. Clearly distinguish selling tokens for USDC from withdrawing fiat. A future live pilot needs a tested, understandable exit path.

Offer “Give another pack” after the recipient understands their holding. Avoid forced referrals, claims conditional on social posts, token rewards, or subsidized traction.

### 4. Polish and verify

Use keyboard navigation, visible focus, accessible status/error announcements, 44 px touch targets, reduced motion, and readable form inputs. Test at 360, 390, 768 and 1440 px. Avoid horizontal overflow and clipping of rotated packs. The last pass widened the stacked-layout breakpoint to 900 px and moved the rear pack inward below 374 px; verify these edits rather than hiding document overflow.

Use transform/opacity for reveal motion. Keep a clear “Open pack” action and reveal fixed holdings without jackpot effects or prize counting. A network delay should show its real state, not a fake progress timer.

Add meaningful tests for recipient identity mismatch, renamed handles, wallet binding, funding verification, invalid allocation versions, duplicate requests, claim/refund races, partial fills, expiry, and recovery after an uncertain transfer. Stub providers only in explicitly designated tests; never route production through synthetic success.

Run relevant lint, typecheck, tests, production build, and a browser pass through both sender and recipient journeys. Existing gift utility tests passed in a 236-test suite on 23 September; rerun after your changes. The completed browser pass covered compose, reveal, replay, invalid links, focus, 360/390/768/1440 px layouts, the matching route and terminal authentication; the latest tablet adjustment also passed the browser check. Optional X OAuth itself is untested.

Build caveat: `NEXT_DIST_DIR=.next-build` avoids corrupting a running dev server. `.env.production.local` may select a hosted database during static page generation. Use an explicitly approved local/test database for validation where appropriate; never print secrets or silently mutate production data. Do not start concurrent Next dev processes sharing `.next`.

## Deliverables

- An improved, working gift UI that preserves the existing app.
- A concrete server integration and state model; explicitly gated where external credentials, eligibility decisions, or reviewed financial infrastructure are missing.
- Tests and browser evidence for completed behavior, with a precise account of what was not exercised.
- Updated `docs/gifting.md` and a compact list of required provider/environment setup, using variable names only.
- No claims of live funding or verified claims until those paths have actually been validated.

The investor/partner deck is `Thesis-Pitch-Deck.pdf`; source is `pitch/build_deck.py`. Keep its build-status slide aligned with reality. Founder: Kayle, Builder, Telegram @kayle_build. Technical materials are available on request; do not add a public repository link.

Proceed autonomously on reviewable local work. Finish useful independent work before reporting an external blocker. At the end, explain what works, what is gated, the exact checks run, and how to open the local experience.
