"use client";

import { useEffect } from "react";

import { anonId } from "@/lib/anon-id";

/**
 * Counts one view of a thesis.
 *
 * Renders nothing. Fires once per mount, after paint, with keepalive so that a reader who
 * clicks straight through to the basket still gets counted.
 *
 * Nothing on screen depends on this — the call card's middle tier reads the call's
 * scoreboard, not a view count — because the counts start at zero today and a number that
 * says "3 people looked at this" is worse than no number. This is here so the number is
 * real by the time it is worth showing.
 */
export function RecordView({ thesisVersionId }: { thesisVersionId: string }) {
  useEffect(() => {
    const body = JSON.stringify({ name: "thesis_viewed", thesisVersionId, anonId: anonId() });
    // Errors are ignored rather than retried. A dropped count is not worth a second
    // request, and definitely not worth a console error on a reader's screen.
    void fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  }, [thesisVersionId]);

  return null;
}
