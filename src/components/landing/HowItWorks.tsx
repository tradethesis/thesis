import { Check, Clock, Minus } from "lucide-react";
import { PARTIAL } from "./content";

const steps = [
  { title: "Find your conviction.", body: "Read the argument, explore the businesses behind it, and decide whether you believe it too." },
  { title: "Make the basket yours.", body: "Start with the author’s weights. Change the allocation to reflect your own point of view." },
  { title: "Own it on your terms.", body: "Review the costs and approve each purchase. The stock tokens go straight to your wallet." },
];
const LEG_ICON = { confirmed: Check, pending: Clock, idle: Minus } as const;

export function HowItWorks() {
  return (
    <section className="ln-section ln-section--tinted" id="how-it-works" aria-labelledby="how-heading">
      <div className="ln-container">
        <div className="ln-section-heading"><h2 className="ln-h2" id="how-heading">From “I believe”<br />to “I own.”</h2><p className="ln-section-lead">An idea you understand.<br />An allocation you choose.</p></div>
        <ol className="ln-steps">
          {steps.map((step, i) => <li className="ln-step" key={step.title}><span className="ln-step-number" aria-hidden="true">0{i + 1}</span><h3>{step.title}</h3><p>{step.body}</p></li>)}
        </ol>
        <details className="ln-execution-details">
          <summary>What happens if only part of my basket is purchased?<span aria-hidden="true">+</span></summary>
          <div className="ln-partial">
            <div className="ln-partial-copy"><h3 className="ln-h3">Three purchases, each in your control.</h3><p>If you stop after the first purchase, you keep it. Unspent USDC stays in your wallet. You can review what happened before deciding whether to continue.</p><p>A pending transaction is checked before a replacement is offered, so a delay does not become a duplicate purchase.</p></div>
            <div className="ln-legs" aria-label="Illustrative partial purchase">
              <div className="ln-legs-head"><span className="ln-meta">Illustrative purchase</span><h4>{PARTIAL.headline}</h4></div>
              {PARTIAL.legs.map(leg => { const Icon = LEG_ICON[leg.tone]; return <div className="ln-leg" key={leg.symbol}><span className="ln-ticker">{leg.symbol}</span><span className="ln-num">{leg.amount}</span><span className={"ln-leg-state ln-leg-state--" + leg.tone}><Icon size={14} aria-hidden="true" />{leg.state}</span></div>; })}
              <p className="ln-legs-foot">{PARTIAL.foot}</p>
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}
