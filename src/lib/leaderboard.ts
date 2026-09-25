import { scoreCall, type CallRecord } from "./calls";

/**
 * Ranking calls honestly.
 *
 * A leaderboard is the easiest surface in this product to lie on, and most of the lying is
 * done by omission: dropping the losers, counting an unresolved call as a win, ranking a
 * price nobody has refreshed in a week, or quietly switching the default to whichever view
 * happens to look good today. Every rule below exists to close one of those doors, and the
 * tests in leaderboard.test.ts exist so they stay closed.
 */

/** An observation older than this is the last thing we know, not the current price. */
export const STALE_AFTER_MS = 26 * 60 * 60 * 1000;

export type RankMetric = "edge" | "basket";
export type RankScope = "completed" | "live";

export type RankedCall = {
  call: CallRecord;
  /** Null when the call cannot be scored — no observation after the start. */
  basketPercent: number | null;
  benchmarkPercent: number | null;
  edgePercent: number | null;
  /** Shown, never ranked. */
  stale: boolean;
  /** Why this row carries no numbers, for the UI to say out loud. */
  excludedReason: "awaiting_first_observation" | "stale_prices" | "no_valid_close" | null;
  /** 1-based. Rows that share a value share a rank; null when unranked. */
  rank: number | null;
  /** ISO year-week of the call's start, so only comparable cohorts are compared. */
  cohort: string;
};

/**
 * ISO-8601 year and week. Calls that began in different weeks began in different markets,
 * so a cohort filter is the difference between a ranking and a coincidence.
 */
export function startCohort(startsAt: string): string {
  const d = new Date(startsAt);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // Thursday of the current week decides the ISO year.
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * Two decimal places, compared as integers.
 *
 * The displayed figure is what ranks. If two calls both read "+1.20 pp", ranking one above
 * the other on a difference the reader cannot see is false precision — they are tied, and
 * the table should say so.
 */
function rankable(value: number): number {
  return Math.round(value * 100);
}

function measure(call: CallRecord, now: number) {
  const started = call.start.observedAt !== call.latest.observedAt;
  if (!started) {
    return { score: null, stale: false, reason: "awaiting_first_observation" as const };
  }

  const score = scoreCall(call.start, call.latest);
  // A resolved call's numbers are final; staleness is only meaningful while it is running.
  const stale =
    call.status === "open" &&
    (Boolean(call.lastError) || now - Date.parse(call.latest.observedAt) > STALE_AFTER_MS);

  if (call.status === "unresolved") {
    return { score, stale, reason: "no_valid_close" as const };
  }
  return { score, stale, reason: stale ? ("stale_prices" as const) : null };
}

export function rankCalls(
  calls: CallRecord[],
  options: { scope: RankScope; metric: RankMetric; cohort?: string | null; now?: number },
): RankedCall[] {
  const now = options.now ?? Date.now();

  const scoped = calls.filter((c) =>
    options.scope === "completed"
      ? // Completed means the call reached a verdict. "unresolved" reached the deadline
        // without a valid observation, which is a failure to measure, not a result — it is
        // listed so it cannot be hidden, but it is never a completed success.
        c.status === "hit" || c.status === "miss" || c.status === "tie" || c.status === "unresolved"
      : c.status === "open",
  );

  const rows: RankedCall[] = scoped
    .filter((c) => !options.cohort || startCohort(c.startsAt) === options.cohort)
    .map((call) => {
      const { score, stale, reason } = measure(call, now);
      return {
        call,
        basketPercent: score?.basketPercent ?? null,
        benchmarkPercent: score?.benchmarkPercent ?? null,
        edgePercent: score?.edgePercent ?? null,
        stale,
        excludedReason: reason,
        rank: null,
        cohort: startCohort(call.startsAt),
      };
    });

  const value = (r: RankedCall) => (options.metric === "edge" ? r.edgePercent : r.basketPercent);

  // Only rows with a number and no reason to distrust it take part in the ranking. The rest
  // still render — a leaderboard that drops rows it cannot score is a leaderboard that hides
  // its own gaps — but they sort to the bottom and carry no position.
  const ranked = rows.filter((r) => r.excludedReason === null && value(r) !== null);
  const unranked = rows.filter((r) => r.excludedReason !== null || value(r) === null);

  ranked.sort((a, b) => rankable(value(b)!) - rankable(value(a)!));

  let position = 0;
  let lastValue: number | null = null;
  ranked.forEach((row, index) => {
    const v = rankable(value(row)!);
    if (lastValue === null || v !== lastValue) {
      position = index + 1;
      lastValue = v;
    }
    row.rank = position;
  });

  // Deterministic order for the rows that cannot be ranked, so the table does not reshuffle
  // between renders for reasons a reader cannot see.
  unranked.sort((a, b) => a.call.startsAt.localeCompare(b.call.startsAt));

  return [...ranked, ...unranked];
}

/** The cohorts present in a set of calls, most recent first. */
export function cohortsOf(calls: CallRecord[]): string[] {
  return [...new Set(calls.map((c) => startCohort(c.startsAt)))].sort().reverse();
}
