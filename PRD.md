# Thesis

## Product requirements document

**Tagline:** Buy what you believe.

**Version:** 0.1, proposed product and implementation scope  
**Date:** 14 September 2026  
**Stage:** Hackathon MVP, followed by a controlled pilot  
**Submission deadline:** 18 September 2026, 4:00 p.m. ET, from the supplied brief. This is 20:00 UTC and 3:00 a.m. on 19 September in Vietnam.  
**Primary surface:** Mobile-first web app, with a complete desktop experience  
**Network and funding:** Solana; USDC-funded purchases

This document defines a proposed product. Demand, asset liquidity, partner access, and implementation estimates remain hypotheses until tested. Documentation has been checked; no integrations or live trades have been tested for this project.

## 1. Product decision

Thesis turns a specific belief about the world into an understandable, editable basket of tokenized stocks that a user can buy and manage from their own wallet.

A user encounters “AI spending keeps growing,” sees which businesses express that belief and why, changes the allocation if desired, invests USDC, and tracks both their position and the evidence behind the belief.

The product unit is a **thesis**, consisting of a claim, an investable expression, evidence, counterarguments, and a review horizon. Its value extends beyond publishing an opinion: it carries the user from understanding an idea through execution and eventual exit.

The investment itself provides financial stakes. Wagers, prize pools, leverage, agents, and a platform token are outside the product scope.

## 2. Problem and audience

### Primary user

A self-directed investor in an eligible market who already has a Solana wallet and USDC, follows business or technology narratives, and wants to express an investment idea without assembling every trade manually.

The pilot deliberately starts with existing wallet users. Fiat onboarding and first-time crypto education would add substantial friction and dependencies to the initial build.

### Core job

“When I believe a trend will matter, help me understand which tradable assets express it, choose my exposure, and buy the basket without losing track of my original reasoning.”

### Current friction

1. A compelling idea is scattered across social posts, research, and ticker suggestions.
2. The user must identify beneficiaries and distinguish direct exposure from loose thematic association.
3. They must choose allocations and repeat purchases across several assets.
4. Later, they see price movement but struggle to remember why they bought or what should change their mind.

### Secondary user

A knowledgeable writer or curator who can explain an investable idea and wants to share an executable version. MVP publishing is limited to the project team; broader creator publishing comes later.

### Why people might want it

| Motivation | Product response | Evidence we need |
| --- | --- | --- |
| “I understand the trend, but not the portfolio.” | Explain each constituent's role in the thesis. | Users can explain why they would own the basket after reading it. |
| “I agree with most of this.” | Adjust weights before buying and preserve that choice. | Users customize allocations and still complete checkout. |
| “I want to do something with this idea now.” | Move directly from the thesis to an executable purchase plan. | Users fund baskets rather than only bookmarking them. |
| “Has anything changed since I bought?” | Keep evidence updates alongside the original thesis and holdings. | Funded users return to review updates. |

These are demand hypotheses, not validated findings. Social engagement alone does not validate the product.

## 3. Positioning and differentiation

**One-sentence pitch:** Thesis lets you turn a belief about the world into a basket of tokenized stocks you can understand, edit, and buy.

The intended differentiation is the complete belief-to-position workflow, rather than a claim that thematic investing or stock baskets are new inventions.

| Alternative | Thesis's intended advantage |
| --- | --- |
| A stock thread on X | Constituents, weights, execution, position tracking, and updates are attached to the idea. |
| Buying several tickers manually | One reviewed allocation plan with coordinated progress and recovery. |
| A fixed thematic fund | The user inspects and adjusts the constituent allocation and holds the resulting tokens. |
| Copying a trader | A published reasoning framework and versioned basket that the user explicitly chooses. |

X is an acquisition channel. The share link points to the investable thesis; the app does not need to rebuild a social network.

### Why Solana

The same wallet can hold funding USDC and the purchased stock tokens. Existing swap infrastructure can execute the constituent trades, and transaction records can substantiate what was bought. The basket is an application-level grouping of individually held assets.

