import { db } from "../db/client";
import { matchQuery } from "../db/schema";

import type { MatchResult, SourceRef } from "./match";

/**
 * Writing down what people searched for.
 *
 * The catalogue cannot tell you what is missing from it. This table can: a search that matched
 * nothing is a demand signal with the supply gap already named, and a run of them on one subject is
 * the strongest argument there is for reviewing a basket about it.
 *
 * Three rules this follows.
 *
 * **No identity.** Wallet, session, IP and user agent are all absent, by omission rather than by
 * scrubbing. "What is being researched" needs the what; it never needs the who.
 *
 * **Never blocks a search.** This is called after the stream has finished, and a failure is logged
 * and swallowed. Analytics that can break the product it measures are worse than no analytics.
 *
 * **Only what was submitted and what came back.** No derived scores, no guesses about intent.
 */
export async function record(args: {
  input: string;
  idea: string;
  source: SourceRef;
  result: MatchResult;
}): Promise<void> {
  const { input, idea, source, result } = args;

  try {
    const ok = result.status === "ok" ? result : null;
    const top = ok?.candidates[0] ?? null;

    await db.insert(matchQuery).values({
      input: input.slice(0, 4_000),
      sourceKind: source.kind,
      sourceUrl: source.kind === "post" ? source.url : null,
      idea: idea.slice(0, 4_000),
      outcome: result.status,
      noMatch: ok ? ok.noMatch : false,
      topSlug: top?.slug ?? null,
      topStrength: top?.strength ?? null,
      topScore: top ? top.bar.toFixed(3) : null,
      results: (ok?.candidates ?? []).map((c) => ({
        slug: c.slug,
        strength: c.strength,
        bar: Number(c.bar.toFixed(3)),
        contradicts: c.contradicts,
        direction: c.direction.choice,
      })),
      providerMs: ok?.telemetry?.providerMs ?? null,
      questions: ok?.telemetry?.questions ?? null,
    });
  } catch (error) {
    // The shape of the failure, never the input. A search that worked must not be reported as
    // broken because a row could not be written.
    console.error("[match:record]", error instanceof Error ? error.name : "unknown");
  }
}
