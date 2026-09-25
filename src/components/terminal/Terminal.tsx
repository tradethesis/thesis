"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { BasketLeaderboard } from "./BasketLeaderboard";
import { BasketWorkspace } from "./BasketWorkspace";
import { TerminalRail } from "./TraderLeaderboard";
import type { BasketRow, TerminalBasket } from "./types";

/**
 * The workspace: baskets, the selected one, and who is trading it.
 *
 * Selection is client state, and the URL is a record of it — written with `replaceState` rather
 * than through the router. Two reasons. A router navigation re-runs the server component for a
 * page whose data does not depend on the query, so picking a basket would cost a round trip to
 * fetch the list it already has. And `replace` rather than `push` keeps twelve back presses from
 * being the cost of scanning twelve baskets, which is a trap rather than history.
 *
 * Reload and a shared link still work, because the initial selection is read from the query on
 * mount; `popstate` keeps the two in step if somebody navigates anyway.
 *
 * On a phone the same three panels become three places instead of three columns. Squeezing a
 * 20/60/20 grid into 390px produces three things that are all too narrow, so the list opens the
 * detail and the detail has a way back.
 */

type Mobile = "list" | "detail" | "traders";

export function Terminal({
  baskets,
  rows,
  period,
  initialSlug,
}: {
  baskets: TerminalBasket[];
  rows: BasketRow[];
  period: string;
  /** Read from the query on the server, so the first paint is already correct. */
  initialSlug: string | null;
}) {
  const [requested, setRequested] = useState<string | null>(initialSlug);
  const [mobile, setMobile] = useState<Mobile>(initialSlug ? "detail" : "list");

  // The initial value arrives as a prop; this only keeps things in step when the browser itself
  // moves through history.
  useEffect(() => {
    const read = () => {
      const slug = new URLSearchParams(window.location.search).get("basket");
      setRequested(slug);
      if (slug) setMobile((m) => (m === "list" ? "detail" : m));
    };
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  // No slug, or an unknown one, opens the top of the ranking rather than whatever was published
  // last (which is often too new to have a single reading). A stale link still lands somewhere useful.
  const selected = useMemo(
    () => baskets.find((b) => b.slug === requested) ?? baskets.find((b) => b.slug === rows[0]?.slug) ?? baskets[0] ?? null,
    [baskets, requested, rows],
  );

  const select = useCallback((slug: string) => {
    setRequested(slug);
    setMobile("detail");
    const url = new URL(window.location.href);
    url.searchParams.set("basket", slug);
    window.history.replaceState(null, "", url);
  }, []);

  if (!baskets.length) {
    return (
      <div className="tm-empty">
        <h1>No baskets yet</h1>
        <p>Nothing has been published. A basket appears here once a thesis names an allocation.</p>
      </div>
    );
  }

  return (
    <div className={`tm tm--${mobile}`} data-selected={selected?.slug}>
      <nav className="tm-tabs" aria-label="Terminal sections">
        <button type="button" aria-pressed={mobile === "list"} onClick={() => setMobile("list")}>
          Baskets
        </button>
        <button type="button" aria-pressed={mobile === "detail"} onClick={() => setMobile("detail")}>
          {selected ? selected.name : "Selected"}
        </button>
        <button type="button" aria-pressed={mobile === "traders"} onClick={() => setMobile("traders")}>
          Holdings
        </button>
      </nav>

      <div className="tm-grid">
        <aside className="tm-col tm-col--left" aria-label="Baskets">
          <BasketLeaderboard baskets={rows} selected={selected?.slug ?? ""} onSelect={select} period={period} />
        </aside>

        <div className="tm-col tm-col--main">
          {selected ? <BasketWorkspace basket={selected} /> : <p>Select a basket.</p>}
        </div>

        <aside className="tm-col tm-col--right" aria-label="Your holdings">
          <TerminalRail basketName={selected?.name ?? null} basketSymbols={selected?.execution.holdings.map((h) => h.symbol) ?? []} />
        </aside>
      </div>
    </div>
  );
}
