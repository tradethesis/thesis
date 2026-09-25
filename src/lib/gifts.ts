import { z } from "zod";

/**
 * The smallest gift: $1, for the beta (23 September 2026, product decision: easy to try, easy to
 * share). It was $10 earlier the same day.
 *
 * Ordinary baskets keep the engine's $75 floor (MIN_BASKET_RAW), because below it fees are a large
 * share of the money. Gifts go lower on purpose and pay for it: each holding carries a flat ~$0.16
 * (token-account rent, see src/lib/money/cost.ts), so a three-holding pack loses about 48% of a $1
 * gift, 10% of $5 and 5% of $10. The sender sees that share in dollars while choosing the amount,
 * and again before signing. The smallest leg of a $1 pack ($0.25) still clears the flat charge.
 *
 * The engine accepts a gift purchase under $75 only after /api/intents has verified the gift
 * server-side (reserved, this wallet, this exact amount). The floor is not lowered for anybody else.
 */
export const GIFT_MIN_USD = 1;
export const GIFT_MIN_RAW = BigInt(GIFT_MIN_USD) * 1_000_000n;
export const GIFT_MAX_USD = 1000;

export type GiftPack = {
  id: string;
  versionId: string;
  name: string;
  subtitle: string;
  forWhom: string;
  color: "blue" | "green" | "red" | "gold";
  motif: "orbit" | "bloom" | "spark" | "rings";
  edition: string;
  basketName: string;
  thesisSlug: string;
  /** The thesis whose buy page executes this basket. Differs from thesisSlug only for a custom pack. */
  buySlug: string;
  claim: string;
  counterargument: string;
  holdings: { symbol: string; company: string; weightBps: number; why: string | null }[];
  /**
   * The thesis's public call: how the basket has done since the call opened, against its benchmark.
   * Observed prices, not a model. Null when the thesis has no call yet.
   */
  /** The 12-month what-if (scripts/pack-history.ts): current holdings at current weights, buy-and-hold. */
  history?: { returnPct: number; benchmarkPct: number; from: string; asOf: string; points: { basketPct: number; benchmarkPct: number }[] } | null;
  /** Interest in the pack's companies: Wikipedia page views, last 7 days vs the 7 before (server/gifts/attention.ts). */
  attention?: { weekViews: number; changePct: number; asOf: string } | null;
  /** Holds private-company tokens (PreStocks): no public share price, and the issuer's terms apply. */
  preIpo?: boolean;
  performance?: { startsAt: string; benchmark: string; basketPct: number; benchmarkPct: number; points: { basketPct: number; benchmarkPct: number }[] } | null;
};

export const giftDraftSchema = z.object({
  packId: z.string().min(1).max(100),
  versionId: z.string().min(1).max(100),
  recipient: z.string().trim().regex(/^@?[A-Za-z0-9_]{1,15}$/, "Use an X handle, such as @kayle_build.").transform((s) => s.replace(/^@/, "")),
  sender: z.string().trim().min(1, "Add your name.").max(40),
  message: z.string().trim().max(240),
  amount: z.number().int().min(GIFT_MIN_USD, `Gifts start at $${GIFT_MIN_USD}.`).max(GIFT_MAX_USD, `Gifts go up to $${GIFT_MAX_USD}.`),
});
export type GiftDraft = z.infer<typeof giftDraftSchema>;

/** A shareable preview, never a claim credential or evidence of funding. Personal text stays in
 * the URL fragment: it is not sent to the server, link unfurlers, or in HTTP referrers. */
export function giftPreviewPath(input: GiftDraft): string {
  const draft = giftDraftSchema.parse(input);
  return `/gift/preview#${encodeURIComponent(JSON.stringify(draft))}`;
}

export function readGiftPreview(fragment: string): GiftDraft | null {
  if (!fragment || fragment.length > 5000) return null;
  try {
    const result = giftDraftSchema.safeParse(JSON.parse(decodeURIComponent(fragment.replace(/^#/, ""))));
    return result.success ? result.data : null;
  } catch { return null; }
}

/** Allocate integer cents without dropping the rounding remainder. Preview budgets only. */
export function allocateGiftCents(amount: number, weights: number[]): number[] {
  if (!Number.isInteger(amount) || amount < 0 || weights.length === 0 || weights.some((w) => !Number.isInteger(w) || w < 0) || weights.reduce((a, b) => a + b, 0) !== 10000) {
    throw new Error("Invalid gift allocation");
  }
  const total = amount * 100;
  const parts = weights.map((w) => Math.floor(total * w / 10000));
  const order = weights.map((w, i) => ({ i, fraction: (total * w) % 10000 })).sort((a, b) => b.fraction - a.fraction);
  const remainder = total - parts.reduce((a, b) => a + b, 0);
  for (let i = 0; i < remainder; i++) parts[order[i].i]++;
  return parts;
}
