import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HERO } from "./content";

export function Hero() {
  return (
    <section className="ln-hero">
      <div className="ln-container">
        <p className="ln-hero-kicker">{HERO.kicker}</p>
        <h1 className="ln-h1">{HERO.title}</h1>
        <p className="ln-hero-lead">{HERO.lead}</p>

        <div className="ln-cta-row">
          <Link href="/explore" className="ln-btn ln-btn--primary">
            Explore theses
            <ArrowRight className="ln-arrow" size={18} strokeWidth={2} aria-hidden="true" />
          </Link>
          <a href="#how-it-works" className="ln-btn ln-btn--secondary">
            How it works
          </a>
        </div>

        <dl className="ln-facts">
          {HERO.facts.map((fact) => (
            <div className="ln-fact" key={fact.term}>
              <dt>{fact.term}</dt>
              <dd>{fact.detail}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
