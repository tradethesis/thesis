"use client";

import Link from "next/link";

import { BasketPerformanceChart } from "@/components/terminal/BasketPerformanceChart";
import { TokenLogo } from "@/components/calls/TokenLogo";

import type { Candidate } from "./types";

/**
 * The basket on the left, and the way to buy it.
 *
 * Every figure here is a row from the reviewed catalogue: the name, the case, the tickers and the
 * weights, and a chart drawn only from readings that were actually taken. If a basket has no
 * series yet it says so in one line — the alternative, a smooth invented curve, is the single most
 * dishonest thing a page like this could draw.
 *
 * "Review basket" goes to the existing checkout at /buy/[slug], which is where the allocation is
 * confirmed and the wallet is asked for. Identity travels in the URL, so connecting a wallet comes
 * back to this basket and this allocation rather than to a generic landing.
 */
export function SelectedBasket({ candidate }: { candidate: Candidate }) {
  const b = candidate.basket;
  const holdings = b.execution.holdings;
  const perf = b.performance;

  return (
    <section className="hm-basket" aria-labelledby="hm-basket-name">
      <p className="hm-k">Selected basket</p>
      <h2 className="hm-basket-name" id="hm-basket-name">
        {b.name}
      </h2>
      <p className="hm-basket-case">{b.description}</p>

      {/*
        * The allocation, given the size the reference gives a score.
        *
        * These are reviewed weights read from the basket — the thing a buyer is actually agreeing
        * to — so they earn the largest figures on the page. The ticker and company sit above each
        * one as its key, which is the reference's label-over-number arrangement exactly.
        */}
      <p className="hm-k">Reviewed allocation</p>
      <div className="hm-stats">
        {holdings.map((h, i) => (
          <div className="hm-stat" key={h.mint}>
            <span className="hm-stat-k">
              <TokenLogo symbol={h.symbol} company={h.company} tone={i} size={18} />
              {h.symbol}
            </span>
            <span className="hm-stat-v">{(h.weightBps / 100).toFixed(0)}</span>
            <span className="hm-stat-co">{h.company}</span>
          </div>
        ))}
      </div>

      <div className="hm-chart">
        <p className="hm-k">
          Performance{perf ? <span className="hm-vs"> vs {perf.benchmark}</span> : null}
        </p>
        {perf && perf.points.length >= 2 ? (
          <BasketPerformanceChart
            points={perf.points}
            benchmark={perf.benchmark}
            startsAt={perf.startsAt}
            height={200}
          />
        ) : (
          <p className="hm-unavailable">
            {perf
              ? "Tracking has begun but only one reading exists. A line needs two."
              : "No readings taken yet for this basket."}
          </p>
        )}
      </div>

      <div className="hm-actions">
        <Link href={`/buy/${b.execution.executionSlug}`} className="hm-btn hm-btn--go">
          Review basket →
        </Link>
        <Link href={`/app?basket=${encodeURIComponent(b.slug)}`} className="hm-btn hm-btn--quiet">
          Open in terminal
        </Link>
      </div>

      {!b.execution.buyable && b.execution.blockedReason && (
        <p className="hm-blocked">{b.execution.blockedReason}</p>
      )}
    </section>
  );
}
