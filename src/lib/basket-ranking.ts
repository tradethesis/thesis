import type { SeriesPoint } from "./series";

/**
 * Ranking baskets over a named period.
 *
 * Carried across from the call leaderboard, whose honesty properties are the reason anybody can
 * read it: losses are included, ties share a rank, and anything that cannot be scored appears
 * without a position instead of being dropped. A reader who cannot see the unrankable entries
 * does not know what the ranking left out.
 *
 * The rule that matters most here is the period. Baskets are struck at different times, so
 * "return since inception" across a three-day-old basket and a ninety-day-old one is not one
 * measure — it is two, sharing a column. A basket is ranked only when it has readings that
 * actually span the window being named, and otherwise it is **unranked with a stated reason**.
 */

/** Readings older than this make a figure a historical claim rather than a current one. */
export const STALE_AFTER_MS = 26 * 3_600_000;

export type Rankable = {
  slug: string;
  points: SeriesPoint[];
};

export type Ranked = {
  slug: string;
  returnPct: number | null;
  benchmarkPct: number | null;
  rank: number | null;
  unrankedReason: string | null;
};

/**
 * Score every basket over `days`, or over all of its history when `days` is null.
 *
 * `now` is injected so the staleness rule is testable rather than dependent on the clock.
 */
export function rankBaskets(baskets: Rankable[], days: number | null, now: number = Date.now()): Ranked[] {
  const scored = baskets.map((b): Ranked => {
    if (b.points.length < 2) {
      return {
        slug: b.slug,
        returnPct: null,
        benchmarkPct: null,
        rank: null,
        unrankedReason: b.points.length === 0 ? "no readings yet" : "only one reading so far",
      };
    }

    const latest = b.points[b.points.length - 1];
    if (now - Date.parse(latest.at) > STALE_AFTER_MS) {
      return { slug: b.slug, returnPct: null, benchmarkPct: null, rank: null, unrankedReason: "readings are stale" };
    }

    if (days === null) {
      return {
        slug: b.slug,
        returnPct: latest.basketPct,
        benchmarkPct: latest.benchmarkPct,
        rank: null,
        unrankedReason: null,
      };
    }

    // The window has to be covered by real readings at both ends. A basket younger than the
    // period cannot be compared over it, and stretching its short history to fill the column
    // would make a new basket look like an old one that went nowhere.
    const from = now - days * 86_400_000;
    const first = b.points[0];
    if (Date.parse(first.at) > from) {
      return {
        slug: b.slug,
        returnPct: null,
        benchmarkPct: null,
        rank: null,
        unrankedReason: `less than ${days} days of readings`,
      };
    }

    const opening = [...b.points].reverse().find((p) => Date.parse(p.at) <= from) ?? first;
    // Both series are already indexed to the call's opening mark, so re-basing inside the window
    // is a subtraction of two cumulative percentages, not a second normalisation.
    return {
      slug: b.slug,
      returnPct: latest.basketPct - opening.basketPct,
      benchmarkPct: latest.benchmarkPct - opening.benchmarkPct,
      rank: null,
      unrankedReason: null,
    };
  });

  // Rank the scorable ones. Equal to two decimal places shares a rank, and the next rank skips —
  // two firsts are followed by a third, because there is no second.
  const ranked = scored
    .filter((s) => s.returnPct !== null)
    .sort((a, b) => b.returnPct! - a.returnPct! || a.slug.localeCompare(b.slug));

  let position = 0;
  let previous: string | null = null;
  ranked.forEach((row, i) => {
    const key = row.returnPct!.toFixed(2);
    if (key !== previous) {
      position = i + 1;
      previous = key;
    }
    row.rank = position;
  });

  return scored;
}
