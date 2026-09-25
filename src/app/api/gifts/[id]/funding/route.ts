import { authed, err } from "@/server/api";
import { chain } from "@/server/execution/chainReader";
import { body, idempotencyKey } from "@/server/gifts/http";
import { submitFunding } from "@/server/gifts/service";

/**
 * The signature the sender's wallet broadcast. Recorded first, then read from the chain. The
 * response is evidence-based: funded, failed with a reason, or reconciling — never "sent" on the
 * browser's say-so.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const key = idempotencyKey(request);
  if (typeof key !== "string") return key;
  const b = await body<{ signature?: unknown }>(request);
  if (typeof b?.signature !== "string") return err("invalid_signature", "Send the transaction signature.");
  const signature = b.signature;
  return authed((wallet) => submitFunding({ giftId: id, senderWallet: wallet, signature, idempotencyKey: key, chain }));
}
