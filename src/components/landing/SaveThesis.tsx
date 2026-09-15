"use client";

import { useCallback, useEffect, useState } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";

/**
 * Save a thesis so it is easy to come back to.
 *
 * PRD Screen B lists this as the secondary action, and P0 "Follow" only requires that a
 * saved thesis can be found again. Saving is deliberately local to this browser: the
 * catalogue is public and readable without a wallet, so asking someone to connect one
 * just to bookmark an idea would be the wrong trade. It also keeps a reading habit out of
 * a database that has no reason to hold it (PRD §13).
 *
 * The consequence is stated on the button rather than hidden: saved here, on this device.
 * Syncing to the wallet session is P1, and is explicitly the second thing the PRD cuts.
 */

const KEY = "thesis.saved.v1";

function read(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
  } catch {
    // Private windows and blocked site data both throw here. A reader who cannot save is
    // not a reader who should see a broken page.
    return [];
  }
}

export function SaveThesis({ slug, title }: { slug: string; title: string }) {
  const [saved, setSaved] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSaved(read().includes(slug));
    setReady(true);
  }, [slug]);

  const toggle = useCallback(() => {
    const next = read().filter((s) => s !== slug);
    if (!saved) next.unshift(slug);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next.slice(0, 100)));
      setSaved(!saved);
    } catch {
      // Storage refused. Say nothing rather than claim a save that did not happen.
    }
  }, [saved, slug]);

  return (
    <div className="td-save">
      <button
        type="button"
        className="ln-btn ln-btn--secondary td-save-btn"
        onClick={toggle}
        aria-pressed={saved}
        disabled={!ready}
      >
        {saved ? <BookmarkCheck size={16} aria-hidden="true" /> : <Bookmark size={16} aria-hidden="true" />}
        {saved ? "Saved" : "Save thesis"}
        <span className="ln-sr-only">{`: ${title}`}</span>
      </button>
      <p className="td-save-note" role="status">
        {saved ? "Saved in this browser." : "Saved in this browser, not to an account."}
      </p>
    </div>
  );
}
