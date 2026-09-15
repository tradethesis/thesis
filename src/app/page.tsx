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
import { ClosingCta, SiteFooter } from "@/components/landing/SiteFooter";

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

export const revalidate = 60;

export default async function Home() {
  const [theses, calls] = await Promise.all([listPublishedTheses(), getCalls()]);
  return (
    <div className="landing">
      <a className="ln-skip" href="#main">
        Skip to content
      </a>
      <SiteHeader active="home" />
      <main id="main">
        <Hero />
        <section className="ln-section" id="calls"><div className="ln-container"><div className="cg-featured-head"><p className="ln-eyebrow">Open calls</p><h2 className="ln-h2">Someone has a take.<br />Make it your position.</h2><p className="ln-section-lead">Read the creator’s reasoning. Inspect the basket. Follow the call to its finish line.</p></div><CallGrid theses={theses} calls={calls} featured /></div></section>
        <HowItWorks />
        <WhatYouShouldKnow />
        <ClosingCta />
      </main>
      <SiteFooter />
    </div>
  );
}
