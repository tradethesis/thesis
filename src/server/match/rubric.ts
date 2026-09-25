/**
 * Turning three model numbers into a word a reader can act on.
 *
 * ## What these labels mean, and what they do not
 *
 * A label here answers one question: **does this basket's investment case express the idea in the
 * input, including its direction and intended exposure?** It says nothing about probability of
 * profit, expected return, safety, or how much anybody should put in. A Strong match on a bad idea
 * is a strong match on a bad idea.
 *
 * ## Why topic overlap is not enough
 *
 * Measured against the live API on 22 September 2026, with the idea "AI datacenter spending is
 * going to collapse, the capex is unsustainable" and the basket "AI Spending Chain — the chip, the
 * cloud and the deployment layer that each get paid once per unit of AI spending":
 *
 *     expresses 0.21   ·   topic 0.89   ·   direction "opposite" (confidence 0.99)
 *
 * A ranker built on subject matter would put that pair at the top. It is the single worst answer
 * this product can give — a bearish post sold as a reason to buy the bullish basket — so direction
 * is read separately and can only ever lower a label, never raise one.
 *
 * ## The thresholds
 *
 * They are judgement, not calibration, and they are written here rather than scattered through the
 * matcher so that changing one is a visible act. `expresses` is a model's relevance estimate on
 * 0..1; it has not been validated against any outcome and is never shown as a percentage next to a
 * basket. Independent per candidate: two baskets can both be Strong, and the numbers are never
 * normalised to sum to anything.
 *
 *   Strong   expresses >= 0.70 and direction is `same`
 *            (or direction `unclear` with expresses >= 0.85 — the case is explicit enough that a
 *            reader's unstated direction is not in doubt)
 *   Partial  expresses >= 0.40
 *   Weak     anything lower that still clears the relevance floor
 *
 *   Contradiction  direction `opposite` with confidence >= 0.60 caps the label at Weak whatever
 *                  `expresses` says, and is stated in words rather than implied by a short bar.
 *
 *   Relevance floor  expresses >= 0.25, or topic >= 0.60 whatever `expresses` says. Below that a
 *                    basket is not shown at all: an unrelated basket with a short bar still reads
 *                    as a suggestion.
 *
 *                    Same-subject baskets are shown even when they express nothing, because that
 *                    is the case worth seeing. The bearish AI-capex idea above scored `expresses`
 *                    0.08-0.11 against five bullish AI baskets whose `topic` ran 0.76-0.89, every
 *                    one of them `opposite`. An earlier version of this floor hid all five and left
 *                    a bare "no match", throwing away the useful answer: the catalogue does cover
 *                    this subject, and every basket in it points the other way.
 *
 *   No match  nothing reaches Partial. The highest-scoring candidate can still be unsuitable, and
 *             saying so is a supported answer, not a failure.
 */

export type Direction = "same" | "opposite" | "unclear";

/** Raw judgement for one basket, straight from the provider. Independent of every other basket. */
export type Judgement = {
  /** P(the basket's case expresses this idea, direction included). */
  expresses: number;
  /** P(same subject matter, direction ignored). Used only to explain a near miss. */
  topic: number;
  direction: Direction;
  /** The provider's confidence in `direction`, 0..1. */
  directionConfidence: number;
  /** The full distribution the provider returned. Displayed by the page; no rule reads it. */
  directionProbabilities: { same: number; opposite: number; unclear: number };
};

export type Strength = "strong" | "partial" | "weak";

export type Rated = {
  strength: Strength;
  /** True when the idea points the other way. Always said out loud. */
  contradicts: boolean;
  /** True when the subjects line up but the case does not. Explains a Partial. */
  topicOnly: boolean;
  /** 0..1, for the bar's length only. Never rendered as a percentage beside a basket. */
  bar: number;
};

export const THRESHOLDS = {
  strong: 0.7,
  strongWhenUnclear: 0.85,
  partial: 0.4,
  floor: 0.25,
  topicFloor: 0.6,
  contradiction: 0.6,
} as const;

/** Whether a candidate is worth putting on screen at all. */
export function isRelevant(j: Judgement): boolean {
  if (j.expresses >= THRESHOLDS.floor) return true;
  // Same subject, whatever it expresses: this is how a contradiction gets said out loud instead of
  // disappearing into a bare "no match".
  return j.topic >= THRESHOLDS.topicFloor;
}

export function rate(j: Judgement): Rated {
  const contradicts = j.direction === "opposite" && j.directionConfidence >= THRESHOLDS.contradiction;

  let strength: Strength = "weak";
  if (!contradicts) {
    const strongEnough =
      j.direction === "same"
        ? j.expresses >= THRESHOLDS.strong
        : j.direction === "unclear" && j.expresses >= THRESHOLDS.strongWhenUnclear;
    if (strongEnough) strength = "strong";
    else if (j.expresses >= THRESHOLDS.partial) strength = "partial";
  }

  return {
    strength,
    contradicts,
    // A near miss worth explaining: the subjects agree, the investment case does not.
    topicOnly: !contradicts && strength !== "strong" && j.topic >= THRESHOLDS.topicFloor,
    bar: clamp(j.expresses),
  };
}

/** True when nothing on offer is worth calling a match. */
export function isNoMatch(rated: Rated[]): boolean {
  return !rated.some((r) => r.strength === "strong" || r.strength === "partial");
}

export const LABEL: Record<Strength, string> = {
  strong: "Strong",
  partial: "Partial",
  weak: "Weak",
};

function clamp(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}
