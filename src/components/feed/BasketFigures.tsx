"use client";

import { useEffect, useState } from "react";

import { STALE_AFTER_MS } from "@/lib/leaderboard";
import { scoreCall, signedPercent, type CallRecord } from "@/lib/calls";

/**
 * The two numbers on the basket tile: how the basket has moved, and how the benchmark has.
 *
 * Growth leads, because that is the number a person actually feels and the question they
 * are asking — "is this idea up?". The benchmark sits beside it rather than being dropped,
 * and the reason is not pedantry: several of these baskets hold the same mega-caps, and in
 * a rising market every one of them shows a green number whether or not its belief was
 * right. Without the benchmark alongside, a bull run makes the whole catalogue look prescient.
 *
 * It refuses to show a figure it cannot stand behind. An observation older than a day, or a
 * recorded fetch error, means the last price is the most recent thing known — not the
 * current one — and the tile says that instead of quietly printing a stale number.
 *
 * The word "model" is on the label, every time there is a number. It is not anybody's
 * return: it is a fixed basket quoted from a fixed starting point, and a person who buys
 * today starts from a different price and pays costs the model does not.
 */
export function BasketFigures({ call }: { call: CallRecord | null }) {
  // Null on the server and on the first client pass so the clock cannot desync hydration.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!call) return <p className="fc-figs fc-figs--none">No call yet</p>;

  const started = call.start.observedAt !== call.latest.observedAt;
  const stale =
    call.status === "open" &&
    (Boolean(call.lastError) || (now !== null && now - Date.parse(call.latest.observedAt) > STALE_AFTER_MS));

  if (!started) return <p className="fc-figs fc-figs--none">Prices set</p>;
  if (stale) return <p className="fc-figs fc-figs--none">Needs a refresh</p>;

  const score = scoreCall(call.start, call.latest);
  const tone = score.basketPercent > 0 ? "is-up" : score.basketPercent < 0 ? "is-down" : "";

  return (
    <div className="fc-figs">
      <div className="fc-fig">
        <span className="fc-fig-label">MODEL</span>
        <strong className={`ln-num ${tone}`}>{signedPercent(score.basketPercent)}</strong>
      </div>
      <div className="fc-fig">
        <span className="fc-fig-label">{call.benchmark}</span>
        <strong className="ln-num fc-fig-bench">{signedPercent(score.benchmarkPercent)}</strong>
      </div>
    </div>
  );
}
