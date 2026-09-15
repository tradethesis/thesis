import type { Metadata } from "next";
import "./landing.css";
import "./workshop.css";
import "./calls.css";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { Hero } from "@/components/landing/Hero";
import { CallGrid } from "@/components/calls/CallGrid";
import { listPublishedTheses } from "@/server/content/queries";
import { getCalls } from "@/server/calls/service";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { WhatYouShouldKnow } from "@/components/landing/WhatYouShouldKnow";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { ClosingCta } from "@/components/landing/SiteFooter";
import { WaitlistLanding } from "@/components/join/WaitlistLanding";
import { siteMode } from "@/lib/site-mode";
import "./join/join.css";

export const metadata: Metadata = {
  title: "Thesis — Buy what you believe.",
  description:
    "Read a claim about the world, see the three tokenized stocks that express it, change the weights, and buy the basket with USDC from your own Solana wallet.",
  openGraph: {
    title: "Thesis — Buy what you believe.",
    description:
      "A claim, three tokenized stocks with a stated job and a stated weakness, weights you can change, and the strongest argument against. Bought with USDC from your own wallet.",
    siteName: "Thesis",
    type: "website",
  },
};

/**
 * Rendered per request rather than prerendered, because SITE_MODE decides which homepage
 * this is. Baking it in at build time would let the middleware start gating the product
 * while the homepage still showed the catalogue -- the switch has to move both together.
 *
 * The cost is one uncached page. The catalogue pages stay static.
 */
export const dynamic = "force-dynamic";

export default async function Home() {
  const gated = siteMode() === "waitlist";

  // Waitlist mode: the same hero and the same working allocation preview, with the form
  // where the catalogue would be. The product is built and running on beta; this is the
  // front door while access is worked out, not a placeholder for something that does not
  // exist.
  if (gated) return <WaitlistLanding source="home" />;

  const [theses, calls] = await Promise.all([listPublishedTheses(), getCalls()]);
  return (
    <div className="landing">
      <a className="ln-skip" href="#main">
        Skip to content
      </a>
      <SiteHeader active="home" />
      <main id="main">
        <Hero />
        <section className="ln-section" id="calls"><div className="ln-container"><div className="cg-featured-head"><p className="ln-eyebrow">Open calls</p><h2 className="ln-h2">Someone had a thought.<br />We read it as a portfolio.</h2><p className="ln-section-lead">Read the argument, inspect the basket, and watch our call run to its deadline. Every basket here is written by Thesis editorial.</p></div><CallGrid theses={theses} calls={calls} featured /></div></section>
        <HowItWorks />
        <WhatYouShouldKnow />
        <ClosingCta />
      </main>
      <SiteFooter />
    </div>
  );
}
