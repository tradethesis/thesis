import { authed } from "@/server/api";
import { getGift } from "@/server/gifts/repository";

/** The sender's view of their own gift. Anyone else's is indistinguishable from none. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return authed(async (wallet) => {
    const g = /^[0-9a-f-]{36}$/.test(id) ? await getGift(id) : null;
    if (!g || g.senderWallet !== wallet) return { status: "not_found" as const };
    return {
      status: "ok" as const,
      gift: {
        id: g.id,
        state: g.state,
        packId: g.packId,
        basketVersionId: g.basketVersionId,
        amountUsd: g.amountUsd,
        senderName: g.senderName,
        note: g.note,
        recipientHandleRequested: g.recipientHandleRequested,
        recipientHandle: g.recipientHandleAtResolution ?? g.recipientHandleRequested,
        recipientName: g.recipientDisplayName,
        fundingSignature: g.fundingSignature,
        failureReason: g.failureReason,
        inviteExpiresAt: g.inviteExpiresAt,
        fundedAt: g.fundedAt,
        claimedAt: g.claimedAt,
      },
    };
  });
}
