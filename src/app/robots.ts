import type { MetadataRoute } from "next";

import { canonical, isIndexable } from "@/lib/seo";
import { GATED_PREFIXES, siteMode } from "@/lib/site-mode";

/**
 * Evaluated per request, not at build time, so a deployment promoted between
 * environments cannot serve the wrong answer from a baked file.
 */
export const dynamic = "force-dynamic";

/**
 * Answer-engine crawlers, named in one group rather than left to the wildcard.
 *
 * They get exactly the same rules as everyone else, so this unlocks nothing on its own —
 * a crawler with no group of its own already falls back to `*`. It is here to make the
 * decision explicit, because two of these are opt-out tokens rather than crawlers:
 * Google-Extended and Applebot-Extended control whether the content may be used for AI
 * grounding, and the difference between "we chose to allow that" and "nobody thought
 * about it" is invisible unless it is written down.
 *
 * One group with many User-Agent lines, not one group each: the rules are identical, and
 * fifteen copies of the same five lines is fifteen chances for them to drift apart.
 */
const ANSWER_ENGINES = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "cohere-ai",
  "meta-externalagent",
];

export default function robots(): MetadataRoute.Robots {
  // Beta runs the same code on a different host. Nothing there should ever be indexed:
  // it is the same copy as production, so it would be duplicate content, and it exposes
  // surfaces that are deliberately closed on the public site.
  if (!isIndexable()) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  // Routes the middleware redirects away from while the site is gated. They would resolve
  // to /join anyway; saying so up front keeps them out of the index and out of the crawl
  // budget, and avoids a pile of indexed redirects to unwind when the gate comes down.
  const closed = siteMode() === "waitlist" ? [...GATED_PREFIXES] : [];

  const allow = ["/"];
  const disallow = ["/api/", ...closed];

  return {
    rules: [
      { userAgent: "*", allow, disallow },
      { userAgent: ANSWER_ENGINES, allow, disallow },
    ],
    sitemap: canonical("/sitemap.xml"),
    host: canonical("/"),
  };
}
