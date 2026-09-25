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
export const SITE_TAGLINE = "The coolest gift on the internet.";

/** The one-sentence answer to "what is this". Used as the meta description on the front door. */
export const SITE_DESCRIPTION = "Give a friend a pack of stocks. From $1, sent to their X handle.";

/**
 * The longer answer, for the places that have room: Open Graph, and the AI crawlers
 * that read /llms.txt. Says what the product does and what it does not do, because a
 * summary that overclaims is worse than no summary.
 */
export const SITE_DESCRIPTION_LONG =
  "Give a friend a pack of stocks — Nvidia, Apple, Amazon and more — from $1, sent to their X handle. " +
  "They rip it open; no crypto wallet needed. These are tokenized stocks: they track the share price and can lose value.";

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
