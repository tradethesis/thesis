import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { BrandMark } from "@/components/landing/BrandMark";

export function GiftHeader({ recipient = false }: { recipient?: boolean }) {
  return <header className="gift-header">
    <Link href="/" className="gift-wordmark" aria-label="Thesis home"><BrandMark />thesis<span>gifts</span></Link>
    {/* Somebody opening a gift sees their gift, not the site's navigation. */}
    {!recipient && <nav aria-label="Main navigation">
      <Link href="#packs">The packs</Link>
      <Link href="/discover" className="gift-nav-discover">Find a thesis <ArrowUpRight size={14} /></Link>
      <Link href="#make-a-gift" className="gift-button gift-button--small">Make a gift <ArrowUpRight size={15} /></Link>
    </nav>}
  </header>;
}

export function GiftFooter() {
  return <footer className="gift-footer">
    <div><Link href="/" className="gift-wordmark"><BrandMark />thesis</Link><p>A little belief goes a long way.</p></div>
    <p>Tokenized stocks track the share price and can lose value. They aren&rsquo;t the shares themselves. Availability depends on eligibility.</p>
    <div className="gift-footer-links"><Link href="/app">Terminal <ArrowUpRight size={13} /></Link><a href="https://docs.xstocks.fi/docs/product-legal-overview" target="_blank" rel="noopener noreferrer">About tokenized stocks <ArrowUpRight size={13} /></a></div>
  </footer>;
}
