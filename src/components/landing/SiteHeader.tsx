import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="ln-header">
      <div className="ln-container ln-header-inner">
        <Link href="/" className="ln-wordmark">
          <span className="ln-mark" aria-hidden="true" />
          Thesis
        </Link>
        <nav className="ln-header-nav" aria-label="Main">
          <a href="#how-it-works" className="ln-btn ln-btn--quiet ln-hide-sm">
            How it works
          </a>
          <Link href="/explore" className="ln-btn ln-btn--secondary">
            Explore theses
          </Link>
        </nav>
      </div>
    </header>
  );
}
