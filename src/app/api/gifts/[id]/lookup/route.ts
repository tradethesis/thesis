import { authed } from "@/server/api";
import { lookUpRecipient } from "@/server/gifts/service";

/** Resolve the handle and show the sender who it is. Binds nothing. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return authed((wallet) => lookUpRecipient(id, wallet));
}
