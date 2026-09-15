import { StructuredData } from "@/components/seo/StructuredData";

import { JoinForm } from "./JoinForm";

/**
 * The front door: one centred column on exactly one screen.
 *
 * Used by both `/` in waitlist mode and `/join`, so the headline and the form cannot drift
 * apart. Nothing below the fold, because there is no fold — the page does not scroll.
 *
 * Three things on it: a label, the headline, the field. Everything else was removed on
 * purpose; the artwork carries the brand, so a wordmark on top of it was saying the same
 * thing twice.
 *
 * The reveal is a staggered rise, driven by a CSS custom property per element rather than
 * a nth-child chain, so reordering the column cannot silently break the rhythm. Reduced
 * motion gets the finished state with no animation at all.
 */
export function WaitlistLanding({ source }: { source: string }) {
  return (
    <div className="landing jn-page">
      {/*
        Inside this div rather than at the root of <body>, which is where it started.
        A script that is a direct child of <body> sits among the placeholder nodes
        Next uses to stream suspense boundaries, and those get reparented as chunks
        land — so hydration would intermittently find the body's children in a
        different order than it rendered them. As a descendant of a real element it
        is just an ordinary child. JSON-LD is read wherever it appears in the document.
      */}
      <StructuredData />

      <a className="ln-skip" href="#main">
        Skip to content
      </a>

      {/*
        Art direction, not a responsive resize: a phone crops the landscape cut to a narrow
        strip that throws away the forms at both edges and leaves the top half empty paper.
        The portrait cut is composed for that shape. A <picture> element rather than two
        <Image>s so the browser fetches exactly one of them.
      */}
      <picture className="jn-backdrop">
        <source media="(max-aspect-ratio: 3 / 4)" srcSet="/brand/waitlist-backdrop-portrait.webp" />
        <img src="/brand/waitlist-backdrop.webp" alt="" aria-hidden="true" fetchPriority="high" decoding="async" />
      </picture>

      <main className="ln-container jn-main" id="main">
        <p className="jn-eyebrow jn-reveal" style={{ "--d": "0ms" } as React.CSSProperties}>
          Early access
        </p>

        <h1 className="jn-h1 jn-reveal" style={{ "--d": "90ms" } as React.CSSProperties}>
          Buy what you <em>believe.</em>
        </h1>

        <div className="jn-form jn-reveal" style={{ "--d": "190ms" } as React.CSSProperties}>
          <JoinForm source={source} />
        </div>
      </main>
    </div>
  );
}
