import { z } from "zod";

import { MAX_LEGS, MIN_LEGS, MIN_WEIGHT_BPS, TOTAL_BPS, weightBoundsBps } from "./money/allocate";

/**
 * What a person types to create a thesis.
 *
 * Four things, and no more: the claim, the basket, why it works, why it might not. Everything
 * else a published thesis carries — the per-holding role, case and limitation, the summary,
 * the falsifier — is drafted from these by `src/server/content/expand.ts` and shown before
 * anything goes live.
 *
 * The two prose fields are the ones that cannot be delegated. The case for is the argument,
 * and the case against is the reason anybody should trust the case for. A form that asked for
 * the first and not the second would be a launchpad with a text box.
 */

/** The usual basket, and the most a basket may hold. One or two are allowed too (allocate.ts). */
export const HOLDINGS = 3;

const trimmed = (min: number, max: number) =>
  z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(min).max(max));

export const CATEGORIES = ["Technology", "Finance", "Crypto", "Energy", "Consumer", "Health"] as const;

export const holdingSchema = z.object({
  symbol: z.string().min(1).max(12),
  /** Whole percent. The database stores basis points; a person types percent. */
  weightPercent: z.number().int().min(MIN_WEIGHT_BPS / 100).max(TOTAL_BPS / 100),
});

export const draftSchema = z
  .object({
    claim: trimmed(12, 70),
    category: z.enum(CATEGORIES),
    why: trimmed(80, 1200),
    against: trimmed(60, 1200),
    holdings: z.array(holdingSchema).min(MIN_LEGS, "Pick at least one holding.").max(MAX_LEGS, `At most ${MAX_LEGS} holdings.`),
  })
  .superRefine((draft, ctx) => {
    const total = draft.holdings.reduce((sum, h) => sum + h.weightPercent, 0);
    const { min, max } = weightBoundsBps(draft.holdings.length);
    if (draft.holdings.some((h) => h.weightPercent * 100 < min || h.weightPercent * 100 > max)) {
      ctx.addIssue({ code: "custom", path: ["holdings"], message: `With ${draft.holdings.length} holding${draft.holdings.length === 1 ? "" : "s"}, each must be ${min / 100}–${max / 100}%.` });
    }
    if (total !== 100) {
      ctx.addIssue({ code: "custom", path: ["holdings"], message: `Weights add up to ${total}%, not 100%.` });
    }

    if (draft.holdings.some((h) => !h.symbol)) {
      ctx.addIssue({ code: "custom", path: ["holdings"], message: "Pick every holding." });
    }

    const symbols = draft.holdings.map((h) => h.symbol).filter(Boolean);
    if (new Set(symbols).size !== symbols.length) {
      ctx.addIssue({ code: "custom", path: ["holdings"], message: "A holding appears twice." });
    }
  });

export type ThesisDraftInput = z.infer<typeof draftSchema>;

/**
 * A url-safe identity for a claim.
 *
 * Derived from the claim rather than asked for, because a slug is a thing a person gets wrong
 * and never sees again. Collisions are resolved by the caller against what is already stored.
 */
export function slugify(claim: string): string {
  const base = claim
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72)
    .replace(/-+$/g, "");
  return base || "thesis";
}
