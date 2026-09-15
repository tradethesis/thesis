"use client";

import { useState } from "react";
import { Bookmark, Search } from "lucide-react";

import { callForThesis, type CallRecord } from "@/lib/calls";
import type { ThesisCard } from "@/server/content/queries";

import { CallCard } from "./CallCard";
import { useFollowing } from "@/lib/following";

type Filter = "all" | "resolved" | "saved";

const FILTERS = [
  ["all", "Discover"],
  ["saved", "Following"],
  ["resolved", "Resolved"],
] as const;

/**
 * Finds a call among the theses. Presentation lives in CallCard; this file decides only
 * what is on screen.
 */
export function CallGrid({
  theses,
  calls,
  featured = false,
}: {
  theses: ThesisCard[];
  calls: CallRecord[];
  featured?: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const { slugs: saved } = useFollowing();

  const filtered = theses.filter((t) => {
    const call = callForThesis(calls, t);
    const matches =
      filter === "all" ||
      (filter === "saved" && saved.includes(t.slug)) ||
      (filter === "resolved" && call && call.status !== "open");

    if (!matches) return false;

    const needle = search.toLowerCase().trim();
    if (!needle) return true;

    const haystack = [
      t.claim,
      t.summary,
      t.authorName,
      t.sourcePost?.author,
      t.sourcePost?.handle,
      t.sourcePost?.text,
      ...t.holdings.map((h) => h.symbol),
      ...t.holdings.map((h) => h.company),
    ];
    return haystack.filter(Boolean).join(" ").toLowerCase().includes(needle);
  });

  return (
    <>
      {!featured && (
        <div className="cg-toolbar">
          <div className="cg-filters" role="group" aria-label="Filter calls">
            {FILTERS.map(([id, label]) => (
              <button type="button" key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>
                {id === "saved" && <Bookmark size={13} aria-hidden="true" />}
                {label}
              </button>
            ))}
          </div>
          <label className="cg-search">
            <Search size={16} aria-hidden="true" />
            <span className="ln-sr-only">Search ideas, authors, or tokens</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="An idea, an author, or a token…"
            />
          </label>
        </div>
      )}

      <p className="ln-sr-only" role="status">
        {filtered.length} {filtered.length === 1 ? "thesis" : "theses"} shown
      </p>

      {filtered.length ? (
        <>
        {filter === "saved" && <div className="cg-follow-intro"><h2>Your ideas, still unfolding.</h2><p>Evidence updates and call results for the theses you follow. Saved in this browser; check back here for changes.</p></div>}
        <div className="cg-grid">
          {filtered.map((t) => (
            <CallCard key={t.slug} thesis={t} call={callForThesis(calls, t)} followingView={filter === "saved"} />
          ))}
        </div>
        </>
      ) : (
        <div className="cg-empty">
          <h2>
            {search.trim()
              ? "No ideas match that search."
              : filter === "saved"
              ? "Keep an idea close."
              : filter === "resolved"
                ? "The first calls are still playing out."
                : "No calls match yet."}
          </h2>
          <p>
            {search.trim()
              ? "Try a different idea, author, company or token."
              : filter === "saved"
              ? "Tap Follow thesis on any idea. Its evidence updates and call results will be easy to revisit here, in this browser."
              : "Browse all calls or try a different search."}
          </p>
          <button
            type="button"
            className="ln-btn ln-btn--secondary"
            onClick={() => {
              setFilter("all");
              setSearch("");
            }}
          >
            Discover theses
          </button>
        </div>
      )}
    </>
  );
}
