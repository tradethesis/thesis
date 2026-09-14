import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { FOOTER } from "./content";

export function ClosingCta() {
  return (
    <section className="ln-section ln-section--tinted">
      <div className="ln-container ln-close">
        <h2 className="ln-h2">Buy what you believe.</h2>
        <p className="ln-section-lead">
          Read a thesis, disagree with the weights, and decide whether you want to own the idea.
        </p>
        <Link href="/explore" className="ln-btn ln-btn--primary">
          Explore theses
          <ArrowRight className="ln-arrow" size={18} strokeWidth={2} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="ln-footer">
      <div className="ln-container">
        <div className="ln-footer-grid">
          <div>
            <p className="ln-wordmark">
              <span className="ln-mark" aria-hidden="true" />
              Thesis
            </p>
            {FOOTER.notes.map((note) => (
              <p className="ln-footer-note" key={note.slice(0, 24)}>
                {note}
              </p>
            ))}
          </div>

          <nav className="ln-footer-links" aria-label="Footer">
            {FOOTER.links.map((link) => (
              <a key={link.href} href={link.href} target="_blank" rel="noreferrer noopener">
                {link.label}
                <ArrowUpRight size={14} strokeWidth={2.25} aria-hidden="true" />
                <span className="ln-sr-only"> (opens in a new tab)</span>
              </a>
            ))}
            <Link href="/explore">Explore theses</Link>
            <a href="#what-you-should-know">What you should know</a>
          </nav>
        </div>

        <div className="ln-footer-bottom">
          <p className="ln-meta">{FOOTER.bottom}</p>
          <p className="ln-meta">Solana mainnet · USDC · routed by Jupiter</p>
        </div>
      </div>
    </footer>
  );
}
