# Claude implementation prompt: Trade Thesis terminal revamp

You are implementing a product and UX revamp in `/Users/limon/thesis`.
Read the current working tree before editing. Implement and verify the result; do not stop at a proposal or a static mockup. Do not deploy or submit real financial transactions as part of this task.

## The founder's direction

Keep Trade Thesis. Replace the article-feed framing with a basket-first investing terminal.

The journey is:

1. Visit the site. There is no marketing landing page.
2. See one centered **Connect wallet** action over an original, subtly animated stock-exchange illustration.
3. Connect and establish the existing signed wallet session.
4. Enter a full-width terminal with a compact bento layout:
   - Left: basket/narrative leaderboard, approximately 20% of desktop width.
   - Center: selected basket's chart, allocation, buying action and attached theses, approximately 60%.
   - Right: trader leaderboard with properly scoped P&L, approximately 20%.

Interpret 20/60/20 as percentages of the entire workspace. The center and right together occupy 80%. The chart should dominate the center panel; thesis text belongs below it or behind concise disclosures.

The conceptual flip is important:

**Before:** each thesis is an article with its own basket.
**After:** each basket has a short narrative identity and can contain multiple distinct investment theses, sources and counterarguments.

People select a future/exposure, see how the basket is doing, inspect why different people believe in it, then buy. This is a substantive data and interaction change, not a rename of feed cards.

The latest instructions supersede PRODUCT.md/DESIGN.md where those files require a separate marketing homepage, anonymous app entry, a vertical feed, or prohibit all entry-screen animation. Retain their accessibility, attribution and execution integrity requirements. Update those documents and the affected PRD sections after implementing.

## Repository findings, verified September 21, 2026

The working tree has extensive existing uncommitted changes. Preserve and build on them. HEAD is `311b614`; the working tree is much newer than that commit. Do not reset, clean, overwrite or start again from HEAD.

- Next.js 15 App Router, React 19, TypeScript, Drizzle/Postgres, pnpm, Node 22; Geist, lucide-react, existing CSS tokens. See package.json for commands.
- `src/app/page.tsx` currently renders marketing sections or a waitlist homepage.
- `src/middleware.ts` and `src/lib/site-mode.ts` separately redirect product routes in waitlist mode. Both must be addressed for the requested entry journey to work.
- `src/app/app/layout.tsx` renders AppNav, a full-width SignalMap, TrendingRail, PortfolioRail and a shared ThesisDrawer.
- `src/app/app/page.tsx` loads published theses, calls and activity into `src/components/feed/Feed.tsx`.
- App routes also include `/app/leaderboard`, `/app/my-theses`, `/app/create`; legacy research and purchase URLs are `/t/[slug]` and `/buy/[slug]`.
- Authentication exists in `src/components/buy/useWallet.tsx`, `SignIn.tsx`, `src/app/providers.tsx`, `PrivyAuth.tsx`, `PrivyBridge.tsx`, and `src/server/session/index.ts`. Phantom and optional Privy both prove wallet control using the existing server-issued signed challenge.
- `useWallet` currently has component-local session state and no explicit initial session-loading flag. The Privy path currently requires another tap after its modal completes. Fix these seams for a smooth entry flow, using shared state where appropriate.
- `src/server/content/queries.ts` exposes `ThesisCard`. `schema.ts` has thesis, immutable thesisVersion, thesisConstituent and thesisUpdate records; there is no independent basket parent today.
- `src/server/content/publish.ts::assertBasketIsDistinct` currently rejects an identical allocation attached to a different thesis. That conflicts directly with the requested parent basket / multiple theses model. Inspect its test file too.
- The buy path is real implementation: `BuyModal.tsx`, `BuyFlow.tsx`, intent routes, server execution state machine and reconciliation. Purchases pin a version, preserve custom allocations, and handle separate legs and partial fills.
- `src/lib/money/allocate.ts` and `src/lib/thesis-draft.ts` currently enforce exactly THREE holdings, whole-percent weights, 10–70% each, sum 100%. Keep that executable constraint for this revamp. Sourcing code describes 2–4 holdings, so reconcile that mismatch at validation; do not quietly widen financial execution scope.
- Current code DOES have LLM assistance: `src/server/content/expand.ts` expands human-chosen arguments/holdings, and `src/server/sourcing/analyse.ts` proposes drafts from posts. Do not assume basket generation is entirely manual, and do not introduce another agent system for this redesign.
- `src/server/calls/service.ts` now values model baskets from a batched price feed. It supports the enabled equity/crypto/pre-IPO allowlist. These marks are model performance, not executable liquidation quotes or user P&L.
- `src/components/calls/PerformanceChart.tsx` is a small SVG chart. Its x positions are currently evenly spaced by index. `src/server/calls/observations.ts` normalizes to the first stored observation, whereas the call service stores the opening snapshot separately. Audit and fix those differences before making the chart the centerpiece.
- `src/server/conviction.ts` has free conviction votes, model scoring, aggregated crowd standings, and confirmed live purchase activity. None is a public trader P&L leaderboard.
- Position, holding, valuation and externalActivity tables exist in schema.ts, but table definitions alone do not establish that a complete valuation/position pipeline is running. Verify actual writers and records. `src/server/purchases.ts` is explicitly purchase history, not current holdings.
- Existing speculative thesis-token launch/fee code is separate from underlying basket purchases. Preserve its records and attribution. Do not treat its price as the basket price or make token issuance part of this task.
- `scripts/seed-dev-feed.ts` creates published development fixtures. `listPublishedTheses()` currently has no fixture exclusion. Filter these out of the normal terminal; do not delete user data.
- Existing assets include `public/brand/conviction-workshop.webp`, `waitlist-backdrop.webp`, `waitlist-backdrop-portrait.webp`, abstract banners, the three-piece T, author images and token logos.

