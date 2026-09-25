import { authed } from "@/server/api";
import { fundingTransaction } from "@/server/gifts/service";

/** The unsigned transfer for the sender's wallet to sign and broadcast. The server does neither. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return authed((wallet) => fundingTransaction(id, wallet));
}
