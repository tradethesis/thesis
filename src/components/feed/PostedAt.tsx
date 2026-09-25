"use client";

import { useEffect, useState } from "react";

/**
 * When the post went up.
 *
 * The date first, then the relative form once the client has a clock. Both halves matter:
 * these pages are static and revalidate on a timer, so a day count rendered on the server
 * is a day count from whenever the page was last built — by tomorrow it is simply wrong,
 * and React would tear it out as a hydration mismatch on the way.
 *
 * Anything older than a month keeps the date, because "47d" stops being something a reader
 * can picture.
 */
export function PostedAt({ at }: { at: string }) {
  const absolute = new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  const [relative, setRelative] = useState<string | null>(null);
  useEffect(() => {
    const days = Math.floor((Date.now() - Date.parse(at)) / 86_400_000);
    if (days < 0 || days > 30) return;
    setRelative(days < 1 ? "today" : days === 1 ? "1d ago" : `${days}d ago`);
  }, [at]);

  return <time dateTime={at}>{relative ?? absolute}</time>;
}
