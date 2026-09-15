import { SITE_DESCRIPTION_LONG, SITE_NAME, SITE_TAGLINE, canonical } from "@/lib/seo";

/**
 * Schema.org description of the site, for search and answer engines.
 *
 * Deliberately thin. Every field here is a claim, and the schema vocabulary makes it
 * very easy to assert things that are not true yet — ratings, offers, founding dates,
 * social profiles. None of those are known, so none of them are stated. What is left
 * is what the site actually is: an organisation, a website, and a one-line description
 * of what the product does.
 *
 * No SearchAction: there is no search endpoint to point it at, and declaring one that
 * 404s is worse than declaring nothing.
 */
export function StructuredData() {
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": canonical("/#organization"),
        name: SITE_NAME,
        url: canonical("/"),
        description: SITE_DESCRIPTION_LONG,
        logo: {
          "@type": "ImageObject",
          url: canonical("/icon-512.png"),
          width: 512,
          height: 512,
        },
      },
      {
        "@type": "WebSite",
        "@id": canonical("/#website"),
        name: SITE_NAME,
        alternateName: `${SITE_NAME} — ${SITE_TAGLINE}`,
        url: canonical("/"),
        description: SITE_DESCRIPTION_LONG,
        publisher: { "@id": canonical("/#organization") },
        inLanguage: "en",
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // The payload is a literal above, with no user input anywhere in it, so there is
      // nothing here to escape. JSON.stringify keeps it valid JSON-LD.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
