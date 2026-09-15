import type { Metadata } from "next";
import "./landing.css";
import "./workshop.css";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { WhatYouShouldKnow } from "@/components/landing/WhatYouShouldKnow";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { ClosingCta } from "@/components/landing/SiteFooter";
import { WaitlistLanding } from "@/components/join/WaitlistLanding";
import { siteMode } from "@/lib/site-mode";
import "./join/join.css";

export const metadata: Metadata = {
  // The default title, not the "%s — Thesis" template: this is the front door and its
  // title is the whole name.
  title: { absolute: "Thesis — Buy what you believe." },
  description:
    "Read a claim about the world, see the three tokenized stocks that express it, change the weights, and buy the basket with USDC from your own Solana wallet.",
  alternates: { canonical: "/" },
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
  const gated = siteMode() === "waitlist";

  // Waitlist mode: the same hero and the same working allocation preview, with the form
  // where the catalogue would be. The product is built and running on beta; this is the
  // front door while access is worked out, not a placeholder for something that does not
  // exist.
  if (gated) return <WaitlistLanding source="home" />;

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
