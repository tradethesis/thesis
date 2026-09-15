import { describe, expect, it } from "vitest";
import { buyInputSchema, parseWeightQuery } from "./buy-input";

describe("allocation link handoff", () => {
  const symbols = ["COINx", "CRCLx", "HOODx"];
  it("preserves a valid custom allocation", () => expect(parseWeightQuery("60,20,20", symbols)).toEqual([60, 20, 20]));
  it.each(["90,5,5", "30,30,30", "40,30", "40,30,30,0", "NaN,30,30", "40.1,29.9,30", "1e1,20,70"])("rejects malformed or invalid weights %s", value => expect(parseWeightQuery(value, symbols)).toBeNull());
  it("refuses non-finite amounts before BigInt conversion", () => {
    const input = { slug: "example", idempotencyKey: "e9b035e1-954f-47c4-a889-540bc9b13ec2" };
    for (const budgetUsdc of [Infinity, NaN, -1, 1e20]) expect(buyInputSchema.safeParse({ ...input, budgetUsdc }).success).toBe(false);
  });
});
