import type { Metadata } from "next";
import Link from "next/link";
import "../landing.css";
import "./explore.css";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { listPublishedTheses } from "@/server/content/queries";
import { bpsToPercentLabel } from "@/lib/money/allocate";

export const metadata: Metadata = {
  title: "Explore — Thesis",
  description: "Three claims about the world, and the tokenized stocks that express each one.",
};

// The catalogue is small and changes when an editor publishes, not per request.
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
          <h1 className="ex-question">What do you believe happens next?</h1>
          <p className="ex-sub">
            Each of these is a claim about the world, written out in full, with the three tokenized stocks that
            express it and the strongest argument that it is wrong. Read one before you decide whether you agree.
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
              <article className="ex-card" key={t.slug}>
                <div className="ex-card-meta">
                  <span>{t.category}</span>
                  <span aria-hidden="true">·</span>
                  <span>{t.horizonLabel}</span>
                </div>

                <div className="ex-card-body">
                  <h2 className="ex-claim">
                    <Link href={`/t/${t.slug}`}>{t.claim}</Link>
                  </h2>
                  <p className="ex-summary">{t.summary}</p>

                  <ul className="ex-holdings">
                    {t.holdings.map((h) => (
                      <li className="ex-holding" key={h.symbol}>
                        <span className="ex-ticker">{h.symbol}</span>
                        <span className="ex-company">{h.company}</span>
                        <span className="ex-role">{h.role}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="ex-foot">
                    <span className="ex-open" aria-hidden="true">
                      Explore thesis →
                    </span>
                    <span className="ex-weights">
                      {t.holdings.map((h) => bpsToPercentLabel(h.weightBps)).join(" / ")}
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        <p className="ln-container ex-note">
          By {theses[0]?.authorName ?? "Thesis editorial"}. No wallet is needed to read any of this. There are no
          returns shown anywhere on this page, because none of these have a track record yet — tracking begins at
          publication.
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
