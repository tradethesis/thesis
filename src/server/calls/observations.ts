import { asc, inArray } from "drizzle-orm";

import { db } from "../db/client";
import { callObservation } from "../db/schema";

import type { SeriesPoint } from "@/lib/series";

export type { SeriesPoint } from "@/lib/series";

/**
 * Each call's observations as cumulative percentages, oldest first.
 *
 * Indexed to the call's opening mark rather than plotted in dollars, because the basket and
 * the benchmark start from the same $150 and a reader comparing them wants the divergence,
 * not two near-identical dollar lines. Indexing also puts both series on one axis, which is
 * the only way two measures should ever share a chart.
 *
 * Returns whatever exists, including a single point. The caller decides what too few points
 * looks like; this refuses to interpolate, because a line drawn through observations that
 * were never taken is a picture of data we do not have.
 */
export async function loadSeries(callIds: string[]): Promise<Map<string, SeriesPoint[]>> {
  if (!callIds.length) return new Map();

  const rows = await db
    .select()
    .from(callObservation)
    .where(inArray(callObservation.callId, callIds))
    .orderBy(asc(callObservation.callId), asc(callObservation.observedAt));

  const byCall = new Map<string, SeriesPoint[]>();
  // The first observation of each call is its baseline. Since 21 September 2026 that really is
  // the call's opening mark: startCall writes it here as well as onto start_snapshot, and the
  // existing sixty were backfilled from their own snapshots. Before that this baselined on the
  // first cron reading while the leaderboard scored from the true origin, so the chart and the
  // ranking disagreed and the chart's caption was false.
  //
  // Kept in its own map rather than stashed on the array, because a property hidden on a list is
  // the kind of thing that survives until somebody copies the array.
  const baseline = new Map<string, { basket: number; benchmark: number }>();

  for (const row of rows) {
    const basket = Number(row.basketUsdcRaw);
    const benchmark = Number(row.benchmarkUsdcRaw);
    if (!(basket > 0) || !(benchmark > 0)) continue;

    if (!baseline.has(row.callId)) {
      baseline.set(row.callId, { basket, benchmark });
      byCall.set(row.callId, [{ at: row.observedAt.toISOString(), basketPct: 0, benchmarkPct: 0 }]);
      continue;
    }

    const base = baseline.get(row.callId)!;
    byCall.get(row.callId)!.push({
      at: row.observedAt.toISOString(),
      basketPct: ((basket - base.basket) / base.basket) * 100,
      benchmarkPct: ((benchmark - base.benchmark) / base.benchmark) * 100,
    });
  }

  return byCall;
}