## 1. Wallet entry and routing

Replace `/` with a single-screen entry composition, filling the viewport. Small brand mark/name, one short line if necessary, centered Connect wallet button, and minimal legal/help links. No feature sections, hero essay, waitlist form or long footer.

Create a visually strong stock-exchange illustration behind the action. Inspect existing artwork first. Reuse it only if it fits; otherwise create original layered SVG/CSS artwork, or generate a local illustration if image-generation tools are available. A small exchange hall, display boards and restrained moving light/ticker details are appropriate. Do not use fake prices that look like live market data. Keep the center readable on small phones.

Use slow transform/opacity motion, pause when offscreen/hidden, and provide a static reduced-motion version. Avoid a heavy 3D runtime or autoplay video for this one screen. Decorative artwork must not intercept clicks or keyboard focus. Keep animation out of the analytical dashboard except for state feedback.

Reuse the real wallet/session flow. Connect is the dominant entry action; email/embedded-wallet access may be a quiet secondary option when configured. Clearly distinguish wallet connection from the sign-in signature. Enter `/app` after the server verifies the session, not merely when an address exists. Automatically finish the Privy sign-in handshake once its signer becomes available; avoid duplicate prompts or loops.

Returning valid sessions go directly to the terminal without an entry-screen flash. Direct `/app?...` visits without a session return to the entry screen and preserve a validated local return URL. Cancelled/rejected signatures remain on the entry screen with a useful retry. Logout clears shared state and returns there. Never trust localStorage or a client boolean to authorize writes.

Make the product's normal local/full-mode journey exactly this. Remove the old waitlist interception from this journey; update obsolete defaults/documentation while preserving intentional operational access controls explicitly. Do not silently change deployment secrets or deploy. Preserve existing public research URLs and metadata rather than deleting old content. Legacy buy deep links should retain basket/version/amount context across authentication.

## 2. Basket parent and attached theses

Implement a persistent basket parent/read model with:

- Stable basket ID and slug.
- Short narrative name, ideally 2–4 words, such as “AI Infrastructure”. Example names are copy direction, not researched investment recommendations.
- A concise one-line description, category and allocation author.
- Immutable allocation/version identity: chain, asset IDs/mints, weights and version.
- Multiple linked thesis versions, each retaining author, claim, rationale, objections, sources, publication date and attribution.
- Explicit selection of the performance series/call appropriate to that exact allocation version.

Prefer a small additive schema/migration and a compatibility adapter to the existing execution version over rewriting the execution engine. A basket version can reference an immutable existing execution thesisVersion during this transition. That mapping must be explicit and exact; never buy using an arbitrary attached thesis's allocation. Preserve old intent, fill, call, conviction and token foreign keys and identities.

Backfill existing published content without destroying historical versions. Only reuse an allocation identity for exact holdings/weights matches. Narrative similarity is not sufficient. Attaching another thesis must not mutate the basket, rewrite old returns, duplicate trade volume, or impersonate the original author.

Replace the blanket duplicate-thesis-allocation rejection with association to the appropriate basket. Do not encourage meaningless 1% weight edits to evade duplicate detection. Keep validation and immutable version rules. An allocation change creates a new basket version and clearly segmented history; adding an argument does not.

A source post is evidence, not automatically a separate authored thesis. Count actual linked thesis records. Curate a small, coherent initial catalogue from existing content; include at least one genuine multiple-thesis basket in the demo. Any newly written example arguments must be labeled as original editorial work, never attributed to X authors who did not write them. Do not fabricate activity to make the catalogue look populated.

