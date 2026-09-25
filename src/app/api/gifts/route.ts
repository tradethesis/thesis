import { authed } from "@/server/api";
import { body, idempotencyKey } from "@/server/gifts/http";
import { startGift } from "@/server/gifts/service";

/**
 * Start a gift. The sender is the wallet in the verified session, never a field in the body. The
 * invitation token is returned once, here, and never again — only its hash is stored.
 */
export async function POST(request: Request) {
  const key = idempotencyKey(request);
  if (typeof key !== "string") return key;
  const draft = await body(request);
  // The photo rides alongside the draft (the preview's URL fragment cannot carry an image).
  const centerImageId = typeof draft?.centerImageId === "string" ? draft.centerImageId : null;
  return authed((wallet) => startGift({ senderWallet: wallet, draft, idempotencyKey: key, centerImageId }));
}
