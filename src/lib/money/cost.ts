/**
 * What a leg costs, and therefore how small a basket is allowed to be.
 *
 * Measured against live orders on 2026-09-14 (scripts/size-sweep.ts), per leg:
 *
 *     $5    313 bps      $10   162 bps      $16.67  101 bps
 *     $25    71 bps      $50    41 bps      $100     26 bps      $250  17 bps
 *
 * feeBps x size is nearly constant at about $0.15–0.17, so this is a flat charge plus a
 * rate, not a rate. The flat part matches the 1,488,440 lamports of Token-2022 account
 * rent that Jupiter's gasless RFQ pays on the user's behalf and charges back in USDC —
 * which is why the user needs no SOL, and why a small basket is disproportionately
 * expensive.
 *
 * Consequence: the PRD's illustrative $50 basket costs the buyer about 1% in fees. That is
 * true but not good, so the default is higher and the review screen always shows the
 * figure in dollars as well as basis points.
 *
 * Do not compute cost from Jupiter's inUsdValue / outUsdValue. Those are reference prices:
 * the same sweep showed NVDAx with a *negative* implied cost at every size, which would be
 * free money. They are display-only.
 */

export const LEG_COUNT = 3;

/** The rate component Jupiter reports as platformFee. */
export const PLATFORM_FEE_BPS = 10;

/** The flat component, in USDC base units. Covers the token-account rent. */
export const ESTIMATED_FLAT_LEG_COST_RAW = 160_000n; // $0.16

/** Below this, fees are a big enough share that the basket is not worth buying. */
export const MIN_BASKET_RAW = 75_000_000n; // $75 -> $25/leg -> about 71 bps
export const DEFAULT_BASKET_RAW = 150_000_000n; // $150 -> $50/leg -> about 41 bps

/** Above this, say so plainly next to the total rather than burying it. */
export const HIGH_COST_WARNING_BPS = 60;

export type LegCostEstimate = {
  legInputRaw: bigint;
  estimatedCostRaw: bigint;
  estimatedCostBps: number;
};

/** What one leg of a basket of this size is expected to cost, before the real order. */
export function estimateLegCost(legInputRaw: bigint): LegCostEstimate {
  const rate = (legInputRaw * BigInt(PLATFORM_FEE_BPS)) / 10_000n;
  const estimatedCostRaw = rate + ESTIMATED_FLAT_LEG_COST_RAW;
  const estimatedCostBps = legInputRaw > 0n ? Number((estimatedCostRaw * 10_000n) / legInputRaw) : 0;
  return { legInputRaw, estimatedCostRaw, estimatedCostBps };
}

export function estimateBasketCost(budgetRaw: bigint): {
  estimatedCostRaw: bigint;
  estimatedCostBps: number;
  isHighCost: boolean;
} {
  const perLeg = budgetRaw / BigInt(LEG_COUNT);
  const { estimatedCostRaw } = estimateLegCost(perLeg);
  const total = estimatedCostRaw * BigInt(LEG_COUNT);
  const bps = budgetRaw > 0n ? Number((total * 10_000n) / budgetRaw) : 0;
  return { estimatedCostRaw: total, estimatedCostBps: bps, isHighCost: bps >= HIGH_COST_WARNING_BPS };
}

/** USDC base units -> "$123.45". The only place money becomes a string for display. */
export function formatUsdc(raw: bigint, fractionDigits = 2): string {
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const whole = abs / 1_000_000n;
  const frac = abs % 1_000_000n;
  const scaled = Number(frac) / 1_000_000;
  const value = Number(whole) + scaled;
  return `${negative ? "-" : ""}$${value.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}`;
}
