import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AllocationPreview } from "./AllocationPreview";
import { EXAMPLE_THESIS } from "./content";

const t = EXAMPLE_THESIS;

export function WorkedExample() {
  return (
    <section className="ln-section" id="example">
      <div className="ln-container">
        <div className="ln-example-head">
          <p className="ln-eyebrow">A thesis in full</p>
          <h2 className="ln-h2">One claim, three holdings, and the case against it.</h2>
          <p className="ln-section-lead">
            Every thesis has the same shape. A claim about the world. Three tokenized stocks that
            express it, each with a job and a weakness. Weights you can change. And the strongest
            argument that the whole idea is wrong, written by the author, kept next to the position.
          </p>
        </div>

        <article className="ln-thesis">
          <div className="ln-thesis-band">
            <span>{t.version}</span>
            <span aria-hidden="true">·</span>
            <span>{t.category}</span>
            <span aria-hidden="true">·</span>
            <span>{t.horizon}</span>
            <span aria-hidden="true">·</span>
            <span>By {t.author}</span>
          </div>

          <div className="ln-thesis-body">
            <h3 className="ln-claim">{t.title}</h3>
            <p className="ln-claim-summary">{t.summary}</p>

            <div className="ln-block">
              <p className="ln-block-label">Three holdings</p>
              <ul className="ln-holdings">
                {t.holdings.map((holding) => (
                  <li className="ln-holding" key={holding.symbol}>
                    <div className="ln-holding-head">
                      <span className="ln-ticker">{holding.symbol}</span>
                      <span className="ln-company">
                        {holding.company} · {holding.underlying}
                      </span>
                      <span className="ln-role">{holding.role}</span>
                    </div>
                    <p className="ln-holding-why">{holding.why}</p>
                    <p className="ln-limit">
                      <strong>Limitation.</strong> {holding.limitation}
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="ln-block">
              <p className="ln-block-label">Your weights</p>
              <p className="ln-holding-why">{t.weightRationale}</p>
              <AllocationPreview holdings={t.holdings} />
            </div>

            <div className="ln-block">
              <p className="ln-block-label">The argument</p>
              <div className="ln-argument">
                <div>
                  <h4>{t.counterargument.heading}</h4>
                  <p>{t.counterargument.body}</p>
                </div>
                <div>
                  <h4>{t.changeMyMind.heading}</h4>
                  <p>{t.changeMyMind.body}</p>
                </div>
              </div>
              <div className="ln-track">
                <p>
                  <strong>Tracking begins at publication.</strong> {t.trackingNote}
                </p>
              </div>
              <div className="ln-track">
                <p>
                  <strong>Evidence.</strong> {t.evidenceNote}
                </p>
              </div>
            </div>
          </div>
        </article>

        <div className="ln-example-note">
          <Link href="/explore" className="ln-btn ln-btn--secondary">
            Read the full thesis
            <ArrowRight className="ln-arrow" size={18} strokeWidth={2} aria-hidden="true" />
          </Link>
          <span className="ln-meta">
            Weights above are a preview. Nothing on this page connects to a wallet or asks for a
            signature.
          </span>
        </div>
      </div>
    </section>
  );
}
