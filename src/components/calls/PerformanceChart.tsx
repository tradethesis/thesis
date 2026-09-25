"use client";

import { useId, useState } from "react";

import type { SeriesPoint } from "@/server/calls/observations";

/**
 * A call's basket against its benchmark, since the call started.
 *
 * Both series are indexed to the first observation, so they share one axis. Two measures on
 * two y-scales is the single most common way a chart lies, and here it would be gratuitous:
 * both start from the same $150 and the whole question is which one pulls ahead.
 *
 * Every vertex is an observation that was actually taken. Nothing is interpolated to make
 * the line smoother, and the markers are drawn precisely so the reader can see how few
 * points there are — a chart of three observations should look like a chart of three
 * observations, not like a month of trading.
 *
 * Colours are the validated pair: vermilion for the basket, blue for the benchmark, checked
 * with the palette validator for lightness, chroma, contrast and colour-vision separation
 * against this surface. Identity never rests on colour alone — both series are directly
 * labelled and a table carries the same numbers.
 */

const BASKET = "#c2410c";
const BENCHMARK = "#3a6ea5";

export function PerformanceChart({
  points,
  benchmarkLabel,
  compact = false,
}: {
  points: SeriesPoint[];
  benchmarkLabel: string;
  compact?: boolean;
}) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);

  // One point is a baseline, not a track. Saying so is more use than a dot on an empty grid.
  if (points.length < 2) {
    return (
      <p className="pc-empty">
        {points.length === 0
          ? "No prices yet."
          : "One price so far. The line starts after the second daily price."}
      </p>
    );
  }

  const w = compact ? 248 : 320;
  const h = compact ? 88 : 120;
  const pad = { t: 10, r: 8, b: 16, l: 30 };

  const values = points.flatMap((p) => [p.basketPct, p.benchmarkPct]);
  const lo = Math.min(...values, 0);
  const hi = Math.max(...values, 0);
  // A flat series would otherwise divide by zero and draw off-canvas.
  const span = hi - lo || 1;
  const padY = span * 0.15;

  const x = (i: number) => pad.l + (i / (points.length - 1)) * (w - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - (lo - padY)) / (span + padY * 2)) * (h - pad.t - pad.b);

  const path = (key: "basketPct" | "benchmarkPct") =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");

  const last = points[points.length - 1];
  const shown = hover === null ? last : points[hover];
  const fmt = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
  const when = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <figure className="pc">
      <figcaption className="pc-legend">
        <span>
          <i style={{ background: BASKET }} aria-hidden="true" />
          Basket <b style={{ color: BASKET }}>{fmt(shown.basketPct)}</b>
        </span>
        <span>
          <i style={{ background: BENCHMARK }} aria-hidden="true" />
          {benchmarkLabel} <b style={{ color: BENCHMARK }}>{fmt(shown.benchmarkPct)}</b>
        </span>
        <time dateTime={shown.at}>{when(shown.at)}</time>
      </figcaption>

      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="pc-svg"
        role="img"
        aria-labelledby={`${id}-desc`}
        onMouseLeave={() => setHover(null)}
      >
        <desc id={`${id}-desc`}>
          Basket {fmt(last.basketPct)} against {benchmarkLabel} {fmt(last.benchmarkPct)} over{" "}
          {points.length} daily prices. The same figures are in the table below.
        </desc>

        {/* Zero is the only gridline worth drawing: it is the line that says whether the
            call is up or down, and more grid than that competes with the data. */}
        <line x1={pad.l} x2={w - pad.r} y1={y(0)} y2={y(0)} className="pc-zero" />
        <text x={pad.l - 6} y={y(0) + 3} className="pc-tick" textAnchor="end">0%</text>

        <path d={path("benchmarkPct")} fill="none" stroke={BENCHMARK} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <path d={path("basketPct")} fill="none" stroke={BASKET} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {points.map((p, i) => (
          <g key={p.at}>
            {/* A 2px surface ring keeps the markers legible where the two lines cross. */}
            <circle cx={x(i)} cy={y(p.benchmarkPct)} r={3.5} fill={BENCHMARK} stroke="var(--ln-surface)" strokeWidth={2} />
            <circle cx={x(i)} cy={y(p.basketPct)} r={3.5} fill={BASKET} stroke="var(--ln-surface)" strokeWidth={2} />
            {/* Hit target far wider than the mark, per the interaction spec. */}
            <rect
              x={x(i) - (w - pad.l - pad.r) / (points.length * 2)}
              y={0}
              width={(w - pad.l - pad.r) / points.length}
              height={h}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          </g>
        ))}

        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={h - pad.b} className="pc-crosshair" />}
      </svg>

      <details className="pc-table">
        <summary>{points.length} daily prices</summary>
        <table>
          <caption className="ln-sr-only">Basket and {benchmarkLabel} change since the call started</caption>
          <thead>
            <tr><th scope="col">Observed</th><th scope="col">Basket</th><th scope="col">{benchmarkLabel}</th></tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.at}>
                <th scope="row">{when(p.at)}</th>
                <td>{fmt(p.basketPct)}</td>
                <td>{fmt(p.benchmarkPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
