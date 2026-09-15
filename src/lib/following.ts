"use client";

import { useEffect, useState } from "react";

// Keep existing bookmarks. One list powers the feed and the detail page.
const KEY = "thesis.saved.v1";
const EVENT = "thesis:following-changed";
export function readFollowing(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value) ? [...new Set(value.filter((s): s is string => typeof s === "string"))].slice(0, 100) : [];
  } catch { return []; }
}

export function useFollowing() {
  const [slugs, setSlugs] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => { setSlugs(readFollowing()); setReady(true); };
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener("storage", sync); };
  }, []);
  function toggle(slug: string) {
    const current = readFollowing();
    if (!current.includes(slug) && current.length >= 100) {
      setError("You’re following 100 theses. Unfollow one to make room."); return;
    }
    const next = current.includes(slug) ? current.filter(s => s !== slug) : [slug, ...current];
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      setSlugs(next); setError(null);
      window.dispatchEvent(new Event(EVENT));
    } catch { setError("This browser couldn’t save your follow. Allow site storage and try again."); }
  }
  return { slugs, ready, error, toggle };
}
