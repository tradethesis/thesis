/**
 * The verified asset universe. PRD TH-05: "Transactions use an issuer-verified mint
 * allowlist, never ticker search alone."
 *
 * This is not a convenience cache. Jupiter's token search for "NVDAx" returns four
 * pump.fun clones alongside the real mint, one of them with $3k of liquidity. A symbol
 * is not an identity; only the mint is. Nothing in this codebase resolves an asset by
 * symbol at runtime.
 *
 * Every mint below was checked on 2026-09-14 against Jupiter's token index and against
 * the on-chain mint account (see verify.ts). xStock mints all begin with "Xs" and are
 * SPL Token-2022 with 8 decimals.
 */

export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

/**
 * What the issuer can do to a holder, disclosed in the holding detail view.
 * Verified on the NVDAx mint account: permanentDelegate and pausableConfig are both
 * present and live, and scaledUiAmountConfig currently carries a multiplier above 1.
 */
export const XSTOCK_ISSUER_POWERS =
  "Backed Finance issues these tokens. The issuer can move tokens out of any wallet " +
  "(permanent delegate) and can freeze all transfers (pausable). Balances rebase for " +
  "dividends and splits, so your share count can change without a trade.";

export type AllowlistEntry = {
  symbol: string;
  company: string;
  underlying: string;
  mint: string;
  decimals: number;
  tokenProgram: string;
  issuer: string;
  termsUrl: string;
  issuerPowers: string;
  /**
   * The vanity prefix every mint from this issuer carries, checked by the verifier.
   *
   * These prefixes are ground, not assigned, so a lookalike is cheap to produce — the
   * prefix proves nothing on its own. It is here so that pasting a mint from the wrong
   * issuer into the wrong block fails loudly instead of silently listing a token nobody
   * checked.
   */
  mintPrefix: string;
  /**
   * Token-2022 transfer fee, in basis points, at the time of verification.
   *
   * Recorded because it is charged on every transfer including each leg of a route, it is
   * invisible in a quote, and the issuer can change it at any time. Zero means none today,
   * not none guaranteed.
   */
  transferFeeBps: number;
  /** Enabled for trading. A verified mint we choose not to list yet stays false. */
  enabled: boolean;
};

const xstock = (
  symbol: string,
  company: string,
  underlying: string,
  mint: string,
  enabled = true,
): AllowlistEntry => ({
  symbol,
  company,
  underlying,
  mint,
  decimals: 8,
  tokenProgram: TOKEN_2022_PROGRAM,
  issuer: "Backed Finance",
  termsUrl: "https://xstocks.com/legal",
  issuerPowers: XSTOCK_ISSUER_POWERS,
  mintPrefix: "Xs",
  transferFeeBps: 0,
  enabled,
});

export const QUOTE_ASSET: AllowlistEntry = {
  symbol: "USDC",
  company: "Circle",
  underlying: "USDC",
  mint: USDC_MINT,
  decimals: 6,
  tokenProgram: TOKEN_PROGRAM,
  issuer: "Circle",
  termsUrl: "https://www.circle.com/legal/usdc-terms",
  issuerPowers: "Circle can freeze USDC held at a blacklisted address.",
  mintPrefix: "",
  transferFeeBps: 0,
  enabled: true,
};

