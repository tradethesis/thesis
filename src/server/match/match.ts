import { listBaskets, type BasketView } from "../baskets/queries";

import { explain, noMatchNote, type Explanation } from "./explain";
import { isConfigured, judge, ProviderUnavailable, type Candidate, type Usage } from "./jev";
import { retrievePost, looksLikeUrl, parseStatusUrl, RetrievalFailed, type RetrievedPost } from "./retrieve";
import { record } from "./record";
import { isNoMatch, isRelevant, rate, type Rated, type Judgement } from "./rubric";

/**
 * Idea in, baskets out.
 *
 * The workflow is owned here and the model only answers questions inside it. Nothing in this file
 * can create a basket, a holding, a ticker or a weight: candidates come from `listBaskets()`, which
 * reads the reviewed catalogue, and every field that reaches the reader is copied from a row.
 *
 * Order of business:
 *   1. If the input is a URL, fetch the post. Never infer its content from the link.
 *   2. Take the live catalogue as candidates.
 *   3. Score each candidate independently. No normalising: two baskets can both be Strong.
 *   4. Drop anything under the relevance floor, rank, keep three.
 *   5. Explain from the basket's own words.
 */

export const MAX_INPUT = 4_000;

export type MatchCandidate = {
  slug: string;
  name: string;
  description: string;
  category: string;
  strength: "strong" | "partial" | "weak";
  label: string;
  /** Bar length only, 0..1. An unvalidated relevance estimate, never shown as a percentage. */
  bar: number;
  contradicts: boolean;
  /** Jev's own distribution for this basket. Displayed as returned. */
  direction: { choice: string; same: number; opposite: number; unclear: number };
  explanation: Explanation;
  /** The full basket, so the left pane needs no second round trip. */
  basket: BasketView;
};

/** Everything the reader is shown about the run itself. Measured, never estimated. */
export type Telemetry = {
  model: string;
  batches: number;
  candidates: number;
  questions: number;
  inputTokens: number;
  outputTokens: number;
  /** Sum of measured provider round trips, milliseconds. */
  providerMs: number;
};

/**
 * One judged basket, as it lands.
 *
 * Emitted per batch rather than at the end, so the page fills as real answers arrive. The order is
 * the catalogue's, not a ranking — ranking happens once everything is in.
 */
export type MatchEvent =
  | { type: "started"; query: string; source: SourceRef; candidates: { slug: string; name: string }[] }
  | { type: "scored"; slug: string; judged: JudgedBasket; usage: Usage }
  | { type: "done"; result: MatchResult }
  | { type: "failed"; result: MatchResult };

export type SourceRef =
  | { kind: "post"; handle: string; authorName: string | null; url: string; postedAt: string | null }
  | { kind: "text" };

export type JudgedBasket = {
  slug: string;
  strength: "strong" | "partial" | "weak";
  bar: number;
  contradicts: boolean;
  /** Jev's own distribution for this basket's direction. Displayed, never derived from. */
  direction: { choice: string; same: number; opposite: number; unclear: number };
};

export type MatchResult =
  | {
      status: "ok";
      /** Exactly the text that produced these results, so the page can say which input they are for. */
      query: string;
      source: { kind: "post"; handle: string; authorName: string | null; url: string; postedAt: string | null } | { kind: "text" };
      candidates: MatchCandidate[];
      noMatch: boolean;
      noMatchNote: string | null;
      /** True when the catalogue was scored by labelled fixtures rather than the provider. */
      fixture: boolean;
      telemetry: Telemetry | null;
    }
  | { status: "unretrievable"; query: string; message: string }
  | { status: "unavailable"; query: string; reason: "unconfigured" | "unreachable" | "refused"; message: string }
  | { status: "empty_catalogue"; query: string };

/** Jev references state by backticked path, so a key must be a plain identifier — slugs are not. */
const keyFor = (i: number) => `b${i}`;

/** Candidates per provider request. Small enough that the page fills visibly, large enough that
 *  ten baskets cost four round trips rather than ten. */
const BATCH = 3;

