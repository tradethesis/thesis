# Current product direction · 22 September 2026

register: product

Thesis Gifts helps an existing investor introduce an adult friend to a future they care about through a personal stock-token gift. The public homepage is a themed pack collection and gift composer, not a wallet gate or search terminal. The sender chooses a reviewed allocation, an intended X handle, a budget and a note. The recipient experience centers a tactile pack reveal.

The unfunded preview is live. Funded gifting — server-owned gift records, X-subject binding, server-verified X claims, chain-verified funding and delivery through the existing buy engine — is built and tested, and switched on for the beta site except X handle lookup, which waits on an X API token; nothing has been funded or claimed end to end. For the hackathon anyone can open a gift (no location check; must be replaced before a public launch). Gifts are $10–$1,000 USDC, arrive in a wallet only the recipient's X account can open, and cannot be recalled. Never present an editable preview as a funded gift or proof of identity. Full current requirements and status: [docs/gifting.md](docs/gifting.md).

The old matching homepage remains at `/discover`; the terminal remains at `/app`. Respect the existing waitlist environment switch. Preserve the reviewed allocation, original thesis and counterargument under each pack. Stock tokens are volatile economic exposure, not stablecoins or direct company shares.

Design for a friend opening a gift on their phone in daylight: warm paper, readable charcoal type, personal notes, and physical-looking packs. Keep the three-piece vermilion T and Geist. Blue, pine and vermilion differentiate themed packaging; color never indicates investment quality. The surprise is a visual reveal, never random financial value.

Prior context below is historical where it conflicts with this decision.

---

# Thesis

register: product

## Users

Self-directed investors with a Solana wallet and USDC, browsing on a phone or laptop. They understand a trend but want help connecting it to a legible portfolio. The workspace is behind a wallet; published research at `/t/<slug>` stays public and readable without one.

## Product purpose

Turn a belief about the world into a stock basket that a person can understand, adjust, and eventually buy. **The basket is the object.** It has a short narrative name and carries the arguments for it — several of them, by different people, who need not agree. Keep the evidence, counterargument, and original reasoning attached to each. The source of truth for scope is PRD.md; current execution availability must be represented honestly.

## Brand personality

Opinionated, tactile, clear. The agreed identity is the three-piece T in vermilion and ivory, with an abstract paper composition. Use the existing Geist family with decisive scale and weight. There is no marketing homepage: `/` is a single wallet-entry screen and the brand surface moved to `/about`. The workspace is an instrument, not a brochure.

## Anti-references

Generic blue finance dashboards, neon crypto terminals, speculative return promises, decorative candlesticks, repetitive icon-card grids, dense implementation explanations in the buying journey, and invented activity or track records.

## Design principles

- Lead with a concrete belief, then the businesses that express it.
- Let a reader compare ten baskets before they read one argument.
- Keep risks and sources discoverable alongside the argument.
- Distinguish illustrative previews from executable purchases.
- Preserve the user's choices and all published evidence.

## Accessibility

Target WCAG 2.2 AA. Keyboard access, explicit labels, visible focus, accessible status updates, 44 px interactive targets, responsive 360 px layouts, and reduced-motion support.

## Discovery and return visits

**Revised 21 September 2026.** Thesis was a vertical feed of theses; it is now a basket-first
terminal. The reversal is deliberate and the reasons are worth keeping: a feed made each thesis an
article with its own basket, so two people could not argue for the same holdings, and comparing
ten exposures meant scrolling through ten essays.

The journey is: arrive, connect a wallet, work.

**Entry** (`/`) is one centered Connect wallet action over an original animated illustration of an
exchange hall. No feature sections, no waitlist form, no long footer. Connecting shows an address;
signing proves it; only the server-verified session opens the workspace. A deep link without a
session returns here and is carried back afterwards.

**Terminal** (`/app`) is a full-width three-column workspace — baskets at roughly 20%, the selected
basket at 60%, traders at 20%.

- The **left column** ranks baskets on return over a named period. Each row is a choice, not an
  article: rank, narrative name, one line, the real holding logos, one figure. A basket without
  enough readings inside the period is shown **unranked**, never extrapolated and never hidden.
- The **centre** leads with the chart, because "how is this doing" is the question people arrive
  with. Below it the holdings, genuinely recorded activity, and every attached argument — each
  expandable to its case, its case against, and what would change its author's mind. Buying pins
  the basket's own execution version, never whichever argument is open.
- The **right column** is trader standings. It currently says *No verified trader results yet* and
  names the inputs it would need, because this deployment records purchases and not holdings.
  Nothing else is renamed into P&L to fill it.

On a phone these are three navigable states, not three squeezed columns. Selection lives in the
URL, so a basket is linkable and survives a reload.

**Portfolio** (`/app/my-theses`) separates purchases from following, and is still called purchase
history rather than holdings: the database knows what this app bought and when, and knows nothing
about what the wallet contains now. Completed calls keep their own surface at `/app/leaderboard`,
because a track record and a running bet are different claims.

Three identities stay distinct everywhere: the person who posted the idea, whoever built the
allocation, and whoever's money backs it. An X author is never implied to have chosen the assets,
made the call, or endorsed anything — and attaching a second argument to a basket never
reattributes the first.

Buying is unchanged: amount, allocation summary, review, wallet approvals, progress. Customisation stays optional, the allocation's author is always named, and simulation and live are always distinguished. The basket is not tokenized and there is no pooled vault; buyers receive the underlying tokenized stocks in their own wallet, which needs one approval per asset. A thesis may separately launch its own token, which is never sold, priced or linked from the buy flow — it is a speculative instrument with no claim on the basket, and the two surfaces are kept apart on purpose.