/** Two-way routes and round-trip cost confirmed at $16.67 per leg on 2026-09-14. */
export const EQUITY_ASSETS: AllowlistEntry[] = [
  xstock("COINx", "Coinbase Global", "COIN", "Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu"),
  xstock("CRCLx", "Circle Internet Group", "CRCL", "XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1"),
  xstock("HOODx", "Robinhood Markets", "HOOD", "XsvNBAYkrDRNhA7wPHQfX3ZUXZyZLdnCQDfHZ56bzpg"),
  xstock("METAx", "Meta Platforms", "META", "Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu"),
  xstock("GOOGLx", "Alphabet", "GOOGL", "XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN"),
  xstock("AMZNx", "Amazon.com", "AMZN", "Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg"),
  xstock("NVDAx", "NVIDIA", "NVDA", "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh"),
  xstock("MSFTx", "Microsoft", "MSFT", "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX"),
  xstock("PLTRx", "Palantir Technologies", "PLTR", "XsoBhf2ufR8fTyNSjqfU71DYGaE6Z3SUGAidpzriAA4"),
  // Added 17 Sep by scripts/discover-xstocks.ts: each mint read from the chain as
  // Token-2022 with 8 decimals, symbol confirmed against Jupiter's record of that exact
  // mint, and a real two-way quote taken at $25 a leg.
  xstock("QQQx", "Nasdaq 100 ETF", "QQQ", "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ"),
  xstock("GLDx", "Gold ETF", "GLD", "Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re"),
  xstock("MCDx", "McDonald's", "MCD", "XsqE9cRRpzxcGKDXj1BJ7Xmg4GRhZoyY1KpmGSxAWT2"),
  xstock("MSTRx", "MicroStrategy", "MSTR", "XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ"),
  xstock("GMEx", "GameStop", "GME", "Xsf9mBktVB9BSU5kf4nHxPq5hCBJ2j2ui3ecFGxPRGc"),
  // Added 24 Sep for the metabolic-medicine thesis (docs/curated-thesis-research.md, subject 5).
  // Mints from Jupiter's index, confirmed on chain against the same Backed authorities as NVDAx.
  // Thinner than the big tech tokens: a $5 buy-then-sell cost about 2% on 24 Sep (NVDAx: ~0%).
  xstock("LLYx", "Eli Lilly", "LLY", "Xsnuv4omNoHozR6EEW5mXkw8Nrny5rB3jVfLqi6gKMH"),
  xstock("NVOx", "Novo Nordisk", "NVO", "XsfAzPzYrYjd4Dpa9BU3cusBsvWfVB9gBcyGC87S57n"),

  // Verified and deliberately not enabled. STRCx is a preferred instrument with a variable
  // rate, not common stock; its payoff and risks do not resemble the equity tokens around it.
  //
  // Removed 25 Sep: SPCXx, Backed's token tracking SpaceX. Pre-IPO exposure on Thesis comes from
  // one issuer, PreStocks (below); a second issuer's pre-IPO token would make the same company
  // two different instruments with different terms.
  xstock("STRCx", "Strategy preferred", "STRC", "Xs78JED6PFZxWc2wCEPspZW9kL3Se5J7L5TChKgsidH", false),

  // Verified mints held in reserve — not listed in a thesis yet.
  xstock("AAPLx", "Apple", "AAPL", "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", false),
  // Enabled 17 Sep. It is the benchmark every call is scored against, and also the
  // deepest xStock pool, so a reader who decides the index is the better bet can act on
  // that. Being the benchmark and being buyable are independent: calls are scored the
  // same way whether or not anybody holds it.
  xstock("SPYx", "S&P 500 ETF", "SPY", "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W"),
  xstock("TSLAx", "Tesla", "TSLA", "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB", false),
];


/**
 * Onchain assets, as opposed to tokenized equities.
 *
 * Different shape, so a different helper: classic SPL Token, decimals that vary per asset,
 * and no "Xs" prefix. What replaces the prefix as a safety check is the issuer powers
 * string, which is read off the mint account by scripts/discover-crypto.ts rather than
 * written from memory — a wrapped or staked token has somebody standing behind it, and a
 * buyer is entitled to know who and what they can do.
 */
const crypto = (
  symbol: string,
  company: string,
  mint: string,
  decimals: number,
  issuer: string,
  issuerPowers: string,
  enabled = true,
): AllowlistEntry => ({
  symbol,
  company,
  underlying: symbol,
  mint,
  decimals,
  tokenProgram: TOKEN_PROGRAM,
  issuer,
  termsUrl: "",
  issuerPowers,
  mintPrefix: "",
  transferFeeBps: 0,
  enabled,
});

