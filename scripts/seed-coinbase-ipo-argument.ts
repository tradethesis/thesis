/**
 * One more argument for "Onchain Finance Rails", from a post the founder shared (24 Sep 2026).
 *
 *   pnpm tsx scripts/seed-coinbase-ipo-argument.ts          # dry run
 *   pnpm tsx scripts/seed-coinbase-ipo-argument.ts --apply
 *
 * Brian Armstrong announced IPO access on Coinbase for US retail, starting with Oura. That is
 * evidence for the basket's existing claim that finance reaches people through the apps they
 * already use, so it is attached to the exact allocation (COINx 40 / CRCLx 30 / HOODx 30) rather
 * than becoming a new basket. He is credited as the source of the observation; he did not write
 * this argument, choose these holdings or set these weights, and the card says so.
 *
 * Two other posts shared the same day were deliberately not attached: a Kalshi headline about
 * the US current-account deficit, and a GitHub/Muse integration. Neither says anything about
 * the economics of a basket in the catalogue, and forcing them onto one would invent a signal.
 */

import { EDITORIAL, publishSeed } from "../src/server/content/publish";
import type { ThesisSeed } from "../src/server/content/theses";
import type { CuratedEvidence } from "../src/server/content/curated";

const APPLY = process.argv.includes("--apply");

const SEED: ThesisSeed = {
  slug: "the-exchange-becomes-the-front-door",
  title: "The exchange becomes the front door to every asset",
  claim: "The exchange becomes the front door to every asset",
  category: "Finance",
  summary:
    "Coinbase now offers US retail customers access to IPOs, starting with Oura. If primary markets reach people through the apps they already trade on, those apps become the front door to more of finance.",
  rationale:
    "Brian Armstrong writes that IPO allocations have gone to institutions and a small number of rich people, and that Coinbase wants to change that; IPO access is live, starting with Oura. Our reading: each new asset class an exchange adds is another reason for a customer to keep money there, and another fee on the same account. That favours the distribution apps in this basket, Coinbase and Robinhood, and the dollar they settle in. It is an inference about customer behaviour and fees, not something the post claims, and he did not choose these holdings.",
  counterargument:
    "Retail IPO access is not new: Robinhood has offered it for years without it becoming a large business. Allocations to retail are small, the hottest deals are the hardest to get, and the ones that are easy to get can be the ones institutions passed on. A new product line can matter for the story and very little for revenue.",
  changeMyMind:
    "Over the next two earnings reports, neither Coinbase nor Robinhood discloses IPO or primary-market activity as a meaningful source of revenue or customer growth, or retail allocations stay token-sized.",
  horizonLabel: "Review in 6 months",
  reviewDate: "2027-03-24",
  weightRationale: "The basket's existing weights, unchanged: this argument attaches to the allocation as it is.",
  constituents: [
    { symbol: "COINx", position: 0, weightBps: 4000, role: "The new front door", why: "The company making the announcement. Every asset class it adds gives customers another reason to hold money on the platform.", limitation: "Most of its revenue still moves with crypto trading, which can swamp anything IPO access adds." },
    { symbol: "CRCLx", position: 1, weightBps: 3000, role: "The dollar underneath", why: "USDC is the dollar Coinbase's customers hold and settle in, so more activity on the platform means more of it in use.", limitation: "Its income depends heavily on interest rates, and it earns nothing directly from IPO access." },
    { symbol: "HOODx", position: 2, weightBps: 3000, role: "The incumbent retail app", why: "Robinhood already offers IPO access to retail, so the same shift toward apps as the front door benefits it too.", limitation: "It is also Coinbase's competitor here, so this holding can gain exactly where the other loses." },
  ],
};

const EVIDENCE: CuratedEvidence[] = [
  {
    url: "https://x.com/brian_armstrong/status/2102827556319969665",
    title: "IPO access is live on Coinbase, starting with Oura",
    source: "Brian Armstrong on X",
    publishedAt: "2026-09-23",
    relevance:
      "The Coinbase chief executive announces retail IPO access and frames it as opening a closed part of finance. It establishes that the product exists and what the company intends; it does not establish demand, allocation sizes or revenue.",
    kind: "primary",
    sourcePost: {
      url: "https://x.com/brian_armstrong/status/2102827556319969665",
      author: "Brian Armstrong",
      handle: "@brian_armstrong",
      text: "IPOs are among the most closed parts of finance. Allocations go to institutions and a small number of rich people. We wanted to change this.\n\nIPO access is live on Coinbase, starting with @ouraring - available on our app now!",
      postedAt: "2026-09-23T18:28:52.000Z",
      verifiedAt: "2026-09-24T15:25:00.000Z",
    },
  },
  {
    url: "https://robinhood.com/us/en/support/articles/ipo-access/",
    title: "IPO Access",
    source: "Robinhood support",
    publishedAt: null,
    relevance:
      "Robinhood's own description of the retail IPO access it already offers, including that allocations are not guaranteed. The case that this is not new, and that access alone has not made it a large business.",
    kind: "primary",
    supportsCounterargument: true,
  },
];

async function main() {
  console.log(`${SEED.slug}\n  ${SEED.claim}\n  ${EVIDENCE.length} sources`);
  if (!APPLY) {
    console.log("\nDry run. Nothing written. Re-run with --apply.");
    process.exit(0);
  }
  const result = await publishSeed(SEED, EVIDENCE, { attribution: EDITORIAL });
  console.log(`  ${result.action}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
