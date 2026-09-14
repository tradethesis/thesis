# What Jupiter actually does

Measured against live mainnet on 14 September 2026. Every number here came from a real
response, not from documentation. Reproduce with `pnpm tsx scripts/capture-orders.ts` and
`pnpm tsx scripts/size-sweep.ts`.

## 1. A taker-less preflight is a different product from the order you sign

| | preflight (no `taker`) | executable (with `taker`) |
| --- | --- | --- |
| router | `metis` / aggregator, every time | `jupiterz` / rfq, usually |
| `slippageBps` | 0 | 0 (RFQ) or 100 (AMM) |
| `otherAmountThreshold` | equals `outAmount` | equals `outAmount` (RFQ), 1% below (AMM) |
| `gasless` | false | true |
| `expireAt` | absent | present, ~36 s out |
| `transaction` | null | base64, or `""` if it could not be built |

The RFQ maker only quotes once it knows who the taker is. So a review screen built on a
preflight shows a price from a different venue than the one the user ends up signing. We
preflight for feasibility and cost, then fetch a fresh order with the taker immediately
before each signature and re-check it against what the user was shown.

## 2. The fee is a flat charge, not a rate

Per leg, buying COINx and NVDAx:

| leg size | `feeBps` | implied flat charge |
| --- | --- | --- |
| $5 | 313 | $0.157 |
| $10 | 162 | $0.162 |
| $16.67 | 101 | $0.168 |
| $25 | 71 | $0.178 |
| $50 | 41 | $0.205 |
| $100 | 26 | $0.260 |
| $250 | 17 | $0.425 |

`platformFee` stays at `{feeBps: 10}` throughout, so the top-level `feeBps` is that 10 bps
plus roughly $0.16 fixed. The fixed part matches `rentFeeLamports` of 1,488,440 — the
Token-2022 account rent that Jupiter's gasless RFQ pays for the user and charges back in
USDC. That is the trade: **you need no SOL, and you pay about sixteen cents a leg for it.**

Consequence for the product: the PRD's illustrative $50 basket costs the buyer about 1% in
fees. True, but not good. Minimum is $75 and the default is $150; above 60 bps the review
screen says so next to the total rather than burying it.

## 3. `inUsdValue` / `outUsdValue` are reference prices, not cost

The same sweep showed NVDAx with a *negative* implied cost at every size above $5 — free
money, which it is not. `priceImpactPct` behaves the same way: it read −2.2% on an order
whose real cost was about 1%, and it changes sign between router families.

Neither is a gate and neither enters P&L. Cost comes from `feeBps` plus a two-sided
executable quote; P&L comes from confirmed USDC deltas read off the chain.

## 4. The transaction has three signature slots and you do not own the first one

A gasless RFQ transaction requires three signatures: Jupiter's fee payer, Jupiter's gas
payer, and the user — in that order, all empty when handed to us. The canonical txid is
signature 0, which Jupiter applies inside `/execute`. So the txid cannot be derived before
broadcast in this case, and there is no order-status endpoint to ask (`/swap/v2/status`,
`/swap/v2/order/status`, `/ultra/v1/order/status` and `/swap/v2/execute/status` all 404).

What survives: the user's own 64-byte signature, which appears verbatim in the landed
transaction. Scanning the token account and matching those bytes identifies our
transaction exactly, rather than inferring it from balance deltas.

When the fee payer *is* the taker, signature 0 is the user's and the txid is derivable
immediately — the ordinary case, and the one `~/copy-desk/live.py` was written for.

## 5. Token-2022 details that matter

All xStocks are Token-2022 with 8 decimals. Checked on every allowlisted mint:

- `scaledUiAmountConfig` is **live**. Six of thirteen mints currently carry a multiplier
  above 1 — MSFTx 1.00590, SPYx 1.00571, GOOGLx 1.00238, METAx 1.00230, AAPLx 1.00327,
  NVDAx 1.00170. Raw is not UI. Pairing a UI price with a raw quantity invents profit.
- `defaultAccountState` is `initialized`, so a new buyer's account is not frozen on
  creation.
- `transferHook.programId` is `null`, so no third program can veto a transfer.
- `permanentDelegate` and `pausableConfig` are both set. The issuer can move tokens out of
  any wallet and can freeze transfers. Disclosed on every holding.

## 6. Rate limits

Keyless `api.jup.ag` returns 429 after about four rapid calls. With `JUP_API_KEY`, five
back-to-back order calls all returned 200. `lite-api.jup.ag/swap/v1/quote` is free and
generous but serves no `/order` or `/execute`, which is why valuation polling lives there
and execution never does.
