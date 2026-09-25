import { describe, expect, it } from "vitest";

import { displayAmount, formatAmount, formatUsd, usable, valueHoldings, valueTheses, type Price } from "./portfolio";

const P = (usd: number, multiplier = 1): Price => ({ usd, multiplier });

describe("displayAmount", () => {
  it("applies decimals and the issuer multiplier", () => {
    expect(displayAmount("156200", 8)).toBeCloseTo(0.001562, 9);
    expect(displayAmount("100000000", 8, 1.02)).toBeCloseTo(1.02, 9);
  });
  it("ignores a nonsense multiplier rather than zeroing the holding", () => {
    expect(displayAmount("100000000", 8, 0)).toBe(1);
    expect(displayAmount("100000000", 8, Number.NaN)).toBe(1);
  });
});

describe("usable", () => {
  it("a zero, negative or NaN price is not a price", () => {
    expect(usable(P(0))).toBeNull();
    expect(usable(P(-1))).toBeNull();
    expect(usable(P(Number.NaN))).toBeNull();
    expect(usable(undefined)).toBeNull();
    expect(usable(P(12))).toEqual(P(12));
  });
});

describe("valueHoldings", () => {
  const bal = (mint: string, raw: string) => ({ mint, symbol: mint.toUpperCase(), company: mint, raw, decimals: 8 });

  it("values each holding and totals only the priced ones", () => {
    const prices = new Map([["a", P(100)], ["b", P(0)]]);
    const { rows, holdingsUsd, unpriced } = valueHoldings([bal("a", "200000000"), bal("b", "100000000")], prices);
    expect(rows[0]).toMatchObject({ mint: "a", amount: 2, priceUsd: 100, valueUsd: 200 });
    expect(rows[1]).toMatchObject({ mint: "b", priceUsd: null, valueUsd: null });
    expect(holdingsUsd).toBe(200);
    expect(unpriced).toBe(1);
  });

  it("drops empty token accounts and sorts largest first", () => {
    const prices = new Map([["a", P(1)], ["b", P(10)], ["c", P(5)]]);
    const { rows } = valueHoldings([bal("a", "100000000"), bal("b", "100000000"), bal("c", "0")], prices);
    expect(rows.map((r) => r.mint)).toEqual(["b", "a"]);
  });

  it("uses the feed's multiplier for rebased stock tokens", () => {
    const { rows } = valueHoldings([bal("x", "100000000")], new Map([["x", P(50, 1.1)]]));
    expect(rows[0].amount).toBeCloseTo(1.1, 9);
    expect(rows[0].valueUsd).toBeCloseTo(55, 9);
  });
});

describe("valueTheses", () => {
  const intent = { intentId: "i1", slug: "s", claim: "c", executionMode: "live" as const, createdAt: "2026-09-24T00:00:00Z", plannedLegs: 3 };
  const fill = (mint: string, inRaw: string, outRaw: string) => ({ intentId: "i1", mint, symbol: mint, company: mint, decimals: 8, inRaw, outRaw });

  it("puts in = USDC spent on confirmed fills; now = those tokens at today's price", () => {
    const rows = valueTheses([intent], [fill("a", "400000", "100000000"), fill("b", "350000", "50000000")], new Map([["a", P(0.5)], ["b", P(1)]]));
    expect(rows[0].putInUsd).toBeCloseTo(0.75, 9);
    expect(rows[0].nowUsd).toBeCloseTo(1, 9);
    expect(rows[0].changeUsd).toBeCloseTo(0.25, 9);
    expect(rows[0].changePct).toBeCloseTo(33.333, 2);
    expect(rows[0].missing).toBe(1);
  });

  it("an unpriced holding makes the purchase's value unknown, not smaller", () => {
    const rows = valueTheses([intent], [fill("a", "400000", "100000000"), fill("b", "350000", "50000000")], new Map([["a", P(0.5)]]));
    expect(rows[0].nowUsd).toBeNull();
    expect(rows[0].changeUsd).toBeNull();
    expect(rows[0].changePct).toBeNull();
  });

  it("a purchase that bought nothing is history, not a position", () => {
    expect(valueTheses([intent], [], new Map())).toEqual([]);
  });
});

describe("formatting", () => {
  it("keeps cents and tiny amounts readable", () => {
    expect(formatUsd(0.0091)).toBe("$0.0091");
    expect(formatUsd(-0.004)).toBe("−$0.004");
    expect(formatUsd(-12.5)).toBe("−$12.50");
    expect(formatAmount(0.0015623)).toBe("0.001562");
    expect(formatAmount(12.34567)).toBe("12.3457");
  });
});