Keep `/app/create` functional: allow adding a thesis to an existing basket without rebuilding its allocation, and creating a new basket with an initial thesis. Ownership of a thesis is not permission to alter somebody else's basket. Reuse current drafting support and server session authentication; source-backed and uncited user content retain their distinct disclosures.

## 3. Terminal composition

Desktop target, around 1440px:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Thesis        Terminal     My portfolio       Create          Wallet / menu  │
├───────────────┬───────────────────────────────────────────┬──────────────────┤
│ BASKETS       │ AI Infrastructure                         │ TOP TRADERS      │
│ Search        │ Description · logos · allocation author   │ Scope / period   │
│ Rank / period │ Performance + Buy basket                  │ Wallet    P&L    │
│               ├───────────────────────────────────────────┤                  │
│ 1 Short name  │                                           │                  │
│   one line    │              LARGE CHART                  │                  │
│   logos   %   │          Basket / benchmark                │                  │
│               │                                           │                  │
│ 2 Short name  ├────────────────────┬──────────────────────┤                  │
│   one line    │ Holdings / weights │ Basket activity       │                  │
│   logos   %   ├────────────────────┴──────────────────────┤                  │
│ ...           │ Theses (N)    Counterarguments    Sources │                  │
│               │ Compact attached arguments; expand to read│                  │
└───────────────┴───────────────────────────────────────────┴──────────────────┘
       ~20%                        ~60%                           ~20%