/**
 * Verified on 17 Sep by scripts/discover-crypto.ts: mint account read from the chain for
 * token program, decimals and authorities; symbol confirmed against Jupiter's record of
 * that exact mint; pool liquidity above $1m; a real two-way quote at $25 a leg.
 *
 * PYTH was rejected on liquidity. A mint labelled wETH was rejected because Jupiter calls
 * that mint ETH — the symbol check working as intended — and was re-verified under the
 * correct label.
 */
export const CRYPTO_ASSETS: AllowlistEntry[] = [
  crypto("SOL", "Solana", "So11111111111111111111111111111111111111112", 9, "Solana",
    "No mint or freeze authority. Market risk only."),
  crypto("JitoSOL", "Jito staked SOL", "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn", 9, "Jito Foundation",
    "A mint authority can issue more, which is how liquid staking works. Its value tracks a staking pool rather than SOL one for one."),
  crypto("cbBTC", "Coinbase wrapped BTC", "cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij", 8, "Coinbase",
    "Coinbase holds a freeze authority and can freeze this token in any wallet, and a mint authority that can issue more. You are holding a claim on Coinbase's custody, not bitcoin itself."),
  crypto("WBTC", "Wrapped BTC (Portal)", "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh", 8, "Portal (Wormhole)",
    "A bridge mint authority can issue more. The token is a bridge claim, so it carries the bridge's risk as well as bitcoin's."),
  crypto("ETH", "Wrapped ETH (Portal)", "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs", 8, "Portal (Wormhole)",
    "A bridge mint authority can issue more. The token is a bridge claim, so it carries the bridge's risk as well as ether's."),
  crypto("JUP", "Jupiter", "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", 6, "Jupiter",
    "No mint or freeze authority. Market risk only."),
  crypto("RAY", "Raydium", "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", 6, "Raydium",
    "No mint or freeze authority. Market risk only."),

  // Verified, deliberately not enabled. Both are real and liquid; neither is a plain asset.
  //
  // JLP is a share of a live trading pool whose value moves with the pool's positions and
  // its traders' losses, and whose issuer can both freeze and mint it.
  //
  // BONK has no issuer powers to disclose, which is not the same as being a suitable thing
  // for this product to help somebody buy on the strength of a thesis.
  crypto("JLP", "Jupiter liquidity provider token", "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4", 6, "Jupiter",
    "The issuer holds both a freeze authority and a mint authority. The token is a share in a live trading pool, so its value depends on that pool's positions.", false),
  crypto("Bonk", "Bonk", "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", 5, "Bonk",
    "No mint or freeze authority. Market risk only.", false),
];

/**
 * Pre-IPO tokens issued by PreStocks, verified on chain on 18 September 2026.
 *
 * Every mint below was read from mainnet with getAccountInfo, its Token-2022 metadata
 * symbol matched to the company, and cross-checked against Jupiter's token index. A real
 * USDC buy was quoted and a swap transaction built and simulated without error.
 *
 * These are the riskiest assets on this list by a wide margin, and the disclosure says so
 * in full rather than in the abstract. Three facts a buyer needs and will not find on a
 * chart:
 *
 *  1. The issuer holds permanent delegate, freeze, pause, mint and transfer-hook authority
 *     on every one of these mints, from a single key. Its terms reserve the right to freeze,
 *     claw back, burn or compulsorily redeem a holding "at a value determined by us… which
 *     may be substantially below any market, indicative, or acquisition price and in some
 *     circumstances nil", with no notice, no appeal and no compensation.
 *  2. A live 0.5% transfer fee is charged on every transfer, including each leg of a route
 *     and a move between two wallets you own. It is uncapped and the issuer can raise it,
 *     including on tokens already held.
 *  3. What is held is a reference to economic exposure, not shares. No shareholder rights,
 *     and no claim on the assets of any vehicle behind it. The backing may be an SPV, a
 *     swap, another token or cash, and may be changed without notice.
 *
 * Only four are enabled. The rest are verified and deliberately left off:
 *   - XAI's order book is exhausted by about $1,900; a basket cannot fill against it.
 *   - SPACEX, ANDURIL, NEURALINK and FIGUREAI are thin enough that a $150 leg moves the
 *     price against the buyer, and SPACEX also carries a 5x scaled-UI multiplier.
 *
 * The issuer's terms prohibit US persons. Listing these tokens in a jurisdiction where the
 * issuer will not serve the buyer is a decision for whoever operates the site, not one this
 * file can make — which is why enabling them here does not deploy them anywhere.
 */
