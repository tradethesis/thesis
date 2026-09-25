"use client";

import { TokenLogo } from "../calls/TokenLogo";

import type { BasketRow } from "./types";

/**
 * Every basket, ranked, dense enough to compare.
 *
 * A row is a choice, not an article: the narrative name, one line of what it holds, the real
 * holding logos, and one clearly-scoped return. No quotation, no paragraph, no thumbnail, no
 * per-row buy button — those belong to the basket you have actually selected, and repeated once
 * a row they become furniture.
 *
 * Ranking is by return over the named period, and a basket without enough history inside that
 * period is shown **unranked** rather than extrapolated or dropped. A reader comparing a
 * three-day-old basket against a ninety-day one is not comparing anything; hiding it would be
 * worse, because then they would not know it existed.
 */
export function BasketLeaderboard({
  baskets,
  selected,
  onSelect,
  period,
}: {
  baskets: BasketRow[];
  selected: string;
  onSelect: (slug: string) => void;
  period: string;
}) {
  return (
    <div className="tml">
      <div className="tml-head">
        <h2>Baskets</h2>
        <span className="tml-period">{period}</span>
      </div>

      <ol className="tml-rows">
        {baskets.map((b) => (
          <li key={b.slug}>
            <button
              type="button"
              className={`tml-row ${b.slug === selected ? "is-on" : ""}`}
              aria-current={b.slug === selected ? "true" : undefined}
              onClick={() => onSelect(b.slug)}
            >
              <span className="tml-rank ln-num">{b.rank === null ? "–" : b.rank}</span>

              <span className="tml-body">
                <span className="tml-name">{b.name}</span>
                <span className="tml-desc">{b.description}</span>
                <span className="tml-logos">
                  {b.holdings.map((h, i) => (
                    <TokenLogo key={h.mint} symbol={h.symbol} company={h.company} tone={i} size={18} />
                  ))}
                  <span className="tml-tickers">{b.holdings.map((h) => h.symbol).join(" · ")}</span>
                </span>
              </span>

              <span className="tml-figure">
                {b.returnPct === null ? (
                  <span className="tml-unranked" title={b.unrankedReason ?? undefined}>
                    too new
                  </span>
                ) : (
                  <strong className={`ln-num ${b.returnPct > 0 ? "is-up" : b.returnPct < 0 ? "is-down" : ""}`}>
                    {b.returnPct > 0 ? "+" : ""}
                    {b.returnPct.toFixed(2)}%
                  </strong>
                )}
                {b.argumentCount > 1 && <span className="tml-args">{b.argumentCount} theses</span>}
              </span>
            </button>
          </li>
        ))}
      </ol>

      {/* Stated once for the column, never once per row. */}
      <p className="tml-note">
        Example baskets, not anybody&rsquo;s holdings. Ranked by return since each call started;
        baskets without enough price history yet aren&rsquo;t ranked.
      </p>
    </div>
  );
}
