/**
 * Recent posts from a public X account, without an API key.
 *
 * X's own embed service renders a public profile timeline server-side and ships the data
 * with the page. It is the same payload that powers every embedded timeline on the web, it
 * needs no token, and it is the only route to *current* posts we have: the mirrors this
 * codebase already trusts (fxtwitter, vxtwitter) can verify a post you name but cannot tell
 * you what somebody posted today.
 *
 * What this is not: a search. It reads named accounts only, which is the right shape for
 * this product anyway — a thesis should start from somebody whose judgement we chose to
 * follow, not from whatever an algorithm surfaced.
 *
 * Everything here is treated as untrusted input. A post is a candidate, never a fact about
 * the world, and nothing reaches the catalogue without being re-verified against the
 * mirrors by the existing verification path.
 */

const ENDPOINT = "https://syndication.twitter.com/srv/timeline-profile/screen-name/";

/**
 * One timeline at a time, with a gap between them.
 *
 * Measured on 18 September 2026: the endpoint served a full timeline, then answered 429 to
 * everything for the next several minutes — including a single plain request. It is not a
 * rate in requests per second so much as a small budget per address per window, so the only
 * thing that works is reading few accounts, slowly, and treating a refusal as "come back
 * later" rather than as a failure. A feed that refreshes daily can afford to spend an hour
 * doing it.
 */
const GAP_MS = 45_000;
let chain: Promise<void> = Promise.resolve();

function paced<T>(run: () => Promise<T>): Promise<T> {
  const turn = chain.then(run);
  chain = turn.then(
    () => new Promise((resolve) => setTimeout(resolve, GAP_MS)),
    () => new Promise((resolve) => setTimeout(resolve, GAP_MS)),
  );
  return turn;
}

/** Thrown when the endpoint asked us to come back later, which is not the same as broken. */
export class RateLimited extends Error {
  constructor(readonly handle: string) {
    super(`timeline for ${handle} is rate limited`);
    this.name = "RateLimited";
  }
}

/** The embed service refuses a default agent; this is a plain desktop browser string. */
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export type TimelinePost = {
  id: string;
  url: string;
  handle: string;
  author: string;
  text: string;
  postedAt: string;
  likes: number;
  reposts: number;
  replies: number;
  /** True when the post is a reply, a retweet, or has no text worth reading. */
  skip: boolean;
};

export async function fetchTimeline(handle: string, timeoutMs = 20_000): Promise<TimelinePost[]> {
  const screenName = handle.replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{1,15}$/.test(screenName)) throw new Error(`Not a handle: ${handle}`);
  return paced(() => read(screenName, timeoutMs));
}

async function read(screenName: string, timeoutMs: number): Promise<TimelinePost[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let html: string;
  try {
    const res = await fetch(`${ENDPOINT}${screenName}`, {
      headers: { "user-agent": UA, accept: "text/html" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (res.status === 429) throw new RateLimited(screenName);
    if (!res.ok) throw new Error(`timeline ${res.status}`);
    html = await res.text();
  } finally {
    clearTimeout(timer);
  }

  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
  if (!match) throw new Error("timeline payload not found");

  let data: unknown;
  try {
    data = JSON.parse(match[1]);
  } catch {
    throw new Error("timeline payload is not JSON");
  }

  const raw: RawTweet[] = [];
  collect(data, raw);

  const seen = new Set<string>();
  const posts: TimelinePost[] = [];
  for (const t of raw) {
    const id = t.id_str;
    const text = t.full_text ?? t.text;
    if (!id || !text || seen.has(id)) continue;
    seen.add(id);

    const author = t.user?.screen_name;
    // The payload carries quoted and replied-to posts alongside the account's own. Only
    // the ones this account actually wrote are candidates.
    if (!author || author.toLowerCase() !== screenName.toLowerCase()) continue;

    const posted = t.created_at ? new Date(t.created_at) : null;
    if (!posted || Number.isNaN(posted.getTime())) continue;

    posts.push({
      id,
      url: `https://x.com/${author}/status/${id}`,
      handle: `@${author}`,
      author: t.user?.name ?? author,
      text,
      postedAt: posted.toISOString(),
      likes: t.favorite_count ?? 0,
      reposts: t.retweet_count ?? 0,
      replies: t.reply_count ?? 0,
      skip:
        Boolean(t.in_reply_to_status_id_str) ||
        text.startsWith("RT @") ||
        // A post that is only a link or only a handle says nothing on its own, and a
        // thesis built on one would be a thesis built on our own reading of the link.
        text.replace(/https?:\/\/\S+/g, "").replace(/@\w+/g, "").trim().length < 40,
    });
  }

  return posts.sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt));
}

type RawTweet = {
  id_str?: string;
  full_text?: string;
  text?: string;
  created_at?: string;
  favorite_count?: number;
  retweet_count?: number;
  reply_count?: number;
  in_reply_to_status_id_str?: string | null;
  user?: { screen_name?: string; name?: string };
};

/** The payload nests tweets several ways; this finds them wherever they are. */
function collect(node: unknown, out: RawTweet[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collect(item, out);
    return;
  }
  if (!node || typeof node !== "object") return;

  const record = node as Record<string, unknown>;
  if (typeof record.id_str === "string" && (typeof record.full_text === "string" || typeof record.text === "string")) {
    out.push(record as RawTweet);
  }
  for (const value of Object.values(record)) collect(value, out);
}
