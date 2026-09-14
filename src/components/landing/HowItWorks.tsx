import { Check, Clock, Minus } from "lucide-react";
import { PARTIAL, STEPS } from "./content";

const LEG_ICON = {
  confirmed: Check,
  pending: Clock,
  idle: Minus,
} as const;

export function HowItWorks() {
  return (
    <section className="ln-section ln-section--tinted" id="how-it-works">
      <div className="ln-container">
        <p className="ln-eyebrow">How it works</p>
        <h2 className="ln-h2">Four steps, ending in your own wallet.</h2>

        <ol className="ln-steps">
          {STEPS.map((step) => (
            <li className="ln-step" key={step.title}>
              <h3 className="ln-h3">{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>

        <div className="ln-partial">
          <div className="ln-partial-copy">
            <h3 className="ln-h3">{PARTIAL.heading}</h3>
            {PARTIAL.body.map((paragraph) => (
              <p key={paragraph.slice(0, 24)}>{paragraph}</p>
            ))}
          </div>

          <div className="ln-legs">
            <div className="ln-legs-head">
              <p>{PARTIAL.headline}</p>
              <p className="ln-meta">{PARTIAL.subhead}</p>
            </div>
            {PARTIAL.legs.map((leg) => {
              const Icon = LEG_ICON[leg.tone];
              return (
                <div className="ln-leg" key={leg.symbol}>
                  <span className="ln-ticker">{leg.symbol}</span>
                  <span className="ln-leg-amount">{leg.amount}</span>
                  <span className={`ln-leg-state ln-leg-state--${leg.tone}`}>
                    <Icon size={15} strokeWidth={2.25} aria-hidden="true" />
                    {leg.state}
                  </span>
                </div>
              );
            })}
            <p className="ln-legs-foot">
              <strong>{PARTIAL.foot}</strong>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
