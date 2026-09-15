import Link from "next/link";
import { siteMode } from "@/lib/site-mode";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { FOOTER } from "./content";
import { BrandMark } from "./BrandMark";

export function ClosingCta() {
  const gated = siteMode() === "waitlist";
  return (
    <section className="ln-section ln-closing">
      <div className="ln-container ln-close">
        <h2 className="ln-h2">The next big shift<br />starts with an idea.</h2>
        <p className="ln-section-lead">Find one you believe in. Make it yours.</p>
        <Link href={gated ? "/join" : "/explore"} className="ln-btn ln-btn--ink">{gated ? "Join the waitlist" : "Explore theses"}<ArrowRight size={18} aria-hidden="true" /></Link>
      </div>
    </section>
  );
}

export function SiteFooter() {
  const gated = siteMode() === "waitlist";
  return (
    <footer className="ln-footer">
      <div className="ln-container">
        <div className="ln-footer-grid">
          <div>
            <Link href="/" className="ln-wordmark"><BrandMark />thesis</Link>
            <p className="ln-footer-note">Ideas into investments.<br />Built on Solana. Held in your wallet.</p>
            <p className="ln-footer-note ln-build-note">Early access build. Public allocation previews do not move funds. Live trading is limited to eligible, allowlisted wallets.</p>
          </div>
          <nav className="ln-footer-links" aria-label="Footer">
            {!gated && <Link href="/explore">Explore theses</Link>}
            <Link href="/join">Join the waitlist</Link>
            <Link href="/#what-you-should-know">What you should know</Link>
            {FOOTER.links.map((link) => (
              <a key={link.href} href={link.href} target="_blank" rel="noreferrer noopener">
                {link.href.includes("github") ? "GitHub" : link.href.includes("jup") ? "Jupiter" : "xStocks"}
                <ArrowUpRight size={14} aria-hidden="true" /><span className="ln-sr-only"> (opens in a new tab)</span>
              </a>
            ))}
          </nav>
        </div>
        <div className="ln-footer-bottom"><p className="ln-meta">{FOOTER.bottom}</p><p className="ln-meta">© {new Date().getFullYear()} Thesis</p></div>
      </div>
    </footer>
  );
}
