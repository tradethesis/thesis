/**
 * Which surfaces the public site exposes.
 *
 *   full      everything: the catalogue, thesis pages, the buy flow.
 *   waitlist  the front door only. The catalogue is built and working, it is just not
 *             open yet, so every product route sends a visitor to /join.
 *
 * One switch, set per environment, rather than two versions of the site. Beta runs `full`
 * and production runs `waitlist`, and the same build serves both — so what gets opened up
 * later is exactly what has been running on beta all along.
 *
 * Defaults to `full`: a missing or misspelt value should leave the product working rather
 * than silently hide it.
 */
export type SiteMode = "full" | "waitlist";

export function siteMode(value: string | undefined = process.env.SITE_MODE): SiteMode {
  return value === "waitlist" ? "waitlist" : "full";
}

/** Product routes, closed while the site is in waitlist mode. */
export const GATED_PREFIXES = ["/explore", "/t/", "/buy/", "/signing-check"] as const;

export function isGatedPath(pathname: string): boolean {
  return GATED_PREFIXES.some((p) => pathname === p.replace(/\/$/, "") || pathname.startsWith(p));
}
