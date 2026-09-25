import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Reading a post the visitor pasted.
 *
 * Two rules, both non-negotiable.
 *
 * **A post's content is never inferred from its URL.** A slug, a handle and an id say nothing
 * about what somebody wrote. If the text cannot be fetched, this says so and asks for the text;
 * it does not guess and it does not match on the link alone.
 *
 * **Everything that comes back is untrusted data.** It is a string the product displays and sends
 * to a scoring model, never an instruction. It is length-capped before it goes anywhere.
 *
 * ## What may be fetched
 *
 * One host, `api.fxtwitter.com`, and only for a URL that parses as an x.com/twitter.com status.
 * This is the same public mirror `scripts/verify-source-posts.ts` already trusts to re-verify
 * catalogue posts, so it is not a new dependency. An allowlist rather than a blocklist: this
 * endpoint takes a URL from the public internet, and "anything except these" is the shape of
 * SSRF bug that keeps being written.
 *
 * The resolved address is checked as well as the name, because a name is a promise about an
 * address that DNS is free to break, and redirects are refused outright rather than followed.
 */

const MIRROR_HOST = "api.fxtwitter.com";
const MAX_BYTES = 128 * 1024;
const TIMEOUT_MS = 8_000;

export class RetrievalFailed extends Error {
  constructor(readonly reason: "not_a_post" | "unreachable" | "blocked" | "empty") {
    super("Couldn’t read this post. Paste its text to continue.");
    this.name = "RetrievalFailed";
  }
}

export type RetrievedPost = {
  text: string;
  handle: string;
  authorName: string | null;
  url: string;
  postedAt: string | null;
};

/** True when the input looks like a bare URL rather than prose the visitor typed. */
export function looksLikeUrl(input: string): boolean {
  const t = input.trim();
  return /^https?:\/\/\S+$/i.test(t) && !/\s/.test(t);
}

/** Pull the handle and id out of an x.com status URL, or null if it is not one. */
export function parseStatusUrl(raw: string): { handle: string; id: string } | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (!["x.com", "twitter.com", "mobile.twitter.com", "fxtwitter.com", "vxtwitter.com"].includes(host)) return null;

  const m = u.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,25})/);
  if (!m) return null;
  return { handle: m[1], id: m[2] };
}

/** Refuse anything that resolves off the public internet, including via a CNAME. */
async function assertPublicHost(host: string): Promise<void> {
  if (host !== MIRROR_HOST) throw new RetrievalFailed("blocked");
  const addrs = await lookup(host, { all: true }).catch(() => {
    throw new RetrievalFailed("unreachable");
  });
  if (!addrs.length) throw new RetrievalFailed("unreachable");
  for (const { address } of addrs) if (isPrivateAddress(address)) throw new RetrievalFailed("blocked");
}

export function isPrivateAddress(address: string): boolean {
  const v = isIP(address);
  if (v === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  if (v === 6) {
    const s = address.toLowerCase();
    if (s === "::" || s === "::1") return true;
    if (s.startsWith("fe80") || s.startsWith("fc") || s.startsWith("fd")) return true;
    // An IPv4 address wearing an IPv6 hat is still that address.
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }
  return true;
}

export async function retrievePost(raw: string): Promise<RetrievedPost> {
  const parsed = parseStatusUrl(raw);
  if (!parsed) throw new RetrievalFailed("not_a_post");

  await assertPublicHost(MIRROR_HOST);

  let res: Response;
  try {
    res = await fetch(`https://${MIRROR_HOST}/${parsed.handle}/status/${parsed.id}`, {
      headers: { "user-agent": "thesis-match/1.0", accept: "application/json" },
      // A redirect is a second destination this function never checked, so it is an error.
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new RetrievalFailed("unreachable");
  }
  if (!res.ok) throw new RetrievalFailed("unreachable");

  const body = await readCapped(res);
  let json: {
    tweet?: { text?: string; created_timestamp?: number; author?: { screen_name?: string; name?: string } };
  };
  try {
    json = JSON.parse(body);
  } catch {
    throw new RetrievalFailed("unreachable");
  }

  const tweet = json.tweet;
  const text = (tweet?.text ?? "").trim();
  if (!text) throw new RetrievalFailed("empty");

  return {
    text: text.slice(0, 2_000),
    handle: `@${tweet?.author?.screen_name ?? parsed.handle}`,
    authorName: tweet?.author?.name?.slice(0, 80) ?? null,
    url: `https://x.com/${parsed.handle}/status/${parsed.id}`,
    postedAt: tweet?.created_timestamp ? new Date(tweet.created_timestamp * 1000).toISOString() : null,
  };
}

/** Stop reading at the cap rather than buffering whatever the other end decides to send. */
async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) throw new RetrievalFailed("unreachable");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new RetrievalFailed("unreachable");
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(await new Blob(chunks as BlobPart[]).arrayBuffer());
}
