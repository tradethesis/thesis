import { ArrowUpRight } from "lucide-react";
import type { SourcePost as Post } from "@/lib/source-post";

export function SourcePost({ post, compact = false }: { post: Post; compact?: boolean }) {
  return <div className={`source-post${compact ? " source-post--compact" : ""}`}>
    <div className="source-post-meta"><span>The conversation</span><a href={post.url} target="_blank" rel="noopener noreferrer">{post.handle} on X <ArrowUpRight size={13} aria-hidden="true" /><span className="ln-sr-only"> (opens in a new tab)</span></a></div>
    <blockquote cite={post.url}>{post.text}</blockquote>
    <p className="source-post-credit">{post.author} · <time dateTime={post.postedAt}>{new Date(post.postedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</time></p>
    <p className="source-post-attribution">Inspired by {post.author} · Basket by Thesis<br /><span>The basket and call are our interpretation. No author endorsement.</span></p>
  </div>;
}
