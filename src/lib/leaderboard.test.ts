import { describe, expect, it } from "vitest";

import type { CallRecord, CallSnapshot } from "./calls";
import { cohortsOf, rankCalls, startCohort } from "./leaderboard";

const HOUR = 3_600_000;
const NOW = Date.parse("2026-09-17T12:00:00.000Z");

function snapshot(startedAt: string, observedAt: string, basket: bigint, benchmark: bigint): CallSnapshot {
  return {
    startedAt,
    observedAt,
    basketUsdcRaw: basket.toString(),
    benchmarkUsdcRaw: benchmark.toString(),
    quotes: [],
  };
}

/**
 * A call whose basket moved `basketPct` and whose benchmark moved `benchPct` since the
 * start, observed `observedHoursAgo` before NOW.
 */
function call(opts: {
  id: string;
  basketPct: number;
  benchPct: number;
  status?: CallRecord["status"];
  observedHoursAgo?: number;
  startsAt?: string;
  started?: boolean;
  lastError?: string | null;
}): CallRecord {
  const base = 150_000_000n;
  const startedAt = opts.startsAt ?? "2026-09-15T09:00:00.000Z";
  const observedAt = new Date(NOW - (opts.observedHoursAgo ?? 1) * HOUR).toISOString();
  const start = snapshot(startedAt, startedAt, base, base);
  const latest = opts.started === false
    ? start
    : snapshot(
        observedAt,
        observedAt,
        BigInt(Math.round(Number(base) * (1 + opts.basketPct / 100))),
        BigInt(Math.round(Number(base) * (1 + opts.benchPct / 100))),
      );

  return {
    id: opts.id,
    versionId: `v-${opts.id}`,
    thesisId: `t-${opts.id}`,
    basketKey: `k-${opts.id}`,
    statement: "beats SPYx",
    rules: "rules",
    benchmark: "SPYx",
    durationDays: 90,
    startsAt: startedAt,
    endsAt: "2026-12-14T09:00:00.000Z",
    status: opts.status ?? "open",
    start,
    latest,
    lastError: opts.lastError ?? null,
  };
}

describe("startCohort", () => {
  it("groups calls that began in the same ISO week", () => {
    expect(startCohort("2026-09-15T09:00:00.000Z")).toBe(startCohort("2026-09-17T23:00:00.000Z"));
  });

  it("separates calls that began in different weeks", () => {
    expect(startCohort("2026-09-15T09:00:00.000Z")).not.toBe(startCohort("2026-09-22T09:00:00.000Z"));
  });

  it("puts a Sunday with the week it ends, not the one it precedes", () => {
    // 2026-09-20 is a Sunday; ISO weeks run Monday to Sunday.
    expect(startCohort("2026-09-20T12:00:00.000Z")).toBe(startCohort("2026-09-15T12:00:00.000Z"));
  });
});

