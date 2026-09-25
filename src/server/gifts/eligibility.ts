/**
 * Who may open a gift into stock tokens, when the deployment asks (GIFT_ELIGIBILITY_PROVIDER=attestation).
 *
 * The issuer's own list (Backed, assets.backed.fi/legal-documentation/restricted-countries, read
 * 24 September 2026): prohibited — the United States (not registered with US regulators, so not
 * offered to US persons or people in the US), Iran, North Korea, Syria; not serviced — the rest below.
 * "Occupied regions of Ukraine" has no country code of its own, so the declaration names it.
 *
 * Two signals, and either one refuses: what the recipient declares, and the country their
 * connection comes from. Neither is proof. Together they are a real, stated check — and a refusal
 * never costs anybody their gift: the USDC stays in their wallet.
 */

export const PROHIBITED = ["US", "IR", "KP", "SY"] as const;
export const NOT_SERVICED = [
  "AF", "BY", "CF", "CD", "CU", "ET", "HT", "IQ", "LB", "LY", "ML", "MZ",
  "MM", "NI", "NG", "PH", "RU", "SO", "SS", "SD", "VE", "YE", "ZW",
] as const;
const RESTRICTED = new Set<string>([...PROHIBITED, ...NOT_SERVICED]);

export function isRestricted(country: string | null | undefined): boolean {
  return Boolean(country) && RESTRICTED.has(country!.toUpperCase());
}

export type Declaration = { country: string; attested: boolean };

export type EligibilityVerdict =
  | { status: "eligible" }
  | { status: "ineligible"; reason: "declared" | "located" }
  | { status: "incomplete" };

export function judgeEligibility(declaration: Declaration | null | undefined, ipCountry: string | null | undefined): EligibilityVerdict {
  if (!declaration?.attested || !/^[A-Za-z]{2}$/.test(declaration.country ?? "")) return { status: "incomplete" };
  if (isRestricted(declaration.country)) return { status: "ineligible", reason: "declared" };
  // Vercel sends "XX" or nothing when it cannot tell; only a real, restricted code refuses.
  if (ipCountry && /^[A-Za-z]{2}$/.test(ipCountry) && isRestricted(ipCountry)) return { status: "ineligible", reason: "located" };
  return { status: "eligible" };
}
