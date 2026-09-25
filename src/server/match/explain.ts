import type { Judgement, Rated } from "./rubric";

/**
 * The sentences under the bars.
 *
 * These are assembled from the basket's own reviewed words and the reader's own input. Nothing
 * here is written by a model, for two reasons: the scoring model returns numbers and does not
 * write prose, and a second model asked to justify a score will justify any score it is given.
 * A template that can only restate facts cannot invent a reason.
 *
 * Every branch is reachable from a real combination of judgement and rating, and each one names
 * the thing that actually decided the label — the direction, the subject, or the case itself.
 */

export type Explanation = {
  /** One or two sentences. Always present. */
  why: string;
  /** One concrete limitation, when the judgement supports naming one. */
  misses: string | null;
};

export function explain(args: {
  basketName: string;
  investmentCase: string;
  holdings: string[];
  judgement: Judgement;
  rated: Rated;
  /** Where the idea came from, for the first clause. */
  from: "post" | "text";
}): Explanation {
  const { basketName, holdings, judgement: j, rated: r } = args;
  const source = args.from === "post" ? "the post" : "your idea";
  const names = holdings.slice(0, 3).join(", ");

  if (r.contradicts) {
    return {
      why: `${basketName} is about the same subject as ${source}, but it is built to gain when that subject does well.`,
      misses: `${source[0].toUpperCase()}${source.slice(1)} points the other way, so buying this basket would be acting against it, not on it.`,
    };
  }

  if (r.strength === "strong") {
    return {
      why: `${basketName} holds ${names} for the reason ${source} gives. Its reviewed case is the same argument, pointed the same way.`,
      misses:
        j.topic < 0.9
          ? `It expresses the idea through ${holdings.length} named holdings, which is narrower than ${source} as written.`
          : null,
    };
  }

  if (r.strength === "partial") {
    return {
      why: r.topicOnly
        ? `${basketName} covers the same subject as ${source}, and part of its case overlaps — but it is not built around that argument.`
        : `Part of ${basketName}'s case matches ${source}, through ${names}.`,
      misses: `It was reviewed for a different argument, so ${names} may move for reasons ${source} never mentions.`,
    };
  }

  return {
    why: r.topicOnly
      ? `${basketName} touches the same subject as ${source} without expressing the argument in it.`
      : `${basketName} has little to do with ${source}.`,
    misses: `Nothing in its reviewed case acts on what ${source} actually claims.`,
  };
}

/**
 * What to say when nothing fits.
 *
 * The highest-scoring candidate is still the highest-scoring candidate, so it is named — a reader
 * who disagrees with the verdict can go and look. What is not done is promoting it to a match.
 */
export function noMatchNote(best: { name: string } | null): string {
  return best
    ? `No reviewed basket expresses this idea. The closest is ${best.name}, and it is not close enough to call a match.`
    : "No reviewed basket expresses this idea.";
}
