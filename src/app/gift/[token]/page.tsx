import type { Metadata } from "next";

import { GiftInvitation } from "@/components/gifts/GiftInvitation";
import { resolveGiftPack } from "@/server/gifts/catalogue";
import { readiness } from "@/server/gifts/providers";
import { viewInvitation } from "@/server/gifts/service";

import "../../gifts.css";

export const metadata: Metadata = {
  title: "A gift for you",
  description: "Someone sent you a Thesis gift.",
  // A personal invitation. Never indexed, and the note never goes into link previews.
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * A funded gift's invitation. Distinct from /gift/preview in route, banner and behaviour: this one
 * reads a server-owned record, and opening it can only follow a server-verified X sign-in.
 */
export default async function GiftInvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await viewInvitation(token);
  const pack = view ? await resolveGiftPack(view.packId) : null;
  const ready = readiness();
  return (
    <GiftInvitation
      token={token}
      // Only what the page renders crosses to the browser; the allocation version stays server-side.
      view={view ? { giftId: view.giftId, state: view.state, packId: view.packId, amountUsd: view.amountUsd, senderName: view.senderName, note: view.note, intendedHandle: view.intendedHandle, expired: view.expired, centerImageUrl: view.centerImageUrl } : null}
      pack={pack && view && pack.versionId === view.basketVersionId ? pack : null}
      claimConfigured={ready.privy}
      eligibilityCheck={process.env.GIFT_ELIGIBILITY_PROVIDER === "attestation"}
    />
  );
}
