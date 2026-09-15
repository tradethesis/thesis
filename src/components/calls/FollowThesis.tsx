"use client";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { useFollowing } from "@/lib/following";

export function FollowThesis({ slug, title, explain = false }: { slug: string; title: string; explain?: boolean }) {
  const { slugs, ready, error, toggle } = useFollowing();
  const following = slugs.includes(slug);
  return <div className="follow-control">
    <button type="button" className="feed-action" onClick={() => toggle(slug)} aria-pressed={following} disabled={!ready}>
      {following ? <BookmarkCheck size={16} aria-hidden="true" /> : <Bookmark size={16} aria-hidden="true" />}
      {following ? "Following" : "Follow thesis"}<span className="ln-sr-only">: {title}</span>
    </button>
    {explain && <p className="follow-note">Follow in this browser. Revisit Following for evidence updates and call results.</p>}
    <span className={error ? "follow-error" : "ln-sr-only"} role="status">{error ?? (following ? "Following in this browser. Find this idea in Following." : "")}</span>
  </div>;
}
