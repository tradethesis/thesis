import type { JupiterOrder } from "@/server/jupiter/client";

/**
 * The last thing between a user's signature and their money.
 *
 * The PRD proposes "maximum 50 bps slippage and block price impact above 100 bps per
 * leg". That is not buildable as written, because the two router families do not mean the
 * same thing by those words:
 *
 *   - jupiterz / rfq   a market maker quotes a firm price. slippageBps is 0 and
 *                      otherAmountThreshold === outAmount. There is no slippage to cap.
 *   - metis  / amm     a real AMM route. Jupiter picks slippage itself (100 bps observed)
 *                      and otherAmountThreshold sits below outAmount by that much.
 *
 * And we must not send slippageBps ourselves: doing so flips `mode` from "ultra" to
 * "manual", which can exclude the RFQ maker and hand the user a worse fill than doing
 * nothing at all.
 *
 * So the policy is expressed in terms of the one number that means the same thing to both:
 * `otherAmountThreshold`, the floor the chain will enforce. Everything else is a
 * family-specific sanity check on top.
 *
 * priceImpactPct is deliberately NOT a gate. Measured against live orders it is computed
 * from a reference price, swings sign between families, and read -2.2% on an order whose
 * true cost was about 1%. Gating on it would block good orders and admit bad ones.
 */

export const MAX_FLOOR_DRIFT_BPS = 100;
export const MAX_AMM_SLIPPAGE_BPS = 150;
export const MAX_LEG_FEE_BPS = 400;
export const MIN_QUOTE_HEADROOM_MS = 5_000;

export type RouterFamily = "rfq" | "amm";

export type PolicyContext = {
  /** What allocate() decided. The input budget can never expand. */
  plannedInRaw: bigint;
  expectedInputMint: string;
  expectedOutputMint: string;
  expectedTaker: string;
  /** What the user was shown. Absent on the first quote, present before signing. */
  reviewedOutRaw?: bigint;
  reviewedMinOutRaw?: bigint;
  /** Must the order be signable right now? False for a preflight price check. */
  requireExecutable: boolean;
  nowMs: number;
};

export type PolicyReject = {
  outcome: "reject";
  code:
    | "wrong_input_mint"
    | "wrong_output_mint"
    | "wrong_taker"
    | "budget_mismatch"
    | "no_route"
    | "no_transaction"
    | "rfq_not_firm"
    | "amm_slippage_too_wide"
    | "fee_too_high"
    | "quote_expired"
    | "missing_floor";
  message: string;
};

export type PolicyTermsChanged = {
  outcome: "terms_changed";
  family: RouterFamily;
  reviewedOutRaw: bigint;
  reviewedMinOutRaw: bigint;
  outRaw: bigint;
  minOutRaw: bigint;
  driftBps: number;
  message: string;
};

export type PolicyOk = {
  outcome: "ok";
  family: RouterFamily;
  outRaw: bigint;
  /** The floor the chain enforces. For RFQ this equals outRaw. */
  minOutRaw: bigint;
  feeBps: number;
  gasless: boolean;
  expiresAtMs: number | null;
};

export type PolicyResult = PolicyOk | PolicyReject | PolicyTermsChanged;

export function routerFamily(order: Pick<JupiterOrder, "swapType" | "router">): RouterFamily {
  return order.swapType === "rfq" || order.router === "jupiterz" ? "rfq" : "amm";
}

export function expiresAtMs(order: Pick<JupiterOrder, "expireAt">): number | null {
  if (!order.expireAt) return null;
  const seconds = Number(order.expireAt);
  return Number.isFinite(seconds) ? seconds * 1000 : null;
}

const reject = (code: PolicyReject["code"], message: string): PolicyReject => ({ outcome: "reject", code, message });

