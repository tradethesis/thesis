import type { TimelinePost } from "./timeline";

/**
 * Fresh material from credible publications.
 *
 * The X route reads real posts but not recent ones: the public embed service serves a
 * cached timeline, and measured across five accounts on 18 September 2026 the newest post
 * in every payload was around four weeks old. It is good for backfill and useless for
 * freshness, which is the thing the feed actually needs.
 *
 * These feeds are the opposite. Techmeme's newest item was zero hours old and the FT's six,
 * both on the same check. They are published by the outlet itself rather than scraped, they
 * carry a timestamp we can hold them to, and they update all day.
 *
 * What they are not is somebody's belief. A headline reports; a post argues. So an item
 * from here is attributed to the publication, never to a person, and the thesis drawn from
 * it is openly ours — which is the same rule the rest of the catalogue already follows, and
 * the reason the attribution line exists.
 */

export type Feed = { name: string; handle: string; url: string; beat: string };

export const FEEDS: Feed[] = [
  {
    name: "Techmeme",
    handle: "@Techmeme",
    url: "https://www.techmeme.com/feed.xml",
    beat: "Technology news, aggregated and clustered by significance",
  },
  {
    name: "Financial Times",
    handle: "@FT",
    url: "https://www.ft.com/technology?format=rss",
    beat: "Technology and markets, reported",
  },
];

/**
 * Items as candidate posts, so the analysis step does not care where they came from.
 *
 * Deliberately shaped into the same record the timeline produces: one analyser, one set of
 * rules, one place where a draft can be rejected. A second path would be a second place for
 * the rules to drift.
 */
export async function fetchFeed(feed: Feed, timeoutMs = 20_000): Promise<TimelinePost[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let xml: string;
  try {
    const res = await fetch(feed.url, {
      headers: { "user-agent": "thesis-app/0.1 (+https://github.com/tradethesis)", accept: "application/rss+xml,*/*" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`feed ${res.status}`);
    xml = await res.text();
  } finally {
    clearTimeout(timer);
  }

  const items = [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/g)].map((m) => m[0]);
  const posts: TimelinePost[] = [];

  for (const item of items) {
    const title = clean(field(item, "title"));
    const link = field(item, "link").trim();
    const published = field(item, "pubDate").trim();
    if (!title || !link || !published) continue;

    const at = new Date(published);
    if (Number.isNaN(at.getTime())) continue;

    const description = clean(field(item, "description"));
    // Headline plus standfirst. The body is behind the link and often behind a paywall, so
    // the draft is built from what the outlet chose to publish in the open.
    const text = description && description !== title ? `${title}\n\n${description}` : title;

    posts.push({
      id: link,
      url: link,
      handle: feed.handle,
      author: feed.name,
      text,
      postedAt: at.toISOString(),
      likes: 0,
      reposts: 0,
      replies: 0,
      // A headline under about fifty characters is a label, not a claim.
      skip: text.length < 50,
    });
  }

  return posts.sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt));
}

function field(item: string, tag: string): string {
  const m = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : "";
}

/** RSS ships CDATA, entities and markup; none of it belongs in a quotation. */
function clean(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
