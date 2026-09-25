import type { SeriesPoint } from "@/lib/series";

/** What a left-column row needs, and nothing more. */
export type BasketRow = {
  slug: string;
  name: string;
  description: string;
  holdings: { mint: string; symbol: string; company: string; weightBps: number }[];
  /** Null when the series is too short to rank inside the chosen period. */
  returnPct: number | null;
  rank: number | null;
  unrankedReason: string | null;
  argumentCount: number;
};

export type TerminalBasket = {
  basketId: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  allocationAuthor: { name: string; handle: string | null };
  execution: {
    basketVersionId: string;
    executionThesisVersionId: string;
    executionSlug: string;
    weightRationale: string | null;
    holdings: {
      mint: string;
      symbol: string;
      company: string;
      weightBps: number;
      role: string | null;
      why: string | null;
      limitation: string | null;
      tradable: boolean;
    }[];
    buyable: boolean;
    blockedReason: string | null;
  };
  performance: {
    callId: string;
    startsAt: string;
    endsAt: string;
    status: string;
    benchmark: string;
    points: SeriesPoint[];
    observedAt: string | null;
  } | null;
  arguments: {
    thesisId: string;
    thesisVersionId: string;
    slug: string;
    role: "origin" | "argument";
    claim: string;
    summary: string;
    rationale: string;
    counterargument: string;
    changeMyMind: string;
    authorName: string;
    authorHandle: string | null;
    authorDisclosure: string;
    publishedAt: string | null;
    /** The public post this argument started from, credited as the source, never as the author. */
    source?: import("@/lib/source-post").SourcePost | null;
  }[];
  activity: { buyers: number; volumeUsdc: number } | null;
};
