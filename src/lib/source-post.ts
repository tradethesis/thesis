import { z } from "zod";

/** Stored inside the published evidence snapshot, so attribution cannot drift later. */
export const sourcePostSchema = z.object({
  url: z.string().url().regex(/^https:\/\/x\.com\/[A-Za-z0-9_]+\/status\/\d+$/),
  author: z.string().min(1),
  handle: z.string().regex(/^@[A-Za-z0-9_]+$/),
  text: z.string().min(1).max(500),
  postedAt: z.string().datetime(),
  verifiedAt: z.string().datetime(),
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