describe("rankCalls", () => {
  it("ranks live calls by outperformance, best first, losses included", () => {
    const rows = rankCalls(
      [
        call({ id: "behind", basketPct: -2, benchPct: 1 }),
        call({ id: "ahead", basketPct: 4, benchPct: 1 }),
        call({ id: "middle", basketPct: 2, benchPct: 1 }),
      ],
      { scope: "live", metric: "edge", now: NOW },
    );

    expect(rows.map((r) => r.call.id)).toEqual(["ahead", "middle", "behind"]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    // The loser is ranked, not dropped.
    expect(rows[2].edgePercent).toBeLessThan(0);
  });

  it("can rank by basket return instead, which is a different order", () => {
    const calls = [
      call({ id: "high-return-low-edge", basketPct: 6, benchPct: 5.5 }),
      call({ id: "low-return-high-edge", basketPct: 2, benchPct: -3 }),
    ];
    expect(rankCalls(calls, { scope: "live", metric: "basket", now: NOW }).map((r) => r.call.id)).toEqual([
      "high-return-low-edge",
      "low-return-high-edge",
    ]);
    expect(rankCalls(calls, { scope: "live", metric: "edge", now: NOW }).map((r) => r.call.id)).toEqual([
      "low-return-high-edge",
      "high-return-low-edge",
    ]);
  });

  it("gives equal displayed figures the same rank and skips the next position", () => {
    const rows = rankCalls(
      [
        // Differ far below the second decimal: the reader sees the same number.
        call({ id: "a", basketPct: 3.000001, benchPct: 1 }),
        call({ id: "b", basketPct: 3.000002, benchPct: 1 }),
        call({ id: "c", basketPct: 1, benchPct: 1 }),
      ],
      { scope: "live", metric: "edge", now: NOW },
    );
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 3]);
  });

  it("refuses to rank a call whose prices are stale, but still shows it", () => {
    const rows = rankCalls(
      [
        call({ id: "fresh", basketPct: 1, benchPct: 0 }),
        call({ id: "stale", basketPct: 9, benchPct: 0, observedHoursAgo: 40 }),
      ],
      { scope: "live", metric: "edge", now: NOW },
    );

    const stale = rows.find((r) => r.call.id === "stale")!;
    expect(stale.rank).toBeNull();
    expect(stale.stale).toBe(true);
    expect(stale.excludedReason).toBe("stale_prices");
    // Present, so the gap is visible rather than silently omitted.
    expect(rows).toHaveLength(2);
    // The fresh call takes first place rather than losing it to a better-looking old price.
    expect(rows.find((r) => r.call.id === "fresh")!.rank).toBe(1);
  });

  it("treats a recorded fetch error as stale however recent the observation", () => {
    const [row] = rankCalls([call({ id: "errored", basketPct: 5, benchPct: 0, lastError: "quote failed" })], {
      scope: "live",
      metric: "edge",
      now: NOW,
    });
    expect(row.rank).toBeNull();
    expect(row.excludedReason).toBe("stale_prices");
  });

  it("does not rank a call with no observation after its start", () => {
    const [row] = rankCalls([call({ id: "new", basketPct: 0, benchPct: 0, started: false })], {
      scope: "live",
      metric: "edge",
      now: NOW,
    });
    expect(row.rank).toBeNull();
    expect(row.excludedReason).toBe("awaiting_first_observation");
    expect(row.edgePercent).toBeNull();
  });

  it("never counts an unresolved call as a completed success", () => {
    const rows = rankCalls(
      [
        call({ id: "won", basketPct: 3, benchPct: 1, status: "hit" }),
        // Would top the table on the numbers alone.
        call({ id: "unresolved", basketPct: 40, benchPct: 1, status: "unresolved" }),
      ],
      { scope: "completed", metric: "edge", now: NOW },
    );

    expect(rows[0].call.id).toBe("won");
    expect(rows[0].rank).toBe(1);
    const unresolved = rows.find((r) => r.call.id === "unresolved")!;
    expect(unresolved.rank).toBeNull();
    expect(unresolved.excludedReason).toBe("no_valid_close");
  });

  it("keeps completed and live scopes apart", () => {
    const calls = [call({ id: "open", basketPct: 1, benchPct: 0 }), call({ id: "done", basketPct: 1, benchPct: 0, status: "miss" })];
    expect(rankCalls(calls, { scope: "completed", metric: "edge", now: NOW }).map((r) => r.call.id)).toEqual(["done"]);
    expect(rankCalls(calls, { scope: "live", metric: "edge", now: NOW }).map((r) => r.call.id)).toEqual(["open"]);
  });

  it("compares only within a cohort when one is given", () => {
    const thisWeek = call({ id: "this-week", basketPct: 1, benchPct: 0 });
    const lastWeek = call({ id: "last-week", basketPct: 8, benchPct: 0, startsAt: "2026-09-08T09:00:00.000Z" });

    const rows = rankCalls([thisWeek, lastWeek], {
      scope: "live",
      metric: "edge",
      cohort: startCohort(thisWeek.startsAt),
      now: NOW,
    });
    expect(rows.map((r) => r.call.id)).toEqual(["this-week"]);
  });

  it("lists cohorts newest first", () => {
    const cohorts = cohortsOf([
      call({ id: "a", basketPct: 0, benchPct: 0, startsAt: "2026-09-08T09:00:00.000Z" }),
      call({ id: "b", basketPct: 0, benchPct: 0, startsAt: "2026-09-15T09:00:00.000Z" }),
    ]);
    expect(cohorts).toEqual([startCohort("2026-09-15T09:00:00.000Z"), startCohort("2026-09-08T09:00:00.000Z")]);
  });

  it("returns an empty list rather than inventing rows when nothing has completed", () => {
    expect(rankCalls([call({ id: "open", basketPct: 5, benchPct: 0 })], { scope: "completed", metric: "edge", now: NOW })).toEqual([]);
  });
});