/**
 * Match, as a stream of events.
 *
 * Scoring happens in batches and each batch is emitted the moment it lands, so the reader watches
 * real judgements arrive instead of a spinner. That is the whole reason this is a generator: the
 * page's movement is the work happening, not an animation played over a finished result.
 *
 * It costs more wall clock than one large request — four round trips instead of one — and buys a
 * surface where every number on screen came back from the provider while you were looking at it.
 */
export async function* matchStream(rawInput: string): AsyncGenerator<MatchEvent> {
  const input = rawInput.trim().slice(0, MAX_INPUT);

  let idea = input;
  let source: SourceRef = { kind: "text" };
  let post: RetrievedPost | null = null;

  if (looksLikeUrl(input)) {
    if (!parseStatusUrl(input)) {
      const failed: MatchResult = { status: "unretrievable", query: input, message: "That link is not an X post. Paste its text to continue." };
      yield { type: "failed", result: failed };
      await record({ input, idea: input, source, result: failed });
      return;
    }
    try {
      post = await retrievePost(input);
      idea = post.text;
      source = { kind: "post", handle: post.handle, authorName: post.authorName, url: post.url, postedAt: post.postedAt };
    } catch (error) {
      const failed: MatchResult = {
        status: "unretrievable",
        query: input,
        message: error instanceof RetrievalFailed ? error.message : "Couldn’t read this post. Paste its text to continue.",
      };
      yield { type: "failed", result: failed };
      await record({ input, idea: input, source, result: failed });
      return;
    }
  }

  const baskets = await listBaskets();
  if (!baskets.length) {
    const failed: MatchResult = { status: "empty_catalogue", query: input };
    yield { type: "failed", result: failed };
    await record({ input, idea, source, result: failed });
    return;
  }

  const candidates: Candidate[] = baskets.map((b, i) => ({
    key: keyFor(i),
    name: b.name,
    investmentCase: investmentCase(b),
  }));

  yield { type: "started", query: input, source, candidates: baskets.map((b) => ({ slug: b.slug, name: b.name })) };

  const judgements = new Map<string, Judgement>();
  const raw = new Map<string, { same: number; opposite: number; unclear: number; choice: string }>();
  const tel: Telemetry = { model: "", batches: 0, candidates: 0, questions: 0, inputTokens: 0, outputTokens: 0, providerMs: 0 };
  let fixture = false;

  if (isConfigured()) {
    for (let i = 0; i < candidates.length; i += BATCH) {
      const slice = candidates.slice(i, i + BATCH);
      let batch;
      try {
        batch = await judge(idea, slice);
      } catch (error) {
        if (error instanceof ProviderUnavailable) {
          const failed: MatchResult = { status: "unavailable", query: input, reason: error.reason, message: error.message };
          yield { type: "failed", result: failed };
          await record({ input, idea, source, result: failed });
          return;
        }
        throw error;
      }

      tel.model = batch.usage.model;
      tel.batches += 1;
      tel.candidates += batch.usage.candidates;
      tel.questions += batch.usage.questions;
      tel.inputTokens += batch.usage.inputTokens;
      tel.outputTokens += batch.usage.outputTokens;
      tel.providerMs += batch.usage.ms;

      for (const c of slice) {
        const j = batch.judgements.get(c.key);
        if (!j) continue;
        judgements.set(c.key, j);
        raw.set(c.key, { ...j.directionProbabilities, choice: j.direction });
        const basket = baskets[Number(c.key.slice(1))];
        const r = rate(j);
        yield {
          type: "scored",
          slug: basket.slug,
          usage: batch.usage,
          judged: {
            slug: basket.slug,
            strength: r.strength,
            bar: r.bar,
            contradicts: r.contradicts,
            direction: { choice: j.direction, ...j.directionProbabilities },
          },
        };
      }
    }
  } else if (process.env.MATCH_FIXTURES === "1") {
    fixture = true;
    for (const [k, j] of fixtureJudgements(idea, baskets)) judgements.set(k, j);
  } else {
    const failed: MatchResult = { status: "unavailable", query: input, reason: "unconfigured", message: "Matching is not configured on this deployment." };
    yield { type: "failed", result: failed };
    await record({ input, idea, source, result: failed });
    return;
  }

  const scored = baskets
    .map((b, i) => ({ basket: b, judgement: judgements.get(keyFor(i)) }))
    .filter((x): x is { basket: BasketView; judgement: Judgement } => Boolean(x.judgement))
    .map((x) => ({ ...x, rated: rate(x.judgement) }))
    .sort((a, b) => b.judgement.expresses - a.judgement.expresses);

  const shown = scored.filter((x) => isRelevant(x.judgement)).slice(0, 3);
  const noMatch = isNoMatch(shown.map((x) => x.rated));

  const done: MatchResult = {
      status: "ok",
      query: input,
      source,
      fixture,
      noMatch,
      telemetry: fixture ? null : tel,
      noMatchNote: noMatch ? noMatchNote(scored[0] ? { name: scored[0].basket.name } : null) : null,
      candidates: shown.map(({ basket, judgement, rated }) => ({
        slug: basket.slug,
        name: basket.name,
        description: basket.description,
        category: basket.category,
        strength: rated.strength,
        label: labelOf(rated),
        bar: rated.bar,
        contradicts: rated.contradicts,
        direction: { choice: judgement.direction, ...judgement.directionProbabilities },
        explanation: explain({
          basketName: basket.name,
          investmentCase: investmentCase(basket),
          holdings: basket.execution.holdings.map((h) => h.symbol),
          judgement,
          rated,
          from: post ? "post" : "text",
        }),
        basket,
      })),
  };

  yield { type: "done", result: done };
  // After the answer is on its way, never before it.
  await record({ input, idea, source, result: done });
}

