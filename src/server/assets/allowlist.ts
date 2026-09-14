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
  // Verified mints held in reserve — not listed in a thesis yet.
  xstock("AAPLx", "Apple", "AAPL", "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", false),
  xstock("PLTRx", "Palantir Technologies", "PLTR", "XsoBhf2ufR8fTyNSjqfU71DYGaE6Z3SUGAidpzriAA4", false),
  xstock("SPYx", "S&P 500 ETF", "SPY", "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W", false),
  xstock("TSLAx", "Tesla", "TSLA", "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB", false),
];

export const ALLOWLIST: AllowlistEntry[] = [QUOTE_ASSET, ...EQUITY_ASSETS];

const BY_MINT = new Map(ALLOWLIST.map((a) => [a.mint, a]));

/** The only sanctioned lookup. Returns undefined for anything not on the list. */
export function assetByMint(mint: string): AllowlistEntry | undefined {
  return BY_MINT.get(mint);
}

export function isTradableEquityMint(mint: string): boolean {
  const asset = BY_MINT.get(mint);
  return Boolean(asset && asset.enabled && asset.mint !== USDC_MINT);
}
