import { describe, expect, it } from "vitest";
import fixtures from "./__fixtures__/orders.json";
import type { JupiterOrder } from "@/server/jupiter/client";
import { evaluateOrder, routerFamily, type PolicyContext } from "./orderPolicy";

const orders = fixtures.orders as unknown as Record<string, JupiterOrder>;
const TAKER = fixtures.taker as string;
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const ctxFor = (order: JupiterOrder, over: Partial<PolicyContext> = {}): PolicyContext => ({
  plannedInRaw: BigInt(order.inAmount),
  expectedInputMint: order.inputMint,
  expectedOutputMint: order.outputMint,
  expectedTaker: TAKER,
  requireExecutable: true,
  // Fixtures were captured in the past, so evaluate them at their own capture time.
  nowMs: order.expireAt ? Number(order.expireAt) * 1000 - 30_000 : Date.parse(fixtures.capturedAt),
  ...over,
});

const clone = (order: JupiterOrder): JupiterOrder => JSON.parse(JSON.stringify(order));

describe("fixtures describe the world we actually execute in", () => {
  it("has both router families among executable orders", () => {
    const families = Object.entries(orders)
      .filter(([k]) => !k.startsWith("preflight_"))
      .map(([, o]) => routerFamily(o));
    expect(families).toContain("rfq");
    expect(families).toContain("amm");
  });

  it("shows that a taker-less preflight does not predict the executed route", () => {
    // Every preflight came back as an AMM aggregator quote; supplying a taker brought
    // the RFQ maker in. A review screen built on a preflight is showing a different
    // product from the one the user will sign.
    expect(routerFamily(orders.preflight_buy_COINx)).toBe("amm");
    expect(routerFamily(orders.buy_COINx)).toBe("rfq");
  });
});

describe("evaluateOrder accepts real orders", () => {
  it("accepts a firm RFQ buy", () => {
    const order = orders.buy_COINx;
    const result = evaluateOrder(order, ctxFor(order));
    expect(result.outcome).toBe("ok");
    if (result.outcome !== "ok") return;
    expect(result.family).toBe("rfq");
    expect(result.minOutRaw).toBe(BigInt(order.outAmount));
    expect(result.gasless).toBe(true);
  });

  it("accepts an AMM sell and reports a floor below the expected amount", () => {
    const order = orders.sell_CRCLx;
    // This one priced but could not build a transaction for an empty wallet, which is
    // exactly the preflight case: price it, do not try to sign it.
    const result = evaluateOrder(order, ctxFor(order, { requireExecutable: false }));
    expect(result.outcome).toBe("ok");
    if (result.outcome !== "ok") return;
    expect(result.family).toBe("amm");
    expect(result.minOutRaw).toBeLessThan(result.outRaw);
  });
});

describe("evaluateOrder rejects", () => {
  it("an order that pays or buys the wrong mint", () => {
    const order = orders.buy_COINx;
    expect(evaluateOrder(order, ctxFor(order, { expectedInputMint: "SomeOtherMint" }))).toMatchObject({
      code: "wrong_input_mint",
    });
    expect(evaluateOrder(order, ctxFor(order, { expectedOutputMint: "SomeOtherMint" }))).toMatchObject({
      code: "wrong_output_mint",
    });
  });

  it("an order assembled for a different wallet", () => {
    const order = orders.buy_COINx;
    expect(evaluateOrder(order, ctxFor(order, { expectedTaker: "NotOurWallet" }))).toMatchObject({
      code: "wrong_taker",
    });
  });

  it("an order that spends more than allocate() planned", () => {
    const order = orders.buy_COINx;
    const planned = BigInt(order.inAmount) - 1n;
    expect(evaluateOrder(order, ctxFor(order, { plannedInRaw: planned }))).toMatchObject({
      code: "budget_mismatch",
    });
  });

  it("an RFQ order that is not actually firm", () => {
    const order = clone(orders.buy_COINx);
    order.otherAmountThreshold = (BigInt(order.outAmount) - 1000n).toString();
    expect(evaluateOrder(order, ctxFor(order))).toMatchObject({ code: "rfq_not_firm" });

    const slipped = clone(orders.buy_COINx);
    slipped.slippageBps = 50;
    expect(evaluateOrder(slipped, ctxFor(slipped))).toMatchObject({ code: "rfq_not_firm" });
  });

  it("an AMM route with a floor further below the quote than we allow", () => {
    const order = clone(orders.sell_CRCLx);
    order.otherAmountThreshold = ((BigInt(order.outAmount) * 9_700n) / 10_000n).toString();
    expect(evaluateOrder(order, ctxFor(order, { requireExecutable: false }))).toMatchObject({
      code: "amm_slippage_too_wide",
    });
  });

  it("an order Jupiter priced but could not build a transaction for", () => {
    const order = orders.sell_CRCLx;
    expect(order.transaction).toBeFalsy();
    expect(evaluateOrder(order, ctxFor(order))).toMatchObject({ code: "no_transaction" });
  });

  it("a quote with no useful life left", () => {
    const order = orders.buy_COINx;
    const atExpiry = Number(order.expireAt) * 1000 - 1_000;
    expect(evaluateOrder(order, ctxFor(order, { nowMs: atExpiry }))).toMatchObject({ code: "quote_expired" });
  });

  it("a fee that has run away", () => {
    const order = clone(orders.buy_COINx);
    order.feeBps = 900;
    expect(evaluateOrder(order, ctxFor(order))).toMatchObject({ code: "fee_too_high" });
  });

  it("but tolerates the honestly high fee of a small leg", () => {
    // 101 bps on a $16.67 leg is a flat ~$0.16 account cost, not a bad route.
    expect(orders.buy_COINx.feeBps).toBeGreaterThan(100);
    expect(evaluateOrder(orders.buy_COINx, ctxFor(orders.buy_COINx)).outcome).toBe("ok");
  });
});

describe("terms changed", () => {
  it("flags a floor that dropped more than 100 bps below what the user reviewed", () => {
    const order = orders.buy_COINx;
    const reviewed = (BigInt(order.otherAmountThreshold) * 10_200n) / 10_000n;
    const result = evaluateOrder(
      order,
      ctxFor(order, { reviewedOutRaw: reviewed, reviewedMinOutRaw: reviewed }),
    );
    expect(result.outcome).toBe("terms_changed");
    if (result.outcome !== "terms_changed") return;
    expect(result.driftBps).toBeGreaterThan(100);
    expect(result.message).toMatch(/firm price moved/);
  });

  it("does not flag a floor that moved in the user's favour", () => {
    const order = orders.buy_COINx;
    const reviewed = (BigInt(order.otherAmountThreshold) * 9_000n) / 10_000n;
    expect(
      evaluateOrder(order, ctxFor(order, { reviewedOutRaw: reviewed, reviewedMinOutRaw: reviewed })).outcome,
    ).toBe("ok");
  });

  it("does not flag drift inside the tolerance", () => {
    const order = orders.buy_COINx;
    const reviewed = (BigInt(order.otherAmountThreshold) * 10_050n) / 10_000n;
    expect(
      evaluateOrder(order, ctxFor(order, { reviewedOutRaw: reviewed, reviewedMinOutRaw: reviewed })).outcome,
    ).toBe("ok");
  });
});

describe("USDC identity", () => {
  it("every buy fixture pays USDC", () => {
    for (const [name, order] of Object.entries(orders)) {
      if (name.includes("buy_")) expect(order.inputMint).toBe(USDC);
    }
  });
});
