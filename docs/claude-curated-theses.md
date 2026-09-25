# Claude implementation prompt: a small shelf of futures worth backing

Work in `/Users/limon/thesis`. Read `docs/curated-thesis-research.md` first. Then inspect the latest code, `git status`, `PRODUCT.md`, `DESIGN.md`, `PRD.md` and `docs/gifting.md`. This is an implementation task, not another ideation exercise. Preserve the owner's extensive uncommitted work.

## Product intent

Thesis helps someone turn a view of the future into a position and introduce a friend to it. The thesis is the durable object people recognize; an allocation expresses it, and a gift distributes it. We want a few compelling futures with living evidence, not endless AI-generated baskets or an article feed.

The emotional promise is: “A future I believe in. A position I understand. A record of when I backed it.” Never imply ownership of an idea, guaranteed returns, or that price performance proves the causal argument.

Use these six researched subjects and the exact copy/details in the research file:

1. Intelligence becomes a utility.
2. Wall Street moves onto internet rails.
3. The AI race runs on electricity.
4. Robots clock in.
5. Medicine rewrites appetite.
6. The internet needs a stronger immune system.

These are six research subjects, not six approved or currently executable allocations. The research file identifies constraints and sources for each. Sources support observations; the investment interpretation is ours.

## 1. Extend the existing model minimally

Inspect `src/server/db/schema.ts`, `src/server/baskets/queries.ts`, `src/server/content/{theses,curated,evidence,baskets,publish}.ts`, `src/lib/basket.ts`, `src/server/gifts/catalogue.ts`, and current gift components before choosing a schema.

The app already separates thesis arguments from basket allocations and supports basket versions, attached arguments, thesis updates and execution spans. Reuse these. Do not flatten them into a new giant JSON blob or duplicate the purchase engine.

Add a lightweight canonical subject/collection layer only where needed. A subject should have a stable ID, headline, short belief, aliases, scope boundaries, evidence links, related arguments, featured allocation reference (nullable), review metadata and editorial status. Store canonical content in one typed, validated place and project it into views; do not create competing copies in UI components.

A source can inform multiple subjects with separate interpretations. A basket can support multiple arguments without issuing another basket coin. Preserve authorship, source attribution and editorial interpretation as separate facts. Do not attribute our basket or weights to the author of a linked post.

Published financial allocations are immutable. Do not rewrite old thesis versions, basket weights, funded gifts, or performance records to fit the new headlines. Where a subject groups existing work, link it rather than pretending the new umbrella thesis has the old track record. Keep all existing recipient and thesis links resolving.

## 2. Encode the research and exposure states honestly

Create reviewed content records for all six subjects using the research file. Each includes:

- Headline and a one-sentence belief.
- Why the future is compelling and a separate, explicitly unproven “what might be underestimated” angle.
- The route from adoption to company revenue, including where it could break.
- Roles and limitations for each proposed holding.
- The strongest counterargument and observable review triggers.
- A short list of metrics to watch, including disclosure gaps.
- Original source URL, publisher, original publication date (or null if unverified), observation period when relevant, accessed date and a concise factual summary.
- Our interpretation, separately from the source's observation.
- Argument relationship: supports / challenges / context. These labels are editorial assessments, not return probabilities.

Keep the status of the idea separate from the status of the trade. A valid research subject can have no eligible allocation; an established basket can have temporarily unavailable quotes. Do not use one `active` boolean to mean both.

For asset candidates outside the allowlist, retain only research metadata. They must not enter executable constituents. Use the existing issuer/mint verification workflow if assessing additions: verified issuer identity, exact Solana mint, token properties, restrictions, decimals, two-way liquidity and current costs. A Kraken listing is not a verified route for this app. Do not discover executable tokens by ticker alone.

Do not pad a two-company case with a third unrelated holding. If the engine requires a particular constituent count, show a research state until that constraint is intentionally and safely addressed. No arbitrary weights, “AI optimized” weights, or synthetic returns. Reuse existing reviewed weights only where the investment case fits, and retain their actual rationale.

Do not enable previously disabled instruments, restore a hidden gift pack, or change issuance/funding/eligibility policy just to populate the collection. The onchain-finance gift design is deliberately hidden in the current catalogue; inspect and preserve the reason unless the new direction clearly supersedes a presentation-only decision. Document your conclusion.

## 3. Make the home experience thesis-led and concise

Preserve the current brand, stock-pack artwork, gift composer and mobile reveal work. This is a change in content hierarchy and decision quality, not permission to replace the app with a landing-page essay or a new visual framework.

Suggested top-level copy:

“What future are you backing?”
“Find a thesis. Take a position. Bring a friend.”

Use a compact featured shelf with the headline, one-line belief, real constituent logos where verified, and an honest availability label. Never show made-up progress, confidence percentages, holder counts or profit numbers. Research-only subjects have “Explore thesis” / “Follow,” not a disabled fake price and an apparent buy CTA.

Opening a subject should answer in this order:

1. What future am I backing?
2. What changed recently? Show one dated, sourced update, or say there is no recent reviewed update.
3. How does this allocation capture it? Holdings and role/limitation; the full allocation is visible before a purchase or gift.
4. What is the strongest case against it?
5. What are we watching next?

Show at most a few updates initially and expand on demand. Keep detailed research one level deeper. Do not lead with a chart when the reader still has no idea what the thesis is. Use authentic historical performance only with dates and methodology; a historical what-if is not an investor's P&L or a record of someone being early.

