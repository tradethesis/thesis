import { authed, err } from "@/server/api";
import { createIntent } from "@/server/execution/intents";
import { buyInputSchema } from "@/lib/buy-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsed = buyInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return err("invalid_input", "Check the amount, allocation, and thesis before continuing.");
  const body = parsed.data;
  return authed((wallet) =>
    createIntent({
      wallet,
      slug: body.slug!,
      versionId: body.versionId,
      budgetRaw: BigInt(Math.round(body.budgetUsdc! * 1e6)),
      weights: body.weights ?? [],
      idempotencyKey: body.idempotencyKey!,
    }),
  );
}
