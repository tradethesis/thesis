/**
 * Every word on the landing page.
 *
 * Two rules held this file to the ground:
 *
 *   1. No number appears here that was not measured. The per-leg cost, the flat rent
 *      charge and the basket minimum come from docs/execution-findings.md and
 *      src/lib/money/cost.ts. There are no user counts, no volumes, and no returns,
 *      because none exist yet.
 *   2. The worked example is a real thesis in the shape the product publishes: a claim,
 *      three holdings with a job and a weakness each, a weight rationale, the strongest
 *      argument against, and the observation that would change the author's mind.
 *      The holdings are three mints already on the verified allowlist.
 */

export type Holding = {
  symbol: string;
  company: string;
  underlying: string;
  /** The job this company does inside the claim. Two or three words. */
  role: string;
  /** Author's starting weight, whole percent. */
  weight: number;
  why: string;
  limitation: string;
};

export const EXAMPLE_HOLDINGS: Holding[] = [
  {
    symbol: "COINx",
    company: "Coinbase Global",
    underlying: "COIN",
    role: "The exchange",
    weight: 40,
    why: "Coinbase earns a fee when someone trades, and it holds assets for institutions that will not custody their own. If more financial activity moves onchain, a regulated exchange is one of the few places large amounts of it can pass through.",
    limitation:
      "Revenue still follows retail trading volume, which rises and falls with prices. A quiet year is a bad year for this holding even if the claim is correct.",
  },
  {
    symbol: "CRCLx",
    company: "Circle Internet Group",
    underlying: "CRCL",
    role: "The dollar",
    weight: 30,
    why: "Circle issues USDC, the dollar most onchain activity settles in. Payments and trades that move onchain have to settle in something, and the issuer earns on the reserves behind every unit in circulation.",
    limitation:
      "Circle's income depends heavily on interest earned on those reserves. If rates fall, that income falls with them, even while the amount of USDC in circulation grows.",
  },
  {
    symbol: "HOODx",
    company: "Robinhood Markets",
    underlying: "HOOD",
    role: "The brokerage",
    weight: 30,
    why: "Robinhood puts crypto next to stocks in one retail account. It captures the customer who moves money onchain without ever calling themselves a crypto user.",
    limitation:
      "Crypto is one revenue line among several. Equities and options still drive much of the business, so part of this holding is a bet on retail trading in general rather than on the claim.",
  },
];

export const EXAMPLE_THESIS = {
  title: "Financial activity moves onchain",
  author: "Thesis editorial",
  version: "Version 1",
  category: "Financial infrastructure",
  horizon: "Review in 12 months",
  summary:
    "The claim: payments, trading and settlement keep moving onto public blockchains, and the businesses that route that activity earn a fee on each step. This basket holds three of them — the exchange, the issuer of the dollar they settle in, and the brokerage that brings retail money in.",
  holdings: EXAMPLE_HOLDINGS,
  weightRationale:
    "Coinbase carries the most direct exposure to the claim, so it takes the largest share. The other two are equal. This is a judgement, not the output of an optimiser.",
  counterargument: {
    heading: "The strongest argument against",
    body: "Activity can move onchain without these three capturing it. Fees on public networks fall over time, and the routing layer is easier to replace than the companies built on top of it. Banks are building their own rails. An onchain future can arrive and route around every listed intermediary — the claim right, the basket wrong.",
  },
  changeMyMind: {
    heading: "What would change my mind",
    body: "Two consecutive quarters where onchain settlement volume rises while the transaction revenue of these three falls. That would mean the activity is real and the fee is being earned somewhere we do not hold.",
  },
  evidenceNote:
    "Every published thesis carries at least two dated sources, each with a line on why it matters. They sit under the argument on the thesis page.",
  trackingNote:
    "There is no performance chart here because there is no history. A thesis page says Tracking begins at publication until there are real observations to show, and a model series, if one ever appears, will be labelled as a model.",
};

export const HERO = {
  kicker: "Tokenized stocks on Solana. No SOL required.",
  title: "Buy what you believe.",
  lead: "Read a claim about the world, see the three tokenized stocks that express it, change the weights if you disagree, and buy the whole basket with USDC from your own wallet.",
  facts: [
    {
      term: "You need no SOL",
      detail:
        "You pay in USDC. Jupiter's gasless route covers the network and token-account costs and charges them back at about $0.16 per purchase.",
    },
    {
      term: "You hold the tokens",
      detail:
        "They land in your own wallet and stay there. Not a fund, not a pooled asset, not a claim on anything we hold. We never touch your keys.",
    },
    {
      term: "The reasoning stays attached",
      detail:
        "Your position keeps the version you bought, the evidence, the counterargument, and the observation that would change the author's mind.",
    },
  ],
} as const;

