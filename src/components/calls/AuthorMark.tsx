/**
 * The author of a quoted post: their picture where we have it, their initial where we
 * do not.
 *
 * Both layers always render. The monogram is the tile's background and the photograph sits
 * on top of it, so an author whose avatar has not been fetched — or whose file 404s after a
 * rename — gets a coloured initial rather than a broken-image glyph. No client JavaScript
 * and no server filesystem check: the browser already knows how to fail at loading an
 * image, and the fallback is simply what is underneath.
 *
 * Avatars are downloaded and committed by scripts/capture-source-metrics.ts, which checks
 * the post's handle against the mirror before saving anything. A face beside a quotation is
 * a stronger claim than a number beside it, and attaching the wrong one is a worse error.
 */

// Chosen against the ivory background for legible white type. Hues are spread far enough
// apart that two authors on the same screen never look like the same person.
const TONES = [
  "oklch(48% 0.175 33)", // vermilion, the brand's own
  "oklch(44% 0.13 255)", // blue
  "oklch(42% 0.11 156)", // green
  "oklch(46% 0.13 305)", // violet
  "oklch(45% 0.12 70)", // amber-brown
];

function toneFor(handle: string): string {
  let hash = 0;
  for (const ch of handle) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length];
}

export function AuthorMark({ handle, author }: { handle: string; author: string }) {
  const slug = handle.replace(/^@/, "").toLowerCase();
  const letter = slug.charAt(0).toUpperCase() || "?";

  return (
    <span className="am" style={{ background: toneFor(handle) }} title={author}>
      <span aria-hidden="true">{letter}</span>
      {/* eslint-disable-next-line @next/next/no-img-element --
          A 96px webp that ships with the build. next/image would add an optimizer round
          trip to resize something already at its final size. */}
      <img src={`/authors/${slug}.webp`} alt="" width={96} height={96} loading="lazy" decoding="async" />
    </span>
  );
}
