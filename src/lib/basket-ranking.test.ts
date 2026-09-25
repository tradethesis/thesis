import { describe, expect, it } from "vitest";

import { rankBaskets, STALE_AFTER_MS } from "./basket-ranking";

const NOW = Date.parse("2026-09-21T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const series = (rows: [number, number, number][]) =>
  rows.map(([d, basketPct, benchmarkPct]) => ({ at: daysAgo(d), basketPct, benchmarkPct }));

describe("rankBaskets", () => {
  it("ranks on return over the named period", () => {
    const out = rankBaskets(
      [
        { slug: "a", points: series([[40, 0, 0], [0, 6, 1]]) },
        { slug: "b", points: series([[40, 0, 0], [0, 2, 1]]) },
      ],
      30,
      NOW,
    );
    expect(out.map((r) => [r.slug, r.rank])).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });

  it("leaves a basket younger than the period unranked rather than extrapolated", () => {
    const out = rankBaskets(
      [
        { slug: "old", points: series([[40, 0, 0], [0, 3, 1]]) },
        { slug: "new", points: series([[2, 0, 0], [0, 99, 1]]) },
      ],
      30,
      NOW,
    );
    const fresh = out.find((r) => r.slug === "new")!;
    expect(fresh.rank).toBeNull();
    expect(fresh.returnPct).toBeNull();
    expect(fresh.unrankedReason).toBe("less than 30 days of readings");
    // And the one that can be scored still is.
    expect(out.find((r) => r.slug === "old")!.rank).toBe(1);
  });

  it("shows a stale basket without a position rather than dropping it", () => {
    const stale = [
      { at: new Date(NOW - STALE_AFTER_MS - 60_000 - 86_400_000).toISOString(), basketPct: 0, benchmarkPct: 0 },
      { at: new Date(NOW - STALE_AFTER_MS - 60_000).toISOString(), basketPct: 5, benchmarkPct: 1 },
    ];
    const out = rankBaskets([{ slug: "s", points: stale }], null, NOW);
    expect(out).toHaveLength(1);
    expect(out[0].rank).toBeNull();
    expect(out[0].unrankedReason).toBe("readings are stale");
  });

  it("gives equal figures the same rank and skips the next", () => {
    const out = rankBaskets(
      [
        { slug: "a", points: series([[40, 0, 0], [0, 4, 1]]) },
        { slug: "b", points: series([[40, 0, 0], [0, 4, 1]]) },
        { slug: "c", points: series([[40, 0, 0], [0, 1, 1]]) },
      ],
      30,
      NOW,
    );
    expect(out.map((r) => [r.slug, r.rank])).toEqual([
      ["a", 1],
      ["b", 1],
      ["c", 3],
    ]);
  });

  it("includes losses", () => {
    const out = rankBaskets(
      [
        { slug: "up", points: series([[40, 0, 0], [0, 2, 0]]) },
        { slug: "down", points: series([[40, 0, 0], [0, -7, 0]]) },
      ],
      30,
      NOW,
    );
    expect(out.find((r) => r.slug === "down")!.returnPct).toBe(-7);
    expect(out.find((r) => r.slug === "down")!.rank).toBe(2);
  });

  it("rebases inside the window rather than reporting since inception", () => {
    // Up 10% overall, but only 4% of that happened in the last 7 days.
    const out = rankBaskets(
      [{ slug: "a", points: series([[40, 0, 0], [7, 6, 2], [0, 10, 3]]) }],
      7,
      NOW,
    );
    expect(out[0].returnPct).toBeCloseTo(4, 10);
    expect(out[0].benchmarkPct).toBeCloseTo(1, 10);
  });

  it("says why a basket with one reading cannot be ranked", () => {
    const out = rankBaskets([{ slug: "a", points: series([[0, 0, 0]]) }], null, NOW);
    expect(out[0].unrankedReason).toBe("only one reading so far");
  });

  it("returns an empty list rather than inventing rows", () => {
    expect(rankBaskets([], 30, NOW)).toEqual([]);
  });
});
