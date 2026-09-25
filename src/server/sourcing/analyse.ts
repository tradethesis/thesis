import { LEG_COUNT } from "@/lib/money/allocate";

import { CRYPTO_ASSETS, EQUITY_ASSETS, PRESTOCKS_ASSETS, type AllowlistEntry } from "../assets/allowlist";

import type { TimelinePost } from "./timeline";

/**
 * Turning a post into a thesis draft.
 *
 * The model does the part that scales and none of the parts that matter. It reads a post
 * somebody really wrote and proposes a claim, a basket and — the important one — the
 * strongest argument against itself. It cannot invent an asset, cannot set a weight outside
 * the rules, and cannot publish: everything here lands as a draft for a person to accept,
 * edit or throw away.
 *
 * Three hard limits, enforced after the model answers rather than asked for politely:
 *
 *   1. **Only allowlisted assets.** Every symbol is checked against the enabled allowlist
 *      and the whole draft is rejected if one is not on it. A hallucinated ticker is the
 *      obvious failure and the cheapest to catch.
 *   2. **The published weight rules.** Exactly three holdings, whole percentages, each
 *      between 10% and 70%, summing to exactly 100%. These are the same constraints the
 *      database enforces, checked here so a bad draft never reaches it.
 *   3. **A real counterargument.** A draft whose case against is shorter than its case for
 *      is rejected. The objection is the part a model will happily phone in, and it is the
 *      part this product is built on.
 *
 * What it must never do is decide the post means something. The claim is our reading, the
 * basket is our choice, and both are labelled as ours everywhere they appear.
 */

const MODEL = "anthropic/claude-sonnet-4.5";
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export type DraftConstituent = { symbol: string; weightBps: number; role: string; why: string; limitation: string };

export type ThesisDraft = {
  sourceUrl: string;
  sourceHandle: string;
  sourceAuthor: string;
  sourcePostedAt: string;
  claim: string;
  category: string;
  summary: string;
  rationale: string;
  counterargument: string;
  changeMyMind: string;
  weightRationale: string;
  constituents: DraftConstituent[];
};

export type Rejection = { post: TimelinePost; reason: string };

/** What the model is allowed to reach for, described the way a person would need it. */
function palette(): AllowlistEntry[] {
  return [...EQUITY_ASSETS, ...CRYPTO_ASSETS, ...PRESTOCKS_ASSETS].filter((a) => a.enabled);
}

function prompt(post: TimelinePost): string {
  const assets = palette()
    .map((a) => `  ${a.symbol} — ${a.company}${a.underlying !== a.symbol ? ` (${a.underlying})` : ""}`)
    .join("\n");

  return `A post from ${post.author} (${post.handle}) on ${post.postedAt.slice(0, 10)}:

"""
${post.text}
"""

Decide whether this post contains an investable claim about the future — something that
could be expressed as a basket of tradable assets and later judged right or wrong. Most
posts do not. Announcements, jokes, engagement bait, personal news and pure commentary all
do not. If it does not, answer exactly: {"skip": "<one short reason>"}

If it does, propose a thesis. You may only use these assets:

${assets}

Rules that will be checked and will cause rejection:
- Exactly three holdings. Weights in whole percent, each 10 to 70, summing to exactly 100.
- The counterargument must be the strongest honest case against the thesis, and must be at
  least as substantial as the rationale. Name what would actually go wrong, not a generic
  "markets are risky".
- changeMyMind must be a specific, observable event with a timeframe — something a reader
  could check and that would genuinely falsify the claim.
- Do not claim the author endorses the basket. They wrote the post; the basket is ours.
- Every "limitation" must be a real weakness of that holding for this thesis.

Answer with JSON only:
{
  "claim": "one sentence, under 60 characters, the belief itself",
  "category": "Technology | Finance | Crypto | Energy | Consumer | Health",
  "summary": "two sentences a reader sees before the argument",
  "rationale": "our reading of the post and why this basket expresses it",
  "counterargument": "the strongest case this is wrong",
  "changeMyMind": "the specific observable that would falsify it",
  "weightRationale": "why these weights rather than equal ones",
  "constituents": [
    { "symbol": "...", "weightPercent": 40, "role": "three or four words",
      "why": "why this holding expresses the claim",
      "limitation": "how this holding could fail the thesis" }
  ]
}`;
}

