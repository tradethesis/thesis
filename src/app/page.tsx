import type { Metadata } from "next";
import "./landing.css";
import "./workshop.css";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { Hero } from "@/components/landing/Hero";
import { WorkedExample } from "@/components/landing/WorkedExample";
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

export default function Home() {
  return (
    <div className="landing">
      <a className="ln-skip" href="#main">
        Skip to content
      </a>
      <SiteHeader active="home" />
      <main id="main">
        <Hero />
        <WorkedExample />
        <HowItWorks />
        <WhatYouShouldKnow />
        <ClosingCta />
      </main>
      <SiteFooter />
    </div>
  );
}
