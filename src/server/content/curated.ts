import type { ThesisSeed } from "./theses";
import type { EvidenceLink } from "./evidence";
import type { SourcePost } from "@/lib/source-post";

export type CuratedEvidence = EvidenceLink & { sourcePost?: SourcePost };

// Original post verified against the FxTwitter public mirror at 2026-09-15T08:45:14Z:
// author @naval, posted 2026-09-13T04:14:57Z, text byte-identical apart from a trailing
// space before the line break. Re-check with `pnpm tsx scripts/verify-source-posts.ts`.
// The post author is the source of the question, never the author of this portfolio.
export const CURATED_THESES: ThesisSeed[] = [{
  slug: "ai-liability-favors-big-cloud",
  title: "When AI gets sued, big cloud wins",
  claim: "When AI gets sued, big cloud wins",
  category: "Technology",
  summary: "The next AI moat might be a legal department. Companies worried about liability could buy from the vendors big enough to stand behind their products.",
  rationale: "Naval asks who is liable when AI causes harm. Our interpretation: that uncertainty could push enterprise buyers toward Microsoft, Google and Amazon. Microsoft and Google have already offered conditional protection against some copyright claims; AWS sells tools to filter harmful model outputs. These are different responses to risk, not blanket protection against AI harm. The investment bet is that procurement favors established vendors and their paid platforms. That is an inference about future demand, not something Naval said or the sources prove.",
  counterargument: "The companies with the deepest pockets may become the biggest targets. Paying for claims and safeguards can cost more than the customers they attract. Copyright protection does not answer Naval's question about injury or death. And buying three huge companies is an imprecise way to trade one issue: advertising, retail, capital spending and valuation could overwhelm any benefit from enterprise trust.",
  changeMyMind: "At the next two quarterly earnings reviews, look for evidence that customers choose smaller AI vendors despite liability concerns, or that legal and safety costs outgrow the revenue attributed to enterprise AI. If neither side provides measurable evidence, keep the causal thesis unproven even if this basket beats the market.",
  horizonLabel: "Review in 6 months",
  reviewDate: "2027-03-15",
  weightRationale: "Near-equal weights avoid pretending we know which vendor captures the demand. Microsoft's extra percentage point is a rounding choice, not a stronger forecast.",
  constituents: [
    { symbol: "MSFTx", position: 0, weightBps: 3400, role: "Enterprise trust", why: "Microsoft has explicitly offered conditional copyright protection for eligible commercial AI customers. The bet is that established procurement relationships help turn that reassurance into paid adoption.", limitation: "The commitment covers specified IP claims under conditions, not every form of AI harm. Liability costs and heavy infrastructure spending could outweigh additional demand." },
    { symbol: "GOOGLx", position: 1, weightBps: 3300, role: "Model + platform", why: "Google has offered protection covering training-data and generated-output IP claims for specified services. Owning models and the cloud platform gives it more than one place to sell enterprise AI.", limitation: "The protection is conditional and limited. Search advertising dominates the parent company's economics, so this token is a broad, indirect expression of enterprise AI trust." },
    { symbol: "AMZNx", position: 2, weightBps: 3300, role: "Risk controls", why: "Amazon Bedrock offers configurable guardrails for model inputs and outputs. The bet is that enterprises buy managed controls through an existing AWS relationship rather than assemble everything themselves.", limitation: "Guardrails reduce certain risks; they do not guarantee safe outputs or transfer all liability. Retail and the rest of AWS can move this holding independently of the thesis." },
  ],
}];

export const CURATED_EVIDENCE: Record<string, CuratedEvidence[]> = {
  "ai-liability-favors-big-cloud": [
    { url: "https://x.com/naval/status/2098988781592547683", title: "Naval asks who is liable for AI harm", source: "Naval on X", publishedAt: "2026-09-13", relevance: "The question that inspired this basket. Naval does not name these stocks, recommend this allocation, or make our timed prediction.", kind: "primary",
      sourcePost: { url: "https://x.com/naval/status/2098988781592547683", author: "Naval", handle: "@naval", text: "On the way to killing all of us, AI will likely kill some of us.\n\nIn that case, who’s liable?", postedAt: "2026-09-13T04:14:57.000Z", verifiedAt: "2026-09-15T08:45:14.000Z" } },
    { url: "https://blogs.microsoft.com/on-the-issues/2023/09/07/copilot-copyright-commitment-ai-legal-concerns/", title: "Microsoft’s Customer Copyright Commitment", source: "Microsoft", publishedAt: "2023-09-07", relevance: "Microsoft announced conditional copyright protection for commercial AI customers, later expanding it to Azure OpenAI. This establishes a concrete response to buyer concerns; it does not demonstrate an effect on revenue or cover all AI harm.", kind: "primary" },
    { url: "https://cloud.google.com/blog/products/ai-machine-learning/protecting-customers-with-generative-ai-indemnification", title: "Protecting customers with generative AI indemnification", source: "Google Cloud", publishedAt: "2023-10-13", relevance: "Google describes training-data and generated-output IP protections with conditions. Evidence that enterprise risk is part of its product proposition, not evidence that this stock will outperform.", kind: "primary" },
    { url: "https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails.html", title: "Amazon Bedrock Guardrails", source: "AWS documentation", publishedAt: null, relevance: "AWS documents configurable filters and controls for model inputs and outputs. This supports the managed-controls role in the basket, not an assumption that AWS absorbs every liability.", kind: "primary" },
    { url: "https://www.microsoft.com/licensing/terms/product/ForOnlineServices/OVOVS", title: "Microsoft online services terms: limits of copyright protection", source: "Microsoft Product Terms", publishedAt: null, relevance: "The protection is conditional on safeguards, rights to inputs and other requirements, with excluded claims. These limits challenge the leap from copyright indemnity to protection against the kinds of harm in Naval's question.", kind: "primary", supportsCounterargument: true },
  ],
};
