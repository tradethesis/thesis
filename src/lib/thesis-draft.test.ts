import { describe, expect, it } from "vitest";

import { draftSchema, slugify } from "./thesis-draft";

const draft = (over: Record<string, unknown> = {}) => ({
  claim: "The toll booths outlast the traffic",
  category: "Crypto" as const,
  why: "Every cycle rewards a different application, and every cycle routes through the same small set of places that charge for access. Owning the booth is a bet on the category rather than on this month's winner inside it.",
  against: "Booths get competed away. A fee that looks structural is often the current price of a service somebody else can offer more cheaply.",
  holdings: [
    { symbol: "SOL", weightPercent: 40 },
    { symbol: "JUP", weightPercent: 35 },
    { symbol: "RAY", weightPercent: 25 },
  ],
  ...over,
});

describe("draftSchema", () => {
  it("accepts the four things a person has to write", () => {
    expect(draftSchema.safeParse(draft()).success).toBe(true);
  });

  it("refuses weights that do not add up to 100", () => {
    const result = draftSchema.safeParse(
      draft({ holdings: [{ symbol: "SOL", weightPercent: 40 }, { symbol: "JUP", weightPercent: 35 }, { symbol: "RAY", weightPercent: 20 }] }),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.message.includes("95%"))).toBe(true);
  });

  it("refuses a holding outside the 10-70% bounds", () => {
    const result = draftSchema.safeParse(
      draft({ holdings: [{ symbol: "SOL", weightPercent: 80 }, { symbol: "JUP", weightPercent: 10 }, { symbol: "RAY", weightPercent: 10 }] }),
    );
    expect(result.success).toBe(false);
  });

  it("refuses the same holding twice", () => {
    const result = draftSchema.safeParse(
      draft({ holdings: [{ symbol: "SOL", weightPercent: 40 }, { symbol: "SOL", weightPercent: 35 }, { symbol: "RAY", weightPercent: 25 }] }),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.message.includes("twice"))).toBe(true);
  });

  it("refuses an unpicked holding", () => {
    const result = draftSchema.safeParse(
      draft({ holdings: [{ symbol: "", weightPercent: 40 }, { symbol: "JUP", weightPercent: 35 }, { symbol: "RAY", weightPercent: 25 }] }),
    );
    expect(result.success).toBe(false);
  });

  it("insists on a case against, not just a case for", () => {
    expect(draftSchema.safeParse(draft({ against: "risky" })).success).toBe(false);
  });

  it("insists the case for is an argument rather than a sentence", () => {
    expect(draftSchema.safeParse(draft({ why: "Tolls are good." })).success).toBe(false);
  });

  it("takes one to three holdings, each within the bounds for that count", () => {
    const ok = (holdings: { symbol: string; weightPercent: number }[]) => draftSchema.safeParse(draft({ holdings })).success;
    expect(ok([{ symbol: "SOL", weightPercent: 100 }])).toBe(true);
    expect(ok([{ symbol: "SOL", weightPercent: 80 }, { symbol: "JUP", weightPercent: 20 }])).toBe(true);
    expect(ok([{ symbol: "SOL", weightPercent: 95 }, { symbol: "JUP", weightPercent: 5 }])).toBe(false);
    expect(ok([{ symbol: "SOL", weightPercent: 80 }, { symbol: "JUP", weightPercent: 10 }, { symbol: "RAY", weightPercent: 10 }])).toBe(false);
    expect(ok([])).toBe(false);
    expect(ok([{ symbol: "A", weightPercent: 25 }, { symbol: "B", weightPercent: 25 }, { symbol: "C", weightPercent: 25 }, { symbol: "D", weightPercent: 25 }])).toBe(false);
  });
});

describe("slugify", () => {
  it("makes a claim into a url", () => {
    expect(slugify("The toll booths outlast the traffic")).toBe("the-toll-booths-outlast-the-traffic");
  });

  it("drops apostrophes rather than turning them into gaps", () => {
    expect(slugify("Nvidia's lead is contracted, not chosen")).toBe("nvidias-lead-is-contracted-not-chosen");
  });

  it("never returns an empty slug", () => {
    expect(slugify("——")).toBe("thesis");
  });

  it("never ends on a dash after truncation", () => {
    expect(slugify("a ".repeat(60)).endsWith("-")).toBe(false);
  });
});
