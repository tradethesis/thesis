import { z } from "zod";

/** Stored inside the published evidence snapshot, so attribution cannot drift later. */
export const sourcePostSchema = z.object({
  url: z.string().url().regex(/^https:\/\/x\.com\/[A-Za-z0-9_]+\/status\/\d+$/),
  author: z.string().min(1),
  handle: z.string().regex(/^@[A-Za-z0-9_]+$/),
  text: z.string().min(1).max(500),
  postedAt: z.string().datetime(),
  verifiedAt: z.string().datetime(),
  /**
   * How the post was doing when we last looked, captured from the same mirror that
   * verifies its text.
   *
   * A snapshot with a timestamp, never a live counter, and never rendered without the
   * date it was taken. Two things it is not: it is not engagement with this thesis, and
   * it is not engagement with the basket. It measures the conversation we are reading,
   * which is the only reason it is worth showing at all.
   *
   * Optional because a thesis can be published before the numbers are captured, and a
   * missing snapshot must render as nothing rather than as zero.
   */
  metrics: z
    .object({
      likes: z.number().int().nonnegative(),
      reposts: z.number().int().nonnegative(),
      replies: z.number().int().nonnegative(),
      views: z.number().int().nonnegative(),
      capturedAt: z.string().datetime(),
    })
    .optional(),
});
export type SourcePost = z.infer<typeof sourcePostSchema>;

export function sourcePostFromEvidence(evidence: unknown): SourcePost | null {
  if (!Array.isArray(evidence)) return null;
  for (const item of evidence) {
    const parsed = sourcePostSchema.safeParse(item?.sourcePost);
    if (parsed.success && item.url === parsed.data.url) return parsed.data;
  }
  return null;
}
