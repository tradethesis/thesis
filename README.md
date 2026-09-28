# Thesis

**Buy what you believe.**

Turn a belief about the world into a basket of tokenized stocks you can understand, edit,
and buy — from your own Solana wallet, with USDC.

Read a claim ("Financial activity moves onchain"), see the three companies that express it
and why each one is there, change the weights if you disagree, and buy the basket. Your
reasoning stays attached to the position afterwards, along with the evidence and the
strongest argument against it.

**Live:** [tradethesis.xyz](https://tradethesis.xyz) · **Pitch deck:** [`Thesis-Pitch-Deck.pdf`](./Thesis-Pitch-Deck.pdf)

## What's in it

- **Gift a pack of stocks.** Pick a pack, add a note, send it to a friend's X handle, from $1.
  They open the link and rip a 3D pack open (no sign-in to look), then claim it with X; a wallet
  is created for them and the stocks are bought into it. No custody: funds and keys are never ours.
- **Pre-IPO, through PreStocks.** "Before they go public" holds OpenAI and Anthropic via
  PreStocks' tokens, with NVIDIA as the public reference price, and says on every screen what
  pre-IPO means: no public share price, a transfer fee, and the issuer's freeze and buy-back rights.
- **Every basket has a voice.** Baskets start from a real, credited post, with the argument, the
  case against, and what would change the call. Each is a public 90-day record against the
  S&P 500, measured from the day it starts; no backtest is shown as a result.
- **A terminal.** Baskets ranked by their live record, your holdings read from your wallet on
  chain, and a portfolio showing what each thesis you bought is worth today.
- **Honest numbers.** 12-month and since-launch what-ifs are labelled as what-ifs; interest comes
  from Wikipedia page views, never invented counts.

How it works, in more depth:

- [What Jupiter actually does](./docs/execution-findings.md): measured routing, fees and fills for tokenized stocks.
- [Matching an idea to a basket](./docs/matching.md): how a pasted post or idea finds the baskets that express it.
- [Curated theses and timed calls](./docs/curation-and-calls.md): how a thesis is published and scored against the S&P 500.
- [Signing in without an extension, and pre-IPO assets](./docs/sign-in-and-pre-ipo.md): embedded wallets and the PreStocks disclosures.
- [Six futures](./docs/curated-thesis-research.md): the research behind the curated packs, including what can't be bought yet.

## What you actually own

The individual tokenized stocks, in your own wallet. A Thesis position is an application-level
grouping of trade lots — not a fund share, not a pooled asset, not a claim on anything we hold.
We never touch your private keys.

Tokenized stocks are issued by Backed Finance (xStocks). The issuer can move tokens out of any
wallet and can freeze transfers, and balances rebase for dividends and splits. Those powers are
real and are disclosed on every holding.

## Status

Built for the Solana Stocklana hackathon, September 2026, and live on mainnet. Purchases and gifts
execute through Jupiter from the buyer's or recipient's own wallet. xStocks and PreStocks are not
offered to US persons or in restricted countries; claiming a gift asks where the recipient lives
and checks it against the issuers' restricted lists.

## Setup

Requirements: Node 22, pnpm 9, PostgreSQL 16.

```bash
pnpm install
createdb thesis
cp .env.example .env.local      # then fill it in
pnpm db:push                    # create tables
./scripts/apply-constraints.sh  # partial unique indexes, generated columns, triggers
for f in src/server/db/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done  # gifts
pnpm db:seed                    # verify every mint against chain, then seed
pnpm dev
```

`pnpm assets:verify` re-checks every allowlisted mint against the chain and against live
two-way Jupiter routes. It exits non-zero on any disagreement.

**Stop `pnpm dev` before running `pnpm build`.** Both write to `.next/`, and a production
build run underneath a live dev server leaves it loading chunk files that no longer exist
(`Cannot find module './491.js'`). If that happens: kill the dev server, `rm -rf .next`,
start it again.

### Environment

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `JUP_API_KEY` | Jupiter API key. Without one, `api.jup.ag` rate-limits after ~4 calls |
| `SOLANA_RPC_URL` | Mainnet RPC with a key (Helius or similar) |
| `SOLANA_RPC_FALLBACK_URL` | Public RPC, used for reads only, never for sends |
| `EXECUTION_MODE` | `simulation` (default) or `live` |
| `LIVE_EXECUTION_WALLETS` | Comma-separated wallet allowlist. Empty means nobody executes |
| `CRON_SECRET` | Protects the reconciliation endpoint |

No secret is committed. `.env*` is gitignored.

## Architecture

- **Next.js App Router** — one process serving the public pages and the server API. Thesis pages
  are server-rendered so a shared link works without a wallet.
- **PostgreSQL + Drizzle** — durable content versions, intents, legs, fills, positions.
  The guarantees that matter are constraints, not code paths: see
  [`src/server/db/constraints.sql`](./src/server/db/constraints.sql).
- **Jupiter** — `lite-api.jup.ag/swap/v1/quote` (free) for display and valuation,
  `api.jup.ag/swap/v2/order` + `/execute` (keyed) for orders a user signs. Split deliberately,
  so a valuation poll can never starve execution.
- **Reconciliation** — not a daemon. One function called from the intent endpoint, from the
  execute route's `finally`, and from a cron route.

### Three things this codebase is careful about

**A basket is three transactions, and the truth about partial outcomes is the product.**
No global "success" appears until every leg is confirmed. A partial purchase says exactly how
much USDC was not spent, and that USDC stays in your wallet — never reserved, never swept.

**A provider saying "Success" is not evidence.** A leg is confirmed from a chain read of the
transaction's own pre/post token balances, never from a client message and never from the quote.

**A timeout is not a failure.** When `/execute` times out the transaction may well have landed.
The leg goes to `unknown` and is resolved against the chain by three witnesses — the signature
if we can derive it, the user's own signature bytes inside the landed transaction if we cannot,
and finally blockhash expiry, which is the only proof a transaction can never land. A
replacement is offered only after the previous outcome resolves, and a unique constraint on the
fill signature means even a doubled reconciliation cannot book a purchase twice.

## Tests

```bash
pnpm test        # money and state logic
pnpm typecheck
```

## Acknowledgements

[Jupiter](https://dev.jup.ag) for routing and execution, [Backed Finance](https://xstocks.com)
for the tokenized equities, [Helius](https://helius.dev) for RPC, and
[shadcn/ui](https://ui.shadcn.com) for the component primitives.
