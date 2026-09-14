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
    slug: "financial-activity-moves-onchain",
    title: "Financial activity moves onchain",
    claim: "Financial activity moves onchain",
    category: "Finance",
    summary:
      "Payments, trading and settlement keep moving onto public blockchains, and the businesses that route that activity earn a fee on each step.",
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
    title: "Digital advertising takes a bigger share",
    claim: "Digital advertising takes a bigger share",
    category: "Consumer",
    summary:
      "Advertising budgets keep shifting to places where the result can be measured, and three companies own most of the surfaces where that is true.",
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
    title: "AI spending keeps growing",
    claim: "AI spending keeps growing",
    category: "Technology",
    summary:
      "Companies keep increasing what they spend on building and running AI systems, and that money is collected at three different points on the way through.",
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
