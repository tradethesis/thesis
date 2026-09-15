import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Check, SlidersHorizontal } from "lucide-react";
import { EXAMPLE_HOLDINGS } from "./content";
import { AllocationPreview } from "./AllocationPreview";

export function Hero() {
  return (
    <section className="ws-hero">
      <div className="ln-container ws-intro">
        <p className="ln-hero-kicker"><span aria-hidden="true" /> A world of ideas. A basket of stocks.</p>
        <h1>Buy what<br className="ws-mobile-break" /> you <span>believe.</span></h1>
        <p className="ws-lead">The future doesn’t come with a ticker.<br className="ln-hide-sm" /> Find an idea you believe in. Own the businesses behind it.</p>
        <div className="ln-cta-row">
          <Link href="/explore" className="ln-btn ln-btn--primary">Find your thesis <ArrowRight size={17} aria-hidden="true" /></Link>
          <a href="#allocation-preview" className="ln-text-link">Try a basket <SlidersHorizontal size={15} aria-hidden="true" /></a>
        </div>
        <p className="ln-hero-note">Explore freely. No wallet needed.</p>
      </div>
      <div className="ws-stage">
        <div className="ws-artwork" aria-hidden="true">
          <Image src="/brand/conviction-workshop.webp" alt="" width={1536} height={656} priority sizes="(max-width: 760px) 880px, 1440px" />
        </div>
        <div className="ln-preview ws-basket" id="allocation-preview">
          <div className="ws-basket-label"><span>One idea. Three holdings.</span><SlidersHorizontal size={14} aria-hidden="true" /></div>
          <div className="ln-preview-title"><p className="ln-meta">Financial infrastructure</p><h2>Financial activity<br />moves onchain.</h2></div>
          <AllocationPreview holdings={EXAMPLE_HOLDINGS} compact />
          <Link href="/t/financial-activity-moves-onchain" className="ln-preview-link">Read the argument <ArrowRight size={17} aria-hidden="true" /></Link>
        </div>
      </div>
      <div className="ln-container">
        <ul className="ln-facts" aria-label="About Thesis">
          <li><Check size={17} aria-hidden="true" /> Tokenized stocks on Solana</li>
          <li><Check size={17} aria-hidden="true" /> Your weights. Your wallet.</li>
          <li><Check size={17} aria-hidden="true" /> No added Thesis fee</li>
        </ul>
      </div>
    </section>
  );
}
