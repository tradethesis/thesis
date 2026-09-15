/**
 * A tile standing for the author of a quoted post.
 *
 * Deliberately not their profile photograph. Thesis quotes people who have not been asked
 * and have not agreed, and a face beside a basket reads as a face endorsing a basket — the
 * exact impression the line under it exists to prevent. Their own photograph is also their
 * likeness to license, not ours to redistribute.
 *
 * So it is a monogram whose colour is derived from the handle: stable, so the same author
 * looks the same everywhere, distinct enough to tell two authors apart at a glance, and
 * obviously a label rather than a picture of a person.
 */

// Chosen against the ivory background for legible white type. Hues are spread far enough
// apart that adjacent cards never look like the same author.
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
  const letter = handle.replace(/^@/, "").charAt(0).toUpperCase() || "?";
  return (
    <span className="am" style={{ background: toneFor(handle) }} aria-hidden="true" title={author}>
      {letter}
    </span>
  );
}
