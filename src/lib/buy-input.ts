import { z } from "zod";
import { MAX_WEIGHT_BPS, MIN_WEIGHT_BPS, validateAllocation } from "./money/allocate";

export const buyInputSchema = z.object({
  slug: z.string().min(1).max(120),
  idempotencyKey: z.string().uuid(),
  versionId: z.string().uuid().optional(),
  budgetUsdc: z.number().finite().positive().max(1_000_000).refine(n => Number.isSafeInteger(Math.round(n * 1e6)), "Invalid amount"),
  weights: z.array(z.object({ symbol: z.string().min(1).max(20), weightBps: z.number().int().min(MIN_WEIGHT_BPS).max(MAX_WEIGHT_BPS) })).max(3).optional(),
});

/** Only carry an allocation across pages when every whole-percent weight is valid. */
export function parseWeightQuery(value: string | undefined, symbols: string[]): number[] | null {
  if (!value) return null;
  const parts = value.split(",");
  if (parts.length !== symbols.length || parts.some(p => !/^\d{1,2}$/.test(p))) return null;
  const weights = parts.map(Number);
  try { validateAllocation(weights.map((w, i) => ({ assetId: symbols[i], positionIndex: i, bps: w * 100 }))); }
  catch { return null; }
  return weights;
}
