"use client";

import { useState } from "react";
import { MAX_WEIGHT_BPS, MIN_WEIGHT_BPS } from "@/lib/money/allocate";
import { DEFAULT_BASKET_RAW, estimateLegCost, formatUsdc } from "@/lib/money/cost";
import type { Holding } from "./content";

/**
 * The allocation editor from Screen C, reduced to what a first-time reader needs to see:
 * the author's weights are a starting point, and moving one does not silently move
 * another. The remainder is stated instead.
 *
 * The only client component on this page. It reads the real constants — the 10% floor,
 * the 70% ceiling, the $150 default basket, the per-leg cost — from the modules the
 * product itself uses, so the preview cannot drift away from the thing it previews.
 */

const MIN_WEIGHT = MIN_WEIGHT_BPS / 100;
const MAX_WEIGHT = MAX_WEIGHT_BPS / 100;

function legAmountRaw(weight: number): bigint {
  return (DEFAULT_BASKET_RAW * BigInt(weight)) / 100n;
}

export function AllocationPreview({ holdings }: { holdings: Holding[] }) {
  const authorWeights = holdings.map((h) => h.weight);
  const [weights, setWeights] = useState(authorWeights);

  const total = weights.reduce((sum, w) => sum + w, 0);
  const remainder = 100 - total;
  const edited = weights.some((w, i) => w !== authorWeights[i]);

  const investedRaw = weights.reduce((sum, w) => sum + legAmountRaw(w), 0n);
  const costRaw = weights.reduce((sum, w) => sum + estimateLegCost(legAmountRaw(w)).estimatedCostRaw, 0n);
  const costBps = investedRaw > 0n ? Number((costRaw * 10_000n) / investedRaw) : 0;

  function setWeight(index: number, value: number) {
    setWeights((current) => current.map((w, i) => (i === index ? value : w)));
  }

  return (
    <div className="ln-alloc">
      <div className="ln-alloc-head">
        <h4 className="ln-h3">Your allocation</h4>
        <p className="ln-alloc-budget">
          Basket <span className="ln-num">{formatUsdc(DEFAULT_BASKET_RAW)}</span> · default size
        </p>
      </div>

      {holdings.map((holding, index) => {
        const weight = weights[index];
        const amount = formatUsdc(legAmountRaw(weight));
        return (
          <div className="ln-row" key={holding.symbol}>
            <div className="ln-row-top">
              <span className="ln-row-name">
                <span className="ln-ticker">{holding.symbol}</span>
                <span className="ln-company">{holding.company}</span>
              </span>
              <span className="ln-row-values">
                <span className="ln-weight">{weight}%</span>
                <span className="ln-amount">{amount}</span>
              </span>
            </div>
            <input
              className="ln-slider"
              type="range"
              min={MIN_WEIGHT}
              max={MAX_WEIGHT}
              step={1}
              value={weight}
              onChange={(event) => setWeight(index, Number(event.target.value))}
              aria-label={`Weight for ${holding.symbol}, ${holding.company}`}
              aria-valuetext={`${weight} percent, ${amount}`}
            />
          </div>
        );
      })}

      <div className="ln-alloc-foot">
        <p
          className={`ln-status ${remainder === 0 ? "ln-status--ok" : "ln-status--warn"}`}
          aria-live="polite"
        >
          <span className="ln-status-dot" aria-hidden="true" />
          <span>
            {remainder === 0
              ? edited
                ? "Totals 100%. Your allocation differs from Version 1."
                : "Totals 100%. This is the author's allocation."
              : remainder > 0
                ? `${remainder}% still to allocate. The total must reach 100%.`
                : `${-remainder}% over. The total must come back to 100%.`}
          </span>
        </p>
        <button
          type="button"
          className="ln-reset"
          onClick={() => setWeights(authorWeights)}
          disabled={!edited}
        >
          Reset to author&rsquo;s weights
        </button>
      </div>

      <p className="ln-cost">
        Estimated cost <span className="ln-num">{formatUsdc(costRaw)}</span> on{" "}
        <span className="ln-num">{formatUsdc(investedRaw)}</span>, about{" "}
        <span className="ln-num">{(costBps / 100).toFixed(2)}%</span> — roughly $0.16 per purchase plus
        10 basis points. Jupiter charges it. Thesis adds nothing. A real purchase re-checks every
        figure against a fresh order before you sign.
      </p>
    </div>
  );
}
