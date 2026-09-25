"use client";

import { useEffect, useState } from "react";

import type { Portfolio } from "./portfolio";

export type PortfolioState = {
  /** Null until the first answer, so "loading" is distinguishable from "holds nothing". */
  portfolio: Portfolio | null;
  needsSession: boolean;
  /** The chain or the server couldn't be read. Not the same as an empty wallet. */
  failed: boolean;
};

/** This wallet's portfolio, fetched once per wallet change. */
export function usePortfolio(wallet: string | null): PortfolioState {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [needsSession, setNeedsSession] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setFailed(false);
    fetch("/api/portfolio")
      .then(async (r) => {
        if (!live) return;
        if (r.status === 401) {
          setNeedsSession(true);
          setPortfolio(null);
          return;
        }
        if (!r.ok) throw new Error(String(r.status));
        setNeedsSession(false);
        setPortfolio((await r.json()) as Portfolio);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [wallet]);

  return { portfolio, needsSession, failed };
}