export const PRESTOCKS_ISSUER_POWERS =
  "PreStocks issues these tokens. The issuer can freeze, claw back, burn or compulsorily " +
  "redeem any holding at a price it sets, which its terms say may be nil, without notice, " +
  "appeal or compensation. Every transfer pays a 0.5% fee it can raise at any time. You " +
  "hold a reference to economic exposure, not shares: no shareholder rights and no claim " +
  "on the assets behind it. Its terms prohibit US persons.";

const preStock = (symbol: string, company: string, mint: string, enabled = false): AllowlistEntry => ({
  symbol,
  company,
  underlying: symbol,
  mint,
  decimals: 9,
  tokenProgram: TOKEN_2022_PROGRAM,
  issuer: "PreStocks",
  termsUrl: "https://prestocks.notion.site/terms-of-service",
  issuerPowers: PRESTOCKS_ISSUER_POWERS,
  mintPrefix: "Pre",
  transferFeeBps: 50,
  enabled,
});

export const PRESTOCKS_ASSETS: AllowlistEntry[] = [
  // Enabled: real books. Quoted at $25 and $150 with price impact under 2%, and both of
  // the first two clear $5,000 without exhausting the route.
  preStock("OPENAI", "OpenAI", "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF", true),
  preStock("ANTHROPIC", "Anthropic", "Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw", true),
  preStock("KALSHI", "Kalshi", "PreLWGkkeqG1s4HEfFZSy9moCrJ7btsHuUtfcCeoRua", true),
  preStock("POLYMARKET", "Polymarket", "Pre8AREmFPtoJFT8mQSXQLh56cwJmM7CFDRuoGBZiUP", true),

  // Verified and deliberately not enabled. See the note above for each reason.
  preStock("XAI", "xAI", "PreC1KtJ1sBPPqaeeqL6Qb15GTLCYVvyYEwxhdfTwfx"),
  preStock("SPACEX", "SpaceX", "PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh"),
  preStock("ANDURIL", "Anduril", "PresTj4Yc2bAR197Er7wz4UUKSfqt6FryBEdAriBoQB"),
  preStock("NEURALINK", "Neuralink", "PrekqLJvJ3qVdXmBGDiexvwUTF4rLFDa6HWS4HJbw9S"),
  preStock("FIGUREAI", "Figure AI", "PreZad18qfPtbxNpMtMuAuX2zVpvkEU8DnJx56faCWd"),
];

export const ALLOWLIST: AllowlistEntry[] = [QUOTE_ASSET, ...EQUITY_ASSETS, ...CRYPTO_ASSETS, ...PRESTOCKS_ASSETS];

const BY_MINT = new Map(ALLOWLIST.map((a) => [a.mint, a]));

/** The only sanctioned lookup. Returns undefined for anything not on the list. */
export function assetByMint(mint: string): AllowlistEntry | undefined {
  return BY_MINT.get(mint);
}

export function isTradableEquityMint(mint: string): boolean {
  const asset = BY_MINT.get(mint);
  return Boolean(asset && asset.enabled && asset.mint !== USDC_MINT);
}
