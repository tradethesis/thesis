/**
 * Re-check every curated source post against the live post.
 *
 * Attribution is the one thing in this product that must not drift: the whole promise is
 * that the original conversation is quoted accurately and that its author did not endorse
 * our basket. A hand-typed verifiedAt is a claim; this makes it checkable.
 *
 * Uses the FxTwitter public mirror because x.com serves no readable content to a fetch.
 */
import { CURATED_EVIDENCE } from "../src/server/content/curated";
import { sourcePostSchema } from "../src/lib/source-post";

const norm = (s: string) => s.replace(/[ \t]+\n/g, "\n").trim();

async function main() {
  let failures = 0;

  for (const [slug, evidence] of Object.entries(CURATED_EVIDENCE)) {
    for (const item of evidence) {
      if (!item.sourcePost) continue;
      const parsed = sourcePostSchema.safeParse(item.sourcePost);
      if (!parsed.success) {
        console.log(`  FAIL ${slug}: sourcePost does not match the schema`);
        failures += 1;
        continue;
      }
      const post = parsed.data;
      const [, handle, id] = post.url.match(/x\.com\/([A-Za-z0-9_]+)\/status\/(\d+)/)!;

      const res = await fetch(`https://api.fxtwitter.com/${handle}/status/${id}`, {
        headers: { "user-agent": "thesis-verify/1.0" },
      });
      if (!res.ok) {
        console.log(`  FAIL ${slug}: mirror returned ${res.status}`);
        failures += 1;
        continue;
      }
      const body = (await res.json()) as {
        tweet?: { text?: string; created_timestamp?: number; author?: { screen_name?: string; name?: string } };
      };
      const tweet = body.tweet;
      if (!tweet) {
        console.log(`  FAIL ${slug}: mirror returned no tweet`);
        failures += 1;
        continue;
      }

      const checks: [string, boolean, string][] = [
        ["handle", `@${tweet.author?.screen_name}` === post.handle, `${tweet.author?.screen_name} vs ${post.handle}`],
        ["text", norm(tweet.text ?? "") === norm(post.text), "stored text differs from the live post"],
        [
          "postedAt",
          new Date((tweet.created_timestamp ?? 0) * 1000).toISOString() === new Date(post.postedAt).toISOString(),
          `${new Date((tweet.created_timestamp ?? 0) * 1000).toISOString()} vs ${post.postedAt}`,
        ],
        ["verifiedAt is not in the future", new Date(post.verifiedAt) <= new Date(), post.verifiedAt],
        ["verifiedAt is after the post", new Date(post.verifiedAt) >= new Date(post.postedAt), post.verifiedAt],
      ];

      for (const [label, pass, detail] of checks) {
        console.log(`  ${pass ? "ok  " : "FAIL"} ${slug} · ${label}${pass ? "" : `  ${detail}`}`);
        if (!pass) failures += 1;
      }
    }
  }

  console.log(failures ? `\n${failures} problem(s)` : "\nevery source post matches its original");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
