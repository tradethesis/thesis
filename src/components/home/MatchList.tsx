"use client";

import type { Candidate } from "./types";

/**
 * How the idea matches, as rows.
 *
 * The shape is borrowed from the reference's move-probability column: a marker, a label, a track
 * with a filled bar, and a value. Three things it keeps deliberately.
 *
 * **Strength is never carried by colour alone.** Each row states its label in words, and the
 * selected row carries a `›` marker as well as its colour — the reference does the same, and it is
 * also the only version that survives a colourblind reader or a monochrome screen.
 *
 * **Bars are independent.** Two baskets can both fill most of their track. Nothing here is a share
 * of anything and the widths are not made to sum.
 *
 * **The number hides.** A bar length is a model's relevance estimate that has never been checked
 * against an outcome. It is legible as "more" and "less", which is all it has earned; the figure
 * itself lives behind "About this match", labelled for what it is.
 */
export function MatchList({
  candidates,
  selected,
  onSelect,
}: {
  candidates: Candidate[];
  selected: string;
  onSelect: (slug: string) => void;
}) {
  return (
    <ul className="hm-matches" role="list">
      {candidates.map((c) => {
        const on = c.slug === selected;
        return (
          <li key={c.slug}>
            <button
              type="button"
              className={`hm-match${on ? " is-on" : ""}`}
              aria-current={on ? "true" : undefined}
              onClick={() => onSelect(c.slug)}
            >
              <span className="hm-match-top">
                <span className="hm-match-mark" aria-hidden="true">
                  {on ? "›" : " "}
                </span>
                <span className="hm-match-name">{c.name}</span>
                <span className={`hm-match-label hm-match-label--${c.strength}`}>{c.label}</span>
              </span>
              <span className="hm-match-bar">
                <span className="hm-track" aria-hidden="true">
                  <span
                    className={`hm-fill hm-fill--${c.strength}`}
                    style={{ transform: `scaleX(${c.bar})` }}
                  />
                </span>
              </span>
              {c.contradicts && (
                <span className="hm-match-flag">Points the other way</span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
