import type { Metadata } from "next";
import { GiftRecipient } from "@/components/gifts/GiftRecipient";
import { giftCatalogue } from "@/server/gifts/catalogue";
import "../../gifts.css";

export const metadata: Metadata = {
  title: "A little belief, just for you",
  description: "Someone made you a gift. Tear it open.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default async function GiftPreviewPage() {
  const { packs } = await giftCatalogue();
  return <GiftRecipient packs={packs} />;
}
