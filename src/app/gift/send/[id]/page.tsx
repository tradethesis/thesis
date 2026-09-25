import type { Metadata } from "next";

import { GiftResume } from "@/components/gifts/GiftResume";
import "../../../gifts.css";

export const metadata: Metadata = { title: "Your gift", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Where a sender comes back to a gift: waiting for acceptance, ready to pay, or sent. */
export default async function GiftSendPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GiftResume giftId={id} />;
}