/** The whole run, collected. Used by tests and by anything that cannot stream. */
export async function match(rawInput: string): Promise<MatchResult> {
  let last: MatchResult | null = null;
  for await (const event of matchStream(rawInput)) {
    if (event.type === "done" || event.type === "failed") last = event.result;
  }
  return last ?? { status: "empty_catalogue", query: rawInput.trim() };
}

function labelOf(r: Rated): string {
  return r.strength === "strong" ? "Strong" : r.strength === "partial" ? "Partial" : "Weak";
}

/**
 * The words a basket is judged on.
 *
 * Its reviewed description, plus the origin argument's claim when there is one. Both are already
 * edited prose that a person signed off; nothing is generated here, so the catalogue needs no
 * separate "matching description" to drift out of date.
 */
function investmentCase(b: BasketView): string {
  const origin = b.arguments.find((a) => a.role === "origin");
  const claim = origin?.claim?.trim();
  return claim && claim.toLowerCase() !== b.description.trim().toLowerCase()
    ? `${b.description.trim()} The argument: ${claim}`
    : b.description.trim();
}

/**
 * Development fixtures.
 *
 * Word overlap, which is exactly the naive thing the real provider exists to beat. It is here only
 * so the interface can be looked at without credentials, it is unreachable unless MATCH_FIXTURES=1
 * is set explicitly, and every response it produces is flagged `fixture: true` so the page can say
 * so on screen. It must never be mistaken for matching.
 */
function fixtureJudgements(idea: string, baskets: BasketView[]): Map<string, Judgement> {
  const words = new Set(idea.toLowerCase().match(/[a-z]{4,}/g) ?? []);
  const out = new Map<string, Judgement>();
  baskets.forEach((b, i) => {
    const theirs = new Set(investmentCase(b).toLowerCase().match(/[a-z]{4,}/g) ?? []);
    let hits = 0;
    for (const w of words) if (theirs.has(w)) hits++;
    const overlap = words.size ? Math.min(1, hits / Math.min(8, words.size)) : 0;
    out.set(keyFor(i), {
      expresses: overlap * 0.8,
      topic: overlap,
      direction: "unclear",
      directionConfidence: 0,
      directionProbabilities: { same: 0, opposite: 0, unclear: 1 },
    });
  });
  return out;
}
