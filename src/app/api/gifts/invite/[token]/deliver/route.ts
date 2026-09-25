import { authed, err } from "@/server/api";
import { body, idempotencyKey } from "@/server/gifts/http";
import { getGiftByInvite } from "@/server/gifts/repository";
import { beginDelivery } from "@/server/gifts/service";

/**
 * Attach the recipient's own purchase to their reservation. The session wallet must be the gift's
 * destination: the purchase is signed by that wallet through the existing buy engine.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const key = idempotencyKey(request);
  if (typeof key !== "string") return key;
  const b = await body<{ intentId?: unknown }>(request);
  if (typeof b?.intentId !== "string" || !/^[0-9a-f-]{36}$/.test(b.intentId)) return err("invalid_intent", "Send the purchase to attach.");
  const intentId = b.intentId;
  return authed(async (wallet) => {
    const g = await getGiftByInvite(token);
    if (!g || g.destinationWallet !== wallet) return { status: "not_found" as const };
    return beginDelivery({ giftId: g.id, intentId, idempotencyKey: key });
  });
}
