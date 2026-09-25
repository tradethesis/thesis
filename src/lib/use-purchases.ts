"use client";

import { useEffect, useState } from "react";

import type { Purchase } from "@/server/purchases";

export type PurchasesState = {
  /** Null until the first answer arrives, so "loading" is distinguishable from "none". */
  purchases: Purchase[] | null;
  /** Signed in but nothing bought, versus not signed in, need different screens. */
  needsSession: boolean;
  failed: boolean;
};

/**
 * This wallet's purchase history, fetched once per wallet change.
 *
 * Shared by the My theses page and the desktop rail so the two cannot disagree about what
 * somebody owns — two copies of this fetch would eventually drift, and the version in the
 * corner of the screen is exactly the one nobody would notice going stale.
 */
export function usePurchases(wallet: string | null): PurchasesState {
  const [purchases, setPurchases] = useState<Purchase[] | null>(null);
  const [needsSession, setNeedsSession] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setFailed(false);

    fetch("/api/purchases")
      .then(async (r) => {
        if (!live) return;
        if (r.status === 401) {
          setNeedsSession(true);
          setPurchases([]);
          return;
        }
        if (!r.ok) throw new Error(String(r.status));
        const body = (await r.json()) as { purchases: Purchase[] };
        setNeedsSession(false);
        setPurchases(body.purchases);
      })
      .catch(() => {
        if (live) setFailed(true);
      });

    return () => {
      live = false;
    };
  }, [wallet]);

  return { purchases, needsSession, failed };
}
