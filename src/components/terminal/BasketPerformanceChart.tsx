"use client";

import { useId, useMemo, useState } from "react";

import { benchmarkName } from "@/lib/calls";
import type { SeriesPoint } from "@/lib/series";

/**
 * How a basket has done, plotted honestly.
 *
 * Three things this gets right that the small card chart it replaces did not.
 *
 * **x is time, not index.** The old chart spaced points evenly by position, so a three-day gap
 * from failed refreshes drew identically to a one-day gap. Readings arrive about once a day and
 * the failure path writes no observation at all, so gaps are normal and hiding them is a picture
 * of data we do not have.
 *
 * **Zero is the call's opening mark.** Both series are indexed to the moment the call was struck.
 * That is also what the ranking measures from, so the number in the header, the number in the
 * left column and the end of this line are finally the same number.
 *
 * **Ranges only go as far as the data.** A range with fewer than two readings inside it is
 * offered as disabled rather than drawn, because an empty window and a flat line look the same
 * and only one of them is true.
 *
 * The basket and the benchmark share one axis because they are the same measure — percent from a
 * common origin. Two scales would let a chart say whatever its author wanted.
 */

export type Range = { label: string; days: number | null };

const RANGES: Range[] = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "Max", days: null },
];

const PAD = { top: 16, right: 14, bottom: 26, left: 44 };

export function BasketPerformanceChart({
  points,
  benchmark,
  startsAt,
  height = 380,
}: {
  points: SeriesPoint[];
  benchmark: string;
  startsAt: string;
  height?: number;
}) {
  const id = useId();
  const [range, setRange] = useState<string>("Max");

  const available = useMemo(() => {
    const last = points.length ? Date.parse(points[points.length - 1].at) : Date.now();
    return RANGES.map((r) => {
      const from = r.days === null ? -Infinity : last - r.days * 86_400_000;
      const inside = points.filter((p) => Date.parse(p.at) >= from);
      return { ...r, count: inside.length, points: inside };
    });
  }, [points]);

  const active = available.find((r) => r.label === range) ?? available[available.length - 1];
  const shown = active.points;

  if (points.length < 2) {
    return (
      <div className="tmc tmc--empty" style={{ minHeight: height }}>
        <p className="tmc-empty-head">
          {points.length === 0 ? "Tracking begins at publication" : "One reading so far"}
        </p>
        <p className="tmc-empty-body">
          {points.length === 0
            ? "No prices yet."
            : `Taken ${new Date(points[0].at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}. A second reading is needed before there is a line to draw.`}{" "}
          They&rsquo;re recorded once a day.
        </p>
      </div>
    );
  }

  const w = 900;
  const h = height;
  const times = shown.map((p) => Date.parse(p.at));
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const span = Math.max(1, t1 - t0);

  // The benchmark's token symbol means nothing to most readers; say which index it is.
  const benchName = benchmarkName(benchmark);
  const values = shown.flatMap((p) => [p.basketPct, p.benchmarkPct]);
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  // A little air, and never a zero-height band when everything is flat.
  const pad = Math.max(0.35, (hi - lo) * 0.12);
  const top = hi + pad;
  const bottom = lo - pad;

  const x = (at: string) => PAD.left + ((Date.parse(at) - t0) / span) * (w - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + ((top - v) / (top - bottom)) * (h - PAD.top - PAD.bottom);

  const path = (pick: (p: SeriesPoint) => number) =>
    shown.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.at).toFixed(2)} ${y(pick(p)).toFixed(2)}`).join(" ");

  const area =
    `${path((p) => p.basketPct)} L ${x(shown[shown.length - 1].at).toFixed(2)} ${y(bottom).toFixed(2)}` +
    ` L ${x(shown[0].at).toFixed(2)} ${y(bottom).toFixed(2)} Z`;

  const last = shown[shown.length - 1];
  const fmt = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
  /*
   * UTC, always.
   *
   * Every date here renders on the server and again on the client. The server is UTC and a reader
   * is not, so an unpinned formatter produces two different strings for the same instant and React
   * refuses to hydrate — error #418, which appeared the moment this shipped to Vercel and never
   * once on a development machine that shares its timezone with the browser.
   *
   * It is also the right answer regardless: these are market observations, and CallPanel already
   * states them in UTC.
   */
  const day = (at: string) => new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <div className="tmc">
      <div className="tmc-head">
        <div className="tmc-keys">
          <span className="tmc-key tmc-key--basket">
            <i aria-hidden="true" /> Basket <strong className={signed(last.basketPct)}>{fmt(last.basketPct)}</strong>
          </span>
          <span className="tmc-key tmc-key--bench">
            <i aria-hidden="true" /> {benchName}{" "}
            <strong className={signed(last.benchmarkPct)}>{fmt(last.benchmarkPct)}</strong>
          </span>
        </div>
        <div className="tmc-ranges" role="group" aria-label="Time range">
          {available.map((r) => (
            <button
              key={r.label}
              type="button"
              // A range with fewer than two readings has nothing to draw. Offered and disabled,
              // rather than hidden, so the reader can see how much history actually exists.
              disabled={r.count < 2}
              aria-pressed={r.label === active.label}
              onClick={() => setRange(r.label)}
              title={r.count < 2 ? "Not enough price history yet" : `${r.count} price checks`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <svg
        className="tmc-plot"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        role="img"
        aria-labelledby={`${id}-t`}
        style={{ height }}
      >
        <title id={`${id}-t`}>
          {`Basket ${fmt(last.basketPct)} against the ${benchName} ${fmt(last.benchmarkPct)} since the call started on ${day(startsAt)}.`}
        </title>

        <line className="tmc-zero" x1={PAD.left} x2={w - PAD.right} y1={y(0)} y2={y(0)} />
        <text className="tmc-axis" x={PAD.left - 8} y={y(top) + 4} textAnchor="end">
          {fmt(top)}
        </text>
        <text className="tmc-axis" x={PAD.left - 8} y={y(0) + 4} textAnchor="end">
          0%
        </text>
        <text className="tmc-axis" x={PAD.left - 8} y={y(bottom) + 4} textAnchor="end">
          {fmt(bottom)}
        </text>

        <path className="tmc-area" d={area} />
        <path className="tmc-line tmc-line--bench" d={path((p) => p.benchmarkPct)} />
        <path className="tmc-line tmc-line--basket" d={path((p) => p.basketPct)} />

        {/* Every reading is marked. With one point a day and gaps where a refresh failed, the
            dots are the honest part of this chart — they show what was actually observed. */}
        {shown.map((p) => (
          <circle key={p.at} className="tmc-dot" cx={x(p.at)} cy={y(p.basketPct)} r={3} />
        ))}

        <text className="tmc-axis" x={PAD.left} y={h - 8}>
          {day(shown[0].at)}
        </text>
        <text className="tmc-axis" x={w - PAD.right} y={h - 8} textAnchor="end">
          {day(last.at)}
        </text>
      </svg>

      {/* The accessible equivalent. Not a fallback — the numbers are the point, and a line is a
          summary of them. */}
      <details className="tmc-table">
        <summary>Price history</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Reading</th>
              <th scope="col">Basket</th>
              <th scope="col">{benchName}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.at}>
                <th scope="row">{`${new Date(p.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC`}</th>
                <td className={`ln-num ${signed(p.basketPct)}`}>{fmt(p.basketPct)}</td>
                <td className={`ln-num ${signed(p.benchmarkPct)}`}>{fmt(p.benchmarkPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function signed(v: number): string {
  return v > 0 ? "is-up" : v < 0 ? "is-down" : "";
}
