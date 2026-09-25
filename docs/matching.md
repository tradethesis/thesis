# Matching an idea to a basket

What `/` does: take an X link or a typed investment idea and say which reviewed baskets express it.
This file records the semantics, the thresholds, and what is measured rather than assumed.

## The question

> Does this basket's investment case express the investment idea in the input, **including its
> direction and intended exposure**?

That is the only question the labels answer. They do not describe probability of profit, expected
return, safety, or how much to put in. A Strong match on a bad idea is a strong match on a bad idea.

## Why direction is asked separately

Topic overlap is not enough, and this is measurable rather than a matter of opinion. Against the
live provider on 22 September 2026, for the idea

> "AI datacenter spending is going to collapse, the capex is unsustainable"

and the basket **AI Spending Chain** ("the chip, the cloud and the deployment layer that each get
paid once per unit of AI spending"):

| signal | value |
|---|---|
| `expresses` | **0.21** |
| `topic` | **0.89** |
| `direction` | **opposite**, confidence 0.99 |

A ranker built on subject matter puts that pair first. It is the worst answer this product can
give — a bearish post sold as a reason to buy the bullish basket — so `direction` is read as its own
question and can only ever lower a label, never raise one.

Across the whole catalogue the same bearish idea scored `expresses` 0.08–0.11 against five AI
baskets whose `topic` ran 0.76–0.89, every one of them `opposite` at 0.89–0.99.

## The rubric

Three signals per candidate, judged independently. Thresholds live in
`src/server/match/rubric.ts` as `THRESHOLDS`.

| label | condition |
|---|---|
| **Strong** | `expresses >= 0.70` and `direction` is `same`; or `direction` is `unclear` with `expresses >= 0.85` |
| **Partial** | `expresses >= 0.40` |
| **Weak** | anything lower that clears the relevance floor |

- **Contradiction.** `direction === "opposite"` with confidence `>= 0.60` caps the label at Weak
  whatever `expresses` says, and is stated in words ("Points the other way") rather than implied by
  a short bar.
- **Relevance floor.** Shown when `expresses >= 0.25`, **or** `topic >= 0.60` whatever `expresses`
  says. The second clause exists so a same-subject contradiction is visible: hiding all five AI
  baskets above left a bare "no match" and threw away the useful answer, which is that the
  catalogue covers the subject and every basket in it points the other way.
- **No match.** Nothing reaches Partial. The highest-scoring candidate is named so a reader can
  disagree, but it is not promoted to a match.

These thresholds are judgement, not calibration. They are in one exported object so changing one is
a visible act.

## Independence

Every candidate is judged on its own and nothing is normalised. Two baskets can both be Strong, and
the bar widths are not shares of anything. The numeric estimate appears only behind **About this
match**, labelled as an unvalidated model estimate of relevance on a 0–1 scale that has not been
checked against any outcome.

## What the model does and does not do

The provider (TypeSafe Jev, `src/server/match/jev.ts`) returns **numbers only** — `noul` for a
probability, `choice` for one option out of a set. Every sentence a reader sees is assembled in
`explain.ts` from the basket's own reviewed words and the reader's own input. A model that scores
can be audited against a rubric; a model asked to justify a score will justify any score it is
given.

Nothing in the matcher can create a basket, holding, ticker or weight. Candidates come from
`listBaskets()`, and the words a basket is judged on are its reviewed description plus its origin
argument's claim — already-edited prose a person signed off, so no separate "matching description"
exists to drift out of date.

## Configuration

| variable | purpose | absent |
|---|---|---|
| `TYPESAFE_API_KEY` | the relevance provider, server-side only | the page shows an honest unavailable state |
| `TYPESAFE_MODEL` | optional, defaults to `jev-latest` | — |
| `MATCH_FIXTURES=1` | development only | word-overlap placeholders, flagged `fixture: true` and labelled on screen |

Without a key and without `MATCH_FIXTURES`, matching returns `unavailable` and the page says so. It
never substitutes a plausible-looking guess.

## Input handling

- URL input is **retrieved**, never inferred from the link. One allowlisted host
  (`api.fxtwitter.com`), status URLs only, redirects refused, resolved addresses checked against
  private ranges, 8s timeout, 128KB cap.
- Retrieved text is untrusted data: displayed and scored, never treated as instruction, capped at
  2,000 characters.
- Input is capped at 4,000 characters; the endpoint rate limits per address.
- Server logs carry only the shape of a failure, never its content.

## The demand loop

Every search and its outcome go to `match_query`: the text, whether a post was retrieved, which
baskets came back and how strongly, and what it cost. **No wallet, no session, no IP, no user
agent** — answering "what is being researched" needs the what and never the who.

The point is the rows where `no_match` is true. The catalogue cannot tell you what is missing from
it; those rows can, with the gap already named. `pnpm tsx scripts/match-demand.ts [days]` reads it
back three ways: searches that found nothing, baskets that are being found, and baskets that were
never the best match in the window.

Writing happens after the response is already streaming and a failure is swallowed — analytics that
can break the product they measure are worse than none.

## Checks

- `src/server/match/rubric.test.ts` — labels, the contradiction cap, the floor, independence.
- `src/server/match/retrieve.test.ts` — URL parsing and the private-address blocklist.
- `scripts/home-check.cjs` — the page end to end, including contradiction, no match, stale
  responses, provider failure, routing and the phone layout.
