"use client";

import { useCallback, useEffect, useState } from "react";

import { anonId } from "./anon-id";
import type { ConvictionScore, SeriesPoint, Side } from "./conviction";

export type MyConviction = {
  thesisId: string;
  versionId: string;
  callId: string | null;
  side: Side;
  basketKey: string;
  takenAt: string;
  slug: string;
  claim: string;
  score: ConvictionScore;
  points: SeriesPoint[];
};

type Mine = Map<string, MyConviction>;

const EVENT = "thesis:conviction-changed";

/** The anonymous id travels in a header, never in the body, matching the route's rule. */
function headers(): HeadersInit {
  const id = anonId();
  return id ? { "content-type": "application/json", "x-thesis-anon": id } : { "content-type": "application/json" };
}

/**
 * One answer, shared by every component that asks.
 *
 * The feed renders fifty-nine cards and each one mounts two of these — the thumbs and the
 * verdict line — so a per-instance fetch is a hundred and eighteen identical requests on
 * first paint, and a hundred and eighteen chances for two parts of the same card to
 * disagree about what you called. The module holds the answer; the hook reads it.
 */
let cache: Mine | null = null;
let inflight: Promise<Mine> | null = null;

async function read(): Promise<Mine> {
  try {
    const res = await fetch("/api/conviction", { headers: headers() });
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as { convictions: MyConviction[] };
    return new Map(body.convictions.map((c) => [c.thesisId, c]));
  } catch {
    // An empty map renders as "no side taken", which is the safe reading: it invites the
    // action again rather than claiming a side that may not have saved.
    return new Map();
  }
}

async function loadShared(force = false): Promise<Mine> {
  if (!force && cache) return cache;
  // Callers that arrive while a request is open wait on that one rather than starting
  // another, which is what collapses first paint to a single fetch.
  inflight ??= read().then((next) => {
    cache = next;
    inflight = null;
    return next;
  });
  return inflight;
}

/**
 * The sides this browser (or wallet) has taken.
 *
 * Every instance reads the same cache and re-reads it on one window event, so the thumbs on
 * a card and the verdict beneath them can never show different answers.
 */
export function useConviction() {
  const [mine, setMine] = useState<Mine | null>(cache);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const sync = () => {
      if (live) setMine(cache);
    };

    void loadShared().then(sync);
    window.addEventListener(EVENT, sync);
    return () => {
      live = false;
      window.removeEventListener(EVENT, sync);
    };
  }, []);

  const take = useCallback(
    async (thesisId: string, side: Side) => {
      setBusy(thesisId);
      setError(null);
      try {
        const existing = cache?.get(thesisId);
        // Tapping the side you already hold clears it, so the control is its own undo.
        if (existing?.side === side) {
          const res = await fetch(`/api/conviction?thesisId=${thesisId}`, { method: "DELETE", headers: headers() });
          if (!res.ok && res.status !== 204) throw new Error(String(res.status));
        } else {
          const res = await fetch("/api/conviction", {
            method: "POST",
            headers: headers(),
            body: JSON.stringify({ thesisId, side }),
          });
          if (!res.ok) throw new Error(String(res.status));
        }
        // Forced, because the cache is exactly the thing that just went out of date. The
        // event then hands the new answer to every other instance in the same tick.
        await loadShared(true);
        window.dispatchEvent(new Event(EVENT));
      } catch {
        setError("That did not save. Check your connection and try again.");
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  return { mine, ready: mine !== null, busy, error, take };
}
