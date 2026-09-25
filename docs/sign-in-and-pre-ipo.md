# Signing in without an extension, and pre-IPO assets

Written 18 September 2026. Local only — nothing here has been deployed.

## Why sign-in changed

Every action behind a wallet required Phantom specifically. `useWallet.connect` hard-failed
without it, so a visitor without that extension could reach the amount slider and nothing
else. That was the single largest reason the app was unusable, and no amount of work on the
feed touched it.

Privy now issues an embedded Solana wallet against an email or a social login.

**The server did not change, and that is the point.** The challenge is still ours, the
signature is still verified as ed25519 against the claimed address, and the session cookie
is still the only thing that authorises a write. Privy supplies a *signer*. It does not
supply an identity we trust, and being logged into Privy grants nothing on its own.

```
email / Google / X  ──▶ Privy embedded wallet ──┐
                                                ├──▶ signs /api/session/challenge ──▶ /api/session/verify ──▶ cookie
Phantom extension   ──▶ injected provider ──────┘
```

Phantom still wins when it is installed: somebody who installed it expects it to be used,
and quietly creating an embedded wallet would strand their tokens in a second address.

### Three things that needed care

1. **Privy's hooks throw outside their provider.** `usePrivy()` and friends raise
   ``must be used within a `PrivyProvider` ``. Calling them from `useWallet` would crash the
   feed whenever the provider was absent — which is every visit's first moments, and forever
   when no app id is set. So `PrivyBridge` is the only component in the tree that touches
   Privy's API; it publishes a small signer to `lib/wallet/privy-signer.ts` and everything
   else reads that. The rest of the app never imports Privy.
2. **Privy is ~400 kB.** Imported statically it landed in the entry graph of every route and
   took the feed from **130 kB to 532 kB** of first-load JS — a four-fold cost on the page
   every visitor lands on, for an action most of them will not take on that visit. It is now
   `next/dynamic` with `ssr: false`, in its own module so the split actually splits:
   **back to 134 kB.** A dynamic import in the same file as the heavy import does nothing.
3. **Privy references integrations this product does not use.** `@farcaster/mini-app-solana`
   is only loaded inside a Farcaster mini-app host, is not a declared dependency, and failed
   the build. `next.config.ts` aliases it to `false` rather than installing a package to
   satisfy an import nothing calls.

### Configuration

```
NEXT_PUBLIC_PRIVY_APP_ID=…   # public, inlined into the client bundle
PRIVY_APP_SECRET=…           # server only, never referenced from client code
```

With no app id the provider never mounts, Phantom keeps working, and the email button
simply does not appear.

> **The app secret in use was pasted into a chat transcript. Rotate it in the Privy
> dashboard before this reaches anything real.**

## PreStocks — pre-IPO tokens

Nine mints verified on mainnet on 18 September 2026: `getAccountInfo` for token program,
decimals and authorities; Token-2022 metadata symbol matched to the company; cross-checked
against Jupiter's token index; a USDC buy quoted and a swap transaction built and simulated
(`simulationError: null`).

**Four are enabled**: OPENAI, ANTHROPIC, KALSHI, POLYMARKET.

**Five are verified and deliberately not enabled:**

| Symbol | Why not |
|---|---|
| XAI | The order book is exhausted at roughly **$1,900**. A basket cannot fill against it. |
| SPACEX | Thin, and carries a **5×** scaled-UI multiplier. |
| ANDURIL, NEURALINK, FIGUREAI | Thin enough that a $150 leg moves the price against the buyer. |

### What a buyer is actually taking on

This is in `PRESTOCKS_ISSUER_POWERS` and on every surface that renders `issuerPowers`,
because none of it is visible on a chart:

- **The issuer can zero you.** Permanent delegate, freeze, pause, mint and transfer-hook
  authority on every mint, from a single key. Its terms reserve the right to freeze, claw
  back, burn or compulsorily redeem a holding "at a value determined by us… which may be
  substantially below any market, indicative, or acquisition price and in some circumstances
  nil", with no notice, no appeal and no compensation.
- **0.5% transfer fee, live and uncapped**, charged on every transfer including each leg of
  a route and a move between two wallets you own. The issuer can raise it on tokens already
  held. Round trip on a $150 clip is realistically 3–5%.
- **You do not own shares.** A reference to economic exposure. No shareholder rights, no
  claim on the assets of any vehicle behind it, and the backing may be an SPV, a swap,
  another token or cash, changed without notice.
- **Scaled-UI multipliers.** OPENAI is 1.4861347 and SPACEX is 5. The seeder reads these off
  the chain rather than hardcoding them, because the issuer can change them — they behave
  like split events.

### A separate asset kind, on purpose

PreStocks seed as `kind = 'pre_ipo_token'`, not `equity_token`. The
`asset_equity_mint_prefix` CHECK requires an `Xs` prefix on every equity token, and relaxing
that check to admit a different issuer would delete the guarantee that makes it worth having.
The allowlist entry now carries its own `mintPrefix`, and `verify.ts` checks each issuer's
prefix rather than assuming everyone is Backed Finance.

### The decision that is not an engineering decision

**The issuer's terms prohibit US persons**, and list being in a prohibited jurisdiction as a
trigger for freezing a holding. Thesis is US-reachable. Enabling these tokens in this file
deploys nothing; whether to serve them, and where, is a product and legal decision.

## Pyth — evaluated and not integrated

Worth writing down so nobody re-does the research.

- **Hermes REST is no longer keyless.** Every price endpoint returns `401` without a key,
  including plain `Crypto.SOL/USD`. Only the `/v2/price_feeds` metadata list is still open.
- **US equity feeds require Pyth Pro, from $2,500/month.** The Starter tier at $500 is
  crypto-only; Free is explicitly "No Pyth API access".
- **The keyless path is reading Pyth's price accounts directly off Solana**, which works —
  but it covers only **10 of our 17 equities** live, and **all 15 xStock feeds have been
  stale for 5.8 days**. The assets this product actually holds are the ones not being pushed.

So a Pyth integration would either cost $2,500/month or be built on a feed that stopped
updating a week ago. Neither is worth doing.

**What the research found instead is the fix we needed.** `lite-api.jup.ag/price/v3?ids=…`
is keyless, batches many mints into one request, and returns `usdPrice`, the issuer's
reference `stockData.price`, and `scaledUiConfig.multiplier`. One request replaces the
~240 quotes a full refresh currently costs. Not yet wired in — see the note in
`conviction.md` about the immutable call record, which is why this is not a drop-in swap.
