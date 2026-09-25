/**
 * What each editorial allocation is called.
 *
 * A basket needs a narrative name and a one-line description before it can be published, and
 * neither can be derived: "MSFTx GOOGLx AMZNx" says nothing, and a generated one is unreviewable at
 * the moment it matters. So they are written here, beside the theses they belong to, and a seed
 * whose slug is missing from this map fails loudly rather than publishing something unnamed.
 *
 * It lived in scripts/backfill-baskets.ts until the first fresh-database publish failed: the
 * backfill only ever runs against a database that already has theses, and `publishAll` needs the
 * same names to create a basket from scratch.
 */

/** Keyed by thesis slug. 2–4 words, and a line that says what it holds — never why to believe it. */
export const BASKET_NAMES: Record<string, { name: string; description: string }> = {
  "bitcoin-on-solana-is-a-choice-of-counterparty": {
    name: "Bitcoin Wrappers",
    description: "Three ways to hold bitcoin on Solana: a custodial claim, a bridge claim, and a listed balance sheet.",
  },
  "the-toll-booths-outlast-the-traffic": {
    name: "Solana Toll Booths",
    description: "The chain, the router and the pool that every Solana trade pays on its way through.",
  },
  "breadth-beats-picking-the-buildout": {
    name: "Buildout Breadth",
    description: "Index exposure to the AI buildout, diluted with the wider market and a non-earning hedge.",
  },
  "financial-activity-moves-onchain": {
    name: "Onchain Finance Rails",
    description: "The exchange, the stablecoin issuer and the broker that collect on activity moving onchain.",
  },
  "digital-advertising-takes-a-bigger-share": {
    name: "Digital Advertising",
    description: "The three surfaces a television advertising dollar lands on when it leaves television.",
  },
  "ai-spending-keeps-growing": {
    name: "AI Spending Chain",
    description: "The chip, the cloud and the deployment layer that each get paid once per AI dollar.",
  },
  "ai-liability-favors-big-cloud": {
    name: "Enterprise AI Trust",
    description: "The three hyperscalers that sell indemnities and guardrails alongside the model itself.",
  },
  "appetite-medicine-becomes-everyday-care": {
    name: "Metabolic Medicine",
    description: "The two companies that lead appetite and metabolic medicines, held equally.",
  },
  "contracted-capex-pays-the-supplier-first": {
    name: "Contracted Capex",
    description: "The supplier paid first out of committed datacenter spending, and the two buyers committing it.",
  },
  "spending-a-trillion-is-the-easy-part": {
    name: "Depreciation Absorbers",
    description: "The profit pools deep enough to absorb datacenter depreciation, weighted by how deep they are.",
  },
  "the-ai-money-is-private-now": {
    name: "Private AI Labs",
    description: "Two unlisted frontier labs held through issuer-controlled tokens, with one public reference price.",
  },
};
