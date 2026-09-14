import { ArrowUpRight } from "lucide-react";
import { DISCLOSURES } from "./content";

export function WhatYouShouldKnow() {
  return (
    <section className="ln-section" id="what-you-should-know">
      <div className="ln-container">
        <p className="ln-eyebrow">What you should know</p>
        <h2 className="ln-h2">The parts that are easy to leave out.</h2>
        <p className="ln-section-lead">
          Tokenized stocks carry real constraints, and some of them are unusual. They belong here,
          before you connect anything, rather than in a footnote after you have bought.
        </p>

        <ul className="ln-know">
          {DISCLOSURES.map((item) => (
            <li className="ln-know-item" key={item.title}>
              <h3 className="ln-h3">{item.title}</h3>
              <p>{item.body}</p>
              {item.link ? (
                <p>
                  <a href={item.link.href} target="_blank" rel="noreferrer noopener">
                    {item.link.label}
                    <ArrowUpRight size={14} strokeWidth={2.25} aria-hidden="true" />
                    <span className="ln-sr-only"> (opens in a new tab)</span>
                  </a>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
