import { authed, err } from "@/server/api";
import { body, idempotencyKey } from "@/server/gifts/http";
import { confirmRecipient } from "@/server/gifts/service";

/** The sender confirms the account they were shown; the recipient's wallet is provisioned. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const key = idempotencyKey(request);
  if (typeof key !== "string") return key;
  const b = await body<{ subject?: unknown }>(request);
  if (typeof b?.subject !== "string" || !/^\d{1,25}$/.test(b.subject)) return err("invalid_subject", "Confirm the account you were shown.");
  const subject = b.subject;
  return authed((wallet) => confirmRecipient({ giftId: id, senderWallet: wallet, confirmedSubject: subject, idempotencyKey: key }));
}
