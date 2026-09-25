import { authed } from "@/server/api";
import { idempotencyKey } from "@/server/gifts/http";
import { cancelGift } from "@/server/gifts/service";

/** Only before payment has been requested. After that the funds may already be the recipient's. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const key = idempotencyKey(request);
  if (typeof key !== "string") return key;
  return authed((wallet) => cancelGift(id, wallet, key));
}
