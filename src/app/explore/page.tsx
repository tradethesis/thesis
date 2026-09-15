import { permanentRedirect } from "next/navigation";

/**
 * The catalogue moved to /app when the marketing site and the product were split.
 *
 * A permanent redirect rather than a deleted route: /explore is in the wild — it is what
 * the site header pointed at, what the sitemap listed, and what anyone who bookmarked the
 * calls has. 308 so the move is cached and search engines transfer the URL rather than
 * indexing two addresses for one page.
 */
export default function ExploreRedirect(): never {
  permanentRedirect("/app");
}
