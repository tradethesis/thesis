/**
 * What a basket *is*, as a string.
 *
 * A basket is an allocation: a set of mints and the weight of each. Two theses that name the
 * same mints at the same weights are arguing about one basket, whatever else they say — which
 * is the whole reason a basket can be a parent with several arguments attached.
 *
 * ## Why mints and not symbols
 *
 * `asset.symbol` has no unique index, deliberately: `asset.network` is `mainnet | fixture` and
 * a development fixture may legitimately carry a real symbol. `asset.mint` *is* unique. A key
 * in symbol space can therefore collide a fixture with the mainnet asset of the same name —
 * TH-14, and the one collision that must never reach a decision about what gets bought. The
 * order path already resolves by mint (`assetByMint` in the execution layer), so mint space is
 * also the vocabulary the money already speaks.
 *
 * ## Why the chain is not in the string
 *
 * It belongs in a column beside this key, never inside it. Prefixing `solana:` would change
 * every `conviction.basket_key` already stored, every one of those rows would read as
 * `basketChanged`, and the standings would empty with no error anywhere.
 *
 * ## Sort order is part of the format
 *
 * `.sort()` on strings compares UTF-16 code units. Any SQL that derives this key must say
 * `COLLATE "C"` to match, because the database's own collation is case-insensitive and base58
 * mints are mixed case. Measured on this catalogue: the two orders disagree on 21 of 68
 * versions. A mismatch is silent and looks like a basket that changed.
 */

export type AllocationHolding = { mint: string; weightBps: number };

/** Canonical allocation identity. Byte-identical to the historical `basketKey`. */
export function allocationKey(holdings: AllocationHolding[]): string {
  return holdings
    .map((h) => `${h.mint}:${h.weightBps}`)
    .sort()
    .join("|");
}

/**
 * How far two allocations are apart, in basis points of the basket.
 *
 * Sum of the absolute weight changes, halved — moving 5% from one holding to another is a
 * 500bps move of the basket, not 1000. Only meaningful between allocations over the same
 * mints; a different mint set is a different basket by inspection.
 */
export function turnoverBps(a: AllocationHolding[], b: AllocationHolding[]): number {
  const byMint = new Map<string, number>();
  for (const h of a) byMint.set(h.mint, (byMint.get(h.mint) ?? 0) + h.weightBps);
  for (const h of b) byMint.set(h.mint, (byMint.get(h.mint) ?? 0) - h.weightBps);
  let total = 0;
  for (const delta of byMint.values()) total += Math.abs(delta);
  return total / 2;
}

/** True when both allocations name exactly the same mints, whatever the weights. */
export function sameMints(a: AllocationHolding[], b: AllocationHolding[]): boolean {
  if (a.length !== b.length) return false;
  const mine = new Set(a.map((h) => h.mint));
  return b.every((h) => mine.has(h.mint)) && mine.size === a.length;
}

/**
 * The smallest re-weight that counts as a different basket, in basis points.
 *
 * Weights are whole percentages across exactly three legs, so 500bps cannot be reached by
 * rounding: it is a five-percentage-point shift of the whole basket, the smallest move that
 * visibly changes which holding an argument leans on. Below it, a re-weight is a way of
 * dodging association rather than an editorial act.
 *
 * Calibrated against the one real clash this catalogue shipped: `spending-a-trillion` was
 * separated from `ai-liability-favors-big-cloud` by moving 3400/3300/3300 to 4500/3500/2000,
 * a turnover of 1300bps. The rule below would not have changed that decision.
 */
export const MIN_TURNOVER_BPS = 500;

/** A basket already holding some allocation, as the classifier needs to see it. */
export type ExistingBasket = {
  basketId: string;
  basketVersionId: string;
  slug: string;
  name: string;
  holdings: AllocationHolding[];
};

export type AllocationResolution =
  /** This allocation already exists. Attach the argument to it rather than refusing it. */
  | { kind: "attach"; basket: ExistingBasket; mine: boolean }
  /** Close enough to an existing basket to look like evasion rather than an editorial act. */
  | { kind: "too_similar"; basket: ExistingBasket; turnoverBps: number }
  /** Genuinely new. */
  | { kind: "create" };

/**
 * What to do with an allocation somebody wants to publish.
 *
 * This replaces a rule that simply refused: "two theses that buy exactly the same thing are one
 * thesis". That was right about the diagnosis and wrong about the remedy — the answer to two
 * arguments over one allocation is one basket with two arguments, not one of them deleted.
 *
 * What survives is the reason the old rule existed. A reader choosing between two entries that
 * buy the identical thing is not choosing between two products, and a one-percent nudge to dodge
 * the check produces exactly that while looking compliant. So a near-miss is still refused, and
 * only a re-weight large enough to change which holding the argument leans on makes a new basket.
 */
export function classifyAllocation(
  mine: AllocationHolding[],
  existing: ExistingBasket[],
  options: { ownBasketId?: string } = {},
): AllocationResolution {
  const key = allocationKey(mine);

  const exact = existing.find((b) => allocationKey(b.holdings) === key);
  if (exact) return { kind: "attach", basket: exact, mine: exact.basketId === options.ownBasketId };

  for (const b of existing) {
    if (b.basketId === options.ownBasketId) continue;
    if (!sameMints(mine, b.holdings)) continue;
    const moved = turnoverBps(mine, b.holdings);
    if (moved > 0 && moved < MIN_TURNOVER_BPS) return { kind: "too_similar", basket: b, turnoverBps: moved };
  }

  return { kind: "create" };
}
