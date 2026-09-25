import { authed, err } from "@/server/api";
import { createIntent, IntentError } from "@/server/execution/intents";
import { buyInputSchema } from "@/lib/buy-input";
import { giftPurchaseTerms } from "@/server/gifts/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsed = buyInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return err("invalid_input", "Check the amount, allocation, and thesis before continuing.");
  const body = parsed.data;
  const budgetRaw = BigInt(Math.round(body.budgetUsdc! * 1e6));
  return authed(async (wallet) => {
    // Opening a gift: verified against the record here, so the engine never trusts the client.
    let gift: { minRaw: bigint; executionMode: "live" | "simulation"; basketVersionId?: string } | undefined;
    if (body.giftToken) {
      const check = await giftPurchaseTerms({ token: body.giftToken, wallet, budgetRaw });
      if (!check.ok) {
        throw new IntentError("gift_not_openable", "This gift can't be opened from here. Open it again from its invitation.", { reason: check.reason });
      }
      gift = check.terms;
    }
    return createIntent({
      wallet,
      slug: body.slug!,
      versionId: body.versionId,
      budgetRaw,
      weights: body.weights ?? [],
      idempotencyKey: body.idempotencyKey!,
      gift,
    });
  });
}
