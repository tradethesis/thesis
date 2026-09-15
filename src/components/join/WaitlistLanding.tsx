import Image from "next/image";
import Link from "next/link";
import { BrandMark } from "@/components/landing/BrandMark";
import { JoinForm } from "./JoinForm";

/**
 * The front door, used by both `/` in waitlist mode and `/join`.
 *
 * One component rather than two pages that look alike, so the headline and the form cannot
 * drift apart. No nav into the catalogue, no footer links, nothing to read past: a
 * headline, a field, a button, and the artwork.
 */
export function WaitlistLanding({ source }: { source: string }) {
  return (
    <div className="landing jn-page">
      <a className="ln-skip" href="#main">
        Skip to content
      </a>
      {/* The wordmark alone. A nav here would only offer the page you are already on. */}
      <header className="ln-header jn-header">
        <div className="ln-container">
          <Link href="/" className="ln-wordmark">
            <BrandMark />
            thesis
          </Link>
        </div>
      </header>

      <main className="ln-container jn-main" id="main">
        <p className="jn-eyebrow">Early access</p>
        <h1 className="jn-h1">
          Buy what you <em>believe.</em>
        </h1>
        <p className="jn-sub">
          Ideas people are already arguing about, read as investments. Buying opens to more wallets soon.
        </p>
        <JoinForm source={source} />
        <p className="jn-note">One email when it opens. Nothing else, ever.</p>
      </main>

      <div className="jn-art" aria-hidden="true">
        <Image
          src="/brand/conviction-workshop.webp"
          alt=""
          width={1536}
          height={656}
          priority
          sizes="(max-width: 760px) 136vw, 100vw"
        />
      </div>
    </div>
  );
}
