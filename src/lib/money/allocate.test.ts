import { describe, expect, it } from "vitest";
import { AllocationError, allocate, validateAllocation, type WeightedLeg } from "./allocate";

const legs = (a: number, b: number, c: number): WeightedLeg[] => [
  { assetId: "A", positionIndex: 0, bps: a },
  { assetId: "B", positionIndex: 1, bps: b },
  { assetId: "C", positionIndex: 2, bps: c },
];

const sum = (xs: { amountRaw: bigint }[]) => xs.reduce((acc, x) => acc + x.amountRaw, 0n);

describe("allocate", () => {
  it("splits an even budget exactly", () => {
    const out = allocate(50_000_000n, legs(3400, 3300, 3300));
    expect(out.map((o) => o.amountRaw)).toEqual([17_000_000n, 16_500_000n, 16_500_000n]);
    expect(sum(out)).toBe(50_000_000n);
  });

  it("preserves the budget when the split does not divide evenly", () => {
    // 7 base units across 34/33/33 -> 2.38 / 2.31 / 2.31
    const out = allocate(7n, legs(3400, 3300, 3300));
    expect(sum(out)).toBe(7n);
    expect(out.map((o) => o.amountRaw)).toEqual([3n, 2n, 2n]);
  });

  it("gives the leftover to the largest remainders, ties by position order", () => {
    // 1 base unit, three equal-ish weights: remainders 3400/3300/3300.
    const out = allocate(1n, legs(3400, 3300, 3300));
    expect(out[0].amountRaw).toBe(1n);
    expect(out[1].amountRaw).toBe(0n);
    expect(out[2].amountRaw).toBe(0n);

    // Perfectly tied remainders must go to the lower positionIndex first.
    const tied = allocate(1n, [
      { assetId: "A", positionIndex: 2, bps: 3400 },
      { assetId: "B", positionIndex: 0, bps: 3300 },
      { assetId: "C", positionIndex: 1, bps: 3300 },
    ]);
    expect(tied.find((t) => t.assetId === "A")!.amountRaw).toBe(1n);
  });

  it("never loses or invents a base unit across 10k random splits", () => {
    let rng = 123456789;
    const next = (n: number) => {
      rng = (rng * 1103515245 + 12345) & 0x7fffffff;
      return rng % n;
    };

    for (let i = 0; i < 10_000; i += 1) {
      // whole percents, each 10..70, summing to 100
      const a = 10 + next(61);
      const maxB = Math.min(70, 100 - a - 10);
      const minB = Math.max(10, 100 - a - 70);
      if (maxB < minB) continue;
      const b = minB + next(maxB - minB + 1);
      const c = 100 - a - b;
      if (c < 10 || c > 70) continue;

      const budget = BigInt(1 + next(500_000_000));
      const out = allocate(budget, legs(a * 100, b * 100, c * 100));
      expect(sum(out)).toBe(budget);
      for (const leg of out) expect(leg.amountRaw >= 0n).toBe(true);
    }
  });

  it("rejects a budget of zero or less", () => {
    expect(() => allocate(0n, legs(3400, 3300, 3300))).toThrow(AllocationError);
    expect(() => allocate(-1n, legs(3400, 3300, 3300))).toThrow(/positive/);
  });
});

describe("validateAllocation", () => {
  it("rejects weights that do not sum to 10000 bps", () => {
    expect(() => validateAllocation(legs(3300, 3300, 3300))).toThrow(/sum to 9900/);
  });

  it("rejects a weight below 10% or above 70%", () => {
    expect(() => validateAllocation(legs(900, 4100, 5000))).toThrow(/outside 1000-7000/);
    expect(() => validateAllocation(legs(7100, 1400, 1500))).toThrow(/outside 1000-7000/);
  });

  it("rejects fractional percentages", () => {
    expect(() => validateAllocation(legs(3350, 3350, 3300))).toThrow(/whole percent/);
  });

  it("rejects the wrong number of constituents", () => {
    expect(() => validateAllocation(legs(3400, 3300, 3300).slice(0, 2))).toThrow(/expected 3/);
  });

  it("rejects duplicate constituent positions", () => {
    expect(() =>
      validateAllocation([
        { assetId: "A", positionIndex: 0, bps: 3400 },
        { assetId: "B", positionIndex: 0, bps: 3300 },
        { assetId: "C", positionIndex: 2, bps: 3300 },
      ]),
    ).toThrow(/duplicate positionIndex/);
  });
});