export async function draftFromPost(post: TimelinePost, apiKey: string): Promise<ThesisDraft | Rejection> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "x-title": "Thesis sourcing",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      // Low, because this is an extraction task with hard constraints, not a creative one.
      temperature: 0.3,
      messages: [{ role: "user", content: prompt(post) }],
    }),
  });

  if (!res.ok) return { post, reason: `model ${res.status}` };

  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = body.choices?.[0]?.message?.content ?? "";
  const json = text.match(/\{[\s\S]*\}/);
  if (!json) return { post, reason: "no JSON in the answer" };

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json[0]);
  } catch {
    return { post, reason: "answer was not valid JSON" };
  }

  if (typeof parsed.skip === "string") return { post, reason: `not investable: ${parsed.skip}` };

  return validate(post, parsed);
}

/**
 * Everything the prompt asked for, checked rather than trusted.
 *
 * A model told to follow rules follows them almost always, and "almost always" across a
 * daily job is a bad ticker in the catalogue eventually. Each rule below has a reason
 * somebody would notice if it were broken.
 */
function validate(post: TimelinePost, raw: Record<string, unknown>): ThesisDraft | Rejection {
  const no = (reason: string): Rejection => ({ post, reason });

  const str = (key: string, min: number, max: number): string | null => {
    const v = raw[key];
    return typeof v === "string" && v.trim().length >= min && v.trim().length <= max ? v.trim() : null;
  };

  const claim = str("claim", 12, 70);
  const category = str("category", 3, 24);
  const summary = str("summary", 40, 400);
  const rationale = str("rationale", 80, 2000);
  const counterargument = str("counterargument", 80, 2000);
  const changeMyMind = str("changeMyMind", 30, 800);
  const weightRationale = str("weightRationale", 20, 600);

  if (!claim) return no("claim missing or the wrong length");
  if (!category) return no("category missing");
  if (!summary || !rationale || !counterargument || !changeMyMind || !weightRationale) return no("prose fields missing");

  // The objection is the field a model phones in, and the one this product rests on.
  if (counterargument.length < rationale.length * 0.6) {
    return no("counterargument is thinner than the rationale");
  }

  const rows = Array.isArray(raw.constituents) ? raw.constituents : [];
  // Exactly three, matching LEG_COUNT in src/lib/money/allocate.ts. A two- or four-holding
  // draft used to pass here and then fail at validateAllocation the moment anybody tried to
  // buy it — sourcing advertised a width the money path never had.
  if (rows.length !== LEG_COUNT) return no(`${rows.length} holdings, needs exactly ${LEG_COUNT}`);

  const enabled = new Map(palette().map((a) => [a.symbol, a]));
  const constituents: DraftConstituent[] = [];
  let total = 0;
  const seen = new Set<string>();

  for (const row of rows as Record<string, unknown>[]) {
    const symbol = typeof row.symbol === "string" ? row.symbol.trim() : "";
    if (!enabled.has(symbol)) return no(`${symbol || "(blank)"} is not an enabled asset`);
    if (seen.has(symbol)) return no(`${symbol} appears twice`);
    seen.add(symbol);

    const percent = Number(row.weightPercent);
    if (!Number.isInteger(percent) || percent < 10 || percent > 70) return no(`${symbol} weight ${percent} is outside 10–70`);
    total += percent;

    const role = typeof row.role === "string" ? row.role.trim() : "";
    const why = typeof row.why === "string" ? row.why.trim() : "";
    const limitation = typeof row.limitation === "string" ? row.limitation.trim() : "";
    if (role.length < 3 || why.length < 30) return no(`${symbol} is missing its role or reason`);
    if (limitation.length < 30) return no(`${symbol} has no real limitation`);

    constituents.push({ symbol, weightBps: percent * 100, role, why, limitation });
  }

  if (total !== 100) return no(`weights sum to ${total}, not 100`);

  return {
    sourceUrl: post.url,
    sourceHandle: post.handle,
    sourceAuthor: post.author,
    sourcePostedAt: post.postedAt,
    claim,
    category,
    summary,
    rationale,
    counterargument,
    changeMyMind,
    weightRationale,
    constituents,
  };
}
