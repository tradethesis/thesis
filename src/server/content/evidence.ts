/**
 * Evidence links, kept apart from the editorial copy because they are the part that has to
 * be checked rather than written.
 *
 * PRD §6: a publishable version carries at least two relevant sources, each with a date and
 * a short note on why it is relevant. Nothing is in here that has not been fetched and had
 * its quoted figure found in the document. An unverified link is worse than no link — it
 * looks like a citation.
 *
 * Verified 2026-09-14. Every SEC URL is the EDGAR original rather than the company's IR
 * page: identical text, more stable address, and the IR hosts rate-limit automated checks
 * so we could not confirm them. SEC requires a User-Agent naming a contact; without one it
 * returns 403, which is a blocked request and not a dead link.
 *
 * Quotes are under 15 words and attributed, and no figure appears here that was not found
 * in the document it is attached to.
 */

export type EvidenceLink = {
  url: string;
  title: string;
  source: string;
  /** ISO date, or null when the page carries no clear one. Never guessed. */
  publishedAt: string | null;
  /** What this specific source establishes. */
  relevance: string;
  kind: "primary" | "secondary";
  /** Set when the link is evidence the thesis may be wrong. */
  supportsCounterargument?: boolean;
};

export const EVIDENCE: Record<string, EvidenceLink[]> = {
  "financial-activity-moves-onchain": [
    {
      url: "https://www.sec.gov/Archives/edgar/data/1876042/000187604226000246/augustepr-circle_q22026f.htm",
      title: "Circle Reports Second Quarter 2026 Results",
      source: "Circle Internet Group, 8-K exhibit via SEC EDGAR",
      publishedAt: "2026-08-05",
      relevance:
        "Settlement volume is growing far faster than the money sitting still: onchain transaction volume of $14.8 trillion grew 151% year-over-year, while USDC in circulation grew 19%. The claim is about activity moving, not about balances.",
      kind: "primary",
    },
    {
      url: "https://www.sec.gov/Archives/edgar/data/1679788/000167978826000087/q226earningsdeck_sec.htm",
      title: "Coinbase Second Quarter 2026 Shareholder Letter",
      source: "Coinbase Global, 8-K exhibit via SEC EDGAR",
      publishedAt: "2026-07-30",
      relevance:
        "Stablecoin balances are now a revenue line that does not depend on trading: $292M of stablecoin revenue against an all-time-high $20B of average USDC held in Coinbase products.",
      kind: "primary",
    },
    {
      url: "https://www.govinfo.gov/content/pkg/PLAW-119publ27/pdf/PLAW-119publ27.pdf",
      title: "GENIUS Act, Public Law 119-27",
      source: "U.S. Government Publishing Office",
      publishedAt: "2025-07-18",
      relevance:
        "A statutory federal framework for payment stablecoins now exists. Regulated institutions needed that before they could route meaningful volume, so it is the precondition the rest of the thesis sits on. Older than the other sources, and included for that reason.",
      kind: "primary",
    },
    {
      url: "https://www.sec.gov/Archives/edgar/data/1783879/000178387926000113/q22026robinhoodexhibit991.htm",
      title: "Robinhood Reports Second Quarter 2026 Results",
      source: "Robinhood Markets, 8-K exhibit via SEC EDGAR",
      publishedAt: "2026-07-29",
      relevance:
        "Evidence against the basket from inside it. Robinhood's cryptocurrencies revenue was $100 million, down 38% year-over-year, in the same quarter onchain volume rose sharply. Activity moving onchain does not automatically reach these companies.",
      kind: "primary",
      supportsCounterargument: true,
    },
    {
      url: "https://www.bis.org/publications/aer-2026/anchoring-trust-money",
      title: "Anchoring trust in money: innovation beyond stablecoins",
      source: "Bank for International Settlements, Annual Economic Report 2026",
      publishedAt: "2026-06-23",
      relevance:
        "The structural case against. The BIS argues stablecoins cannot currently ensure exchange at par across issuers and chains under all conditions, which is a problem for anything built on them as settlement money.",
      kind: "primary",
      supportsCounterargument: true,
    },
  ],

  "digital-advertising-takes-a-bigger-share": [
    {
      url: "https://www.iab.com/wp-content/uploads/2026/04/IAB_PwC_Internet_Ad_Revenue_Report_Full_Year_2025_April_2026.pdf",
      title: "Internet Advertising Revenue Report, Full Year 2025",
      source: "IAB with PwC",
      publishedAt: "2026-04-01",
      relevance:
        "The claim measured at the category level rather than through any one company: internet advertising revenue grew 13.9% to $294.6 billion, with commerce media at $63.4 billion. A census audited by PwC, not a vendor estimate.",
      kind: "primary",
    },
    {
      url: "https://www.sec.gov/Archives/edgar/data/1326801/000162828026050596/meta-06302026xexhibit991.htm",
      title: "Meta Reports Second Quarter 2026 Results",
      source: "Meta Platforms, 8-K exhibit via SEC EDGAR",
      publishedAt: "2026-07-29",
      relevance:
        "Both halves of the shift at once, which matters because either alone can be explained away: ad impressions up 14% year-over-year and average price per ad up 12%. More inventory sold, at a higher price.",
      kind: "primary",
    },
    {
      url: "https://www.sec.gov/Archives/edgar/data/1652044/000165204426000066/googexhibit991q22026.htm",
      title: "Alphabet Announces Second Quarter 2026 Results",
      source: "Alphabet, 8-K exhibit via SEC EDGAR",
      publishedAt: "2026-07-22",
      relevance:
        "Search advertising still compounding while assistants are widely available: 17% growth in Google Search and other. This is the direct test of the thesis's largest single risk.",
      kind: "primary",
    },
    {
      url: "https://www.sec.gov/Archives/edgar/data/1018724/000101872426000024/amzn-20260630xex991.htm",
      title: "Amazon.com Announces Second Quarter 2026 Results",
      source: "Amazon.com, 8-K exhibit via SEC EDGAR",
      publishedAt: "2026-07-30",
      relevance:
        "Retail media growing faster than the category it sits inside: advertising services revenue of $19,809 million, up 26% year-over-year against a category growing 13.9%.",
      kind: "primary",
    },
    {
      url: "https://www.pewresearch.org/short-reads/2025/07/22/google-users-are-less-likely-to-click-on-links-when-an-ai-summary-appears-in-the-results/",
      title: "Google users are less likely to click on links when an AI summary appears",
      source: "Pew Research Center",
      publishedAt: "2025-07-22",
      relevance:
        "Measured behaviour rather than opinion, and the reason to doubt the basket: users clicked a search result in 8% of visits with an AI summary present, against 15% without. Older than a year, and the most direct evidence against the largest holding.",
      kind: "primary",
      supportsCounterargument: true,
    },
  ],

  "ai-spending-keeps-growing": [
    {
      url: "https://www.sec.gov/Archives/edgar/data/1045810/000104581026000073/q2fy27pr.htm",
      title: "NVIDIA Announces Financial Results for Second Quarter Fiscal 2027",
      source: "NVIDIA, 8-K exhibit via SEC EDGAR",
      publishedAt: "2026-08-26",
      relevance:
        "The spending arriving at the supplier, and the forward guide rather than only the past: data centre revenue of $89.0 billion, up 117% year-over-year, with next-quarter revenue guided to $108.0 billion.",
      kind: "primary",
    },
    {
      url: "https://www.sec.gov/Archives/edgar/data/789019/000119312526323632/msft-ex99_1.htm",
      title: "Microsoft Cloud and AI Strength Fuels Fourth Quarter Results",
      source: "Microsoft, 8-K exhibit via SEC EDGAR",
      publishedAt: "2026-07-29",
      relevance:
        "The buyer's side of that number, in an audited cash flow statement rather than a press line: $115.9 billion of additions to property and equipment across the fiscal year, with Azure revenue up 43%.",
      kind: "primary",
    },
    {
      url: "https://www.sec.gov/Archives/edgar/data/1018724/000101872426000024/amzn-20260630xex991.htm",
      title: "Amazon.com Announces Second Quarter 2026 Results",
      source: "Amazon.com, 8-K exhibit via SEC EDGAR",
      publishedAt: "2026-07-30",
      relevance:
        "A second buyer spending at the same magnitude, so the first is not an outlier: $169,007 million of property and equipment purchased over twelve months, with AWS at a $169 billion annualised run rate.",
      kind: "primary",
    },
    {
      url: "https://www.imf.org/-/media/files/publications/gfsr/2026/april/english/ch1.pdf",
      title: "Global Financial Stability Report, April 2026, Chapter 1",
      source: "International Monetary Fund",
      publishedAt: "2026-04-01",
      relevance:
        "An official body treating this spending as concentration risk rather than as a given. It notes hyperscalers are expected to account for 70 percent of a projected $3.4 trillion of AI capital expenditure by 2029, and warns those valuations may not be justified by returns.",
      kind: "primary",
      supportsCounterargument: true,
    },
  ],
};

export const MIN_EVIDENCE_LINKS = 2;
