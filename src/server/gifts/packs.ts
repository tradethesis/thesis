import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";

import { draftSchema } from "@/lib/thesis-draft";
import { createThesis } from "@/server/content/create";
import { draftCase } from "@/server/content/expand";
import { db } from "@/server/db/client";
import { giftPackDesign } from "@/server/db/schema";

import { CUSTOM_PREFIX, resolveGiftPack } from "./catalogue";

/**
 * Building a pack: the sender's own thesis, published, then named and coloured as a gift.
 *
 * Everything that decides what gets bought goes through `createThesis` exactly as it does from
 * /app/create — the asset checks, the author's own case for and against, the near-duplicate rule —
 * so a gift is never a back door around what a thesis must be. Publishing is public and under the
 * builder's wallet; the builder is told so before they press the button.
 */

/**
 * What the builder sends: the belief in one line, the holdings, a category. The case for and the
 * case against are drafted from those (draftCase) — too much to ask of somebody choosing a present.
 */
export const buildPackSchema = z.object({
  thesis: draftSchema.innerType().omit({ why: true, against: true }),
  name: z.string().trim().min(3, "Give the pack a name.").max(70, "Keep the name under 70 characters."),
  color: z.enum(["blue", "green", "red", "gold"]),
});

/** Publishing is a public act with a model call behind it; a handful an hour is plenty for a person. */
export const PACKS_PER_HOUR = 5;

export async function buildPack(wallet: string, input: z.infer<typeof buildPackSchema>) {
  // Publishing drafts the per-holding detail with a model; without its key nothing can publish.
  if (!process.env.OPENROUTER_API_KEY) return { status: "unavailable" as const };
  const [recent] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(giftPackDesign)
    .where(and(eq(giftPackDesign.createdByWallet, wallet), gt(giftPackDesign.createdAt, sql`now() - interval '1 hour'`)));
  if ((recent?.n ?? 0) >= PACKS_PER_HOUR) return { status: "rate_limited" as const };

  const drafted = await draftCase({ claim: input.thesis.claim, holdings: input.thesis.holdings }, process.env.OPENROUTER_API_KEY!);
  // The full thesis rules still apply once the drafted paragraphs are in.
  const full = draftSchema.safeParse({ ...input.thesis, ...drafted });
  if (!full.success) return { status: "invalid" as const, message: full.error.issues[0]?.message ?? "Check the pack." };
  const { slug } = await createThesis({ wallet, draft: full.data, basketName: input.name });
  await db
    .insert(giftPackDesign)
    .values({ thesisSlug: slug, name: input.name, color: input.color, createdByWallet: wallet })
    .onConflictDoNothing();

  const pack = await resolveGiftPack(`${CUSTOM_PREFIX}${slug}`);
  // Published, but not giftable right now (a holding stopped trading, say). The thesis still stands.
  if (!pack) return { status: "not_giftable" as const, thesisSlug: slug };
  return { status: "created" as const, pack };
}
