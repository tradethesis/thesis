/**
 * Keep the feed fresh: read the watchlist, find investable posts, draft theses.
 *
 *   pnpm tsx scripts/source-feed.ts [--handles @a,@b] [--per 2] [--dry]
 *
 * The loop this product needs. It reads the accounts in src/server/sourcing/watchlist.ts,
 * takes the posts that are actually claims about the future, and asks a model to propose a
 * thesis for each: a claim, a basket drawn only from the enabled allowlist, and the
 * strongest argument against itself.
 *
 * Three things it deliberately does not do:
 *
 *   - **It does not publish.** Everything lands in output/feed-drafts.json for a person to
 *     accept, edit or bin. An investment thesis that nobody read before it went live is the
 *     one failure this product cannot recover from.
 *   - **It does not trust the timeline.** Every post that survives to a draft is re-verified
 *     against the public mirrors — author, handle, exact text, posted time — by the same
 *     path scripts/source-from-x.ts uses. The timeline says what to look at; the mirror says
 *     what is true.
 *   - **It does not invent assets.** The model is given the enabled allowlist and every
 *     symbol it returns is checked against it. A draft with an unknown ticker is discarded
 *     whole, not repaired.
 *
 * The timeline endpoint is stingy — a handful of reads per address per window — so this
 * paces itself at one account every forty-five seconds and treats a refusal as "come back
 * later". Reading ten accounts takes about eight minutes, which is nothing for a job that
 * runs once a day.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { draftFromPost, type Rejection, type ThesisDraft } from "../src/server/sourcing/analyse";
import { FEEDS, fetchFeed } from "../src/server/sourcing/feeds";
import { fetchTimeline, RateLimited, type TimelinePost } from "../src/server/sourcing/timeline";
import { SOURCES } from "../src/server/sourcing/watchlist";

const MIRRORS = ["https://api.fxtwitter.com", "https://api.vxtwitter.com"];
const UA = "thesis-app/0.1 (+https://github.com/tradethesis)";

/** Only look at posts from the last fortnight. A feed is not an archive. */
const MAX_AGE_DAYS = 14;

type Args = { handles: string[] | null; per: number; dry: boolean };

function args(): Args {
  const argv = process.argv.slice(2);
  const value = (flag: string) => {
    const i = argv.indexOf(flag);
    return i === -1 ? null : argv[i + 1];
  };
  return {
    handles: value("--handles")?.split(",").map((h) => h.trim()) ?? null,
    per: Number(value("--per") ?? 2),
    dry: argv.includes("--dry"),
  };
}

/**
 * The mirror is the source of truth about what somebody wrote.
 *
 * The timeline payload is convenient and current; it is also a scrape of an embed service,
 * and a quotation attributed to a real person next to an investment basket is the one thing
 * in this product that must never be approximated.
 */
async function verify(post: TimelinePost): Promise<{ ok: true } | { ok: false; reason: string }> {
  const path = new URL(post.url).pathname;
  for (const mirror of MIRRORS) {
    try {
      const res = await fetch(`${mirror}${path}`, { headers: { "user-agent": UA } });
      if (!res.ok) continue;
      const body = (await res.json()) as { tweet?: { text?: string; author?: { screen_name?: string } } };
      const tweet = body.tweet;
      if (!tweet?.text) continue;

      const handle = `@${tweet.author?.screen_name ?? ""}`;
      if (handle.toLowerCase() !== post.handle.toLowerCase()) {
        return { ok: false, reason: `mirror says ${handle}, timeline said ${post.handle}` };
      }
      // Whitespace differs between the two services; the words must not.
      const norm = (s: string) => s.replace(/\s+/g, " ").trim();
      if (norm(tweet.text) !== norm(post.text)) return { ok: false, reason: "mirror text does not match" };
      return { ok: true };
    } catch {
      // Try the next mirror.
    }
  }
  return { ok: false, reason: "no mirror could confirm it" };
}

async function main() {
  const { handles, per, dry } = args();
  const key = process.env.OPENROUTER_API_KEY;
  if (!key && !dry) throw new Error("OPENROUTER_API_KEY is not set. Use --dry to read timelines only.");

  const sources = handles ? SOURCES.filter((s) => handles.includes(s.handle)) : SOURCES;
  const feeds = handles ? FEEDS.filter((f) => handles.includes(f.handle)) : FEEDS;
  if (!sources.length && !feeds.length) throw new Error("No matching handles in the watchlist or feeds.");

  const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;
  const drafts: ThesisDraft[] = [];
  const skipped: Rejection[] = [];
  const unreachable: string[] = [];

  /* The publications first. They are the half of this that is actually current — the X
     embed service serves a cached timeline weeks behind, so the accounts contribute depth
     and the feeds contribute freshness. */
  for (const feed of feeds) {
    let items: TimelinePost[];
    try {
      items = await fetchFeed(feed);
    } catch (error) {
      console.log(`  ${feed.handle.padEnd(18)} —  ${(error as Error).message}`);
      unreachable.push(feed.handle);
      continue;
    }

    const fresh = items.filter((p) => !p.skip && Date.parse(p.postedAt) >= cutoff);
    console.log(`  ${feed.handle.padEnd(18)} ${String(items.length).padStart(3)} items, ${fresh.length} fresh and readable`);
    if (dry) continue;

    for (const item of fresh.slice(0, per)) {
      const result = await draftFromPost(item, key!);
      if ("reason" in result) skipped.push(result);
      else {
        drafts.push(result);
        console.log(`      draft: ${result.claim}`);
      }
    }
  }

  for (const source of sources) {
    let posts: TimelinePost[];
    try {
      posts = await fetchTimeline(source.handle);
    } catch (error) {
      const why = error instanceof RateLimited ? "rate limited, try later" : (error as Error).message;
      console.log(`  ${source.handle.padEnd(18)} —  ${why}`);
      unreachable.push(source.handle);
      continue;
    }

    const fresh = posts.filter((p) => !p.skip && Date.parse(p.postedAt) >= cutoff);
    console.log(`  ${source.handle.padEnd(18)} ${String(posts.length).padStart(3)} posts, ${fresh.length} fresh and readable`);
    if (dry) continue;

    for (const post of fresh.slice(0, per)) {
      const checked = await verify(post);
      if (!checked.ok) {
        skipped.push({ post, reason: `unverified: ${checked.reason}` });
        continue;
      }

      const result = await draftFromPost(post, key!);
      if ("reason" in result) skipped.push(result);
      else {
        drafts.push(result);
        console.log(`      draft: ${result.claim}`);
      }
    }
  }

  const out = join(process.cwd(), "output", "feed-drafts.json");
  mkdirSync(join(process.cwd(), "output"), { recursive: true });
  writeFileSync(
    out,
    JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        read: sources.map((s) => s.handle),
        unreachable,
        drafts,
        skipped: skipped.map((s) => ({ url: s.post.url, text: s.post.text.slice(0, 120), reason: s.reason })),
      },
      null,
      2,
    ),
  );

  console.log(`\n${drafts.length} drafts, ${skipped.length} skipped, ${unreachable.length} unreachable`);
  console.log(`Written to ${out}. Nothing is published: review, then move accepted drafts into curated.ts.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
