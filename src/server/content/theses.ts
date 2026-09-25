/**
 * The published catalogue.
 *
 * Editorial rules this file is held to, from PRD §6:
 *
 *   - Every holding states the job it does inside the claim AND a real limitation. The
 *     limitation is written in the same weight as the case for owning it, because a
 *     holding whose weakness has to be hunted for has not been explained.
 *   - The counterargument is the strongest one available, not a token objection. If the
 *     best argument against a thesis is that its basket is wrong rather than its claim,
 *     it says so.
 *   - The change-my-mind is an observation someone could actually make, with a timeframe.
 *     Not "if it goes down".
 *   - Unequal weights need a stated reason and may never claim to be optimised.
 *   - No constituent repeats across theses. Three baskets that overlap are one basket
 *     wearing three hats.
 *
 * Evidence links live in evidence.ts, separately, because they are the part that must be
 * verified against live URLs rather than written.
 */

export type ConstituentSeed = {
  symbol: string;
  /** Deterministic order. The tie-break input to allocate(), so it is a real field. */
  position: number;
  weightBps: number;
  /** Two or three words. The job, not the pitch. */
  role: string;
  why: string;
  limitation: string;
};

export type ThesisSeed = {
  slug: string;
  title: string;
  claim: string;
  category: string;
  summary: string;
  rationale: string;
  counterargument: string;
  changeMyMind: string;
  horizonLabel: string;
  reviewDate: string;
  weightRationale: string | null;
  constituents: ConstituentSeed[];
};

export const AUTHOR = {
  name: "Thesis editorial",
  handle: null,
  disclosure:
    "Written by the Thesis team. The team holds no position in these companies or their tokenized shares, and is paid nothing by any of them.",
};

