import type { SeriesPoint } from "@/server/calls/observations";

export type { SeriesPoint };

/**
 * Scoring somebody's call on a thesis.
 *
 * One rule governs this file: a conviction is scored from the moment it was taken, never
 * from the moment the call started. Grading someone on a rise that happened before they
 * arrived is the standard way a scoreboard like this flatters everybody, and it is the same
 * forward-only discipline the wallet screens use — you never grade on the window that
 * selected the entry.
 *
 * Everything else follows from that. Switching sides resets the clock, because credit for a
 * period spent on the other side is credit for a view you did not hold. And a conviction
 * with no observation after it yet is "too early", which is deliberately not zero: an
 * unscored call must never be counted as a win, a loss, or a draw.
 */

export type Side = "backing" | "doubting";

export type ConvictionStatus =
  /** No observation has landed since this was taken. Not a result. */
  | "too_early"
  /** The call is going the way this side needs. */
  | "ahead"
  | "behind"
  /** Indistinguishable at the precision shown. */
  | "level"
  /** The basket was re-weighted, so this call is closed against the basket it was taken on. */
  | "closed"
  /** No call runs on this basket, so there is no benchmark to score against — ever. */
  | "unscored";

export type ConvictionScore = {
  status: ConvictionStatus;
  /**
   * The basket's lead over the benchmark in percentage points, measured from the entry
   * observation. Null when there is nothing to measure yet.
   */
  edgePercent: number | null;
  /** The observation the scoring actually started from, which is at or after the entry. */
  fromObservedAt: string | null;
  /** How many observations have landed since entry. One is not enough to move. */
  observationsSinceEntry: number;
};

/**
 * Two decimal places, compared as integers.
 *
 * The figure on screen is the figure that decides. Calling one side a winner on a
 * difference the reader cannot see is false precision, so a tie at the displayed precision
 * is a draw and says so.
 */
function displayed(value: number): number {
  return Math.round(value * 100);
}

/**
 * Growth between two cumulative-return readings.
 *
 * Both are indexed to the call's first observation, so the return between them is the ratio
 * of the two, not the difference. Subtracting the percentages is close enough to look right
 * and wrong enough to matter once a call has actually moved.
 */
function growthBetween(fromPct: number, toPct: number): number {
  return (1 + toPct / 100) / (1 + fromPct / 100) - 1;
}

export function scoreConviction(
  points: SeriesPoint[],
  takenAt: string,
  side: Side,
  options: { basketChanged?: boolean; hasCall?: boolean } = {},
): ConvictionScore {
  // No call, no benchmark, nothing to measure — and unlike "too early" this does not
  // resolve itself by waiting. Saying "too early" here would promise a result that is
  // never coming.
  if (options.hasCall === false) {
    return { status: "unscored", edgePercent: null, fromObservedAt: null, observationsSinceEntry: 0 };
  }

  // A re-weighted basket is not the thing this person called. It is closed against what
  // they actually backed rather than quietly rescored against something else.
  if (options.basketChanged) {
    return { status: "closed", edgePercent: null, fromObservedAt: null, observationsSinceEntry: 0 };
  }

  const entryTime = Date.parse(takenAt);
  const after = points.filter((p) => Date.parse(p.at) >= entryTime);

  // Fewer than two observations since entry means nothing has been measured yet. The first
  // one is only the starting line.
  if (after.length < 2) {
    return {
      status: "too_early",
      edgePercent: null,
      fromObservedAt: after[0]?.at ?? null,
      observationsSinceEntry: after.length,
    };
  }

  const entry = after[0];
  const latest = after[after.length - 1];

  const basket = growthBetween(entry.basketPct, latest.basketPct);
  const benchmark = growthBetween(entry.benchmarkPct, latest.benchmarkPct);
  const edgePercent = (basket - benchmark) * 100;

  const edge = displayed(edgePercent);
  const status: ConvictionStatus =
    edge === 0 ? "level" : side === "backing" ? (edge > 0 ? "ahead" : "behind") : edge < 0 ? "ahead" : "behind";

  return { status, edgePercent, fromObservedAt: entry.at, observationsSinceEntry: after.length };
}

/** The points a conviction is scored over, for charting the window actually being judged. */
export function pointsSinceEntry(points: SeriesPoint[], takenAt: string): SeriesPoint[] {
  const entryTime = Date.parse(takenAt);
  const after = points.filter((p) => Date.parse(p.at) >= entryTime);
  if (after.length < 2) return after;

  // Re-index to the entry so the chart shows the window being scored, starting at zero,
  // rather than inheriting a rise that happened before this person arrived.
  const entry = after[0];
  return after.map((p) => ({
    at: p.at,
    basketPct: growthBetween(entry.basketPct, p.basketPct) * 100,
    benchmarkPct: growthBetween(entry.benchmarkPct, p.benchmarkPct) * 100,
  }));
}

/**
 * How a set of convictions has gone, for a personal record line.
 *
 * "Too early" and "closed" are reported separately rather than folded into the total,
 * because a record of "3 of 4 ahead" that quietly excludes the unscored ones is a record
 * that improves by adding calls nobody has judged yet.
 */
export function summarise(scores: ConvictionScore[]): {
  taken: number;
  scorable: number;
  ahead: number;
  behind: number;
  level: number;
  tooEarly: number;
  closed: number;
  unscored: number;
} {
  const count = (s: ConvictionStatus) => scores.filter((x) => x.status === s).length;
  const ahead = count("ahead");
  const behind = count("behind");
  const level = count("level");

  return {
    taken: scores.length,
    scorable: ahead + behind + level,
    ahead,
    behind,
    level,
    tooEarly: count("too_early"),
    closed: count("closed"),
    unscored: count("unscored"),
  };
}

/**
 * Below this many participants, no split is shown at all.
 *
 * A percentage built from three people is invented social proof wearing a number. The count
 * is always displayed alongside whatever this gates, so nobody has to guess what it rests on.
 */
export const CROWD_FLOOR = 5;

export function crowdSplit(backing: number, doubting: number): { show: boolean; total: number; backingPct: number } {
  const total = backing + doubting;
  return { show: total >= CROWD_FLOOR, total, backingPct: total ? (backing / total) * 100 : 0 };
}
