import type { BasketView } from "@/server/baskets/queries";

/** Mirrors the server's match types, narrowed to what the page renders. */
export type Explanation = { why: string; misses: string | null };

/** The provider's own distribution for a basket's direction. Displayed as returned; nothing derives from it. */
export type DirectionDist = { choice: string; same: number; opposite: number; unclear: number };

export type Candidate = {
  slug: string;
  name: string;
  description: string;
  category: string;
  strength: "strong" | "partial" | "weak";
  label: string;
  bar: number;
  contradicts: boolean;
  direction: DirectionDist;
  explanation: Explanation;
  basket: BasketView;
};

export type PostSource = {
  kind: "post";
  handle: string;
  authorName: string | null;
  url: string;
  postedAt: string | null;
};

export type Telemetry = {
  model: string;
  batches: number;
  candidates: number;
  questions: number;
  inputTokens: number;
  outputTokens: number;
  providerMs: number;
};

export type Judged = {
  slug: string;
  strength: "strong" | "partial" | "weak";
  bar: number;
  contradicts: boolean;
  direction: DirectionDist;
};

export type MatchResponse =
  | {
      status: "ok";
      query: string;
      source: PostSource | { kind: "text" };
      candidates: Candidate[];
      noMatch: boolean;
      noMatchNote: string | null;
      fixture: boolean;
      telemetry: Telemetry | null;
    }
  | { status: "unretrievable"; query: string; message: string }
  | { status: "unavailable"; query: string; reason: string; message: string }
  | { status: "empty_catalogue"; query: string }
  | { status: "error"; query: string; message: string };

export type MatchEvent =
  | { type: "started"; query: string; source: PostSource | { kind: "text" }; candidates: { slug: string; name: string }[] }
  | { type: "scored"; slug: string; judged: Judged; usage: { model: string; inputTokens: number; outputTokens: number; questions: number; candidates: number; ms: number } }
  | { type: "done"; result: MatchResponse }
  | { type: "failed"; result: MatchResponse };

export type Example = { label: string; idea: string };
