import { authed } from "@/server/api";
import { reissueInvite } from "@/server/gifts/service";

/** A new link for a gift still waiting to be accepted. The old link stops working. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return authed((wallet) => reissueInvite(id, wallet));
}
