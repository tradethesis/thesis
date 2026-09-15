"use client";

import { useEffect, useState } from "react";

import { callTiming, scoreCall, signedPercent, type CallRecord } from "@/lib/calls";

/**
 * Is this idea working?
 *
 * This is the slot where a catalogue normally puts popularity — view counts, holders,
 * "1,204 people bought this". None of that exists here and none of it is invented: nothing
 * has written to the event table yet, saves live in one browser's localStorage, and no
 * wallet has executed. So the slot carries the one credibility signal that is real and
 * measured, the call's own result against its benchmark.
 *
 * Two bars, two numbers, one line. The bars are scaled to the larger of the pair rather
 * than to a fixed idea of a big move, because the only question they answer is which of
 * the two is ahead; the percentages beside them carry the magnitude.
 */

function Bar({ label, value, scale, basket }: { label: string; value: number; scale: number; basket?: boolean }) {
  // Gate on the figure as displayed, not the raw one. A move of 0.004% prints as
  // "+0.00%", and drawing a bar beside a number that reads zero is the kind of small
  // contradiction that makes a reader distrust the rest of the panel.
  const shown = Number(value.toFixed(2));
  const width = shown === 0 || scale === 0 ? 0 : Math.max(4, Math.min(100, (Math.abs(value) / scale) * 100));
  return (
    <div className={`cs-bar${basket ? " cs-bar--basket" : ""}${value < 0 ? " is-down" : " is-up"}`}>
      <span className="cs-bar-label">{label}</span>
      <span className="cs-bar-track" aria-hidden="true">
        {/* A non-zero move always draws something: an empty track reads as "no data",
            which is a different claim from "barely moved". */}
        <span className="cs-bar-fill" style={{ width: width ? `${width}%` : 0 }} />
      </span>
      <strong className="cs-bar-value">{signedPercent(value)}</strong>
    </div>
  );
}

export function CallScore({ call }: { call: CallRecord | null }) {
  // Null on the server and on the first client pass, so the clock cannot make the two
  // disagree. Every branch below has to read correctly while it is still null.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  if (!call) return <div className="cs cs--pending">No call yet</div>;

  const timing = now === null ? { label: `${call.durationDays}-day call`, phase: "open" } : callTiming(call, now);
  const score = scoreCall(call.start, call.latest);

  // A quote older than a day, or a recorded fetch error, means the last observation is the
  // most recent thing we know — not that the position is flat. Showing a stale number as a
  // live one is the failure mode worth designing against.
  const stale =
    call.status === "open" &&
    (Boolean(call.lastError) || (now !== null && now - Date.parse(call.latest.observedAt) > 26 * 3_600_000));
  const started = call.start.observedAt !== call.latest.observedAt;
  const resolved = call.status !== "open";

  if (!started || stale) {
    return (
      <div className={`cs cs--${stale ? "stale" : "waiting"}`}>
        <p className="cs-waiting">
          {stale ? "Price unavailable" : "Starting prices recorded"}
          <span className="cs-clock">
            <i aria-hidden="true" />
            {timing.label}
          </span>
        </p>
      </div>
    );
  }

  const scale = Math.max(Math.abs(score.basketPercent), Math.abs(score.benchmarkPercent));
  const ahead = score.edgePercent > 0;

  return (
    <div className={`cs cs--${resolved ? "resolved" : timing.phase}`}>
      <div className="cs-bars">
        <Bar label="Basket" value={score.basketPercent} scale={scale} basket />
        <Bar label={call.benchmark} value={score.benchmarkPercent} scale={scale} />
      </div>

      <p className={`cs-edge ${ahead ? "is-ahead" : score.edgePercent < 0 ? "is-behind" : "is-level"}`}>
        <strong>
          {signedPercent(score.edgePercent).replace("%", "")} pp{" "}
          {score.edgePercent === 0 ? "level" : ahead ? "ahead" : "behind"}
        </strong>
        <span className="cs-clock">
          <i aria-hidden="true" />
          {timing.label}
        </span>
      </p>
    </div>
  );
}
