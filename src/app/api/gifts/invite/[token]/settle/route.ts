import { guard } from "@/server/api";
import { getGiftByInvite } from "@/server/gifts/repository";
import { settleDelivery } from "@/server/gifts/service";

/** Settle delivery from the purchase's reconciled status. Idempotent; changes nothing if pending. */
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return guard(async () => {
    const g = await getGiftByInvite(token);
    return g ? settleDelivery(g.id) : { status: "not_found" as const };
  });
}
