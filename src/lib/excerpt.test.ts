import { describe, expect, it } from "vitest";

import { excerptPost, firstSentence } from "./excerpt";

const NAVAL = "On the way to killing all of us, AI will likely kill some of us.\n\nIn that case, who’s liable?";

describe("excerptPost", () => {
  it("leaves the Naval post whole, question and all", () => {
    const { text, truncated } = excerptPost(NAVAL);
    expect(truncated).toBe(false);
    expect(text).toContain("who’s liable?");
    // Both sentences survive; only the blank line between them is collapsed.
    expect(text).toBe(NAVAL.trim().replace(/\n{2,}/g, "\n"));
    expect(text).toContain("On the way to killing all of us");
  });

  it("keeps the closing question when it has to cut a long post", () => {
    const long = `${"The setup runs on and on. ".repeat(20)}So who pays for it?`;
    const { text, truncated } = excerptPost(long);
    expect(truncated).toBe(true);
    expect(text.endsWith("So who pays for it?")).toBe(true);
    expect(text).toContain("…");
  });

  it("cuts at a sentence boundary rather than mid-word", () => {
    const long = `${"Alpha beta gamma delta epsilon zeta. ".repeat(12)}And then a statement.`;
    const { text } = excerptPost(long);
    expect(text.endsWith("…")).toBe(true);
    // Nothing chopped in half.
    expect(/\w…$/.test(text)).toBe(false);
  });

  it("falls back to a word boundary when one sentence exceeds the budget", () => {
    const { text, truncated } = excerptPost("x".repeat(50) + " " + "y".repeat(400));
    expect(truncated).toBe(true);
    expect(text.length).toBeLessThan(300);
  });
});

describe("firstSentence", () => {
  it("takes the opening sentence", () => {
    expect(firstSentence("The share can grow while these three lose it. Retail media is taking budget.")).toBe(
      "The share can grow while these three lose it.",
    );
  });

  it("returns a single-sentence passage whole", () => {
    expect(firstSentence("Fees on public networks fall over time.")).toBe("Fees on public networks fall over time.");
  });

  it("is not fooled by an abbreviation mid-sentence", () => {
    expect(firstSentence("Most revenue is booked in the U.S. today. The rest follows later.")).toBe(
      "Most revenue is booked in the U.S. today.",
    );
  });

  it("gives up rather than truncating a long sentence into a teaser", () => {
    expect(firstSentence("a".repeat(200) + ". Next.")).toBeNull();
  });

  it("returns null for an empty passage", () => {
    expect(firstSentence("   ")).toBeNull();
  });
});
