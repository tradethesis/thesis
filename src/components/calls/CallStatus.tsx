"use client";

import { useEffect, useState } from "react";
import { callTiming, scoreCall, signedPercent, type CallRecord } from "@/lib/calls";

export function CallStatus({ call, compact = false }: { call: CallRecord | null; compact?: boolean }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  if (!call) return <div className="call-status call-status--pending"><span>Call not started</span><small>Waiting for a complete starting observation.</small></div>;
  const timing = now === null ? { label: "90-day call", phase: "open" } : callTiming(call, now);
  const score = scoreCall(call.start, call.latest);
  const stale = call.status === "open" && (Boolean(call.lastError) || now !== null && now - Date.parse(call.latest.observedAt) > 26 * 3600_000);
  const started = call.start.observedAt !== call.latest.observedAt;
  return <div className={"call-status call-status--" + timing.phase}>
    <div className="call-status-line"><span className="call-clock"><span aria-hidden="true" />{timing.label}</span><span>{stale ? "Price unavailable" : !started ? "Starting observation set" : signedPercent(score.edgePercent).replace("%", "") + " pp vs " + call.benchmark}</span></div>
    {!compact && <div className="call-returns"><div><span>Model basket</span><strong>{signedPercent(score.basketPercent)}</strong></div><div><span>{call.benchmark}</span><strong>{signedPercent(score.benchmarkPercent)}</strong></div></div>}
    <small>{stale ? "Last observation retained. No result inferred." : "Model quotes, not your investment return."}</small>
  </div>;
}
