import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { BrandMark } from "./BrandMark";

export function SiteHeader({ active }: { active?: "explore" } = {}) {
  return (
    <header className="ln-header">
      <div className="ln-container ln-header-inner">
        <Link href="/" className="ln-wordmark">
          <BrandMark />
          thesis
        </Link>
        <nav className="ln-header-nav" aria-label="Main">
          <Link href="/#how-it-works" className="ln-btn ln-btn--quiet ln-hide-sm">
            How it works
          </Link>
          <Link href="/explore" className="ln-btn ln-btn--ink" aria-current={active === "explore" ? "page" : undefined}>
            Explore theses
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </nav>
      </div>
    </header>
  );
}
