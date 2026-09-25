import { authed } from "@/server/api";
import { idempotencyKey } from "@/server/gifts/http";
import { requestAcceptance } from "@/server/gifts/service";

/** Send the link first and fund once the recipient has accepted with their X account. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const key = idempotencyKey(request);
  if (typeof key !== "string") return key;
  return authed((wallet) => requestAcceptance(id, wallet, key));
}
