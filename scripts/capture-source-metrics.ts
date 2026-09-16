/**
 * Capture how each curated source post is doing, from the mirror that already verifies it.
 *
 * Run with: pnpm tsx scripts/capture-source-metrics.ts
 *
 * Writes to source_post_metrics, not into the evidence snapshot. The snapshot pins the
 * post's text, author and verification time and is immutable once a version is published;
 * engagement changes hourly and says nothing about the argument, so storing it there would
 * mean publishing a new version of a thesis every time somebody liked a tweet.
 *
 * Safe to run on a schedule. It only ever replaces a row keyed by the post URL.
 */
import { CURATED_EVIDENCE } from "../src/server/content/curated";
import { sourcePostSchema } from "../src/lib/source-post";
import { db } from "../src/server/db/client";
import { sourcePostMetrics } from "../src/server/db/schema";

async function main() {
  const capturedAt = new Date().toISOString();

  for (const [slug, evidence] of Object.entries(CURATED_EVIDENCE)) {
    for (const item of evidence) {
      if (!item.sourcePost) continue;
      const post = sourcePostSchema.parse(item.sourcePost);
      const [, handle, id] = post.url.match(/x\.com\/([A-Za-z0-9_]+)\/status\/(\d+)/)!;

      const res = await fetch(`https://api.fxtwitter.com/${handle}/status/${id}`, {
        headers: { "user-agent": "thesis-metrics/1.0" },
      });
      if (!res.ok) {
        console.error(`  FAIL ${slug}: mirror returned ${res.status}`);
        process.exitCode = 1;
        continue;
      }

      const body = (await res.json()) as {
        tweet?: {
          likes?: number; retweets?: number; replies?: number; views?: number;
          author?: { screen_name?: string };
        };
      };
      const t = body.tweet;

      // The mirror is asked for a specific id, but the handle is checked anyway: a post
      // that moved accounts would otherwise attach one person's numbers to another's words.
      if (!t || `@${t.author?.screen_name}` !== post.handle) {
        console.error(`  FAIL ${slug}: mirror returned @${t?.author?.screen_name}, expected ${post.handle}`);
        process.exitCode = 1;
        continue;
      }

      const metrics = {
        likes: t.likes ?? 0,
        reposts: t.retweets ?? 0,
        replies: t.replies ?? 0,
        views: t.views ?? 0,
        capturedAt,
      };

      await db
        .insert(sourcePostMetrics)
        .values({ postUrl: post.url, ...metrics, capturedAt: new Date(capturedAt) })
        .onConflictDoUpdate({
          target: sourcePostMetrics.postUrl,
          set: { ...metrics, capturedAt: new Date(capturedAt) },
        });

      console.log(
        `  ${slug}  ${post.handle}  ${metrics.likes} likes · ${metrics.reposts} reposts · ` +
          `${metrics.replies} replies · ${metrics.views} views`,
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
