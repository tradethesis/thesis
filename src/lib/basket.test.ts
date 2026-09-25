import { describe, expect, it } from "vitest";

import { allocationKey, classifyAllocation, sameMints, turnoverBps, MIN_TURNOVER_BPS } from "./basket";

const MSFT = "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX";
const GOOGL = "XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN";
const AMZN = "Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg";
const NVDA = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";

const alloc = (rows: [string, number][]) => rows.map(([mint, weightBps]) => ({ mint, weightBps }));

describe("allocationKey", () => {
  it("ignores the order the holdings are listed in", () => {
    const a = alloc([[MSFT, 3400], [GOOGL, 3300], [AMZN, 3300]]);
    const b = alloc([[AMZN, 3300], [MSFT, 3400], [GOOGL, 3300]]);
    expect(allocationKey(a)).toBe(allocationKey(b));
  });

  it("treats a different weight as a different basket", () => {
    const a = alloc([[MSFT, 3400], [GOOGL, 3300], [AMZN, 3300]]);
    const b = alloc([[MSFT, 4500], [GOOGL, 3500], [AMZN, 2000]]);
    expect(allocationKey(a)).not.toBe(allocationKey(b));
  });

  it("treats a different holding as a different basket", () => {
    const a = alloc([[MSFT, 3400], [GOOGL, 3300], [AMZN, 3300]]);
    const b = alloc([[MSFT, 3400], [GOOGL, 3300], [NVDA, 3300]]);
    expect(allocationKey(a)).not.toBe(allocationKey(b));
  });

  it("sorts by code unit, which is what COLLATE \"C\" reproduces in SQL", () => {
    // Base58 is mixed case. A case-insensitive collation puts these the other way round, and
    // a key derived in SQL without COLLATE "C" would not match this one.
    const key = allocationKey(alloc([[MSFT, 3400], [AMZN, 3300], [GOOGL, 3300]]));
    expect(key.split("|").map((p) => p.split(":")[0])).toEqual([AMZN, GOOGL, MSFT].sort());
  });
});

describe("turnoverBps", () => {
  it("halves the summed absolute change, so moving 5% reads as 500bps", () => {
    const a = alloc([[MSFT, 3400], [GOOGL, 3300], [AMZN, 3300]]);
    const b = alloc([[MSFT, 3900], [GOOGL, 3300], [AMZN, 2800]]);
    expect(turnoverBps(a, b)).toBe(500);
  });

  it("is zero for the same allocation", () => {
    const a = alloc([[MSFT, 3400], [GOOGL, 3300], [AMZN, 3300]]);
    expect(turnoverBps(a, [...a].reverse())).toBe(0);
  });

  it("keeps the historical re-weight that resolved the real clash above the floor", () => {
    // ai-liability-favors-big-cloud vs spending-a-trillion-is-the-easy-part, as shipped.
    const shipped = turnoverBps(
      alloc([[MSFT, 3400], [GOOGL, 3300], [AMZN, 3300]]),
      alloc([[MSFT, 4500], [GOOGL, 3500], [AMZN, 2000]]),
    );
    expect(shipped).toBe(1300);
    expect(shipped).toBeGreaterThanOrEqual(MIN_TURNOVER_BPS);
  });

  it("puts a one-percent edit far below the floor", () => {
    const nudged = turnoverBps(
      alloc([[MSFT, 3400], [GOOGL, 3300], [AMZN, 3300]]),
      alloc([[MSFT, 3500], [GOOGL, 3200], [AMZN, 3300]]),
    );
    expect(nudged).toBe(100);
    expect(nudged).toBeLessThan(MIN_TURNOVER_BPS);
  });
});

describe("sameMints", () => {
  it("is true when only the weights differ", () => {
    expect(
      sameMints(
        alloc([[MSFT, 3400], [GOOGL, 3300], [AMZN, 3300]]),
        alloc([[AMZN, 2000], [MSFT, 4500], [GOOGL, 3500]]),
      ),
    ).toBe(true);
  });

  it("is false when a holding is swapped", () => {
    expect(
      sameMints(
        alloc([[MSFT, 3400], [GOOGL, 3300], [AMZN, 3300]]),
        alloc([[MSFT, 3400], [GOOGL, 3300], [NVDA, 3300]]),
      ),
    ).toBe(false);
  });
});

describe("classifyAllocation", () => {
  const holdings = (rows: [string, number][]) => rows.map(([mint, weightBps]) => ({ mint, weightBps }));

  const spendingATrillion = {
    basketId: "b1",
    basketVersionId: "v1",
    slug: "depreciation-absorbers",
    name: "Depreciation Absorbers",
    holdings: holdings([[MSFT, 3400], [GOOGL, 3300], [AMZN, 3300]]),
  };

  it("associates the exact duplicate this catalogue actually shipped", () => {
    // This was `assertBasketIsDistinct` refusing ai-liability outright. The diagnosis was right
    // and the remedy was wrong: one allocation, two arguments, one basket.
    const clash = holdings([[MSFT, 3400], [GOOGL, 3300], [AMZN, 3300]]);
    const result = classifyAllocation(clash, [spendingATrillion]);
    expect(result).toMatchObject({ kind: "attach", mine: false });
    expect(result.kind === "attach" && result.basket.slug).toBe("depreciation-absorbers");
  });

  it("allows the same companies at weights that say something different", () => {
    const leaning = holdings([[MSFT, 5000], [GOOGL, 2500], [AMZN, 2500]]);
    expect(classifyAllocation(leaning, [spendingATrillion])).toEqual({ kind: "create" });
  });

  it("allows a different holding at the same weights", () => {
    const swapped = holdings([[MSFT, 3400], [NVDA, 3300], [AMZN, 3300]]);
    expect(classifyAllocation(swapped, [spendingATrillion])).toEqual({ kind: "create" });
  });

  it("refuses a one-percent edit of an allocation that already exists", () => {
    // The anti-evasion rule. Without it, the fix for "this is a duplicate" is a meaningless
    // nudge, and the catalogue fills with allocations that differ only enough to pass.
    const nudged = holdings([[MSFT, 3500], [GOOGL, 3200], [AMZN, 3300]]);
    const result = classifyAllocation(nudged, [spendingATrillion]);
    expect(result).toMatchObject({ kind: "too_similar", turnoverBps: 100 });
  });

  it("lets a basket's own author re-weight it without tripping the near-miss rule", () => {
    const nudged = holdings([[MSFT, 3500], [GOOGL, 3200], [AMZN, 3300]]);
    expect(classifyAllocation(nudged, [spendingATrillion], { ownBasketId: "b1" })).toEqual({ kind: "create" });
  });

  it("recognises a republished thesis as its own basket rather than a stranger's", () => {
    const same = holdings([[MSFT, 3400], [GOOGL, 3300], [AMZN, 3300]]);
    expect(classifyAllocation(same, [spendingATrillion], { ownBasketId: "b1" })).toMatchObject({
      kind: "attach",
      mine: true,
    });
  });

  it("creates when nothing is published yet", () => {
    expect(classifyAllocation(holdings([[MSFT, 3400], [GOOGL, 3300], [AMZN, 3300]]), [])).toEqual({ kind: "create" });
  });
});
