import Link from "next/link";

import type { CallRecord } from "@/lib/calls";
import type { ThesisCard } from "@/server/content/queries";

import { BuyModal } from "../buy/BuyModal";

import { CallScore } from "./CallScore";
import { SourcePost } from "./SourcePost";
import { TokenLogo } from "./TokenLogo";

/**
 * One call, in the order a reader decides in: the idea, whether it is working, what to buy.
 *
 * Almost everything that is not one of those three things has been taken off. The summary,
 * the holding roles, the review horizon, the source quotation and the two standing
 * disclosures were all on the card at once, and the effect was that the claim — the only
 * thing a reader is choosing between — arrived as one paragraph among six.
 *
 * The disclosures did not disappear, they moved to the foot of the page and are stated
 * once. Repeating "nobody's position is attached to this" on every card made it furniture;
 * saying it once, under the grid, makes it a statement.
 */
export function CallCard({ thesis, call }: { thesis: ThesisCard; call: CallRecord | null }) {
  const href = `/t/${thesis.slug}`;

  return (
    <article className="cc">
      <div className="cc-idea">
        <span className="cc-category">{thesis.category}</span>

        <h2 className="cc-claim">
          <Link href={href}>{thesis.claim}</Link>
        </h2>

        {thesis.sourcePost ? (
          <SourcePost post={thesis.sourcePost} compact />
        ) : (
          <p className="cc-byline">
            <span className="cc-byline-mark" aria-hidden="true" />
            {thesis.authorName}
          </p>
        )}
      </div>

      <CallScore call={call} />

      <div className="cc-basket">
        <ul className="cc-holdings" aria-label="What the basket holds">
          {thesis.holdings.map((h, i) => (
            <li key={h.symbol}>
              <TokenLogo symbol={h.symbol} company={h.company} tone={i} />
              <strong>{h.symbol}</strong>
              <span className="cc-weight">{h.weightBps / 100}%</span>
            </li>
          ))}
        </ul>

        <div className="cc-actions">
          <BuyModal
            slug={thesis.slug}
            claim={thesis.claim}
            versionId={thesis.versionId}
            callStatement={call?.statement}
            holdings={thesis.holdings.map((h) => ({
              symbol: h.symbol,
              company: h.company,
              role: h.role,
              weightBps: h.weightBps,
            }))}
          />
          <Link href={href} className="ln-text-link">
            Read thesis
            <span className="ln-sr-only">: {thesis.claim}</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
