/**
 * One reading of a call, as a percentage from its opening mark.
 *
 * Lives in lib rather than beside the loader because the chart is a client component and the
 * loader is a server module — importing the type from there would drag the database client into
 * the browser bundle.
 */
export type SeriesPoint = {
  /** ISO. When the quotes were taken. */
  at: string;
  /** Percent change since the call was struck. */
  basketPct: number;
  benchmarkPct: number;
};
