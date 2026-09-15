import type { MetadataRoute } from "next";

import { canonical } from "@/lib/seo";
import { siteMode } from "@/lib/site-mode";
import { listPublishedTheses } from "@/server/content/queries";

/**
 * Evaluated per request. The set of URLs depends on SITE_MODE and on what is published,
 * neither of which is known at build time.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // While the site is gated, the front door is the only page a visitor can reach. Listing
  // anything else would be advertising a redirect.
  const front: MetadataRoute.Sitemap = [
    { url: canonical("/"), lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: canonical("/join"), lastModified: now, changeFrequency: "weekly", priority: 0.9 },
  ];

  if (siteMode() === "waitlist") return front;

  // A sitemap that throws takes the route down with it, and a missing sitemap is a much
  // smaller problem than a 500. If the catalogue cannot be read, serve the pages that are
  // known to exist.
  try {
    const theses = await listPublishedTheses();
    return [
      ...front,
      { url: canonical("/explore"), lastModified: now, changeFrequency: "daily", priority: 0.9 },
      ...theses.map((t) => ({
        url: canonical(`/t/${t.slug}`),
        lastModified: t.publishedAt ?? now,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
    ];
  } catch {
    return front;
  }
}
