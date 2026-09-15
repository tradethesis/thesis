"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
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

export function AllocationPreview({ holdings, compact = false, version = 1, buyHref, versionId }: { holdings: Holding[]; compact?: boolean; version?: number; buyHref?: string; versionId?: string }) {
  const id = useId();
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
    <div className={`ln-alloc${compact ? " ln-alloc--compact" : ""}`}>
      <div className="ln-alloc-head">
        <p className="ln-alloc-label">Your allocation</p>
        <p className="ln-alloc-budget">
          <span className="ln-num">{formatUsdc(DEFAULT_BASKET_RAW)}</span> USDC
        </p>
      </div>
      <div className="ln-allocation-bar" aria-hidden="true">
        {weights.map((weight, index) => <span key={holdings[index].symbol} className={`ln-allocation-segment ln-asset-tone-${index % 3}`} style={{ flexGrow: weight }} />)}
      </div>

      {holdings.map((holding, index) => {
        const weight = weights[index];
        const amount = formatUsdc(legAmountRaw(weight));
        return (
          <div className="ln-row" key={holding.symbol}>
            <div className="ln-row-top">
              <span className="ln-row-name">
                <span className={`ln-stock-initial ln-asset-tone-${index % 3}`} aria-hidden="true">{holding.company[0]}</span>
                <label htmlFor={`${id}-${index}`}><span className="ln-ticker">{holding.symbol}</span><span className="ln-company">{holding.company}</span></label>
              </span>
              <span className="ln-row-values">
                <span className="ln-weight">{weight}%</span>
                <span className="ln-amount">{amount}</span>
              </span>
            </div>
            <input
              className="ln-slider"
              id={`${id}-${index}`}
              aria-describedby={`${id}-status`}
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
          id={`${id}-status`}
        >
          <span className="ln-status-dot" aria-hidden="true" />
          <span>
            {remainder === 0
              ? edited
                ? `100% allocated · Your version of v${version}`
                : "100% allocated · Author's weights"
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
          aria-label="Reset to author's weights"
        >
          <RotateCcw size={14} aria-hidden="true" /> Reset
        </button>
      </div>

      <p className="ln-preview-disclaimer">Interactive preview. No funds move.</p>
      {buyHref && (total === 100 ? <Link href={buyHref + "?" + new URLSearchParams({ weights: weights.join(","), ...(versionId ? { version: versionId } : {}) })} className="ln-btn ln-btn--ink td-buy">Buy this basket →</Link> : <p className="ln-meta">Set the total to 100% to continue to purchase review.</p>)}
      {!compact && <details className="ln-cost"><summary>Estimated fees <span className="ln-num">{formatUsdc(costRaw)}</span> <span className="ln-meta">({(costBps / 100).toFixed(2)}%)</span></summary><p>Estimate on {formatUsdc(investedRaw)}: about $0.16 per purchase plus 0.1%, charged by Jupiter. Thesis adds no fee. A purchase requires fresh quotes and your approval for each holding.</p></details>}
    </div>
  );
}
