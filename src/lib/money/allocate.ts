/**
 * Split a USDC budget across constituents by basis-point weights.
 *
 * PRD §10 step 3: "Allocate integer USDC base units by weights. Distribute rounding
 * remainder deterministically using largest fractional remainders, breaking ties by
 * constituent order."
 *
 * Pure by design — no db, no network, no config imports — so the invariant that matters
 * (the parts sum to the whole, exactly) is testable on its own.
 */

export type WeightedLeg = {
  assetId: string;
  /** Deterministic constituent order. The tie-break input, so it must be a real field. */
  positionIndex: number;
  bps: number;
};

export type AllocatedLeg = WeightedLeg & { amountRaw: bigint };

export class AllocationError extends Error {
  constructor(
    readonly code:
      | "wrong_leg_count"
      | "bps_not_integer"
      | "bps_not_whole_percent"
      | "bps_out_of_range"
      | "bps_sum_mismatch"
      | "duplicate_position"
      | "budget_not_positive"
      | "sum_invariant_violated",
    message: string,
  ) {
    super(message);
    this.name = "AllocationError";
  }
}

/**
 * PRD §5/§7, widened 23 September 2026 for packs people build themselves: one to three
 * constituents, whole percentages. The weight bounds depend on how many there are, so that no
 * holding is a rounding error and none crowds the others out:
 *
 *   1 holding    100%
 *   2 holdings   10–90% each
 *   3 holdings   10–70% each      (the curated shape, LEG_COUNT, unchanged)
 *
 * The database enforces the same table (constraints.sql, basket_version_shape).
 */
export const LEG_COUNT = 3;
export const MIN_LEGS = 1;
export const MAX_LEGS = 3;
export const MIN_WEIGHT_BPS = 1000;
export const MAX_WEIGHT_BPS = 7000;
export const TOTAL_BPS = 10_000;

/** The allowed weight range for each of `n` constituents. */
export function weightBoundsBps(n: number): { min: number; max: number } {
  if (n === 1) return { min: TOTAL_BPS, max: TOTAL_BPS };
  if (n === 2) return { min: MIN_WEIGHT_BPS, max: TOTAL_BPS - MIN_WEIGHT_BPS };
  return { min: MIN_WEIGHT_BPS, max: MAX_WEIGHT_BPS };
}

export function validateAllocation(legs: WeightedLeg[]): void {
  if (legs.length < MIN_LEGS || legs.length > MAX_LEGS) {
    throw new AllocationError("wrong_leg_count", `expected ${MIN_LEGS}-${MAX_LEGS} constituents, got ${legs.length}`);
  }
  const bounds = weightBoundsBps(legs.length);

  const seen = new Set<number>();
  let sum = 0;

  for (const leg of legs) {
    if (!Number.isInteger(leg.bps)) {
      throw new AllocationError("bps_not_integer", `weight for ${leg.assetId} is not an integer: ${leg.bps}`);
    }
    if (leg.bps % 100 !== 0) {
      throw new AllocationError(
        "bps_not_whole_percent",
        `weight for ${leg.assetId} is not a whole percent: ${leg.bps} bps`,
      );
    }
    if (leg.bps < bounds.min || leg.bps > bounds.max) {
      throw new AllocationError(
        "bps_out_of_range",
        `weight for ${leg.assetId} is ${leg.bps} bps, outside ${bounds.min}-${bounds.max}`,
      );
    }
    if (seen.has(leg.positionIndex)) {
      throw new AllocationError("duplicate_position", `duplicate positionIndex ${leg.positionIndex}`);
    }
    seen.add(leg.positionIndex);
    sum += leg.bps;
  }

  if (sum !== TOTAL_BPS) {
    throw new AllocationError("bps_sum_mismatch", `weights sum to ${sum} bps, must be ${TOTAL_BPS}`);
  }
}

/**
 * Largest-remainder apportionment in integer base units.
 *
 * Guarantees `sum(amountRaw) === budgetRaw` exactly. The leftover is at most
 * `legs.length - 1` base units and goes to the largest fractional remainders,
 * ties broken by ascending positionIndex.
 */
export function allocate(budgetRaw: bigint, legs: WeightedLeg[]): AllocatedLeg[] {
  if (budgetRaw <= 0n) {
    throw new AllocationError("budget_not_positive", `budget must be positive, got ${budgetRaw}`);
  }
  validateAllocation(legs);

  const total = BigInt(TOTAL_BPS);
  const scratch = legs.map((leg) => {
    const exact = budgetRaw * BigInt(leg.bps);
    return { leg, amountRaw: exact / total, remainder: exact % total };
  });

  let leftover = budgetRaw - scratch.reduce((acc, s) => acc + s.amountRaw, 0n);

  const ranked = [...scratch].sort((a, b) => {
    if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
    return a.leg.positionIndex - b.leg.positionIndex;
  });

  for (let i = 0; leftover > 0n; i += 1, leftover -= 1n) {
    ranked[i % ranked.length].amountRaw += 1n;
  }

  const result = scratch.map((s) => ({ ...s.leg, amountRaw: s.amountRaw }));

  // Checked in production, not only in tests. A silent rounding bug here spends
  // the wrong amount of someone's money.
  const check = result.reduce((acc, r) => acc + r.amountRaw, 0n);
  if (check !== budgetRaw) {
    throw new AllocationError("sum_invariant_violated", `allocated ${check}, budget was ${budgetRaw}`);
  }

  return result;
}

/** 2500 -> "25%" for display. Weights are whole percentages by constraint. */
export function bpsToPercentLabel(bps: number): string {
  return `${bps / 100}%`;
}
