import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Check, SlidersHorizontal } from "lucide-react";
import { EXAMPLE_HOLDINGS } from "./content";
import { AllocationPreview } from "./AllocationPreview";

/**
 * `gated` is the waitlist front door: the artwork and the working allocation preview stay,
 * because showing the product is more persuasive than describing it, but nothing links into
 * a route that would only redirect back here.
 */
export function Hero({ gated = false }: { gated?: boolean } = {}) {
  return (
    <section className="ws-hero">
      <div className="ln-container ws-intro">
        <p className="ln-hero-kicker"><span aria-hidden="true" /> Real takes. Real exposure. A finish line.</p>
        <h1>Buy what<br className="ws-mobile-break" /> you <span>believe.</span></h1>
        <p className="ws-lead">Ideas people are already arguing about, read as investments.<br className="ln-hide-sm" /> Buy the basket. Follow the call.</p>
        <div className="ln-cta-row">
          {gated
            ? <Link href="/join" className="ln-btn ln-btn--primary">Join the waitlist <ArrowRight size={17} aria-hidden="true" /></Link>
            : <Link href="/explore" className="ln-btn ln-btn--primary">Find your thesis <ArrowRight size={17} aria-hidden="true" /></Link>}
          <a href="#allocation-preview" className="ln-text-link">Try a basket <SlidersHorizontal size={15} aria-hidden="true" /></a>
        </div>
        <p className="ln-hero-note">{gated ? "Not open yet. Move the sliders below to see how it works." : "Explore freely. No wallet needed."}</p>
      </div>
      <div className="ws-stage">
        <div className="ws-artwork" aria-hidden="true">
          <Image src="/brand/conviction-workshop.webp" alt="" width={1536} height={656} priority sizes="(max-width: 760px) 880px, 1440px" />
        </div>
        <div className="ln-preview ws-basket" id="allocation-preview">
          <div className="ws-basket-label"><span>One idea. Three holdings.</span><SlidersHorizontal size={14} aria-hidden="true" /></div>
          <div className="ln-preview-title"><p className="ln-meta">Financial infrastructure</p><h2>Financial activity<br />moves onchain.</h2></div>
          <AllocationPreview holdings={EXAMPLE_HOLDINGS} compact />
          {gated
            ? <Link href="/join" className="ln-preview-link">Get in when this opens <ArrowRight size={17} aria-hidden="true" /></Link>
            : <Link href="/t/financial-activity-moves-onchain" className="ln-preview-link">Read the argument <ArrowRight size={17} aria-hidden="true" /></Link>}
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
