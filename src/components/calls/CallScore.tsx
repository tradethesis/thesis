"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Clock3 } from "lucide-react";
import { callTiming, scoreCall, signedPercent, type CallRecord } from "@/lib/calls";

/** Model results stay secondary to the argument. No independently scaled mini charts. */
export function CallScore({ call }: { call: CallRecord | null }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  if (!call) return <p className="call-brief call-brief--pending">Performance call not started</p>;
  const timing = now === null ? `${call.durationDays}-day call` : callTiming(call, now).label;
  const started = call.start.observedAt !== call.latest.observedAt;
  const stale = call.status === "open" && (Boolean(call.lastError) || (now !== null && now - Date.parse(call.latest.observedAt) > 26 * 3_600_000));
  const score = scoreCall(call.start, call.latest);
  const edge = Math.abs(score.edgePercent);
  const relative = edge < .005 ? `Level with ${call.benchmark} to 2 decimal places` : `${edge.toFixed(2)} pp ${score.edgePercent > 0 ? "ahead of" : "behind"} ${call.benchmark}`;
  return <details className="call-brief">
    <summary><span>{call.status === "unresolved" ? "No valid closing observation" : stale ? "Prices need a refresh" : !started ? "Call just started" : relative}<small>Model performance</small></span><span className="call-brief-clock"><Clock3 size={13} aria-hidden="true" />{timing}<ChevronDown size={13} aria-hidden="true" /></span></summary>
    <div className="call-brief-detail">
      <p>{call.statement}</p>
      {started && <dl><div><dt>Basket</dt><dd>{signedPercent(score.basketPercent)}</dd></div><div><dt>{call.benchmark}</dt><dd>{signedPercent(score.benchmarkPercent)}</dd></div></dl>}
      <p>Last observation: <time dateTime={call.latest.observedAt}>{new Date(call.latest.observedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC</time>. {stale ? "Prices are stale; the figures are the last available observation. " : ""}Your entry, weights and trading costs can produce a different return.</p>
      <p>Ahead by one percentage point means the basket’s return is one point higher than the benchmark’s. This measures investment performance; it does not prove the argument.</p>
    </div>
  </details>;
}
