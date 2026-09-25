"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import type { ConvictionStatus } from "@/lib/conviction";
import { useConviction } from "@/lib/use-conviction";

const KEY = "thesis:last-looked";

type Seen = {
  at: string;
  /** What each of your calls read as last time, so a change can be named rather than implied. */
  calls: Record<string, { status: ConvictionStatus; edge: number | null }>;
};

type Line = { key: string; text: string; href?: string; label?: string };

/**
 * What changed since you were last here.
 *
 * The reason to open this tomorrow, and the one thing in the app that is allowed to know
 * you have been away. It is strictly a digest: it is read when you arrive and it is true
 * when read. No badge, no unread count, no notification, no streak — the moment a product
 * starts counting your absences it is manufacturing urgency, and a product about beliefs
 * held over ninety days has no business doing that.
 *
 * When nothing has changed it renders nothing at all. "Nothing new" is still a demand for
 * attention, and it is the message this will show most often.
 */
export function SinceYouLastLooked({
  theses,
}: {
  theses: { slug: string; claim: string; thesisId: string; publishedAt: string | null }[];
}) {
  const { mine, ready } = useConviction();
  const [lines, setLines] = useState<Line[] | null>(null);

  useEffect(() => {
    if (!ready || lines !== null) return;

    let seen: Seen | null = null;
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) seen = JSON.parse(raw) as Seen;
    } catch {
      // A browser that refuses storage gets no digest, which is the correct degradation:
      // without a last-visit time there is no honest way to say what changed.
      seen = null;
    }

    const now: Seen = {
      at: new Date().toISOString(),
      calls: Object.fromEntries(
        [...(mine?.values() ?? [])].map((c) => [c.thesisId, { status: c.score.status, edge: c.score.edgePercent }]),
      ),
    };

    const found = seen ? describe(seen, now, mine, theses) : [];
    setLines(found);

    try {
      window.localStorage.setItem(KEY, JSON.stringify(now));
    } catch {
      /* Nothing to do: the digest simply will not appear next time. */
    }
  }, [ready, mine, theses, lines]);

  if (!lines?.length) return null;

  return (
    <section className="since" aria-label="Since you last looked">
      <h2>Since you last looked</h2>
      <ul>
        {lines.map((l) => (
          <li key={l.key}>
            {l.text}
            {l.href && l.label ? (
              <>
                {" "}
                <Link href={l.href}>{l.label}</Link>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

const READS: Record<ConvictionStatus, string> = {
  ahead: "ahead",
  behind: "behind",
  level: "level",
  too_early: "too early to score",
  closed: "closed",
  unscored: "unscored",
};

function describe(
  seen: Seen,
  now: Seen,
  mine: ReturnType<typeof useConviction>["mine"],
  theses: { slug: string; claim: string; thesisId: string; publishedAt: string | null }[],
): Line[] {
  const lines: Line[] = [];
  const since = Date.parse(seen.at);

  // Your own calls first. A result that turned over while you were away is the only thing
  // here that is genuinely about you, and it is the one worth coming back for.
  for (const [thesisId, before] of Object.entries(seen.calls)) {
    const after = now.calls[thesisId];
    const call = mine?.get(thesisId);
    if (!after || !call || after.status === before.status) continue;
    lines.push({
      key: `status-${thesisId}`,
      text: `Your call on “${call.claim}” went from ${READS[before.status]} to ${READS[after.status]}.`,
      href: `/t/${call.slug}`,
      label: "See it",
    });
  }

  // Failing that, the largest move among calls that were already scored both times.
  if (!lines.length) {
    let biggest: { claim: string; slug: string; move: number } | null = null;
    for (const [thesisId, before] of Object.entries(seen.calls)) {
      const after = now.calls[thesisId];
      const call = mine?.get(thesisId);
      if (!after || !call || before.edge === null || after.edge === null) continue;
      const move = after.edge - before.edge;
      if (Math.abs(move) < 0.05) continue;
      if (!biggest || Math.abs(move) > Math.abs(biggest.move)) {
        biggest = { claim: call.claim, slug: call.slug, move };
      }
    }
    if (biggest) {
      const direction = biggest.move > 0 ? "widened" : "narrowed";
      lines.push({
        key: "mover",
        text: `Your call on “${biggest.claim}” ${direction} by ${Math.abs(biggest.move).toFixed(2)} points.`,
        href: `/t/${biggest.slug}`,
        label: "See it",
      });
    }
  }

  const fresh = theses.filter((t) => t.publishedAt && Date.parse(t.publishedAt) > since);
  if (fresh.length === 1) {
    lines.push({ key: "new", text: `One new belief: “${fresh[0].claim}”.`, href: `/t/${fresh[0].slug}`, label: "Read it" });
  } else if (fresh.length > 1) {
    lines.push({ key: "new", text: `${fresh.length} new beliefs were published.` });
  }

  // Three lines is a digest. More than that is a feed inside a feed.
  return lines.slice(0, 3);
}
