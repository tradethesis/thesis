import { inArray } from "drizzle-orm";

import type { SourcePost } from "@/lib/source-post";

import { db } from "../db/client";
import { sourcePostMetrics } from "../db/schema";

/**
 * Attach engagement to source posts, keyed by the post URL.
 *
 * Kept out of the evidence snapshot on purpose: that snapshot is immutable and pins what
 * the post said and who said it, while these numbers change hourly and belong to X rather
 * than to the thesis. Joining at read time lets them refresh without publishing a new
 * version of an argument that has not changed.
 *
 * A post with no row renders with no numbers at all, which is the only correct answer —
 * showing zero would claim nobody engaged with it.
 */
export async function loadSourceMetrics(
  posts: (SourcePost | null)[],
): Promise<Map<string, NonNullable<SourcePost["metrics"]>>> {
  const urls = [...new Set(posts.filter((p): p is SourcePost => Boolean(p)).map((p) => p.url))];
  if (!urls.length) return new Map();

  const rows = await db.select().from(sourcePostMetrics).where(inArray(sourcePostMetrics.postUrl, urls));

  return new Map(
    rows.map((r) => [
      r.postUrl,
      {
        likes: r.likes,
        reposts: r.reposts,
        replies: r.replies,
        views: r.views,
        capturedAt: r.capturedAt.toISOString(),
      },
    ]),
  );
}

/** The post with its engagement attached, or unchanged when there is none. */
export function withMetrics(
  post: SourcePost | null,
  metrics: Map<string, NonNullable<SourcePost["metrics"]>>,
): SourcePost | null {
  if (!post) return null;
  const found = metrics.get(post.url);
  return found ? { ...post, metrics: found } : post;
}
