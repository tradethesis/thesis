import { describe, expect, it } from "vitest";

import { assertBasketIsDistinct, basketIdentity } from "./publish";
import type { ThesisSeed } from "./theses";

function seed(slug: string, holdings: [string, number][]): ThesisSeed {
  return {
    slug,
    title: slug,
    claim: slug,
    category: "Technology",
    summary: "s",
    rationale: "r",
    counterargument: "c",
    changeMyMind: "m",
    horizonLabel: "Review in 12 months",
    reviewDate: "2027-01-01",
    weightRationale: null,
    constituents: holdings.map(([symbol, weightBps], position) => ({
      symbol,
      position,
      weightBps,
      role: "role",
      why: "why",
      limitation: "limitation",
      weightRationale: null,
    })),
  } as ThesisSeed;
}

const asPublished = (s: ThesisSeed) => ({ slug: s.slug, constituents: s.constituents });

describe("basketIdentity", () => {
  it("ignores the order the holdings are listed in", () => {
    expect(basketIdentity(seed("a", [["MSFTx", 3400], ["AMZNx", 3300]]).constituents)).toBe(
      basketIdentity(seed("b", [["AMZNx", 3300], ["MSFTx", 3400]]).constituents),
    );
  });

  it("treats a different weight as a different basket", () => {
    expect(basketIdentity(seed("a", [["MSFTx", 3400], ["AMZNx", 3300]]).constituents)).not.toBe(
      basketIdentity(seed("b", [["MSFTx", 4000], ["AMZNx", 3300]]).constituents),
    );
  });
});

describe("assertBasketIsDistinct", () => {
  // Symbol-space, because this runs before the seed's symbols are resolved against the asset
  // table. The mint-space association that decides what actually gets bought is tested in
  // src/lib/basket.test.ts.
  const existing = seed("spending-a-trillion", [["MSFTx", 3400], ["GOOGLx", 3300], ["AMZNx", 3300]]);

  it("associates the exact duplicate this catalogue actually shipped", () => {
    // This used to throw. The incident is real — ai-liability and spending-a-trillion shipped
    // the identical MSFTx/GOOGLx/AMZNx — and the rule that caught it was right that a reader
    // cannot choose between two entries that buy the same thing. It was wrong that the remedy
    // is deleting one. They are now one basket with two arguments, so an exact match passes
    // here and is attached in publishSeed. See classifyAllocation in src/lib/basket.ts.
    const clash = seed("ai-liability", [["MSFTx", 3400], ["GOOGLx", 3300], ["AMZNx", 3300]]);
    expect(() => assertBasketIsDistinct(clash, [asPublished(existing)])).not.toThrow();
  });

  it("still refuses a one-percent edit made to dodge that association", () => {
    // The part of the old rule that has to survive. Without it, the fix for "this is the same
    // basket" is a meaningless nudge, and the catalogue fills with allocations that differ just
    // enough to pass and not enough to mean anything.
    const nudged = seed("ai-liability", [["MSFTx", 3500], ["GOOGLx", 3200], ["AMZNx", 3300]]);
    expect(() => assertBasketIsDistinct(nudged, [asPublished(existing)])).toThrow(/1 percentage points away/);
  });

  it("allows the same companies at weights that say something different", () => {
    const leaning = seed("ai-liability", [["MSFTx", 5000], ["GOOGLx", 2500], ["AMZNx", 2500]]);
    expect(() => assertBasketIsDistinct(leaning, [asPublished(existing)])).not.toThrow();
  });

  it("allows a different holding at the same weights", () => {
    const swapped = seed("ai-liability", [["MSFTx", 3400], ["NVDAx", 3300], ["AMZNx", 3300]]);
    expect(() => assertBasketIsDistinct(swapped, [asPublished(existing)])).not.toThrow();
  });

  it("does not treat a thesis as a duplicate of itself when it is republished", () => {
    expect(() => assertBasketIsDistinct(existing, [asPublished(existing)])).not.toThrow();
  });

  it("passes when nothing is published yet", () => {
    expect(() => assertBasketIsDistinct(existing, [])).not.toThrow();
  });
});
