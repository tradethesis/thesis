/**
 * One more argument for "Depreciation Absorbers", from a post the founder shared (25 Sep 2026).
 *
 *   pnpm tsx scripts/seed-roon-rates-argument.ts          # dry run
 *   pnpm tsx scripts/seed-roon-rates-argument.ts --apply
 *
 * roon, quoting a Barchart headline about the 10-year Treasury yield, puts the move mostly down to
 * AI capex "borrowing at nation scale". That gives the basket's existing claim (deep profit pools
 * carry the buildout) a mechanism: if AI borrowing makes capital dearer, companies funding capex
 * from their own profits are in the strongest position. Attached to the exact allocation
 * (MSFTx 45 / GOOGLx 35 / AMZNx 20). He is credited as the source of the observation; he did not
 * write this argument, choose these holdings or set these weights.
 *
 * Not attached, same day: a joke post about screen time (@laserboat999). Satire is not evidence.
 */

import { EDITORIAL, publishSeed } from "../src/server/content/publish";
import type { ThesisSeed } from "../src/server/content/theses";
import type { CuratedEvidence } from "../src/server/content/curated";

const APPLY = process.argv.includes("--apply");

const SEED: ThesisSeed = {
  slug: "when-ai-borrows-at-nation-scale-cash-wins",
  title: "When AI borrows at nation scale, cash is the moat",
  claim: "When AI borrows at nation scale, cash is the moat",
  category: "Technology",
  summary:
    "Long-term US borrowing costs have jumped, and roon puts it mostly down to AI capex borrowing at nation scale. If capital gets dearer, the companies that pay for the buildout out of their own profits are best placed.",
  rationale:
    "roon reads the rise in the 10-year Treasury yield as mostly demand pressure from AI capex borrowing at nation scale, with oil and Iran a short-term driver. Our reading: when borrowing gets more expensive, a datacenter funded with debt costs more than one funded from operating cash. Microsoft, Alphabet and Amazon generate enough cash to fund most of their spending themselves, and this basket weights them by how deep that cash runs. That is our inference about who carries higher rates best, not something roon said, and he did not choose these holdings.",
  counterargument:
    "The yield move may have little to do with AI: oil, inflation and government deficits all push long rates, and roon himself names oil as a driver. Higher rates also cut the value of earnings far in the future, which is exactly what large technology stocks are priced on, so these three can fall with rising yields whatever their cash. And cash-rich companies can still choose to borrow for datacenters.",
  changeMyMind:
    "Long yields fall back while AI capex keeps rising, which would mean the link was oil or deficits rather than AI borrowing; or one of these three turns to large-scale debt to fund its buildout.",
  horizonLabel: "Review in 6 months",
  reviewDate: "2027-03-25",
  weightRationale: "The basket's existing weights, unchanged: this argument attaches to the allocation as it is.",
  constituents: [
    { symbol: "MSFTx", position: 0, weightBps: 4500, role: "Deepest cash", why: "The largest established software earnings base, so the most of its buildout it can pay for without borrowing.", limitation: "Also one of the biggest spenders, and priced on long-dated earnings that higher rates discount." },
    { symbol: "GOOGLx", position: 1, weightBps: 3500, role: "Advertising cushion", why: "Search advertising throws off cash that has little to do with the buildout, which is the cushion this claim is about.", limitation: "That same business can move on advertising news that says nothing about rates or AI." },
    { symbol: "AMZNx", position: 2, weightBps: 2000, role: "The thinnest margin", why: "Held smallest on purpose: retail margins are thin, so it is where this claim would show strain first if rates keep rising.", limitation: "Retail earnings dominate and can swamp the signal entirely." },
  ],
};

const EVIDENCE: CuratedEvidence[] = [
  {
    url: "https://x.com/tszzl/status/2103273813928759398",
    title: "roon on the 10-year yield and AI capex borrowing",
    source: "roon on X",
    publishedAt: "2026-09-25",
    relevance:
      "roon attributes the rise in long-term yields mostly to demand from AI capex borrowing, with oil a short-term driver. An interpretation from a well-placed observer, not a measurement of what drove the move.",
    kind: "primary",
    sourcePost: {
      url: "https://x.com/tszzl/status/2103273813928759398",
      author: "roon",
      handle: "@tszzl",
      text: "Iran / oil prices is a short term driver but broadly this is due to demand pressure from extremely attractive ai capex opportunities that are borrowing at nation scale",
      postedAt: "2026-09-25T00:02:08.000Z",
      verifiedAt: "2026-09-25T06:08:00.000Z",
    },
  },
  {
    url: "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve&field_tdr_date_value=2026",
    title: "Daily Treasury par yield curve rates, 2026",
    source: "U.S. Department of the Treasury",
    publishedAt: null,
    relevance:
      "The official daily yields, where the level and the move in the 10-year can be checked. It shows what rates did; it says nothing about why, which is the part this argument infers.",
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
