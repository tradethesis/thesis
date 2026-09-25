import type { Metadata } from "next";
import "../landing.css";
import "../workshop.css";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { WhatYouShouldKnow } from "@/components/landing/WhatYouShouldKnow";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { ClosingCta } from "@/components/landing/SiteFooter";

export const metadata: Metadata = {
  title: "About Thesis",
  description:
    "What Thesis is, how a basket works, and what you actually own when you buy one.",
  alternates: { canonical: "/about" },
};

/**
 * Rendered per request rather than prerendered, because SITE_MODE decides which homepage
 * this is. Baking it in at build time would let the middleware start gating the product
 * while the homepage still showed the catalogue -- the switch has to move both together.
 *
 * The cost is one uncached page. The catalogue pages stay static.
 */
export const dynamic = "force-dynamic";

export default function Home() {

  // Waitlist mode: the same hero and the same working allocation preview, with the form
  // where the catalogue would be. The product is built and running on beta; this is the
  // front door while access is worked out, not a placeholder for something that does not
  // exist.

  return (
    <div className="landing">
      <a className="ln-skip" href="#main">
        Skip to content
      </a>
      <SiteHeader active="home" />
      <main id="main">
        <Hero />
        <HowItWorks />
        <WhatYouShouldKnow />
        <ClosingCta />
      </main>
      <SiteFooter />
    </div>
  );
}
