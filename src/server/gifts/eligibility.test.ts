import { describe, expect, it } from "vitest";

import { judgeEligibility, NOT_SERVICED, PROHIBITED } from "./eligibility";

describe("eligibility", () => {
  it("needs a country and the declaration", () => {
    expect(judgeEligibility(null, "DE").status).toBe("incomplete");
    expect(judgeEligibility({ country: "DE", attested: false }, "DE").status).toBe("incomplete");
    expect(judgeEligibility({ country: "", attested: true }, "DE").status).toBe("incomplete");
  });
  it("refuses every prohibited and non-serviced country, declared or located", () => {
    for (const c of [...PROHIBITED, ...NOT_SERVICED]) {
      expect(judgeEligibility({ country: c, attested: true }, "DE")).toEqual({ status: "ineligible", reason: "declared" });
      expect(judgeEligibility({ country: "DE", attested: true }, c)).toEqual({ status: "ineligible", reason: "located" });
    }
  });
  it("refuses when the two disagree and either is restricted", () => {
    expect(judgeEligibility({ country: "GB", attested: true }, "us")).toEqual({ status: "ineligible", reason: "located" });
  });
  it("lets an eligible country through, including when the location is unknown", () => {
    expect(judgeEligibility({ country: "VN", attested: true }, "VN").status).toBe("eligible");
    expect(judgeEligibility({ country: "SG", attested: true }, null).status).toBe("eligible");
    expect(judgeEligibility({ country: "SG", attested: true }, "XX").status).toBe("eligible");
  });
});