export const STEPS = [
  {
    title: "Read the claim",
    body: "A thesis is one sentence about the world and the argument behind it. Three holdings, each with a stated job and a stated weakness. You should be able to say why you own each one before you own it.",
  },
  {
    title: "Set your weights",
    body: "The author's allocation is a starting point, not an instruction. Move each holding between 10% and 70%, in whole percent. The total has to reach 100%, and nothing is adjusted behind your back to make it fit.",
  },
  {
    title: "See the cost, then sign",
    body: "Before anything is signed you see the USDC going in, the tokens coming out, the minimum you will receive, and the fee in dollars. The fee is Jupiter's. Thesis adds none of its own.",
  },
  {
    title: "Your wallet, your tokens",
    body: "Three purchases, three approvals, three tokens in your wallet. We cannot move them, sell them, or reach them. Selling later is a transaction you start and approve yourself.",
  },
] as const;

export const PARTIAL = {
  heading: "A basket is three transactions",
  body: [
    "Nothing on this site pretends otherwise. No screen says Success until every leg confirms, and confirmation is read from the transaction's own balance changes on chain, never from a provider replying that it worked.",
    "Stop after the first purchase and you keep it. The page then says exactly how much USDC you did not spend. That USDC stays in your wallet — never reserved, never swept. If a request times out the leg is marked unresolved and checked against the chain before any replacement is offered, because a timeout is not a failure.",
  ],
  legs: [
    { symbol: "COINx", amount: "$60.00", state: "Confirmed onchain", tone: "confirmed" },
    { symbol: "CRCLx", amount: "$45.00", state: "Awaiting your approval", tone: "pending" },
    { symbol: "HOODx", amount: "$45.00", state: "Not started", tone: "idle" },
  ],
  headline: "1 of 3 purchased",
  subhead: "Financial activity moves onchain · $150.00 basket",
  foot: "$90.00 not spent on the remaining purchases. It is in your wallet.",
} as const;

export type Disclosure = {
  title: string;
  body: string;
  link?: { label: string; href: string };
};

export const DISCLOSURES: Disclosure[] = [
  {
    title: "Where this works",
    body: "The tokenized stocks are issued by Backed Finance. They are restricted for people in the United States, Canada, the United Kingdom and Australia, and the duty to enforce that sits with the platform rather than the buyer. A wallet address is not proof of eligibility, so access is gated instead of open.",
    link: { label: "Backed Finance terms", href: "https://xstocks.com/legal" },
  },
  {
    title: "What the issuer can do",
    body: "Backed Finance can move these tokens out of any wallet, and can freeze all transfers. We read both powers directly off the mint accounts; they are live. Balances also rebase for dividends and splits, so your token count can change without a trade.",
  },
  {
    title: "What you own",
    body: "A token that tracks the price of a share. It is not the share. There is no vote and no shareholder right, and the claim is on the issuer rather than on the company. A Thesis position is our record of which trades belong to which idea — not a fund, not a pooled asset.",
  },
  {
    title: "What it costs",
    body: "About $0.16 per purchase plus 10 basis points, charged by Jupiter in USDC. Thesis takes no fee. The flat part does not shrink with size, so a small basket is expensive: $50 across three holdings loses roughly 1% to fees. That is why the minimum is $75.",
  },
  {
    title: "There is no track record",
    body: "This launched with no history. Every thesis says Tracking begins at publication, and there are no past returns on this site because there are none to show. Nothing here is a forecast, a promise, or investment advice.",
  },
  {
    title: "Who holds the keys",
    body: "You do. Thesis has no custody, cannot move your tokens, and cannot sell your position. An author publishing an update never trades on your behalf — it puts new evidence next to what you already own and leaves the decision with you.",
  },
];

export const FOOTER = {
  notes: [
    "Thesis is a hackathon build, made between 14 and 18 September 2026. It runs against Solana mainnet, with routing and execution by Jupiter.",
    "Live execution is limited to a wallet allowlist while eligibility is resolved. Everyone else sees the same flow in a clearly labelled simulation that never asks for a signature and never touches mainnet.",
  ],
  links: [
    { label: "Source on GitHub", href: "https://github.com/limon-wq/thesis", external: true },
    { label: "Jupiter, for routing and execution", href: "https://dev.jup.ag", external: true },
    { label: "Backed Finance, the issuer", href: "https://xstocks.com", external: true },
  ],
  bottom: "Not investment advice. No return is promised or implied.",
} as const;
