import { ArrowUpRight, Eye, Heart, MessageCircle, Repeat2 } from "lucide-react";
import type { SourcePost as Post } from "@/lib/source-post";

import { AuthorMark } from "./AuthorMark";

/**
 * The post a thesis was built from, and the line that says we do not speak for its author.
 *
 * Two shapes. The full one leads a thesis page. The compact one leads a card, because the
 * post is the reason the thesis exists and someone else's sentence is what makes a reader
 * stop — our claim is the answer to it, and an answer reads better after the question.
 *
 * What neither shape drops is the non-endorsement. Quoting someone next to a basket implies
 * they stand behind it unless the page says otherwise, and the compact variant is exactly
 * where that line would be tempting to cut.
 */
export function SourcePost({ post, compact = false }: { post: Post; compact?: boolean }) {
  const posted = new Date(post.postedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  if (compact) {
    // Short verified excerpts remain complete, including the sentence that makes the
    // source worth discussing. Long posts should be excerpted during editorial review.
    return (
      <div className="source-post source-post--compact">
        <p className="source-post-credit">
          <AuthorMark handle={post.handle} author={post.author} />
          <span className="source-post-who">
            <strong>{post.author}</strong>
            <a href={post.url} target="_blank" rel="noopener noreferrer">
              {post.handle}
              <ArrowUpRight size={11} aria-hidden="true" />
              <span className="ln-sr-only"> — open the post on X in a new tab</span>
            </a>
            <time dateTime={post.postedAt}>{posted}</time>
          </span>
        </p>

        <blockquote cite={post.url}>{post.text}</blockquote>

        {post.metrics && <PostMetrics metrics={post.metrics} />}

        <p className="source-post-attribution">
          Thesis built the basket below. No author endorsement.
        </p>
      </div>
    );
  }

  return (
    <div className="source-post">
      <div className="source-post-meta">
        <span>The conversation</span>
        <a href={post.url} target="_blank" rel="noopener noreferrer">
          {post.handle} on X <ArrowUpRight size={13} aria-hidden="true" />
          <span className="ln-sr-only"> (opens in a new tab)</span>
        </a>
      </div>
      <blockquote cite={post.url}>{post.text}</blockquote>
      <p className="source-post-credit">
        {post.author} · <time dateTime={post.postedAt}>{posted}</time>
      </p>
      <p className="source-post-attribution">
        Inspired by {post.author} · Basket by Thesis
        <br />
        <span>The basket and call are our interpretation. No author endorsement.</span>
      </p>
    </div>
  );
}


/**
 * How the post itself was doing, the last time we looked.
 *
 * Three rules hold this to something honest. The date is never dropped, because these are
 * a snapshot and not a live counter — the alternative is a number that quietly ages into a
 * lie. The label says "on X", because this is engagement with the conversation and not
 * with the thesis, the basket, or Thesis itself, and a reader skimming will otherwise
 * assume it is ours. And nothing is rounded up: 7,115 stays 7,115 rather than becoming
 * "7.2k", because the only reason to round a number up is to make it look bigger.
 */
function PostMetrics({ metrics }: { metrics: NonNullable<Post["metrics"]> }) {
  const n = (v: number) =>
    v >= 10_000 ? `${Math.floor(v / 1000)}k` : v.toLocaleString("en-US");

  const captured = new Date(metrics.capturedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  return (
    <p className="source-post-metrics">
      <span><Heart size={12} aria-hidden="true" />{n(metrics.likes)}<span className="ln-sr-only"> likes</span></span>
      <span><Repeat2 size={12} aria-hidden="true" />{n(metrics.reposts)}<span className="ln-sr-only"> reposts</span></span>
      <span><MessageCircle size={12} aria-hidden="true" />{n(metrics.replies)}<span className="ln-sr-only"> replies</span></span>
      <span><Eye size={12} aria-hidden="true" />{n(metrics.views)}<span className="ln-sr-only"> views</span></span>
      <small>on X, {captured}</small>
    </p>
  );
}
