import { authed, err } from "@/server/api";
import { createIntent } from "@/server/execution/intents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    slug?: string;
    budgetUsdc?: number;
    weights?: { symbol: string; weightBps: number }[];
    idempotencyKey?: string;
  };
  if (!body.slug || !body.idempotencyKey || typeof body.budgetUsdc !== "number") {
    return err("incomplete", "slug, budgetUsdc and idempotencyKey are required.");
  }
  return authed((wallet) =>
    createIntent({
      wallet,
      slug: body.slug!,
      budgetRaw: BigInt(Math.round(body.budgetUsdc! * 1e6)),
      weights: body.weights ?? [],
      idempotencyKey: body.idempotencyKey!,
    }),
  );
}