export function evaluateOrder(order: JupiterOrder, ctx: PolicyContext): PolicyResult {
  // --- identity. TH-05: the mint is the identity, never the symbol.
  if (order.inputMint !== ctx.expectedInputMint) {
    return reject("wrong_input_mint", `order pays ${order.inputMint}, expected ${ctx.expectedInputMint}`);
  }
  if (order.outputMint !== ctx.expectedOutputMint) {
    return reject("wrong_output_mint", `order buys ${order.outputMint}, expected ${ctx.expectedOutputMint}`);
  }
  if (ctx.requireExecutable && order.taker !== ctx.expectedTaker) {
    return reject("wrong_taker", `order is for ${order.taker ?? "no taker"}, expected ${ctx.expectedTaker}`);
  }

  // --- budget. PRD §10 step 6: never silently expand the input.
  if (BigInt(order.inAmount) !== ctx.plannedInRaw) {
    return reject("budget_mismatch", `order spends ${order.inAmount}, planned ${ctx.plannedInRaw}`);
  }

  const outRaw = BigInt(order.outAmount ?? "0");
  if (outRaw <= 0n) return reject("no_route", "no route returned an output amount");

  // An empty string means the quote worked but the transaction could not be built —
  // for a sell, typically because the wallet does not hold the token yet.
  if (ctx.requireExecutable && !order.transaction) {
    return reject(
      "no_transaction",
      order.errorMessage ?? "Jupiter priced this leg but could not build a transaction for this wallet",
    );
  }

  const minOutRaw = BigInt(order.otherAmountThreshold ?? "0");
  if (minOutRaw <= 0n) return reject("missing_floor", "order has no minimum receive amount");

  const family = routerFamily(order);

  if (family === "rfq") {
    // A firm price, or it is not the product it claims to be.
    if (order.slippageBps !== 0 || minOutRaw !== outRaw) {
      return reject(
        "rfq_not_firm",
        `RFQ order is not firm: slippage ${order.slippageBps} bps, floor ${minOutRaw} vs out ${outRaw}`,
      );
    }
  } else {
    if (order.slippageBps > MAX_AMM_SLIPPAGE_BPS) {
      return reject("amm_slippage_too_wide", `route allows ${order.slippageBps} bps of slippage`);
    }
    const floorGapBps = Number(((outRaw - minOutRaw) * 10_000n) / outRaw);
    if (floorGapBps > MAX_AMM_SLIPPAGE_BPS) {
      return reject("amm_slippage_too_wide", `floor sits ${floorGapBps} bps below the expected amount`);
    }
  }

  // Jupiter's own charge. A flat ~$0.16 plus 10 bps, so a small leg reads high — the
  // ceiling catches a genuinely bad order without blocking an honestly small one.
  if (order.feeBps > MAX_LEG_FEE_BPS) {
    return reject("fee_too_high", `fee is ${order.feeBps} bps of this leg`);
  }

  const expiry = expiresAtMs(order);
  if (ctx.requireExecutable && expiry !== null && expiry - ctx.nowMs < MIN_QUOTE_HEADROOM_MS) {
    return reject("quote_expired", "the quote expires too soon to sign safely; refresh it");
  }

  // --- has what the user reviewed moved?
  if (ctx.reviewedMinOutRaw !== undefined && ctx.reviewedOutRaw !== undefined && ctx.reviewedMinOutRaw > 0n) {
    const driftBps = Number(((ctx.reviewedMinOutRaw - minOutRaw) * 10_000n) / ctx.reviewedMinOutRaw);
    if (driftBps > MAX_FLOOR_DRIFT_BPS) {
      return {
        outcome: "terms_changed",
        family,
        reviewedOutRaw: ctx.reviewedOutRaw,
        reviewedMinOutRaw: ctx.reviewedMinOutRaw,
        outRaw,
        minOutRaw,
        driftBps,
        message:
          family === "rfq"
            ? "The firm price moved. Approve at the new price, or go back."
            : "The guaranteed minimum dropped. Approve the new terms, or go back.",
      };
    }
  }

  return {
    outcome: "ok",
    family,
    outRaw,
    minOutRaw,
    feeBps: order.feeBps,
    gasless: order.gasless,
    expiresAtMs: expiry,
  };
}
