/**
 * Turn real X posts into thesis drafts. Source first, claim second.
 *
 *   pnpm tsx scripts/source-from-x.ts https://x.com/<handle>/status/<id> [more urls…]
 *
 * The catalogue is meant to start from a conversation somebody actually had. This is the
 * only sanctioned way in: paste post URLs, and each one is verified against the public
 * mirror before anything is written — author, handle, exact text, posted time, engagement,
 * avatar. What comes out is a draft with the source block filled in and the editorial work
 * left blank, because the claim, the basket and the argument against it are judgements and
 * cannot be fetched.
 *
 * It refuses rather than guesses. If the mirror cannot be reached, or returns a different
 * handle than the URL claims, or returns no text, that post is skipped and the reason is
 * printed. A quotation attributed to a real person next to an investment basket is the one
 * thing in this product that must never be approximated: the cost of inventing one is
 * somebody's name on a recommendation they never made.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MIRRORS = ["https://api.fxtwitter.com", "https://api.vxtwitter.com"];
const URL_SHAPE = /^https:\/\/(?:x|twitter)\.com\/([A-Za-z0-9_]+)\/status\/(\d+)/;

type Verified = {
  url: string;
  author: string;
  handle: string;
  text: string;
  postedAt: string;
  verifiedAt: string;
  metrics: { likes: number; reposts: number; replies: number; views: number; capturedAt: string };
  avatarUrl: string | null;
};


/**
 * Fetch with backoff, because the mirror rate-limits in bursts.
 *
 * Measured: roughly a dozen quick requests succeed, then every request times out for a
 * while — the connection opens and then hangs rather than returning 429, so there is no
 * status code to react to. Spacing requests out and retrying is the difference between a
 * refresh that works and one that reports the whole catalogue as unverifiable.
 */
async function fetchWithBackoff(url: string, init: RequestInit, attempts = 4): Promise<Response | null> {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
      if (res.ok) return res;
    } catch {
      // A timeout is the shape a block takes here. Fall through and wait.
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 2_000 * 2 ** i));
  }
  return null;
}

async function verify(url: string): Promise<Verified | { error: string }> {
  const match = url.match(URL_SHAPE);
  if (!match) return { error: "not an x.com status URL" };
  const [, handle, id] = match;

  let lastError = "no mirror reachable";
  for (const base of MIRRORS) {
    try {
      const res = await fetchWithBackoff(`${base}/${handle}/status/${id}`, {
        headers: { "user-agent": "thesis-source/1.0", accept: "application/json" },
      });
      if (!res) {
        lastError = `${base} unreachable after retries (rate limited?)`;
        continue;
      }
      const body = (await res.json()) as {
        tweet?: {
          text?: string; created_timestamp?: number;
          likes?: number; retweets?: number; replies?: number; views?: number;
          author?: { name?: string; screen_name?: string; avatar_url?: string };
        };
      };
      const t = body.tweet;
      if (!t?.text) {
        lastError = `${base} returned no text`;
        continue;
      }
      // The URL says who wrote it; the mirror has to agree. A post that moved accounts, or a
      // mirror that resolved the id to something else, must not become an attribution.
      if (`@${t.author?.screen_name}`.toLowerCase() !== `@${handle}`.toLowerCase()) {
        return { error: `mirror says @${t.author?.screen_name}, URL says @${handle}` };
      }

      const now = new Date().toISOString();
      return {
        url: `https://x.com/${t.author!.screen_name}/status/${id}`,
        author: t.author?.name ?? handle,
        handle: `@${t.author!.screen_name}`,
        text: t.text,
        postedAt: new Date((t.created_timestamp ?? 0) * 1000).toISOString(),
        verifiedAt: now,
        metrics: {
          likes: t.likes ?? 0,
          reposts: t.retweets ?? 0,
          replies: t.replies ?? 0,
          views: t.views ?? 0,
          capturedAt: now,
        },
        avatarUrl: t.author?.avatar_url ?? null,
      };
    } catch (e) {
      lastError = `${base}: ${e instanceof Error ? e.message : "failed"}`;
    }
  }
  return { error: lastError };
}

function saveAvatar(v: Verified): boolean {
  if (!v.avatarUrl) return false;
  const slug = v.handle.replace(/^@/, "").toLowerCase();
  const dir = join(process.cwd(), "public", "authors");
  mkdirSync(dir, { recursive: true });
  try {
    execFileSync("curl", ["-sfL", "--max-time", "20", "-o", join(dir, `${slug}.src`), v.avatarUrl.replace("_200x200", "_400x400")]);
    execFileSync("cwebp", ["-quiet", "-resize", "96", "96", "-q", "86", join(dir, `${slug}.src`), "-o", join(dir, `${slug}.webp`)]);
    execFileSync("rm", ["-f", join(dir, `${slug}.src`)]);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const urls = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!urls.length) {
    console.error("  usage: pnpm tsx scripts/source-from-x.ts <x.com status url> [...]");
    process.exit(1);
  }

  const drafts: Verified[] = [];
  for (const url of urls) {
    const result = await verify(url);
    if ("error" in result) {
      console.error(`  SKIP  ${url}\n        ${result.error}`);
      continue;
    }
    const avatar = saveAvatar(result);
    drafts.push(result);
    console.log(
      `  ok    ${result.handle} — ${result.text.replace(/\s+/g, " ").slice(0, 60)}…\n` +
        `        ${result.metrics.likes} likes · ${result.metrics.views} views · avatar ${avatar ? "saved" : "unavailable"}`,
    );
  }

  if (!drafts.length) {
    console.error("\n  Nothing verified, so nothing written.");
    process.exit(1);
  }

  // JSON, not a TypeScript fragment. A .ts file of half-written objects is not valid
  // TypeScript, and the build typechecks everything in the repo.
  const out = join(process.cwd(), "output", "sourced-drafts.json");
  mkdirSync(join(process.cwd(), "output"), { recursive: true });
  writeFileSync(
    out,
    JSON.stringify(
      {
        note:
          "Verified source posts. The source block is fetched and checked; the claim, the " +
          "assets, the reasoning and the argument against are editorial judgement and cannot " +
          "be fetched. Filling them in automatically would attach a real person's name to an " +
          "investment view they never expressed.",
        posts: drafts,
      },
      null,
      2,
    ),
  );

  console.log(`\n  wrote ${drafts.length} verified post(s) to output/sourced-drafts.json`);
  console.log("  Fill in the TODOs, move into src/server/content/curated.ts, then:");
  console.log("    pnpm content:publish && pnpm content:metrics");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