export const THESES: ThesisSeed[] = [
  {
    slug: "bitcoin-on-solana-is-a-choice-of-counterparty",
    title: "Holding bitcoin here means picking a counterparty",
    claim: "Holding bitcoin here means picking a counterparty",
    category: "Crypto",
    summary: "None of these is bitcoin. Each is a different institution standing between you and it, and they fail in different ways — which is the actual decision being made.",
    rationale: "A wrapped token is exposure created through a custodian, a bridge, or a balance sheet, and the wrapper is the risk actually being taken. Read from the mint accounts themselves: Coinbase holds a freeze authority over cbBTC and can freeze it in any wallet; the Portal mint authority can issue more WBTC, so a bridge failure is a failure of the token independent of bitcoin; MicroStrategy is an operating company with debt, so it is the only holding here that can fall while bitcoin rises. Spreading across all three is a bet that no single one of those failures takes the whole position.",
    counterargument: "Diversifying the wrapper does not diversify the asset — all three fall together when bitcoin does, which is the risk that dominates. The spread only pays in the narrow case of one issuer failing on its own, and it buys that protection with three sets of fees, three liquidity profiles, and an equity leg whose leverage can lose money in a flat market.",
    changeMyMind: "A wrapper failing with holders made whole quickly would show the counterparty layer matters less than this assumes.",
    horizonLabel: "Review in 12 months",
    reviewDate: "2027-09-18",
    weightRationale: "Weighted toward the regulated custodian and away from the bridge, because the named historical failures in this category have been bridge and minting failures rather than custodial ones.",
    constituents: [
      { symbol: "cbBTC", position: 0, weightBps: 4500, role: "Custodial claim", why: "Reserves held by a New York chartered custodian under NYDFS oversight, with a stated redemption path — the most conventional institution of the three.", limitation: "Coinbase holds a live freeze authority over this mint and can freeze the token in any wallet. It is a claim on a company's custody, not bitcoin." },
      { symbol: "WBTC", position: 1, weightBps: 2000, role: "Bridge claim", why: "Held deliberately small: it is the leg whose failure mode — bridge and minting logic — is the one this category has actually suffered.", limitation: "A bridge mint authority can issue more. Cross-chain logic can fail while bitcoin itself is fine, and depegs happen when exit liquidity thins." },
      { symbol: "MSTRx", position: 2, weightBps: 3500, role: "No wrapper at all", why: "Bitcoin exposure through a listed company instead of a token, so it carries none of the wrapper risks the other two do.", limitation: "It carries corporate risk instead: debt, dilution and management decisions. It can fall while bitcoin rises, which neither of the others can." },
    ],
  },
  {
    slug: "the-toll-booths-outlast-the-traffic",
    title: "The toll booths outlast the traffic",
    claim: "The toll booths outlast the traffic",
    category: "Crypto",
    summary: "Whoever charges per transaction earns whether the trade was clever or stupid. The chain takes a fee, the router takes a fee, the pool takes a fee — and none of them need the trader to be right.",
    rationale: "This is a bet on activity rather than on direction. Solana's network revenue is the sum of base fees, priority fees and tips, and it is collected on every transaction regardless of outcome; the router and the pool sit on the same flow and charge again. Holding the chain, the aggregator and an automated market maker is an attempt to own the toll at three points along one road.",
    counterargument: "Fees are the most competitive thing in this industry and the direction of travel is downward: record transaction volume has already coincided with flat-to-falling network revenue, which is fee compression doing exactly what it does. Routing has no switching cost, a cheaper aggregator takes the flow in a week, and the fee rules themselves are governed and can be changed by vote. Owning three tolls on one road is also three ways to be wrong about the same road.",
    changeMyMind: "Another quarter of rising transactions with falling network revenue would show the tolls are being competed away faster than the traffic grows.",
    horizonLabel: "Review in 12 months",
    reviewDate: "2027-09-18",
    weightRationale: "Weighted to the chain, because it is the only one of the three that cannot be routed around.",
    constituents: [
      { symbol: "SOL", position: 0, weightBps: 5000, role: "The road", why: "Every transaction pays it, and unlike the other two it cannot be switched away from without leaving entirely. No mint or freeze authority, so there is nothing to disclose beyond market risk.", limitation: "Its fee rules are set by governance and are under active discussion, so the toll is not fixed. Most of its price behaviour has nothing to do with fee revenue." },
      { symbol: "JUP", position: 1, weightBps: 3000, role: "The router", why: "Sits in front of the pools and sees the order flow before they do, which is the most defensible position on the road if habits are sticky.", limitation: "Routing has close to zero switching cost. The position is defensible only for as long as it is the best price, and the token's link to routing revenue is indirect." },
      { symbol: "RAY", position: 2, weightBps: 2000, role: "The pool", why: "Where the trade is actually filled, and among the largest venues by volume on this chain.", limitation: "The most commoditised leg: liquidity moves to whichever venue pays for it, and the fee it earns is the first thing a competitor undercuts." },
    ],
  },

  {
    slug: "breadth-beats-picking-the-buildout",
    title: "If the buildout is right, breadth beats picking",
    claim: "If the buildout is right, breadth beats picking",
    category: "Technology",
    summary: "The spending is spread across a dozen names and nobody knows which of them converts it into profit. Owning the index captures the theme without requiring that guess, and a gold sleeve pays only if the theme fails.",
    rationale: "Every other basket in this catalogue picks three companies out of the buildout and argues for them. This one argues the picking is the weak step. The capex is measurable and large; which participant earns a return on it is not, and the index already holds all of them at their market weight. The gold sleeve is not a view on gold — it is there because a barbell only means something if one end pays when the other does not, and the failure mode of this trade is a broad repricing that an equity index cannot hedge against itself.",
    counterargument: "A barbell can be the worst of both: not concentrated enough to matter if the theme works, not hedged enough to help if it does not. Gold and equities have spent long stretches falling together, so the sleeve may simply be a drag. And if only two or three firms convert the spending into profit, the index dilutes exactly the exposure worth having.",
    changeMyMind: "A clear divergence inside the index — a handful of names carrying the return while the rest fall — would make picking the right step after all.",
    horizonLabel: "Review in 12 months",
    reviewDate: "2027-09-17",
    weightRationale: "Weighted toward the concentrated index, since the claim is that the theme is real; the broad index and the hedge are there to be wrong in different directions.",
    constituents: [
      { symbol: "QQQx", position: 0, weightBps: 5000, role: "The theme, undiluted", why: "Holds every large participant in the buildout at market weight, which is the exposure without the guess about which one wins.", limitation: "Concentrated in the same handful of mega-caps, so it is less diversified than it looks and carries the whole theme's drawdown." },
      { symbol: "SPYx", position: 1, weightBps: 3000, role: "The wider market", why: "Dilutes toward the rest of the economy, which is where the money goes if the buildout disappoints but the expansion does not.", limitation: "Substantially overlaps the first holding, so it adds less independence than its weight suggests." },
      { symbol: "GLDx", position: 2, weightBps: 2000, role: "Paid if the theme is wrong", why: "The only holding here with no exposure to corporate earnings, which is the point: the barbell needs an end that does not depend on the argument being right.", limitation: "Gold and equities fall together often enough that this is a weak hedge, and it earns nothing while it waits." },
    ],
  },

  {
    slug: "financial-activity-moves-onchain",
    title: "Three tolls on the same onchain traffic",
    claim: "Three tolls on the same onchain traffic",
    category: "Finance",
    summary:
      "The exchange large trades pass through, the issuer of the dollar they settle in, and the brokerage bringing retail money in. Each takes its cut in a different way, so this can be right through any one of them.",
    rationale:
      "This basket holds three of those businesses: the exchange large amounts pass through, the issuer of the dollar they settle in, and the brokerage that brings retail money in. Each earns in a different way, so the claim can be right through any one of them without needing all three to work.",
    counterargument:
      "Activity can move onchain without these three capturing it. Fees on public networks fall over time, and the routing layer is easier to replace than the companies built on top of it. Banks are building their own rails, and a bank that settles its own payments onchain pays none of these three. An onchain future can arrive and route around every listed intermediary — the claim right, the basket wrong.",
    changeMyMind:
      "Two consecutive quarters where onchain settlement volume rises while the transaction revenue of these three falls. That would mean the activity is real and the fee is being earned somewhere we do not hold.",
    horizonLabel: "Review in 12 months",
    reviewDate: "2027-09-14",
    weightRationale:
      "Coinbase carries the most direct exposure to the claim, so it takes the largest share. The other two are equal. This is a judgement, not the output of an optimiser.",
    constituents: [
      {
        symbol: "COINx",
        position: 0,
        weightBps: 4000,
        role: "The exchange",
        why: "Coinbase earns a fee when someone trades, and it holds assets for institutions that will not custody their own. If more financial activity moves onchain, a regulated exchange is one of the few places large amounts of it can pass through.",
        limitation:
          "Revenue still follows retail trading volume, which rises and falls with prices. A quiet year is a bad year for this holding even if the claim is correct.",
      },
      {
        symbol: "CRCLx",
        position: 1,
        weightBps: 3000,
        role: "The dollar",
        why: "Circle issues USDC, the dollar most onchain activity settles in. Payments and trades that move onchain have to settle in something, and the issuer earns on the reserves behind every unit in circulation.",
        limitation:
          "Circle's income depends heavily on interest earned on those reserves. If rates fall, that income falls with them, even while the amount of USDC in circulation grows.",
      },
      {
        symbol: "HOODx",
        position: 2,
        weightBps: 3000,
        role: "The brokerage",
        why: "Robinhood puts crypto next to stocks in one retail account. It captures the customer who moves money onchain without ever calling themselves a crypto user.",
        limitation:
          "Crypto is one revenue line among several. Equities and options still drive much of the business, so part of this holding is a bet on retail trading in general rather than on the claim.",
      },
    ],
  },

  {
    slug: "digital-advertising-takes-a-bigger-share",
    title: "A dollar leaving TV has three places to land",
    claim: "A dollar leaving TV has three places to land",
    category: "Consumer",
    summary:
      "One sells attention, one sells intent at the moment of a search, one sells the shelf position beside the purchase. A budget leaving television can go to any of them, and guessing which is the part nobody is good at.",
    rationale:
      "The three hold different parts of the same shift. One sells attention, one sells intent at the moment of a search, and one sells the shelf position next to the purchase itself. A budget moving out of television can land on any of them.",
    counterargument:
      "The share can grow while these three lose their piece of it. Retail media beyond Amazon, streaming ad tiers and short video are all taking budget, and some of the fastest-growing ad surfaces belong to none of these companies. The bigger risk is narrower: assistants that answer a question without showing a page of results remove the unit that made search advertising valuable in the first place. The habit that built this business is the one most exposed.",
    changeMyMind:
      "Two consecutive quarters where total digital ad spend grows and the combined advertising revenue of these three grows more slowly than it. That would mean the shift is real and the budget is landing elsewhere.",
    horizonLabel: "Review in 12 months",
    reviewDate: "2027-09-14",
    weightRationale: null,
    constituents: [
      {
        symbol: "GOOGLx",
        position: 0,
        weightBps: 3400,
        role: "The intent",
        why: "Search reaches someone at the moment they are looking for something, which is the most valuable moment an advertiser can buy. YouTube takes the budget that leaves television.",
        limitation:
          "Search advertising is the part of this basket most exposed to assistants answering questions directly. The product that made Alphabet dominant is the one whose format is under the most pressure.",
      },
      {
        symbol: "METAx",
        position: 1,
        weightBps: 3300,
        role: "The attention",
        why: "Meta sells time spent on Facebook, Instagram and its messaging apps. Its ad system is self-serve, so a budget can move onto it in a day without a salesperson.",
        limitation:
          "Growth increasingly means earning more from the same people rather than reaching new ones, and there is a ceiling on how many ads a feed can carry before it gets worse. Rules on how user data may be combined tighten that further in some markets.",
      },
      {
        symbol: "AMZNx",
        position: 2,
        weightBps: 3300,
        role: "The shelf",
        why: "Amazon sells placement next to the purchase, and measures the sale on the same platform that showed the ad. That closeness to the transaction is what advertisers are moving budget toward.",
        limitation:
          "Advertising is one line inside a very large company. A strong advertising year can be swamped by retail margins or by what happens to AWS, so the holding tracks the claim less tightly than the other two.",
      },
    ],
  },

  {
    slug: "ai-spending-keeps-growing",
    title: "The AI dollar gets paid three times",
    claim: "The AI dollar gets paid three times",
    category: "Technology",
    summary:
      "The chip is bought once, the rent is charged monthly, the software is sold last. The same spending reaches all three, at different times and on very different margins.",
    rationale:
      "One company sells the hardware the spending buys. One rents it out and sells software on top. One sells the software that turns a model into a decision inside an organisation. The money passes all three, but it arrives at different times and with very different margins.",
    counterargument:
      "This is the thesis most likely to be right about the world and wrong about the investment. Spending is a cost to the spender: capacity bought now shows up as depreciation for years, whether or not the revenue arrives. The supplier's biggest customers are also designing their own chips, and a supplier whose customers have alternatives loses margin first. A world that spends enormously on AI and earns thin returns on it would confirm the claim and still damage every holding here.",
    changeMyMind:
      "A quarter in which the largest cloud buyers guide their capital spending down, or two consecutive quarters where NVIDIA's gross margin falls while revenue still grows. Either would say the spending is being met by supply rather than constrained by it.",
    horizonLabel: "Review in 12 months",
    reviewDate: "2027-09-14",
    weightRationale:
      "The weights fall as the holding becomes more concentrated on a single expression of the claim. Microsoft's business survives a slower year; Palantir's is the most exposed to one. This is a judgement about concentration, not a forecast about returns.",
    constituents: [
      {
        symbol: "MSFTx",
        position: 0,
        weightBps: 4000,
        role: "The landlord",
        why: "Microsoft rents out the compute and sells the software that runs on it. It earns whether a customer builds their own system or buys one already built.",
        limitation:
          "It pays for the capacity up front. The spending lands on the accounts before the revenue does, so a year of heavy building can look worse than a year of standing still.",
      },
      {
        symbol: "NVDAx",
        position: 1,
        weightBps: 3500,
        role: "The supplier",
        why: "Almost everything being built runs on hardware NVIDIA designs. When spending rises, this is the first place the money lands.",
        limitation:
          "It is the most crowded way to hold this idea, and its largest customers are designing their own chips to avoid paying it. A supplier with substitutes loses margin before it loses revenue.",
      },
      {
        symbol: "PLTRx",
        position: 2,
        weightBps: 2500,
        role: "The application",
        why: "Palantir sells the layer that turns a model into a decision inside a large organisation. It is the part of the spending that has to justify itself to a budget holder.",
        limitation:
          "Revenue is concentrated in a relatively small number of large contracts, many with governments, so a single procurement cycle moves the business. It is the smallest and least diversified holding here, which is why it carries the smallest weight.",
      },
    ],
  },
];
