import { describe, expect, it } from "vitest";
import { RESOLUTION_WINDOW_MS, callTiming, resolutionState, scoreCall, type CallRecord, type CallSnapshot } from "./calls";

function snapshot(basket: string, benchmark: string, startedAt = "2026-09-15T12:00:00Z", observedAt = startedAt): CallSnapshot {
  return { basketUsdcRaw: basket, benchmarkUsdcRaw: benchmark, startedAt, observedAt, quotes: [] };
}
describe("call scores are independent of a buyer's entry or edited weights", () => {
  it("compares returns, not raw basket values or different starting costs", () => {
    const result = scoreCall(snapshot("149000000", "148000000"), snapshot("163900000", "162800000"));
    expect(result.outcome).toBe("tie");
    expect(result.basketPercent).toBe(10);
    expect(result.benchmarkPercent).toBe(10);
  });
  it("a losing basket can still outperform a worse benchmark", () => {
    expect(scoreCall(snapshot("100", "100"), snapshot("90", "80")).outcome).toBe("hit");
  });
  it("a profitable basket can miss its outperformance call", () => {
    expect(scoreCall(snapshot("100", "100"), snapshot("105", "110")).outcome).toBe("miss");
  });
  it("does not round a tiny edge into a tie", () => {
    expect(scoreCall(snapshot("100000000000000000000", "100000000000000000000"), snapshot("100000000000000000001", "100000000000000000000")).outcome).toBe("hit");
  });
  it("rejects zero or negative values rather than calculating a result", () => {
    expect(() => scoreCall(snapshot("0", "100"), snapshot("100", "100"))).toThrow();
    expect(() => scoreCall(snapshot("100", "100"), snapshot("-1", "100"))).toThrow();
  });
});
describe("deadline and outage rules", () => {
  const end = "2026-12-14T12:00:00Z";
  it("does not resolve an observation begun before the deadline", () => {
    expect(resolutionState(end, snapshot("100", "100", "2026-12-14T11:59:59Z", "2026-12-14T12:00:01Z"))).toBe("open");
  });
  it("accepts an observation started at the deadline", () => {
    expect(resolutionState(end, snapshot("100", "100", end))).toBe("resolve");
  });
  it("leaves missed windows unresolved rather than using a late price", () => {
    const late = new Date(Date.parse(end) + RESOLUTION_WINDOW_MS + 1).toISOString();
    expect(resolutionState(end, snapshot("100", "100", late))).toBe("unresolved");
  });
  it("rejects invalid timestamps and time travelling observations", () => {
    expect(() => resolutionState(end, snapshot("100", "100", "invalid"))).toThrow();
    expect(() => resolutionState(end, snapshot("100", "100", end, "2026-09-15"))).toThrow();
  });
  it("does not turn an expired open call into a win", () => {
    expect(callTiming({ status: "open", endsAt: end } as CallRecord, Date.parse(end) + 1).label).toBe("Awaiting result");
  });
});
