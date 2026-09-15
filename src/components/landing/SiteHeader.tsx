import Link from "next/link";
import { siteMode } from "@/lib/site-mode";
import { ArrowUpRight } from "lucide-react";
import { BrandMark } from "./BrandMark";

export function SiteHeader({ active }: { active?: "home" | "explore" | "thesis" | "join" } = {}) {
  // In waitlist mode the catalogue routes redirect, so linking to them would only bounce
  // a visitor back here.
  const gated = siteMode() === "waitlist";
  return (
    <header className="ln-header">
      <div className="ln-container ln-header-inner">
        <Link href="/" className="ln-wordmark">
          <BrandMark />
          thesis
        </Link>
        <nav className="ln-header-nav" aria-label="Main">
          <div className="ln-nav-tabs">
          <Link href="/" aria-current={active === "home" ? "page" : undefined}>Overview</Link>
          {!gated && <Link href="/explore" aria-current={active === "explore" ? "page" : undefined}>Calls</Link>}
          <Link href="/#how-it-works" className="ln-hide-sm">
            How it works
          </Link>
          <Link href="/join" aria-current={active === "join" ? "page" : undefined}>Join</Link>
          </div>
        </nav>
          <Link
            href={gated ? "/join" : "/explore"}
            className="ln-btn ln-btn--ink"
            aria-current={active === (gated ? "join" : "explore") ? "page" : undefined}
          >
            {gated ? "Join" : "Explore"}
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
      </div>
    </header>
  );
}
