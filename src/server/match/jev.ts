/**
 * The relevance provider: TypeSafe Jev (System One).
 *
 * Jev answers narrow typed questions about text and returns numbers — `noul` for a probability,
 * `choice` for one option out of a set with its own probabilities. It does not write prose, and
 * this module never asks it to: every sentence a reader sees is assembled in explain.ts from the
 * basket's own reviewed words. That split is deliberate. A model that scores is auditable against
 * a rubric; a model that narrates is not.
 *
 * All questions in one request run in parallel over the same state, so a candidate costs one
 * round trip whatever it asks. Candidates are batched with prefixed keys for the same reason.
 *
 * ## Configuration
 *
 * `TYPESAFE_API_KEY`, server-side only. When it is absent this module throws `ProviderUnavailable`
 * and the caller shows an honest unavailable state — it never falls back to a plausible-looking
 * guess. A matcher that quietly invents matches when its provider is down is worse than one that
 * says it is down.
 */

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const MODEL = process.env.TYPESAFE_MODEL ?? "jev-latest";

/** One candidate, reduced to the words Jev is allowed to see. */
export type Candidate = { key: string; name: string; investmentCase: string };

export type RawJudgement = {
  expresses: number;
  topic: number;
  direction: "same" | "opposite" | "unclear";
  directionConfidence: number;
  /** The full distribution Jev returned for `direction`. Shown as-is; nothing is derived from it. */
  directionProbabilities: { same: number; opposite: number; unclear: number };
};

/** What one batch actually cost, straight from the response. Never estimated. */
export type Usage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  questions: number;
  candidates: number;
  /** Measured round trip in milliseconds, wall clock on the server. */
  ms: number;
};

export class ProviderUnavailable extends Error {
  constructor(
    readonly reason: "unconfigured" | "unreachable" | "refused",
    message: string,
  ) {
    super(message);
    this.name = "ProviderUnavailable";
  }
}

export function isConfigured(): boolean {
  return Boolean(process.env.TYPESAFE_API_KEY);
}

/*
 * The three questions.
 *
 * `expresses` is the whole product question and the only one that sets a label. `topic` exists to
 * tell a near miss from an unrelated basket, so a Partial can be explained rather than asserted.
 * `direction` is asked separately because a bearish idea against a bullish basket scores high on
 * subject matter — measured at topic 0.89 while expresses was 0.21 — and nothing but an explicit
 * directional question separates those two facts reliably.
 */
const QUESTIONS = (key: string) => ({
  [`${key}__expresses`]: {
    type: "noul",
    instructions:
      `Does \`baskets.${key}.case\` express the investment idea in \`idea\`, including its direction and intended exposure?`,
    criteria: {
      true: "Buying this basket is a way of acting on the idea as the writer states it",
      false: "It is not a way of acting on that idea, or it would act in the opposite direction",
    },
  },
  [`${key}__topic`]: {
    type: "noul",
    instructions: `Are \`idea\` and \`baskets.${key}.case\` about the same subject matter, ignoring direction?`,
    criteria: { true: "The same industry, asset or theme", false: "Different subjects" },
  },
  [`${key}__direction`]: {
    type: "choice",
    instructions: `Compared with \`baskets.${key}.case\`, which way does \`idea\` point?`,
    criteria: {
      same: "Both expect the same thing to do well",
      opposite: "The idea expects decline where the basket expects gain, or the reverse",
      unclear: "The idea states no direction",
    },
  },
});

type Answers = Record<
  string,
  { noul?: number; choice?: string; confidence?: number; probabilities?: Record<string, number> }
>;

/**
 * Judge every candidate against one idea.
 *
 * Returns a map keyed by candidate key. A candidate whose answers came back unusable is omitted
 * rather than defaulted: a missing judgement is not a judgement of zero.
 */
export async function judge(
  idea: string,
  candidates: Candidate[],
  signal?: AbortSignal,
): Promise<{ judgements: Map<string, RawJudgement>; usage: Usage }> {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) throw new ProviderUnavailable("unconfigured", "TYPESAFE_API_KEY is not set.");
  if (!candidates.length) {
    return {
      judgements: new Map(),
      usage: { model: MODEL, inputTokens: 0, outputTokens: 0, questions: 0, candidates: 0, ms: 0 },
    };
  }
  const startedAt = Date.now();

  const state = {
    idea,
    baskets: Object.fromEntries(candidates.map((c) => [c.key, { name: c.name, case: c.investmentCase }])),
  };
  const questions = Object.assign({}, ...candidates.map((c) => QUESTIONS(c.key)));

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ state, model: MODEL, questions }),
      signal: signal ?? AbortSignal.timeout(30_000),
    });
  } catch {
    throw new ProviderUnavailable("unreachable", "The relevance service did not answer.");
  }

  if (!res.ok) {
    // Said in words a visitor can act on. The status code is for the log, not the page: a 402 means
    // the provider account needs topping up, which nobody reading /discover can do anything about.
    const busy = res.status === 429 || res.status >= 500;
    console.error(`relevance provider answered ${res.status}`);
    throw new ProviderUnavailable(
      busy ? "unreachable" : "refused",
      busy ? "Matching is busy right now." : "Matching is paused right now.",
    );
  }

  const body = (await res.json()) as {
    answers?: Answers;
    model?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const answers = body.answers ?? {};
  const out = new Map<string, RawJudgement>();

  for (const c of candidates) {
    const expresses = answers[`${c.key}__expresses`]?.noul;
    const topic = answers[`${c.key}__topic`]?.noul;
    const dir = answers[`${c.key}__direction`];
    if (typeof expresses !== "number" || typeof topic !== "number" || !dir?.choice) continue;

    const direction = dir.choice === "same" || dir.choice === "opposite" ? dir.choice : "unclear";
    const probs = dir.probabilities ?? {};
    out.set(c.key, {
      expresses,
      topic,
      direction,
      directionConfidence: typeof dir.confidence === "number" ? dir.confidence : 0,
      directionProbabilities: {
        same: num(probs.same),
        opposite: num(probs.opposite),
        unclear: num(probs.unclear),
      },
    });
  }

  return {
    judgements: out,
    usage: {
      model: body.model ?? MODEL,
      inputTokens: body.usage?.input_tokens ?? 0,
      outputTokens: body.usage?.output_tokens ?? 0,
      questions: Object.keys(questions).length,
      candidates: candidates.length,
      ms: Date.now() - startedAt,
    },
  };
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
