import { describe, expect, it } from "vitest";

import type { SeriesPoint } from "@/server/calls/observations";
import { CROWD_FLOOR, crowdSplit, pointsSinceEntry, scoreConviction, summarise } from "./conviction";

const day = (n: number) => `2026-09-${String(10 + n).padStart(2, "0")}T03:15:00.000Z`;

/** Cumulative returns indexed to the call's first observation, as loadSeries produces them. */
function series(rows: [number, number][]): SeriesPoint[] {
  return rows.map(([basketPct, benchmarkPct], i) => ({ at: day(i), basketPct, benchmarkPct }));
}

describe("scoreConviction — forward-only", () => {
  // The basket climbs hard before the entry, then loses to the benchmark afterwards.
  const runUpThenLose = series([
    [0, 0],
    [10, 0],
    [12, 0],
    [12, 6],
  ]);

  it("ignores everything before the call was taken", () => {
    const score = scoreConviction(runUpThenLose, day(1), "backing");
    // From day 1 the basket went 10% -> 12% (+1.82%) while the benchmark went 0 -> 6%.
    expect(score.status).toBe("behind");
    expect(score.edgePercent).toBeLessThan(0);
    expect(score.fromObservedAt).toBe(day(1));
  });

  it("would have looked like a win if it had been scored from the call start", () => {
    // Guards the actual mistake: scoring from the beginning shows the basket up 12 against
    // the benchmark up 6 and calls the same person a winner.
    const fromStart = scoreConviction(runUpThenLose, day(0), "backing");
    expect(fromStart.status).toBe("ahead");
    // Same data, same side, opposite verdict — which is why the entry time governs.
    expect(scoreConviction(runUpThenLose, day(1), "backing").status).toBe("behind");
  });

  it("starts from the first observation at or after the entry, not the nearest one before", () => {
    const takenBetween = "2026-09-11T09:00:00.000Z"; // after day(1), before day(2)
    expect(scoreConviction(runUpThenLose, takenBetween, "backing").fromObservedAt).toBe(day(2));
  });
});

describe("scoreConviction — too early is not a result", () => {
  it("reports too_early when no observation has landed since entry", () => {
    const score = scoreConviction(series([[0, 0], [5, 1]]), "2026-09-30T00:00:00.000Z", "backing");
    expect(score.status).toBe("too_early");
    expect(score.edgePercent).toBeNull();
    expect(score.observationsSinceEntry).toBe(0);
  });

  it("reports too_early on exactly one observation, which is only a starting line", () => {
    const score = scoreConviction(series([[0, 0], [5, 1]]), day(1), "backing");
    expect(score.status).toBe("too_early");
    expect(score.edgePercent).toBeNull();
    expect(score.observationsSinceEntry).toBe(1);
  });
});

describe("scoreConviction — sides and draws", () => {
  const basketWins = series([[0, 0], [0, 0], [4, 1]]);

  it("resolves backing and doubting in opposite directions on the same data", () => {
    expect(scoreConviction(basketWins, day(1), "backing").status).toBe("ahead");
    expect(scoreConviction(basketWins, day(1), "doubting").status).toBe("behind");
  });

  it("calls a tie at the displayed precision a draw, for both sides", () => {
    const flat = series([[0, 0], [0, 0], [2.0001, 2.0001]]);
    expect(scoreConviction(flat, day(1), "backing").status).toBe("level");
    expect(scoreConviction(flat, day(1), "doubting").status).toBe("level");
  });

  it("measures the edge as a ratio, not by subtracting cumulative percentages", () => {
    // Basket 50 -> 60 is +6.67%; benchmark 50 -> 55 is +3.33%. Subtracting the cumulative
    // figures would give 10 - 5 = 5pp, which is wrong once a call has really moved.
    const moved = series([[0, 0], [50, 50], [60, 55]]);
    const score = scoreConviction(moved, day(1), "backing");
    expect(score.edgePercent).toBeCloseTo(3.33, 1);
  });
});

describe("scoreConviction — a re-weighted basket", () => {
  it("closes the call rather than rescoring it against something else", () => {
    const score = scoreConviction(series([[0, 0], [1, 0], [2, 0]]), day(0), "backing", { basketChanged: true });
    expect(score.status).toBe("closed");
    expect(score.edgePercent).toBeNull();
  });
});

describe("pointsSinceEntry", () => {
  it("re-indexes to the entry so the chart starts where the call did", () => {
    const points = pointsSinceEntry(series([[0, 0], [10, 0], [12, 6]]), day(1));
    expect(points).toHaveLength(2);
    expect(points[0].basketPct).toBeCloseTo(0, 6);
    expect(points[0].benchmarkPct).toBeCloseTo(0, 6);
    expect(points[1].basketPct).toBeCloseTo(1.818, 2);
    expect(points[1].benchmarkPct).toBeCloseTo(6, 6);
  });

  it("returns what exists when there is not enough to re-index", () => {
    expect(pointsSinceEntry(series([[0, 0], [1, 1]]), day(1))).toHaveLength(1);
  });
});

describe("summarise", () => {
  it("keeps unscored calls out of the record rather than folding them in", () => {
    const s = summarise([
      scoreConviction(series([[0, 0], [0, 0], [4, 1]]), day(1), "backing"), // ahead
      scoreConviction(series([[0, 0], [0, 0], [1, 4]]), day(1), "backing"), // behind
      scoreConviction(series([[0, 0], [1, 1]]), day(1), "backing"), // too early
      scoreConviction(series([[0, 0], [1, 1]]), day(0), "backing", { basketChanged: true }), // closed
    ]);

    expect(s.taken).toBe(4);
    // Only the two that were actually judged count towards the record.
    expect(s.scorable).toBe(2);
    expect(s.ahead).toBe(1);
    expect(s.behind).toBe(1);
    expect(s.tooEarly).toBe(1);
    expect(s.closed).toBe(1);
  });
});

describe("crowdSplit", () => {
  it("shows nothing below the floor", () => {
    expect(crowdSplit(3, 1).show).toBe(false);
    expect(crowdSplit(CROWD_FLOOR - 1, 0).show).toBe(false);
  });

  it("shows the split once enough people have taken a side", () => {
    const split = crowdSplit(4, 1);
    expect(split.show).toBe(true);
    expect(split.total).toBe(5);
    expect(split.backingPct).toBe(80);
  });

  it("does not divide by zero when nobody has called it", () => {
    expect(crowdSplit(0, 0)).toEqual({ show: false, total: 0, backingPct: 0 });
  });
});

describe("a thesis with no call", () => {
  it("is unscored rather than too early, because waiting will not fix it", () => {
    const score = scoreConviction([], "2026-09-18T00:00:00Z", "backing", { hasCall: false });
    expect(score.status).toBe("unscored");
    expect(score.edgePercent).toBeNull();
  });

  it("is not counted as scorable, ahead, behind, or too early", () => {
    const summary = summarise([
      scoreConviction([], "2026-09-18T00:00:00Z", "backing", { hasCall: false }),
      scoreConviction(
        [
          { at: "2026-09-18T00:00:00Z", basketPct: 0, benchmarkPct: 0 },
          { at: "2026-09-19T00:00:00Z", basketPct: 2, benchmarkPct: 1 },
        ],
        "2026-09-18T00:00:00Z",
        "backing",
      ),
    ]);
    expect(summary).toMatchObject({ taken: 2, scorable: 1, ahead: 1, tooEarly: 0, unscored: 1 });
  });
});
