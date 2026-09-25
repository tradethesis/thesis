"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

import { callForThesis, type CallRecord } from "@/lib/calls";
import { FILTER_BY_ASSET } from "@/lib/filter-feed";
import type { ThesisCard } from "@/server/content/queries";

import { FeedCard } from "./FeedCard";
import { SinceYouLastLooked } from "./SinceYouLastLooked";

/**
 * The Discover feed: every published belief, scannable.
 *
 * Search only. The Following and Resolved filters that used to live here have moved — one to
 * My theses, where the things you keep belong, and one to the Leaderboard, where results
 * belong. A feed whose job is discovery should not also be a filing cabinet.
 */
export function Feed({
  theses,
  calls,
  counts,
  activity,
}: {
  theses: ThesisCard[];
  calls: CallRecord[];
  counts: Record<string, { backing: number; doubting: number }>;
  activity: Record<string, { calls: number; volumeUsdc: number; buyers: number }>;
}) {
  const [search, setSearch] = useState("");
  const needle = search.toLowerCase().trim();
  const box = useRef<HTMLInputElement>(null);

  /*
    The map above sets this search rather than filtering separately. One filter in the
    product, and the visitor can see what was applied and clear it the ordinary way — a
    hidden filter is one people get stuck in.
  */
  useEffect(() => {
    const onFilter = (event: Event) => {
      const symbol = (event as CustomEvent<string>).detail;
      if (typeof symbol !== "string") return;
      setSearch(symbol);
      box.current?.scrollIntoView({ block: "nearest" });
    };
    window.addEventListener(FILTER_BY_ASSET, onFilter);
    return () => window.removeEventListener(FILTER_BY_ASSET, onFilter);
  }, []);

  const matched = theses.filter((t) => {
    if (!needle) return true;
    return [
      t.claim,
      t.summary,
      t.authorName,
      t.sourcePost?.author,
      t.sourcePost?.handle,
      t.sourcePost?.text,
      ...t.holdings.map((h) => h.symbol),
      ...t.holdings.map((h) => h.company),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });

  /*
    A belief somebody said out loud, in public, under their own name, ranks above one we
    wrote. Both are honest; only one can be checked against a person who is still standing
    behind it, and that is the thing this product is for. Publication date orders within
    each group, so the rule is a tier and not a score — nothing here quietly weights a
    sourced thesis by engagement.

    Three of sixty carry a post today. That ratio is the real problem and it is a sourcing
    problem, not an ordering one; this puts the three where they belong while it lasts.
  */
  const shown = [...matched].sort((a, b) => Number(Boolean(b.sourcePost)) - Number(Boolean(a.sourcePost)));

  const digest = theses.map((t) => ({
    slug: t.slug,
    claim: t.claim,
    thesisId: t.thesisId,
    publishedAt: t.publishedAt ? new Date(t.publishedAt).toISOString() : null,
  }));

  return (
    <>
      <SinceYouLastLooked theses={digest} />

      <label className="feed-search">
        <Search size={16} aria-hidden="true" />
        <span className="ln-sr-only">Search beliefs, people, or tickers</span>
        <input
          ref={box}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="An idea, a person, or a ticker"
        />
      </label>

      <p className="ln-sr-only" role="status">
        {shown.length} {shown.length === 1 ? "belief" : "beliefs"} shown
      </p>

      {shown.length ? (
        <div className="feed">
          {shown.map((t) => (
            <FeedCard key={t.slug} thesis={t} call={callForThesis(calls, t)} counts={counts[t.thesisId]} activity={activity[t.thesisId]} />
          ))}
        </div>
      ) : (
        <div className="feed-empty">
          <h2>Nothing matches “{search.trim()}”.</h2>
          <p>Try a person, a company, or a ticker like MSFTx.</p>
          <button type="button" className="ln-btn ln-btn--secondary" onClick={() => setSearch("")}>
            Clear search
          </button>
        </div>
      )}
    </>
  );
}
