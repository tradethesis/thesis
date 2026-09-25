"use client";

import { useMemo, useState } from "react";

import { TokenLogo } from "../calls/TokenLogo";

import { FILTER_BY_ASSET } from "@/lib/filter-feed";
import { squarify } from "@/lib/treemap";
import type { AssetSignal } from "@/server/signals";

/**
 * What the catalogue is pointing at, as a map.
 *
 * Every published basket votes with its holdings, and this is the tally. A tile's **area**
 * is how many separate arguments arrive at that asset; its **colour** is what the price has
 * done since those arguments were made. Two different facts on two different channels, so
 * the interesting case stays visible: heavily signalled and falling.
 *
 * Area is the only thing that carries the count, which is why the layout is squarified —
 * a long thin sliver has the same area as a square one and reads as far less.
 *
 * It is a way in, not a portfolio. Nothing here is weighted by anybody's money, and a big
 * tile means "many people wrote about it", never "this is the one to buy".
 */
export function SignalMap({ signals }: { signals: AssetSignal[] }) {
  const [active, setActive] = useState<string | null>(null);

  // Every asset the catalogue actually points at. There are twenty, and eleven of them are
  // held by exactly one basket — the map shows all of them rather than a top slice, because
  // the long tail of single-conviction assets is itself the shape of the catalogue.
  const shown = signals;
  const rects = useMemo(
    () => squarify(shown.map((s) => ({ key: s.mint, value: s.baskets }))),
    [shown],
  );

  if (rects.length < 3) return null;

  const bySymbol = new Map(shown.map((s) => [s.mint, s]));
  const hot = active ? bySymbol.get(active) : null;

  return (
    <section className="map" aria-label="What the catalogue is pointing at">
      <div className="map-head">
        <h2>Most signalled</h2>
        <p>{hot ? `${hot.company} · in ${hot.baskets} ${hot.baskets === 1 ? "basket" : "baskets"}` : "Size is how many baskets hold it"}</p>
      </div>

      <div className="map-cols">
        {/*
          The same assets twice, because the two shapes answer different questions. The map
          shows proportion at a glance and cannot carry a number; the list carries the
          numbers and cannot show proportion. Neither is a summary of the other.
        */}
        <ol className="map-list">
          {shown.map((s) => (
            <li key={s.mint} className={active === s.mint ? "is-hot" : undefined}>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent(FILTER_BY_ASSET, { detail: s.symbol }))}
                onMouseEnter={() => setActive(s.mint)}
                onMouseLeave={() => setActive((v) => (v === s.mint ? null : v))}
                onFocus={() => setActive(s.mint)}
                onBlur={() => setActive((v) => (v === s.mint ? null : v))}
              >
                <TokenLogo symbol={s.symbol} company={s.company} tone={0} size={20} />
                <span className="map-list-name">
                  <strong>{s.symbol}</strong>
                  <span>{s.company}</span>
                </span>
                <span className="map-list-mcap ln-num">{mcap(s.mcapUsd)}</span>
                <span className={`map-list-chg ln-num ${changeClass(s.change24h)}`}>{pct(s.change24h, 1)}</span>
              </button>
            </li>
          ))}
        </ol>

        <div className="map-plot">
        {rects.map((r) => {
          const s = bySymbol.get(r.key);
          if (!s) return null;
          const tone = toneFor(s.change24h);
          // Three sizes, by what the tile can actually hold. A logo survives being small
          // far better than a word does, so it is the last thing dropped: a reader who
          // cannot read "GOOGLx" at this size still recognises the mark.
          // Whether there is room at all is decided here; how big is decided in CSS, where
          // the cell can be measured instead of guessed. Sizing it in JavaScript meant
          // predicting the plot's pixel aspect from percentages, and two logos spilled out
          // of their tiles because the guess was wrong at that viewport.
          const roomy = r.width > 7 && r.height > 15;
          // A mark below about twenty pixels is a coloured dot, which says less than the
          // empty tile would. The cell keeps its colour and its tooltip; the list beside it
          // names every asset anyway, so nothing is lost by leaving these blank.
          const logo = r.width > 5 && r.height > 13;

          return (
            <button
              key={r.key}
              type="button"
              className={`map-tile ${tone.className}`}
              style={{
                left: `${r.x}%`,
                top: `${r.y}%`,
                width: `${r.width}%`,
                height: `${r.height}%`,
                "--map-tint": tone.tint,
              } as React.CSSProperties}
              onClick={() => window.dispatchEvent(new CustomEvent(FILTER_BY_ASSET, { detail: s.symbol }))}
              onMouseEnter={() => setActive(r.key)}
              onMouseLeave={() => setActive((v) => (v === r.key ? null : v))}
              onFocus={() => setActive(r.key)}
              onBlur={() => setActive((v) => (v === r.key ? null : v))}
              title={`${s.symbol} — ${s.company}, in ${s.baskets} ${s.baskets === 1 ? "basket" : "baskets"}${
                s.change24h === null ? "" : `, ${pct(s.change24h, 2)} over 24 hours`
              }`}
            >
              <span className="map-label">
                {logo && (
                  <span className="map-logo" aria-hidden="true">
                    <TokenLogo symbol={s.symbol} company={s.company} tone={0} />
                  </span>
                )}
                {roomy && <strong>{s.symbol}</strong>}
                {roomy && r.height > 26 && <em className="ln-num">{pct(s.change24h, 1)}</em>}
              </span>
            </button>
          );
        })}
        </div>
      </div>

      {/* Colour is meaningless without this, and a legend that only appears on hover is a
          legend that is not there. */}
      <p className="map-key">
        <span className="map-swatch is-down" aria-hidden="true" />
        <span className="map-swatch is-flat" aria-hidden="true" />
        <span className="map-swatch is-up" aria-hidden="true" />
        Colour is the last 24 hours. Size is how many baskets hold it. Neither is a recommendation.
      </p>
    </section>
  );
}

