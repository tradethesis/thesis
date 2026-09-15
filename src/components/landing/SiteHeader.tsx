import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { BrandMark } from "./BrandMark";

export function SiteHeader({ active }: { active?: "home" | "explore" | "thesis" | "join" } = {}) {
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
          <Link href="/explore" aria-current={active === "explore" ? "page" : undefined}>Calls</Link>
          <Link href="/#how-it-works" className="ln-hide-sm">
            How it works
          </Link>
          <Link href="/join" aria-current={active === "join" ? "page" : undefined}>Join</Link>
          </div>
        </nav>
          <Link href="/explore" className="ln-btn ln-btn--ink" aria-current={active === "explore" ? "page" : undefined}>
            Explore
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
      </div>
    </header>
  );
}
