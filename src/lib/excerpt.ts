/** Longest post shown in full on a feed card. Chosen so a normal post is never cut. */
const FULL_LIMIT = 240;

/**
 * Shorten a source post for the feed without throwing away the hook.
 *
 * A blind line-clamp is the obvious approach and it is wrong here. The Naval post that
 * started this catalogue is two sentences, and the second one — "In that case, who's
 * liable?" — is the entire reason the thesis exists. A three-line clamp at phone width
 * drops it and leaves the reader with the setup and no question.
 *
 * So: posts up to FULL_LIMIT are shown whole, which covers almost everything anybody
 * quotes. Longer ones are cut at a sentence boundary and marked as cut, and the last
 * sentence is kept when it is a question, because a question at the end of a post is
 * nearly always the point of it.
 */
export function excerptPost(text: string): { text: string; truncated: boolean } {
  // Blank lines between paragraphs collapse to a single break. Every word survives; the
  // card just does not spend 20 vertical pixels rendering the author's paragraph spacing,
  // which on a phone is the difference between the question fitting and not. The post is
  // shown with its original spacing on the thesis page.
  const clean = text.trim().replace(/\n{2,}/g, "\n");
  if (clean.length <= FULL_LIMIT) return { text: clean, truncated: false };

  const sentences = clean.split(/(?<=[.!?])\s+/);
  const last = sentences[sentences.length - 1] ?? "";
  const tail = last.endsWith("?") && last.length <= 120 ? last : "";

  // Room for the opening, the ellipsis, and the closing question if we are keeping one.
  const budget = FULL_LIMIT - (tail ? tail.length + 2 : 0);

  let head = "";
  for (const sentence of sentences) {
    if (sentence === tail) break;
    if (head.length + sentence.length + 1 > budget) break;
    head = head ? `${head} ${sentence}` : sentence;
  }

  // No sentence boundary inside the budget: fall back to a word boundary.
  if (!head) {
    head = clean.slice(0, budget);
    head = head.slice(0, Math.max(head.lastIndexOf(" "), 1));
  }

  return { text: tail ? `${head} … ${tail}` : `${head} …`, truncated: true };
}

/**
 * The opening sentence of a longer passage, for a one-line preview.
 *
 * Used to put a thesis's own strongest objection on the card next to "Doubt it". These
 * objections are the best writing in the product and they were buried in a sheet, which
 * made doubting a thumbs-down rather than a position somebody could actually hold.
 *
 * Returns the whole first sentence or nothing. A sentence cut mid-clause and given an
 * ellipsis reads as a teaser, and a teaser is the wrong register for a counterargument:
 * the point is to state the objection honestly, not to advertise it.
 */
export function firstSentence(text: string, maxChars = 150): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // A period, question mark or exclamation followed by whitespace and a capital — which
  // leaves "U.S." and "Inc." alone, since neither is followed by a capitalised word.
  const end = trimmed.search(/[.?!]\s+[A-Z(]/);
  const sentence = end === -1 ? trimmed : trimmed.slice(0, end + 1);
  return sentence.length <= maxChars ? sentence : null;
}