/**
 * Diverging: two hues either side of a neutral middle, never a single ramp.
 *
 * The midpoint is grey rather than a third hue, and "no reading yet" is grey too — an
 * asset nobody has measured must not be drawn as one that has not moved, so the tile is
 * flat and its label reads an em dash rather than a zero.
 */
function toneFor(change: number | null): { className: string; tint: string } {
  // Stepped for the dark ground, not inverted from the light one. Lightness rises with the
  // move rather than falling: on a dark surface a stronger reading has to glow, and the
  // labels sitting on these tiles are near-white, so the floor is set where they stay
  // legible rather than where the hue looks best.
  if (change === null) return { className: "is-none", tint: "oklch(26% 0.008 260)" };
  if (Math.abs(change) < 0.05) return { className: "is-flat", tint: "oklch(30% 0.01 260)" };

  const strength = Math.min(1, Math.abs(change) / 8);
  return change > 0
    ? { className: "is-up", tint: `oklch(${34 + strength * 20}% ${0.06 + strength * 0.09} 152)` }
    : { className: "is-down", tint: `oklch(${34 + strength * 18}% ${0.07 + strength * 0.1} 30)` };
}

/** A signed percentage, or an em dash when there is no reading — never a zero. */
function pct(value: number | null, dp: number): string {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(dp)}%`;
}

function changeClass(value: number | null): string {
  if (value === null) return "is-none";
  return value > 0.05 ? "is-up" : value < -0.05 ? "is-down" : "is-flat";
}

/**
 * Market cap, and only where one exists.
 *
 * A tokenised share has an issuer publishing a share count; SOL and JUP do not, and a
 * circulating-supply figure is a different quantity wearing the same name. The column
 * reads "—" rather than putting the two side by side as if they compared.
 */
function mcap(value: number | null): string {
  if (value === null) return "—";
  if (value >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(0)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${Math.round(value).toLocaleString("en-US")}`;
}
