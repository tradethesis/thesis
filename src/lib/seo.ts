/**
 * One place for everything a crawler — human-facing or machine-facing — reads about
 * the site.
 *
 * Two rules hold this together:
 *
 *   1. There is exactly one canonical host. Beta serves the same build on a different
 *      domain, and if both got indexed they would compete for the same queries with
 *      the same copy. Every canonical URL points at production regardless of where the
 *      code is running.
 *
 *   2. Only production is indexable. The switch is `VERCEL_ENV`, not `SITE_MODE`:
 *      SITE_MODE says which surfaces are open, which is a product decision that will
 *      change, while "is this the real site" is a deployment fact that will not.
 */

export const SITE_NAME = "Thesis";
export const SITE_URL = "https://tradethesis.xyz";
export const SITE_TAGLINE = "Buy what you believe.";

/** The one-sentence answer to "what is this". Used as the meta description on the front door. */
export const SITE_DESCRIPTION =
  "Thesis turns a belief about the world into an editable basket of tokenized stocks, " +
  "bought with USDC from your own Solana wallet.";

/**
 * The longer answer, for the places that have room: Open Graph, and the AI crawlers
 * that read /llms.txt. Says what the product does and what it does not do, because a
 * summary that overclaims is worse than no summary.
 */
export const SITE_DESCRIPTION_LONG =
  "Read a claim about the world, see the tokenized stocks that express it and why, " +
  "change the weights, and buy the basket with USDC from your own Solana wallet. " +
  "Every holding carries a stated job, a stated weakness, and the strongest argument " +
  "against the claim. There is no basket token and no pooled fund — you hold the assets.";

/**
 * True only on the production deployment.
 *
 * Vercel sets VERCEL_ENV to "production", "preview" or "development". Beta is a preview
 * deployment with a custom domain on it, so it lands in "preview" and stays out of the
 * index. A missing value means a local run, which is also not indexable.
 */
export function isIndexable(env: string | undefined = process.env.VERCEL_ENV): boolean {
  return env === "production";
}

/** Absolute URL for a path, always on the canonical host. */
export function canonical(path: string): string {
  return new URL(path, SITE_URL).toString();
}
