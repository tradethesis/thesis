import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { EXAMPLE_HOLDINGS } from "./content";
import { AllocationPreview } from "./AllocationPreview";
import { ThesisArtwork } from "./ThesisArtwork";

export function Hero() {
  return (
    <section className="ln-hero">
      <div className="ln-container">
        <div className="ln-hero-grid">
        <div className="ln-hero-copy">
        <p className="ln-hero-kicker"><span aria-hidden="true" /> Ideas into investments</p>
        <h1 className="ln-h1">Buy what<br />you <span>believe.</span></h1>
        <p className="ln-hero-lead">You see where the world is going. Turn that conviction into a basket of stocks, with a reason behind every holding.</p>
        <div className="ln-cta-row">
          <Link href="/explore" className="ln-btn ln-btn--primary">
            Find your thesis
            <ArrowRight className="ln-arrow" size={18} strokeWidth={2} aria-hidden="true" />
          </Link>
          <a href="#example" className="ln-text-link">
            See an example <span aria-hidden="true">↗</span>
          </a>
        </div>
        <p className="ln-hero-note">Explore freely. No wallet needed.</p>
        </div>
        <div className="ln-preview">
          <div className="ln-preview-cover"><ThesisArtwork category="Finance" /><span className="ln-preview-label">Try a basket</span></div>
          <div className="ln-preview-title"><p className="ln-meta">Financial infrastructure</p><h2>Financial activity<br />moves onchain.</h2><p>Three businesses. Three ways to express one idea.</p></div>
          <AllocationPreview holdings={EXAMPLE_HOLDINGS} compact />
          <Link href="/t/financial-activity-moves-onchain" className="ln-preview-link">Read the argument <ArrowRight size={17} aria-hidden="true" /></Link>
        </div>
        </div>
        <ul className="ln-facts" aria-label="About Thesis">
          <li><Check size={17} aria-hidden="true" /> Tokenized stocks on Solana</li>
          <li><Check size={17} aria-hidden="true" /> Your weights. Your wallet.</li>
          <li><Check size={17} aria-hidden="true" /> No added Thesis fee</li>
        </ul>
      </div>
    </section>
  );
}
