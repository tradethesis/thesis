/** Public call records are model observations, never a buyer's realised P&L. */
export type CallHolding = { mint: string; symbol: string; amountRaw: string; weightBps: number };
export type CallSnapshot = {
  startedAt: string;
  observedAt: string;
  basketUsdcRaw: string;
  benchmarkUsdcRaw: string;
  quotes: { mint: string; amountRaw: string; outRaw: string; contextSlot: number }[];
};
export type CallRecord = {
  id: string;
  versionId: string;
  statement: string;
  rules: string;
  benchmark: string;
  durationDays: number;
  startsAt: string;
  endsAt: string;
  status: "open" | "hit" | "miss" | "tie" | "unresolved";
  start: CallSnapshot;
  latest: CallSnapshot;
  lastError: string | null;
};
export const CALL_DURATION_DAYS = 90;
export const RESOLUTION_WINDOW_MS = 48 * 60 * 60 * 1000;
export const CALL_RULES =
  "A fixed model basket versus SPYx, each initially quoted from $150 USDC. " +
  "The original raw token quantities never rebalance. Returns compare their USDC sell quotes with the starting sell quotes. " +
  "The call succeeds only if the basket's return is strictly higher. Equal returns are a tie. " +
  "Resolution uses the first complete quote observation started on or after the deadline, within 48 hours. " +
  "If that window has no valid observation, the result is unresolved. " +
  "Quotes include route price impact but exclude wallet execution and network costs. These are model returns, not your investment results.";

export function scoreCall(start: CallSnapshot, latest: CallSnapshot) {
  const b0 = BigInt(start.basketUsdcRaw), m0 = BigInt(start.benchmarkUsdcRaw);
  const b1 = BigInt(latest.basketUsdcRaw), m1 = BigInt(latest.benchmarkUsdcRaw);
  if ([b0, m0, b1, m1].some(v => v <= 0n)) throw new Error("Call values must be positive.");
  const delta = b1 * m0 - m1 * b0;
  return {
    basketPercent: Number((b1 - b0) * 1_000_000n / b0) / 10_000,
    benchmarkPercent: Number((m1 - m0) * 1_000_000n / m0) / 10_000,
    edgePercent: Number(delta * 1_000_000n / (b0 * m0)) / 10_000,
    outcome: delta > 0n ? "hit" as const : delta < 0n ? "miss" as const : "tie" as const,
  };
}

export function resolutionState(endsAt: string, snapshot: CallSnapshot) {
  const end = Date.parse(endsAt), start = Date.parse(snapshot.startedAt), observed = Date.parse(snapshot.observedAt);
  if (![end, start, observed].every(Number.isFinite) || observed < start) throw new Error("Invalid observation time.");
  if (start < end) return "open" as const;
  return observed <= end + RESOLUTION_WINDOW_MS ? "resolve" as const : "unresolved" as const;
}

export function callTiming(call: CallRecord, now = Date.now()) {
  if (call.status !== "open") return { label: { hit: "Call hit", miss: "Call missed", tie: "Tie", unresolved: "Unresolved" }[call.status], phase: "resolved" };
  const remaining = Date.parse(call.endsAt) - now;
  if (remaining <= 0) return { label: "Awaiting result", phase: "awaiting" };
  return { label: remaining < 86_400_000 ? "Ends in <1 day" : Math.ceil(remaining / 86_400_000) + " days left", phase: "open" };
}
export function signedPercent(value: number) { return (value > 0 ? "+" : "") + value.toFixed(2) + "%"; }
