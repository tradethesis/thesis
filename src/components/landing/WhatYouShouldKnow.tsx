import { ArrowUpRight } from "lucide-react";
import { DISCLOSURES } from "./content";

export function WhatYouShouldKnow() {
  return (
    <section className="ln-section" id="what-you-should-know" aria-labelledby="know-heading">
      <div className="ln-container ln-know-grid">
        <div>
          <h2 className="ln-h2" id="know-heading">A little clarity<br />before you commit.</h2>
          <p className="ln-section-lead">What you own, what it costs, and where it works. The practical details, in plain language.</p>
        </div>
        <ul className="ln-know">
          {DISCLOSURES.map((item) => (
            <li key={item.title}>
              <details className="ln-know-item">
                <summary>{item.title}<span aria-hidden="true">+</span></summary>
                <p>{item.body}</p>
                {item.link && <p><a href={item.link.href} target="_blank" rel="noreferrer noopener">{item.link.label}<ArrowUpRight size={14} aria-hidden="true" /><span className="ln-sr-only"> (opens in a new tab)</span></a></p>}
              </details>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
