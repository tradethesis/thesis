import type { Metadata } from "next";
import Link from "next/link";
import "../landing.css";
import "./explore.css";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { ThesisArtwork } from "@/components/landing/ThesisArtwork";
import { listPublishedTheses } from "@/server/content/queries";
import { bpsToPercentLabel } from "@/lib/money/allocate";

export const metadata: Metadata = {
  title: "Explore — Thesis",
  description: "Three claims about the world, and the tokenized stocks that express each one.",
};

// The catalogue changes when an editor publishes, not per request.
export const revalidate = 60;

export default async function ExplorePage() {
  const theses = await listPublishedTheses();

  return (
    <div className="landing">
      <a className="ln-skip" href="#main">
        Skip to content
      </a>
      <SiteHeader />

      <main id="main">
        <section className="ln-container ex-head">
          <p className="ln-eyebrow">The catalogue</p>
          <h1 className="ln-h2 ex-question">What do you believe happens next?</h1>
          <p className="ex-sub">
            Each of these is a claim about the world, written out in full, with the businesses that express it and the
            strongest argument that it is wrong. Read one before you decide whether you agree.
          </p>
        </section>

        {theses.length === 0 ? (
          <div className="ln-container">
            <div className="ex-empty">
              <p>Nothing published yet.</p>
            </div>
          </div>
        ) : (
          <div className="ln-container ex-list">
            {theses.map((t) => (
              <article className="ex-item" key={t.slug}>
                <ThesisArtwork category={t.category} className="ex-art" />

                <div className="ex-main">
                  <p className="ex-meta">
                    <span>{t.category}</span>
                    <span className="ex-dot" aria-hidden="true">
                      ·
                    </span>
                    <span>{t.horizonLabel}</span>
                    <span className="ex-dot" aria-hidden="true">
                      ·
                    </span>
                    <span>{t.authorName}</span>
                  </p>

                  <h2 className="ex-claim">
                    <Link href={`/t/${t.slug}`}>{t.claim}</Link>
                  </h2>
                  <p className="ex-summary">{t.summary}</p>

                  <p className="ex-sources">
                    <span className="ex-chip">
                      <strong>{t.supportingCount}</strong> sources for
                    </span>
                    <span className="ex-chip ex-chip--against">
                      <strong>{t.againstCount}</strong> against
                    </span>
                  </p>
                </div>

                <div className="ex-holdings">
                  {t.holdings.map((h, i) => (
                    <div className={`ex-holding ln-asset-tone-${i}`} key={h.symbol}>
                      <span className="ln-stock-initial" aria-hidden="true">
                        {h.company.charAt(0)}
                      </span>
                      <span className="ex-hold-text">
                        <span className="ln-ticker">{h.symbol}</span>
                        <span className="ex-hold-role">{h.role}</span>
                      </span>
                      <span className="ex-weight">{bpsToPercentLabel(h.weightBps)}</span>
                    </div>
                  ))}
                  <span className="ex-open" aria-hidden="true">
                    Explore thesis →
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}

        <p className="ln-container ex-note">
          No wallet is needed to read any of this. There are no returns anywhere on this page, because none of these
          have a track record yet — tracking begins at publication. Every source is linked in full on the thesis
          itself, including the ones that argue against it.
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