xStocks documents Solana support and platform integration requirements. Exact tradability and user eligibility must be verified for the selected assets and deployment. [Issuer integration information](https://xstocks.com/partner)

No custom basket token, pooled fund, or new Solana program is required for this MVP.

## 4. Product principles

1. **The idea comes first.** Titles describe a claim; ticker symbols support it.
2. **Explain the exposure.** Every holding needs a causal role and a meaningful limitation.
3. **Make disagreement useful.** A user can adjust weights rather than accept the author's allocation wholesale.
4. **Keep the original record.** Material changes create new versions; purchased versions remain inspectable.
5. **Separate reasoning from returns.** Positive performance does not prove a thesis, and negative performance does not automatically disprove it.
6. **State what happened to money.** Filled, pending, failed, and unspent amounts must be unmistakable.
7. **Keep decisions with the user.** Updates never initiate trades or grant the author control over a holder's wallet.

## 5. Scope and release cuts

### P0: Required for the submission

| Capability | Required scope |
| --- | --- |
| Discover | Three team-authored theses with distinct claims, public detail links, and no fabricated usage statistics. |
| Understand | Claim, rationale, three holdings, weights, exposure explanations, evidence links, counterargument, and review horizon. |
| Customize | Adjust weights among the existing three constituents; default equal weighting unless the author explains another allocation. |
| Fund | Connect a supported wallet; invest USDC through three independently confirmed swaps. |
| Recover | Persist purchase progress, reconcile transaction state, and retry only eligible unfilled legs. |
| Own | Show the saved thesis version, actual acquired quantities, current allocation, and timestamped estimated value. |
| Exit | Sell the remaining attributed quantities into USDC using an equally explicit multi-swap flow. |
| Follow | Save a thesis and show manually authored, sourced updates on its detail page. |
| Share | Public thesis URL and a static social preview describing the idea and constituents. |
| Evidence | Transaction links, clear demo labels, a working purchase-to-sale demonstration, and setup documentation. |

P0 permits **one open investment position per wallet**, including partially purchased or partially sold positions. This limits overlapping-lot attribution for the deadline. Users may browse and save any number of theses. Closing the position allows a new purchase.

P0 custom allocations remain private to the purchaser; sharing the public thesis does not imply that its default weights match the purchaser's weights.

### P1: After the core flow is reliable

- Multiple simultaneous theses with explicit shared-asset lot accounting.
- Add to an existing position and sell a selected percentage.
- Public personal remixes with their own versioned links.
- User-authored drafts with editorial review before public discovery.
- Creator updates, in-app subscriptions, and optional notifications.
- More constituents, additional verified assets, and overlap analysis.
- Model-versus-benchmark charts once reliable history is available.

### P2: After demand validation

- Recurring investment and user-approved rebalancing proposals.
- Curator tooling and a tested monetization model.
- Embedded wallet and funding options for new users.
- Optional AI assistance for drafting sourced research, with human review.

### Explicitly outside this build

Automatic trading, margin, shorting, betting, custody of private keys, pooled assets, performance fees, basket tokens, anonymous permissionless publishing, native mobile apps, comments, chat, follower leaderboards, and backtests presented as live results.

## 6. Thesis content model

Each publishable version must contain:

| Field | Requirement |
| --- | --- |
| Title | A specific, legible claim, ideally under 65 characters. |
| Summary | One or two sentences explaining the mechanism. |
| Author | Identified editorial account; author holdings/conflicts disclosure. |
| Category | One primary discovery category, such as technology or consumer. |
| Horizon | A review date or explicit time horizon; never an automatic sale date. |
| Constituents | Exactly three verified assets for P0, with weights totaling 10,000 basis points. |
| Exposure role | Why this company benefits if the thesis holds, including direct versus indirect exposure. |
| Weight rationale | Required for unequal author weights; no claim of mathematical optimization. |
| Evidence | At least two relevant source links with dates and a short explanation of relevance. |
| Counterargument | A substantive reason the investment expression may underperform. |
| Change-my-mind condition | A specific observation that would weaken the thesis, without pretending it is an automated verdict. |
| Version | Immutable published content identifier, timestamp, and allocation snapshot. |
| Status | Draft, published, under review, or archived. |

Published versions cannot be silently overwritten. Corrections and updates are appended with dates; material claim or allocation changes create a new version. Archived theses remain available to their holders and stop accepting new purchases.

### Illustrative seed direction

**“AI spending keeps growing.”** A draft expression might examine a compute supplier, a cloud infrastructure business, and a software distributor. NVIDIA, Amazon, and Microsoft are candidate companies for research, not a final recommended basket. Their business exposure differs, and rising capital expenditure can also hurt returns.

Two other editorial directions are **“Digital advertising takes a bigger share”** and **“Financial activity moves onchain.”** Final constituents depend on evidence quality, official mint verification, and live buy/sell route checks. Never substitute a loosely related stock merely to fill three slots; revise or drop the thesis.

## 7. UX and information architecture

### Overall experience

The expected user opens a link on a phone during the day, between reading messages and market commentary. Use a bright, calm surface, strong readable text, and a restrained accent for actions. Personality comes from compelling thesis titles, good writing, and useful investment explanations.

Navigation has two primary destinations: **Explore** and **My theses**. Wallet identity and balances sit in the account menu. Publishing tools are a separate internal surface.

### Screen A: Explore

The opening line is **“What do you believe happens next?”**

Show three distinct thesis entries. Each displays its claim, short summary, constituent names, author, and horizon. The primary action is **Explore thesis**. Avoid performance rankings until there is comparable, sufficient live history.

No wallet connection is required to browse. Categories and search can wait until the catalog exceeds what fits comfortably on one screen.

### Screen B: Thesis detail

Reading order:

1. Claim, author, version, and horizon.
2. Short explanation of the investment mechanism.
3. The three holdings, weights, and the role of each company.
4. Supporting evidence and the strongest counterargument.
5. What would change the thesis and the next review point.
6. Dated updates and version history.

Desktop places the investment panel beside the explanation. Mobile uses a sticky **Build my basket** button opening a dedicated allocation page. Show **Save thesis** as the secondary action.

Do not require the user to understand token mint addresses to evaluate an idea. Asset and issuer details remain accessible in each holding's detail view and appear clearly during trade review.

### Screen C: Build my basket

The user enters a USDC amount and chooses **Author's allocation** or **Customize**.

Each holding has an editable weight and corresponding USDC amount. P0 custom weights use whole percentages, with a proposed 10% minimum and 70% maximum per holding. These are concentration constraints, not assurances of safety. Require the total to equal 100%; show the remainder inline rather than silently changing another holding.

Changing weights reveals **Your allocation differs from version 1**. A reset action restores the author's weights.

The minimum basket amount is computed from current per-leg trade minimums and estimated costs. Do not promise a universal $1 entry price. An illustrative default amount may be $50, but it must pass live feasibility checks.

### Screen D: Review purchase

Show total USDC input, each constituent allocation, expected token quantities, minimum receive amounts, price impact, provider fees, and estimated network/account-creation costs in their actual payment currencies. State who receives any fee.

Show **3 purchases. Your wallet may ask you to approve each one.** Use **Review and buy** as the final product action, followed by wallet approvals.

Eligibility is resolved before executable orders are provided. An unfunded wallet gets a direct explanation of missing USDC or SOL, without a dead-end wallet error.

### Screen E: Purchase progress

Example state:

| Holding | Input | Status |
| --- | --- | --- |
| Asset A | 20 USDC | Purchased; transaction link |
| Asset B | 15 USDC | Awaiting wallet approval |
| Asset C | 15 USDC | Not started |

No global “Success” appears until all required legs are confirmed. A partial outcome says **1 of 3 purchased. 30 USDC not spent on the remaining purchases.** Unspent USDC stays in the user's wallet and is not reserved by the app.

If the user stops, provide **Keep purchased assets** and, when appropriate, **Resume remaining purchases**. A sale is a new user-authorized operation, never an automatic rollback.

### Screen F: My thesis

Show the purchased version and personal allocation, actual remaining holdings, cost, estimated current value, and valuation freshness. Below that, keep the original rationale and new evidence updates visible.

The primary management action is **Sell remaining basket**. For a partially purchased position, also show **Complete purchase** where available.

An author update says **New evidence to review** or **New version available**. It never says the portfolio has been updated unless the user actually traded.

### Screen G: Sale review and result

Fetch fresh quotes for the position's remaining attributed raw quantities. Show expected USDC proceeds, minimum receive, costs, and separate approvals. Track each sale independently and resume only after reconciliation.

When all tracked holdings are sold or explicitly resolved as dust/external movement, show the closed position and transaction history. Preserve the thesis version for later review.

## 8. End-to-end flows

**New buyer:** Shared link → thesis detail → allocation → wallet connection and eligibility → funding check → quotes → review → approvals → confirmed holdings.

**Returning holder:** My theses → original position → evidence update → review decision → keep holding or sell → confirmed result.

**Partial purchase:** First leg fills → next leg fails → persist partial position → user reloads → reconcile signatures → re-quote remaining legs → approve continuation or keep the partial basket.

**Editor:** Draft content and source links → select verified assets → validate weights/content → publish immutable version → append updates → publish new version when necessary.

## 9. Functional requirements and acceptance criteria

| ID | Requirement | Acceptance condition |
| --- | --- | --- |
| TH-01 | Public discovery | A visitor opens all published thesis pages without connecting a wallet. |
| TH-02 | Explainability | Every published holding has a role; every thesis has evidence, a counterargument, and a horizon. |
| TH-03 | Version integrity | A later edit cannot change the version or allocation stored against an existing position. |
| TH-04 | Allocation integrity | Invalid totals, out-of-range weights, and unsupported assets cannot reach order creation. |
| TH-05 | Verified assets | Transactions use an issuer-verified mint allowlist, never ticker search alone. |
| TH-06 | Wallet ownership | Database mutations require an authenticated wallet session; only that wallet can act on its position. |
| TH-07 | Purchase review | The user sees asset identities, total inputs, minimum outputs, costs, and multiple-approval behavior before signing. |
| TH-08 | Confirmed execution | A filled leg is created from reconciled chain execution, not a client success message. |
| TH-09 | Partial recovery | Reloading after a fill restores accurate progress; retry cannot duplicate a confirmed purchase. |
| TH-10 | Safe retry | Unknown transaction status is reconciled before a replacement transaction is offered. |
| TH-11 | Holdings accuracy | Quantities reconcile with confirmed fills and wallet movements; estimates show timestamp and basis. |
| TH-12 | User-controlled exit | Selling uses only remaining attributable quantities and cannot sell unrelated holdings. |
| TH-13 | External activity | An unexplained wallet movement puts attribution under review and disables misleading P&L and basket-wide sales. |
| TH-14 | Demo separation | Synthetic assets, fixtures, and replayed events are labeled and cannot enter a mainnet execution path. |
| TH-15 | Access handling | Failed eligibility prevents quote execution according to the configured launch policy. |
| TH-16 | Accessible interaction | The complete flow works by keyboard, exposes focus, announces status changes, and never relies on color alone. |

## 10. Execution specification

### Integration choice

Use Jupiter's documented `/swap/v2/order` and `/swap/v2/execute` flow for each constituent, with the user's browser wallet signing. The documentation describes assembled orders and managed execution. [Jupiter order and execution documentation](https://developers.jup.ag/docs/swap/order-and-execute)

The basket coordinator is application logic. P0 does not combine three orders into one transaction and does not promise atomic execution. Managed orders must be used as documented; do not concatenate returned transactions or modify them to simulate an atomic basket.

### Purchase lifecycle

1. Authenticate wallet and validate eligibility, thesis version, mint allowlist, weights, and available balances.
2. Persist an intent with a client-generated idempotency key and immutable planned inputs.
3. Allocate integer USDC base units by weights. Distribute rounding remainder deterministically using largest fractional remainders, breaking ties by constituent order.
4. Preflight all three legs and aggregate estimated costs. If any leg is unavailable, do not begin the basket.
5. Show the full review. Process legs sequentially to limit approval complexity and balance conflicts.
6. Before each signature, obtain a valid order. If the refreshed terms differ, show the revised terms before that approval; never expand the input budget or slippage ceiling silently.
7. Persist each request identifier and transaction signature as soon as available.
8. Reconcile the signature, execution error, account deltas, and received amounts. Display confirmed status promptly; retain finality information and repair state if necessary.
9. Update the position from actual fills. Pause on failure or cancellation and leave remaining inputs unspent.

Intent statuses: `draft`, `quoting`, `ready`, `executing`, `partial`, `complete`, `cancelled`, `needs_reconciliation`.

Leg statuses: `planned`, `quoted`, `awaiting_signature`, `submitted`, `confirmed`, `failed`, `expired`, `cancelled`, `unknown`.

“Submitted” never means “failed” solely because a network call timed out. A worker reconciles unknown signatures. Re-submission of an existing signed transaction and creation of a replacement are distinct operations; a replacement is allowed only after the previous outcome is resolved.

### Proposed order policy

Start with a maximum 50 bps slippage setting and block quoted price impact above 100 bps per leg, subject to verifying how the provider exposes and enforces these fields. These are proposed product limits, not measured optimal settings. If enforcement cannot be verified, live execution stays disabled.

A quote review should request refresh after 15 seconds, with provider validity and block-height checks taking precedence. Showing an underlying exchange as closed is informational; route availability, quote validity, and configured limits determine executability. Do not imply that continuous token trading guarantees continuous liquidity at the underlying stock price.

### Custody and transaction checks

Private keys remain with the user's wallet. Backend services hold provider credentials and application data only. Validate the intended wallet, network, input/output mints, token programs, recipients, spending bounds, and unexpected approvals against the order request before asking for signatures. Simulate when supported. Fail closed on unexplained effects.

## 11. Ownership, valuation, and performance

### What the user owns

The user holds the individual tokenized assets in their wallet. A Thesis position groups attributed trade lots in the application's records. It is not a separately issued fund share or a claim on an application-managed pool.

The checkout identifies the issuer and links the applicable asset terms. Avoid representing tokenized exposure as direct ownership of underlying company shares or promising voting rights.

### Raw quantities and corporate actions

Persist raw integer amounts with mint decimals and the relevant scaling metadata. Use raw amounts in transactions and compatible adjusted amounts for display. xStocks documents its multiplier treatment of splits and dividends on Solana. [xStocks multiplier guide](https://docs.xstocks.fi/developers/multipliers)

Every price adapter must declare whether its unit is a raw token unit or a scaled display unit. Pair price and quantity bases correctly; never multiply by the corporate-action adjustment twice. Historical comparison requires historical scaling data. [Solana integration guidance](https://solana.com/docs/tokens/extensions/scaled-ui-amount/integration-guide)

### P0 valuation

Use size-specific sell quotes for remaining tracked assets to display **Estimated exit value**, denominated in USDC. Timestamp each leg; show an aggregate only if every component meets freshness requirements. Quote-based values are estimates, not guaranteed proceeds.

Fetch on position open, manual refresh, and at most once per 60 seconds while the page is visible, subject to provider quotas. If a valid route is missing or a component is older than 60 seconds, show an incomplete/stale state instead of an apparently current total.

### P0 profit and loss

For an unambiguous position:

`trading P&L in USDC = confirmed USDC sale proceeds + estimated exit value of remaining holdings - confirmed USDC purchase inputs`

Provider fees included in transaction inputs/outputs are already reflected and must not be subtracted twice. SOL network and account-creation costs are shown separately. Label P0 P&L **Excludes SOL network and account costs**. Percentage return divides this figure by actual confirmed purchase inputs, not the original intended basket budget.

Unspent USDC in a partial purchase does not count as invested capital or as a managed cash allocation. Failed transaction network costs remain visible in execution history. Dust quantities remain visible and are not silently written off.

Pre-existing holdings and external acquisitions are not attributed to the thesis. P0 reconciles relevant token-account activity from the first fill, not only the current balance. If an external sale or transfer makes attribution ambiguous, mark the position **Holdings changed outside Thesis**, hide aggregate returns, and pause basket-wide execution pending reconciliation. A same-size balance after a sale and repurchase does not establish continuity.

### Public basket performance

No invented historical chart on launch. Show **Tracking begins at publication** until comparable observations exist. A later model series must be labeled model performance, use fixed initial quantities for each version, and clearly state costs and benchmark methodology. Never splice a new version into an old version's return history.

## 12. Proposed architecture and data

### Components

- React/Next.js web app with TypeScript, using a maintained Solana wallet integration selected during the initial technical spike.
- Server API for content, authenticated intents, provider calls, and eligibility policy enforcement.
- PostgreSQL for durable content versions, intent states, fills, positions, and audit events.
- Small reconciliation worker for submitted/unknown transactions and relevant wallet activity.
- Solana RPC provider and Jupiter API access; credentials remain server-side.
- Versioned editor seed files or a protected minimal editor for the initial catalog.

This is a proposed stack, not an assertion that dependencies have been installed or validated.

### Core records

| Record | Essential fields |
| --- | --- |
| Asset | Chain, mint, token program, decimals, issuer, company, display symbol, scaling support, enabled state, verification source/date. |
| Thesis | ID, slug, author, category, current version, publication status. |
| ThesisVersion | ID, thesis ID, claim, rationale, constituents, weights, evidence, counterargument, horizon, content hash, published timestamp. |
| ThesisUpdate | Version reference, authored timestamp, evidence links, explanation, update type. |
| WalletSession | Wallet, domain-bound nonce challenge, expiry, authorization state. |
| SavedThesis | Wallet or local anonymous identifier, thesis ID, timestamp. |
| InvestmentIntent | Wallet, pinned version, custom weights, direction, planned amounts, idempotency key, state. |
| SwapLeg | Intent, asset, input/output mint, raw amounts, quote metadata, request ID, signature, retry lineage, state/error. |
| Fill | Unique signature and swap identity, actual inputs/outputs, fees, slot, confirmation/finality state. |
| Position | Wallet, version, acquired/remaining quantities, confirmed cost and proceeds, external-activity state, open/closed state. |
| Valuation | Position, component quantities, price basis, quote source, estimated proceeds, timestamps, completeness. |

Enforce uniqueness for idempotency keys and fills. Database transitions must be atomic locally even though the basket's chain execution spans transactions.

### Proposed application API

`GET /api/theses`, `GET /api/theses/:slug`, `POST /api/session/challenge`, `POST /api/session/verify`, `POST /api/intents`, `POST /api/intents/:id/quote`, `POST /api/intents/:id/legs/:legId/execute`, `GET /api/intents/:id`, `GET /api/positions`, and `POST /api/positions/:id/sell-intent`.

These are internal proposed endpoints. The server independently verifies wallet ownership and state transitions; browser-submitted “filled” flags are never authoritative.

## 13. Reliability, privacy, and launch dependencies

| Concern | Required behavior |
| --- | --- |
| Thin or missing liquidity | Keep content readable; disable the affected basket's purchase and explain the unavailable holding. |
| Stale quote | Refresh before approval; present changed terms. |
| Wallet rejection | Stop new legs, preserve filled legs, and allow a later intentional resume. |
| Provider timeout | Reconcile; do not automatically double-submit replacement purchases. |
| Application restart | Recover intent and position state from durable records and chain evidence. |
| Insufficient SOL | Explain network/account costs and required funding before trade approvals. |
| Asset disabled after purchase | Preserve holdings visibility and explain available exit status; disabling a catalog item does not erase a position. |
| Creator update | Show version differences without modifying holder allocations. |
| External wallet activity | Pause ambiguous attribution rather than selling or reporting unrelated assets. |
| Sensitive data | Never collect private keys or seed phrases; keep wallet identities out of third-party analytics by default. |

Target WCAG 2.2 AA interaction practices: keyboard operation, clear focus, sufficient contrast, readable errors, accessible status announcements, and reduced-motion support. Target at least 44 px primary touch areas and a usable 360 px-wide layout.

Operational targets: public cached pages usable within 2.5 seconds on a typical mobile connection; quote feedback within 5 seconds under normal provider conditions; unresolved submissions visible to operators. These are acceptance targets to measure, not current performance claims. Chain confirmation has no guaranteed completion time.

### Eligibility and distribution dependency

xStocks currently lists U.S. persons/the United States, Canada, the UK, and Australia among restricted cases and places compliance obligations on integrating platforms. Its current terms and the intended distribution model must govern access. A wallet address alone is not proof of eligibility. [Issuer partner requirements](https://xstocks.com/partner)

Before unrestricted live launch, determine the permitted target market, whether partner approval or additional onboarding is required, and the controls necessary for that deployment. A checkbox alone is not presumed sufficient. Until resolved, use an explicitly labeled simulation for unrestricted visitors; any real demonstration must use eligible participants and permitted access. This is an external launch dependency, not a reason to delay the design or build of the reviewable product.

## 14. Acquisition, retention, and business model

### Acquisition loop

An author shares a specific belief → a reader opens its public page → the reader inspects and customizes its expression → the reader buys → the reader shares the thesis link with their own commentary.

Social previews emphasize the claim and holdings. No fabricated backer counts, manufactured urgency, or return promises. Public previews do not reveal personal wallet balances or purchased amounts without opt-in.

### Retention loop

A holder saves their original reasoning → a relevant evidence update or review date appears → they revisit both the thesis and position → they decide whether to hold, exit, or consider another thesis.

The return trigger should be substantive evidence. Routine price movement alone is not proof that the product's research layer is useful.

### Monetization hypothesis

Charge no additional Thesis fee during the MVP; show provider and network charges accurately. After repeat use is demonstrated, test a disclosed execution fee against willingness to pay for research/curation tools. Creator revenue sharing is later work and depends on the applicable business and distribution requirements. Do not assume that adding a routing fee leaves execution quality unchanged.

### Defensibility hypothesis

Over time, a useful catalog, trusted authors, version histories, execution quality, and personal thesis records may become reasons to stay. None is a proven moat at launch. The first task is to demonstrate that users want to buy and revisit these baskets.

## 15. Metrics and validation

### Primary product metric

**Weekly funded thesis holders who return to review their thesis or evidence updates.** Exclude team wallets, bots, simulated trades, and promotional test funding from user-demand reporting.

### Funnel and quality metrics

- Qualified public detail visits → allocation opened → quotes reviewed → first signature → all legs confirmed.
- Custom allocation rate and completion rate after customization.
- Fully completed, partially completed, and abandoned baskets as separate outcomes.
- Percentage of funded users revisiting within seven days.
- Exit completion and unresolved transaction count.
- Duplicate confirmed fills attributable to retries; target zero.
- User understanding: can they explain the claim, one holding's role, and one reason it may fail?

Event names: `thesis_viewed`, `thesis_saved`, `allocation_opened`, `allocation_changed`, `quote_reviewed`, `purchase_started`, `leg_confirmed`, `basket_partial`, `basket_completed`, `update_viewed`, `sale_started`, `sale_completed`. Record version and anonymous funnel IDs; avoid sending wallet addresses and balances to general analytics.

### Initial validation plan

Run five moderated sessions with target users before submission if feasible. Ask each to evaluate a thesis, explain the exposure, customize an allocation, and navigate the trade flow. At least four should finish a non-funded walkthrough without assistance; comprehension failures require copy or UX changes.

For a subsequent two-week eligible pilot, recruit approximately 20 target users. A directional success signal is at least five voluntary real basket purchases and at least three of those users returning within seven days. This is a small-sample learning threshold, not statistical proof or a revenue forecast.

If people read and share but do not fund, investigate basket relevance, trust, funding friction, and execution costs before adding social features. If they fund but never return, test the usefulness of evidence updates rather than assuming notifications solve retention.

## 16. Build plan to the deadline

Assumption: one experienced full-stack builder, existing access to hosting and provider keys, and tightly controlled scope. This is a schedule target, not a guaranteed delivery estimate.

| Date | Deliverable | Exit criterion |
| --- | --- | --- |
| 14 Sep | Integration spike, verified candidate universe, data schema, first researched thesis | Two-way routes and token handling tested for three candidate assets; access dependencies recorded. |
| 15 Sep | Explore, thesis detail, allocation editor, wallet and quote review | One user can reach a correct review from a public link. |
| 16 Sep | Durable basket execution, confirmation worker, partial recovery | Three-leg purchase succeeds; injected second-leg failure recovers without duplicate spending. |
| 17 Sep | Holdings, sale flow, version pinning, remaining content, mobile polish | A tracked position can be sold; external activity and stale valuations are handled. |
| 18 Sep | Focused acceptance checks, deployment, demo recording, submission | Reviewable live/simulation mode is explicit; submission links work before 20:00 UTC. |

Target code freeze by 12:00 UTC on 18 September, with submission by 18:00 UTC for a two-hour buffer.

Cut in this order if necessary: custom social image generation, save synchronization, additional seeded theses, rich update editor. Keep at least one excellent thesis and the complete purchase/hold/sale flow. Do not cut transaction reconciliation, truthful partial states, or version preservation to add cosmetic features.

If market access prevents live deployment, complete and label the simulation and explain the dependency in the submission. Do not claim it demonstrates real execution. A simulated fallback is a weaker submission outcome, not equivalent fulfillment of the live demo target.

## 17. Verification plan

Use meaningful automated tests for money/state logic and manual checks for reversible presentation details.

1. Allocation rounding preserves the exact USDC budget across three constituents.
2. Invalid weights, wrong wallet/network, disallowed mints, and unexpected transaction effects are rejected.
3. A successful leg followed by failure survives reload and never repeats the successful fill.
4. Timeout-after-submission reconciles to the eventual result before a replacement is possible.
5. User cancellation leaves an accurate partial position and unspent-wallet explanation.
6. A later author version cannot mutate an existing investment's content or allocation.
7. Scaling changes preserve correct units and do not create fictitious split profits.
8. P&L uses actual filled costs; it excludes unspent planned input and labels network-cost exclusions.
9. A partial sale updates remaining attributed quantities and cannot sell pre-existing holdings.
10. External token movements trigger attribution review, including cases where the balance later returns to its previous size.
11. Unavailable or stale component quotes cannot produce an apparently fresh aggregate valuation.
12. Demo fixtures and mainnet execution are isolated at server configuration and asset allowlist boundaries.

Manually check mobile wallet handoff, keyboard operation, quote refresh, insufficient funds, every progress/error state, and two complete eligible purchase-to-sale runs when permitted. Stop broadening tests after relevant checks pass unless new changes or failures justify it.

## 18. Demo narrative and definition of done

### Three-minute demonstration

1. **0:00–0:25:** Open a shared thesis and explain its claim.
2. **0:25–0:55:** Inspect the three holdings and one meaningful counterargument.
3. **0:55–1:20:** Change the allocation and enter a small USDC amount.
4. **1:20–2:00:** Review costs, approve purchases, and show confirmed transaction links.
5. **2:00–2:30:** Open the owned position with its pinned thesis version and actual holdings.
6. **2:30–3:00:** Show the sale path and a completed sale, using a clearly identified previously completed run if confirmation timing requires it.

Demonstrate partial-failure recovery in an additional short clip. Do not fabricate market returns to make a few-minute demonstration look profitable.

### Definition of done

- At least one fully researched, coherent, executable thesis; target three.
- Allocation editing and purchase review work on phone and desktop.
- Actual execution mode, asset identities, and user access are correctly represented.
- Confirmation, partial recovery, holdings, and sale paths satisfy P0 acceptance criteria.
- A thesis version remains stable after later publication changes.
- No private keys in the application; no double-spending through retries.
- Repository contains setup instructions, environment-variable names without secrets, architecture notes, and third-party component acknowledgements.
- Public demo/video links work, and the hackathon registration and submission are completed by the owner through the event's process.

## 19. Decisions and unresolved dependencies

| Decision/dependency | Proposed answer | Resolution point |
| --- | --- | --- |
| Product name | Thesis; working name, availability unchecked | Before public branding commitment |
| Investment model | Individually held stock tokens grouped by application records | Decided for MVP |
| Initial authoring | Team-curated, versioned content | Decided for MVP |
| Personalization | Adjust weights among three assets | Decided for MVP |
| Execution | Sequential managed swaps with explicit partial states | Decided, pending integration test |
| Open positions | One per wallet in P0 | Decided for deadline scope |
| Initial trading universe | Verified issuer assets with working two-way routes | 14 Sep spike |
| Target market and access policy | Must be selected from permitted distribution/access conditions | Before any public live execution |
| Provider keys, quotas, and RPC | Required; access not yet checked | 14 Sep spike |
| Wallet compatibility | One well-tested wallet first, broaden only after the core loop | 14–15 Sep |
| Monetization | No added Thesis fee in MVP | Revisit after pilot |
| Automated rebalancing, agents, wagering | Excluded | Revisit only if later evidence supports a separate requirement |

The central product test is whether a clear, credible explanation plus an editable execution path makes someone willing to fund an idea and return to evaluate it.
