import { ArrowUpRight } from "lucide-react";
import type { SourcePost as Post } from "@/lib/source-post";

import { AuthorMark } from "./AuthorMark";

/**
 * The post a thesis was built from, and the line that says we do not speak for its author.
 *
 * Two shapes. The full one leads a thesis page, where the conversation is the thing being
 * examined and deserves the room. The compact one sits under a card's claim as provenance:
 * the claim is what a reader is choosing between, and the post explains where it came from,
 * so it follows rather than leads.
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
        <blockquote cite={post.url}>{post.text}</blockquote>
        <p className="source-post-credit">
          <AuthorMark handle={post.handle} author={post.author} />
          <span className="source-post-who">
            <a href={post.url} target="_blank" rel="noopener noreferrer">
              {post.handle} on X
              <ArrowUpRight size={11} aria-hidden="true" />
              <span className="ln-sr-only"> (opens in a new tab)</span>
            </a>
            <span className="source-post-attribution">Our reading. No author endorsement.</span>
          </span>
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
