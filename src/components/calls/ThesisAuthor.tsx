import { AuthorMark } from "./AuthorMark";
import { BrandMark } from "../landing/BrandMark";

export type AuthorRef = {
  /** The person or desk the thesis is attributed to. */
  name: string;
  /** An @handle when a real person is behind it, which is what fetches their picture. */
  handle: string | null;
};

/**
 * Who is behind a thesis, wherever a thesis appears.
 *
 * One component because attribution that differs between the feed, the leaderboard and the
 * rails is attribution nobody can rely on. A belief with a face beside it is a belief
 * somebody can be held to; the same belief listed as a row of numbers is not.
 *
 * Where a real person is behind it, that is their verified handle and their committed
 * avatar. Where the desk wrote it, the brand mark says so plainly rather than borrowing a
 * face — an editorial thesis wearing a stock portrait would be the one lie this component
 * exists to prevent.
 */
export function ThesisAuthor({
  author,
  size = "sm",
  prefix,
}: {
  author: AuthorRef;
  size?: "sm" | "md";
  /** "Basket by", "Called by" — the relationship, when it is not obvious from context. */
  prefix?: string;
}) {
  return (
    <span className={`au au--${size}`}>
      {author.handle ? (
        <AuthorMark handle={author.handle} author={author.name} />
      ) : (
        <span className="au-mark">
          <BrandMark />
        </span>
      )}
      <span className="au-name">
        {prefix ? <span className="au-prefix">{prefix} </span> : null}
        {author.name}
      </span>
    </span>
  );
}

/**
 * The human behind a thesis, or the desk when there is not one.
 *
 * A quoted post is the strongest attribution available: a named person said it in public,
 * under their own handle, and it was checked against the mirror. Where that exists it wins
 * over the editorial byline, because the desk built the basket but did not have the idea.
 */
export function authorOf(thesis: {
  authorName: string;
  authorHandle: string | null;
  sourcePost: { author: string; handle: string } | null;
}): AuthorRef {
  if (thesis.sourcePost) return { name: thesis.sourcePost.author, handle: thesis.sourcePost.handle };
  if (thesis.authorHandle) return { name: thesis.authorName, handle: thesis.authorHandle };
  return { name: thesis.authorName, handle: null };
}
