import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { EXAMPLE_THESIS } from "./content";

const t = EXAMPLE_THESIS;

export function WorkedExample() {
  return (
    <section className="ln-section" id="example" aria-labelledby="example-heading">
      <div className="ln-container ln-example-grid">
        <div className="ln-example-intro">
          <p className="ln-eyebrow">An idea, made investable</p>
          <h2 className="ln-h2" id="example-heading">Don’t just follow<br />a ticker.<br /><span>Follow a thesis.</span></h2>
          <p className="ln-section-lead">An exchange. A digital dollar. A brokerage. Different businesses, connected by one belief about the future of finance.</p>
          <Link href="/t/financial-activity-moves-onchain" className="ln-text-link">Explore this thesis <ArrowRight size={17} aria-hidden="true" /></Link>
        </div>
        <div className="ln-example-research">
          <div className="ln-research-heading"><span className="ln-meta">The belief</span><span className="ln-meta">{t.version}</span></div>
          <h3 className="ln-claim">{t.title}.</h3>
          <ul className="ln-holdings">
            {t.holdings.map((holding, i) => (
              <li className="ln-holding" key={holding.symbol}>
                <span className={"ln-stock-initial ln-asset-tone-" + i} aria-hidden="true">{holding.company[0]}</span>
                <div className="ln-holding-content">
                  <div className="ln-holding-head"><h4>{holding.company}</h4><span className="ln-ticker">{holding.symbol}</span></div>
                  <p className="ln-role">{holding.role}</p>
                  <details className="ln-holding-details">
                    <summary>Why it belongs <span aria-hidden="true">+</span></summary>
                    <p>{holding.why}</p>
                    <p className="ln-limit"><strong>The tradeoff.</strong> {holding.limitation}</p>
                  </details>
                </div>
                <span className="ln-weight">{holding.weight}%</span>
              </li>
            ))}
          </ul>
          <div className="ln-counterpoint">
            <span className="ln-counterpoint-symbol" aria-hidden="true">↔</span>
            <div><h4>Every conviction needs a counterargument.</h4><p>The shift can happen without these companies winning. Each thesis includes the strongest case against it, before you invest.</p></div>
          </div>
        </div>
      </div>
    </section>
  );
}
