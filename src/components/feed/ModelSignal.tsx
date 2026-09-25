"use client";

import { useEffect, useState } from "react";

import { STALE_AFTER_MS } from "@/lib/leaderboard";
import { callTiming, scoreCall, signedPercent, type CallRecord } from "@/lib/calls";

/**
 * One line: how much the basket has moved since the call started, and how long is left.
 *
 * Growth leads, because that is the number a person actually feels and the question they
 * are asking — "is this idea up?". The benchmark follows in smaller type rather than being
 * dropped, and the reason is not pedantry: four of these baskets hold the same mega-caps,
 * and in a rising market every one of them shows a green number whether or not its belief
 * was right. Without SPYx beside it, a bull run makes the whole catalogue look prescient.
 *
 * Labelled "model" every time it shows a number, because it is not anybody's return. It is a
 * fixed basket quoted from a fixed starting point, and a person who buys today starts from a
 * different price and pays costs the model does not.
 *
 * It refuses to show a figure it cannot stand behind. An observation older than a day, or a
 * recorded fetch error, means the last price is the most recent thing known — not the
 * current one — and the line says that instead of quietly printing a stale number.
 */
export function ModelSignal({ call }: { call: CallRecord | null }) {
  // Null on the server and on the first client pass so the clock cannot desync hydration.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!call) return <p className="fc-signal fc-signal--none">No call on this basket yet</p>;

  const started = call.start.observedAt !== call.latest.observedAt;
  const stale =
    call.status === "open" &&
    (Boolean(call.lastError) || (now !== null && now - Date.parse(call.latest.observedAt) > STALE_AFTER_MS));
  const timing = now === null ? `${call.durationDays}-day call` : callTiming(call, now).label;

  if (!started) {
    return (
      <p className="fc-signal fc-signal--waiting">
        Starting prices set <span>{timing}</span>
      </p>
    );
  }
  if (stale) {
    return (
      <p className="fc-signal fc-signal--stale">
        Prices need a refresh <span>{timing}</span>
      </p>
    );
  }

  const score = scoreCall(call.start, call.latest);
  const up = score.basketPercent > 0;
  const flat = score.basketPercent === 0;
  const since = new Date(call.startsAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <p className={`fc-signal ${up ? "is-ahead" : flat ? "is-level" : "is-behind"}`}>
      <strong>{signedPercent(score.basketPercent)}</strong>
      <span className="fc-signal-since">since {since}</span>
      <em>model</em>
      <span className="fc-signal-bench">
        {call.benchmark} {signedPercent(score.benchmarkPercent)}
      </span>
    </p>
  );
}