For an executable reviewed allocation, support “Back this thesis” and “Send a first position” using existing buy/gift routes. For an unavailable one, explain why in plain language and offer only actions that actually work. A follow action must persist or clearly state its local-only scope; no fake subscribe success.

Do not silently make gifting secondary or delete the existing collection. Make this curated discovery a natural path into the current self-buy and gift flows. Preserve custom packs, existing designs and legacy links outside the curated shelf where appropriate. “Curated” means reviewed for this collection, not every creator's pack approved by the team.

## 4. Make updates feed a thesis, not spawn another basket

Initial implementation: a reviewed seed/update workflow, not an autonomous news agent. Leverage the existing thesis-update/evidence infrastructure and source-ingestion code.

When a new X post or other source comes in, route it to:

- Same belief, different wording: existing subject/alias.
- New evidence or a new interpretation: attach to an existing subject, preserving author, date and source.
- Related but economically different claim: editorial review before creating a new subject.
- No credible relationship: leave unmatched. Do not force every post into the nearest basket.

If the current matcher is used, it can suggest subject ID(s), rationale and stance. A matching score measures relevance, never probability of investment success. Keep publication and live allocation changes editorially controlled. No new model dependency is needed for the first version.

Untrusted source text must never control tools or financial actions. A source import failure produces an honest unavailable/unverified state, not a generated quotation. Repeated imports should be idempotent. Corrected or retracted evidence retains its history and no longer appears as current support without explanation.

The archive can evolve without changing a user's allocation. Do not rebalance because an LLM found a new article.

## 5. Show overlap without pretending it is diversification

Different wording is not a different opportunity. Remove duplicate front-page subjects manually using their causal claim, not title similarity alone. Preserve distinct arguments and their authors.

For actual reviewed allocations, calculate direct weighted overlap using stable asset identities:

`overlapBps(A, B) = sum over shared assets of min(weightA, weightB)`

Explain it as shared allocation weight, not correlation or portfolio risk. Compare exact reviewed versions. No allocation means unknown overlap, not zero. Normalize the same underlying across issuers where a trusted mapping exists; token mint identity alone can miss duplicate economic exposure. Label missing ETF look-through rather than implying an index and its constituents do not overlap.

Example acceptance case: A = NVDA 60%, MSFT 40%; B = NVDA 30%, AMZN 70%; direct overlap = 30%. This is a test fixture, not a proposed live allocation.

Display a contextual note where useful: “Shares 30% of its allocation with …”. An editorial review flag above 50% can be a simple heuristic, not a scientific threshold. Also note shared demand drivers: AI compute and power can be exposed to the same capex cycle even with no shared stocks.

The old absolute “no constituent repeats” comment/rule is superseded by this direction. Update affected documentation and meaningful validation consistently; do not disable unrelated safeguards.

## 6. Keep evidence and valuation separate

Use three explicit editorial questions:

- Is the change occurring?
- Are these businesses capturing it?
- Is the current price attractive?

No third answer can be inferred from the first two. Default valuation to “Not assessed” unless a dated methodology and sources exist. Do not describe these already discussed themes as undiscovered or automatically early. No invented fair values, alpha estimates, guaranteed catalysts or urgency countdowns.

Review dates indicate an editorial check, not a prediction expiry or a promised return deadline. A follow-up can be “inconclusive” if the needed business metric is undisclosed. Source dates remain original; never manufacture freshness by setting them to import time.

## Current-code cautions

The previous `docs/claude-gifting-revamp.md` predates substantial implementation. There is now a server gift lifecycle, stable-X identity plumbing, direct recipient-wallet USDC funding, custom-pack work, a $1 gift minimum and changed refund semantics. Read the latest files and preserve the architecture; do not rebuild an escrow or apply the older $10 minimum.

`PRODUCT.md` says the beta funding path has not been validated with a funded end-to-end claim and describes a missing X lookup credential and location-check bypass. This task does not authorize broadening availability or claiming those gaps are solved. Do not regress existing safeguards. Treat public-launch readiness as separate from this content/UI change.

No deployments, real-money transactions, outbound social posts, or production database writes. Use reviewable local content/migration changes and local/test seed commands. Do not expose credentials.

## Validation and delivery

- Unit tests for aliases/canonical subject mapping, idempotent source updates, direct overlap calculation, unavailable/disabled asset handling and separation of research from execution status.
- Regression tests that existing gift/order versions and legacy URLs keep their original allocation and attribution.
- Browser checks for browse → thesis → evidence → self-buy review and gift compose/recipient preview, without broadcasting. Research-only subjects must never reach funding.
- Check 360/390/768/1440 px layouts, keyboard/focus behavior and reduced motion. Keep the display compact and legible.
- Run relevant lint, typecheck, tests and build. Use a separate Next build directory if a dev server is running. Report environment blockers precisely rather than changing production credentials.
- Deliver the six records, supporting source data, canonical grouping, curated UI and overlap behavior; update the product docs with a short current-direction note.
- Finish with the exact changes, screenshots, checks run, which allocations are executable versus research-only, and the next asset/provider verification required. Do not say all six are live unless they actually are.

Ship the smallest coherent version of this direction. No new coin, game economy, prediction market, robo-rebalancer, giant social feed or autonomous research swarm.
