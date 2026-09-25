import { describe, expect, it } from "vitest";

import { isNoMatch, isRelevant, rate, THRESHOLDS, type Judgement } from "./rubric";

const j = (p: Partial<Judgement>): Judgement => ({
  expresses: 0.5,
  topic: 0.5,
  direction: "same",
  directionConfidence: 0.9,
  directionProbabilities: { same: 0.9, opposite: 0.05, unclear: 0.05 },
  ...p,
});

describe("match rubric", () => {
  it("calls a same-direction, well-expressed basket Strong", () => {
    expect(rate(j({ expresses: 0.82, topic: 0.9, direction: "same" })).strength).toBe("strong");
  });

  /*
   * The failure this product cannot ship. Measured against the live provider on 22 September 2026,
   * a bearish AI-capex idea against the bullish AI Spending Chain basket returned
   * expresses 0.21 / topic 0.89 / direction opposite 0.99. Anything ranking on subject matter puts
   * that pair first.
   */
  it("never calls a directional contradiction anything but Weak, however strong the topic", () => {
    const r = rate(j({ expresses: 0.95, topic: 0.95, direction: "opposite", directionConfidence: 0.99 }));
    expect(r.strength).toBe("weak");
    expect(r.contradicts).toBe(true);
  });

  it("does not treat a low-confidence opposite reading as a contradiction", () => {
    const r = rate(j({ expresses: 0.8, direction: "opposite", directionConfidence: 0.3 }));
    expect(r.contradicts).toBe(false);
  });

  it("topic overlap alone is not a Strong match", () => {
    const r = rate(j({ expresses: 0.45, topic: 0.95, direction: "same" }));
    expect(r.strength).toBe("partial");
    expect(r.topicOnly).toBe(true);
  });

  it("needs a higher bar to call an undirected idea Strong", () => {
    expect(rate(j({ expresses: 0.75, direction: "unclear" })).strength).toBe("partial");
    expect(rate(j({ expresses: 0.88, direction: "unclear" })).strength).toBe("strong");
  });

  it("hides baskets under the relevance floor rather than showing a short bar", () => {
    expect(isRelevant(j({ expresses: 0.1, topic: 0.2 }))).toBe(false);
    expect(isRelevant(j({ expresses: 0.3 }))).toBe(true);
  });

  /*
   * Measured, 22 September 2026: the bearish AI-capex idea scored expresses 0.08 against
   * AI Spending Chain while topic was 0.88 and direction opposite at 0.99. Hiding it leaves a bare
   * "no match" and throws away the answer worth having — the catalogue covers this subject and
   * every basket in it points the other way.
   */
  it("still shows a same-subject basket that expresses nothing, so the contradiction can be stated", () => {
    const contradiction = j({ expresses: 0.08, topic: 0.88, direction: "opposite", directionConfidence: 0.99 });
    expect(isRelevant(contradiction)).toBe(true);
    expect(rate(contradiction).contradicts).toBe(true);
    expect(rate(contradiction).strength).toBe("weak");
  });

  it("reports no match when nothing reaches Partial", () => {
    expect(isNoMatch([rate(j({ expresses: 0.3 })), rate(j({ expresses: 0.26 }))])).toBe(true);
    expect(isNoMatch([rate(j({ expresses: 0.55 }))])).toBe(false);
  });

  /* Independent judgements. Two baskets can both express one idea, and nothing here is a share. */
  it("does not normalise candidates against each other", () => {
    const a = rate(j({ expresses: 0.9, direction: "same" }));
    const b = rate(j({ expresses: 0.88, direction: "same" }));
    expect(a.strength).toBe("strong");
    expect(b.strength).toBe("strong");
    expect(a.bar + b.bar).toBeGreaterThan(1);
  });

  it("keeps the bar inside 0..1 whatever the provider returns", () => {
    expect(rate(j({ expresses: 4 })).bar).toBe(1);
    expect(rate(j({ expresses: Number.NaN })).bar).toBe(0);
  });

  it("states its thresholds rather than hiding them in branches", () => {
    expect(THRESHOLDS.strong).toBeGreaterThan(THRESHOLDS.partial);
    expect(THRESHOLDS.partial).toBeGreaterThan(THRESHOLDS.floor);
  });
});
