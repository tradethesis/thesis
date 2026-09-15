"use client";

import { useEffect, useMemo, useState } from "react";
import { Bookmark, Search } from "lucide-react";

import type { CallRecord } from "@/lib/calls";
import type { ThesisCard } from "@/server/content/queries";

import { CallCard } from "./CallCard";

type Filter = "all" | "open" | "resolved" | "saved";

const FILTERS = [
  ["all", "All calls"],
  ["open", "Open"],
  ["resolved", "Resolved"],
  ["saved", "Saved"],
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
  const [saved, setSaved] = useState<string[]>([]);

  useEffect(() => {
    try {
      const value = JSON.parse(localStorage.getItem("thesis.saved.v1") ?? "[]");
      if (Array.isArray(value)) setSaved(value.filter((v) => typeof v === "string"));
    } catch {
      // Private windows and blocked site data throw here. A reader with no saved list is
      // the same as a reader whose saved list cannot be read.
    }
  }, []);

  const byVersion = useMemo(() => new Map(calls.map((c) => [c.versionId, c])), [calls]);

  const filtered = theses.filter((t) => {
    const call = byVersion.get(t.versionId);
    const matches =
      filter === "all" ||
      (filter === "saved" && saved.includes(t.slug)) ||
      (filter === "open" && call?.status === "open") ||
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
        <div className="cg-grid">
          {filtered.map((t) => (
            <CallCard key={t.slug} thesis={t} call={byVersion.get(t.versionId) ?? null} />
          ))}
        </div>
      ) : (
        <div className="cg-empty">
          <h2>
            {filter === "saved"
              ? "Keep a call on your radar."
              : filter === "resolved"
                ? "The first calls are still playing out."
                : "No calls match yet."}
          </h2>
          <p>
            {filter === "saved"
              ? "Open a thesis and save it. Your saved calls stay in this browser."
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
            See all calls
          </button>
        </div>
      )}
    </>
  );
}