```

Use a proper full-width CSS grid with usable minimum column widths, e.g. minmax constraints around a 1:3:1 split. Do not preserve the old 720px feed max-width. Compact bento means connected panels with clear hierarchy, not dozens of floating decorative cards or nested cards.

Retain the T mark, Geist and vermilion accent. Default design direction: a graphite workspace with warm off-white text, subtly differentiated panel surfaces, quiet 1px boundaries and restrained green/red for signed results. This is a deliberate new terminal treatment for side-by-side comparison; do not leave half the terminal inheriting the ivory article theme. The entry illustration should share the palette. No neon glow, gradient headings, fake terminal logs, glass-card wallpaper or decorative price charts.

Left leaderboard:

- Dense selectable rows, roughly 76–96px, fitting several choices in the initial viewport.
- Rank, short narrative name, one short description, actual holding logos/tickers, one clearly scoped return figure and optional thesis count.
- No X quotation, paragraph, large thumbnail or repeated buy button per row.
- Row selection updates the center and any basket-scoped right panel in place. Persist selection in a shareable URL such as `/app?basket=slug`; support refresh, back/forward, loading and invalid-slug fallback.
- Use basket performance as the primary ranking signal, with a clearly named period. Live results are labeled live/in progress. Provide completed-call history separately when available.
- Rank only comparable, sufficiently observed series for a selected interval; a newer basket without the required history is unranked, not extrapolated. Define deterministic ties, losses and stale handling. Do not rank “since inception” returns of arbitrary different ages as one equivalent period.

Center:

- Concise selected basket header, logos, change over the chosen interval, valuation basis and updated timestamp.
- A prominent Buy basket action using the existing amount/review/sign/progress flow. Show actual weights before purchase. One convenient entry action must not promise one signature if execution needs several.
- Large responsive interactive line/area chart, approximately 350–440px high on desktop. A basket is a model portfolio, not necessarily a separately traded asset with a token price or order book.
- Use real timestamp spacing, coherent axes, crosshair/tooltip, touch interaction and an accessible numeric alternative. Basket and benchmark share the same normalization basis and axis.
- Correct opening baseline to the immutable call start snapshot; do not reset performance silently to the first later observation. Period returns in the chart, header and rankings must agree, including a clear rule for interval rebasing.
- Offer only ranges supported by actual data. No fabricated candles, intraday ticks, smoothed histories, liquidity or volume. Show sparse observations and gaps honestly. Empty or one-point history gets a composed explanation, not a fake rising line.
- Holdings and genuinely available activity sit below the chart in compact panels. Trading volume from recorded fills must be labeled as activity through Thesis, never total market volume or TVL.
- Attached theses appear below: short claim, author, date, and expand-to-read argument/evidence/counterargument. This is where source posts belong. Multiple viewpoints are attached to the same basket without implying they all make the same prediction or endorse that allocation.

Right:

- Build the trader leaderboard panel, not another basket/call leaderboard.
- Default scope: eligible public traders for the selected basket, with an All baskets control if supported. Show identity/address, signed P&L, valuation time and the exact scope used.
- If a row is selected, show a concise relevant position/history view; do not introduce an entire social profile system.

## 4. Trader P&L integrity and missing data

This panel needs new read-model work. Do not rename `crowdStandings`, conviction scores, buy volume or model returns to “trader P&L”.

Inspect and reuse real fills/position tracking where it actually works. Scope the initial implementation to positions acquired through Thesis with known cost basis, attributable subsequent activity and fresh valuations. Exclude simulated intents, failed transactions, unresolved external transfers and incomplete/stale valuations from ranking. Never infer that a historical purchase remains in the wallet.

For an eligible tracked position, estimated total P&L is confirmed proceeds plus current value of attributable remaining holdings minus confirmed acquisition cost, with explicit fee treatment and no double counting. Net-of-all-fees claims require the relevant fee valuation. Realized-only P&L requires disposed-lot cost basis, not simply all proceeds minus all purchases. Aggregation, deposits and differing start times require a stated rule; do not average position percentages.

Use opt-in public participation if there is no existing permission to publish trader identities/performance. Preserve private purchase APIs. Do not expose private histories through the leaderboard or trust a requested wallet parameter as authorization.

Implement the reader/calculator, eligibility states and tests. If this deployment lacks reliable holdings/valuation inputs, return a reasoned unavailable result and render the finished panel with “No verified trader results yet” or unranked unavailable entries as appropriate. An empty dataset is acceptable; a fake financial leaderboard is not. Do not create a vast new indexer just to fill this panel. Document what input is missing and what would make real results eligible. A clearly labeled development-only fixture view may help visual QA, but must not enter production queries, live rankings or live buy flows.

## 5. Mobile and secondary routes

- Do not squeeze three desktop columns onto a phone.
- At 360–430px, use Basket list / selected basket detail / Traders as clear navigable states or tabs. The list opens the selected chart/detail, with an obvious way back. Retain selection through navigation.
- The selected basket view leads with name, performance and chart; holdings and attached theses follow. Buy is thumb-reachable and respects safe areas without covering content. Trader standings remain accessible as a full-width view.
- At tablet widths, use two columns and move trader standings to a tab or below. At wide desktop, all three columns are visible.
- Preserve My portfolio/purchase history and creation access in the new shell. Old `/app/leaderboard` links should resolve to an appropriate terminal leaderboard view or a deliberate compatibility route. Old thesis URLs must keep working.
- All states must handle keyboard navigation, visible focus, readable contrast, 44px touch actions, reduced motion, loading, empty results, errors and long names. Avoid nested scroll traps.

## 6. Implementation and verification

First inspect the relevant files and record the current git diff. Make a short implementation plan, then execute it. Work autonomously on routine design choices. Use the existing skill/context files where useful, applying the founder's new direction when they conflict.

Suggested implementation units: WalletEntry, shared wallet/session state, TerminalShell, BasketLeaderboard, BasketWorkspace, BasketPerformanceChart, BasketTheses, TraderLeaderboard, and small server-side basket/leaderboard read services. These are suggestions, not required names.

Keep app tokens/styles scoped so old `.landing` selectors cannot silently override the new workspace. Check production route CSS loading; the project has previously had shared CSS disappear on direct navigation. Handle bigint/Date serialization across server/client boundaries deliberately. Avoid per-row database queries or per-row price requests; batch/cache shared data without sharing private session output.

Add targeted tests for basket association/version mapping, duplicate allocations, ranking intervals/ties/staleness, chart baselines and irregular timestamps, trader P&L exclusions/calculation, and authentication return paths. Retain financial execution, reconciliation, allocation, sourcing and attribution checks; adapt old product assumptions rather than deleting safety tests to make a build pass.

Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` using Node 22. Distinguish pre-existing failures from regressions and fix regressions. Apply only reviewed additive local migrations; do not reset databases or rewrite existing histories. Never reveal environment secrets.

Use the browser to inspect both the entry screen and terminal at approximately 390x844, 768x1024 and 1440x900. Verify direct routes, real auth cancellation, session restoration/logout, selection/back/refresh, chart ranges, thesis expansion, buy dialog and simulation-mode purchase progress. Use isolated test fixtures for authenticated browser QA where needed, never an authentication bypass shipped to users. Do not sign a mainnet purchase for validation.

Deliver:

1. A working entry-to-terminal journey, basket-parent model and responsive UI.
2. Preserved buying behavior and historical attribution, with new basket selection mapped to the correct execution version.
3. Trader leaderboard data states that are truthful about available inputs.
4. Updated PRODUCT.md, DESIGN.md and relevant PRD sections describing the implemented design.
5. Screenshots and a concise report: what changed, checks run, migrations, any missing external data/configuration, and exact local URL to review.

Success: after entering, a user can scan short basket narratives on the left, select one, understand its chart and holdings, inspect several attached arguments, compare eligible traders on the right, and start buying without moving through an article feed.
