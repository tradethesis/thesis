import { describe, expect, it } from "vitest";

import { attentionFrom } from "./attention";

const flat = (n: number) => Array(7).fill(n);

describe("pack attention", () => {
  it("sums every holding and compares this week with the week before", () => {
    const a = attentionFrom([[...flat(100), ...flat(120)], [...flat(50), ...flat(60)]], "2026-09-23");
    expect(a?.weekViews).toBe(7 * 180);
    expect(a?.changePct).toBeCloseTo(20);
  });

  it("is null with no usable series rather than a made-up zero", () => {
    expect(attentionFrom([], "2026-09-23")).toBeNull();
    expect(attentionFrom([[...flat(0), ...flat(10)]], "2026-09-23")).toBeNull();
  });
});
