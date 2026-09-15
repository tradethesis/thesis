import { describe, expect, it } from "vitest";
import { GATED_PREFIXES, isGatedPath, siteMode } from "./site-mode";

describe("siteMode", () => {
  it("only the exact value closes the site", () => {
    expect(siteMode("waitlist")).toBe("waitlist");
    for (const v of ["full", "", undefined, "Waitlist", "waitlist ", "true", "1"]) {
      expect(siteMode(v), JSON.stringify(v)).toBe("full");
    }
  });
});

describe("isGatedPath", () => {
  it("closes the product routes", () => {
    for (const p of ["/explore", "/t/ai-liability-favors-big-cloud", "/buy/x", "/signing-check"]) {
      expect(isGatedPath(p), p).toBe(true);
    }
  });

  it("leaves the front door and the API open", () => {
    for (const p of ["/", "/join", "/api/waitlist", "/brand/conviction-workshop.webp", "/favicon.ico"]) {
      expect(isGatedPath(p), p).toBe(false);
    }
  });

  it("the trailing slash on /t/ is what keeps other t-routes open", () => {
    // Without it, /terms and /team would both be gated.
    expect(isGatedPath("/terms")).toBe(false);
    expect(isGatedPath("/team")).toBe(false);
    expect(isGatedPath("/t/anything")).toBe(true);
  });

  it("gates anything under a gated prefix, which is the intent", () => {
    // A future /explore-archive would be closed too. That is wanted: a new product
    // surface should be shut by default rather than open by accident.
    expect(isGatedPath("/explore-archive")).toBe(true);
    expect(isGatedPath("/explore/page/2")).toBe(true);
  });

  it("every prefix it advertises is actually gated", () => {
    for (const prefix of GATED_PREFIXES) expect(isGatedPath(`${prefix}anything`)).toBe(true);
  });
});
