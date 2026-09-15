import { describe, expect, it } from "vitest";
import { MAX_NOTE, parseWaitlist } from "./waitlist";

describe("parseWaitlist", () => {
  it("normalises an address so one person cannot take two places", () => {
    const a = parseWaitlist({ email: "  Kayle@Example.COM " });
    const b = parseWaitlist({ email: "kayle@example.com" });
    expect(a.ok && b.ok && a.value.email === b.value.email).toBe(true);
  });

  it("accepts the addresses people actually have", () => {
    for (const email of [
      "a@b.co",
      "kayle+thesis@example.com",
      "first.last@sub.domain.example",
      "x_y-z@example.technology",
    ]) {
      expect(parseWaitlist({ email }).ok, email).toBe(true);
    }
  });

  it("rejects what is not an address", () => {
    for (const email of ["", "   ", "kayle", "kayle@", "@example.com", "kayle@example", "two @spaces.com"]) {
      expect(parseWaitlist({ email }).ok, JSON.stringify(email)).toBe(false);
    }
  });

  it("bounds the email length", () => {
    const long = `${"a".repeat(250)}@example.com`;
    expect(parseWaitlist({ email: long }).ok).toBe(false);
  });

  it("treats the wallet as optional but checks it when given", () => {
    expect(parseWaitlist({ email: "a@b.co" }).ok).toBe(true);
    expect(parseWaitlist({ email: "a@b.co", wallet: "   " }).ok).toBe(true);

    const good = parseWaitlist({ email: "a@b.co", wallet: "38y5uxVPTmeGa4YdcnhwfGeMccQcjetbYE45D9q5PR1L" });
    expect(good.ok && good.value.wallet).toBe("38y5uxVPTmeGa4YdcnhwfGeMccQcjetbYE45D9q5PR1L");

    // 0 and O and I and l are not in the base58 alphabet.
    const bad = parseWaitlist({ email: "a@b.co", wallet: "0OIl38y5uxVPTmeGa4YdcnhwfGeMccQcjetbYE45D9q5" });
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.field).toBe("wallet");
  });

  it("bounds the note", () => {
    expect(parseWaitlist({ email: "a@b.co", note: "x".repeat(MAX_NOTE) }).ok).toBe(true);
    expect(parseWaitlist({ email: "a@b.co", note: "x".repeat(MAX_NOTE + 1) }).ok).toBe(false);
  });

  it("only accepts a source that looks like a page name", () => {
    const tracked = parseWaitlist({ email: "a@b.co", source: "utm_campaign=spring&id=9912" });
    expect(tracked.ok && tracked.value.source).toBe("join");

    const page = parseWaitlist({ email: "a@b.co", source: "explore" });
    expect(page.ok && page.value.source).toBe("explore");
  });
});
