import type { Metadata } from "next";
import { GiftHome } from "@/components/gifts/GiftHome";
import { WaitlistLanding } from "@/components/join/WaitlistLanding";
import { siteMode } from "@/lib/site-mode";
import { giftCatalogue } from "@/server/gifts/catalogue";
import { readiness } from "@/server/gifts/providers";
import "./gifts.css";
import "./landing.css";
import "./join/join.css";

export const metadata: Metadata = {
  title: "The coolest gift on the internet",
  description: "Give a friend a pack of stocks. From $1, sent to their X handle.",
};
export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (siteMode() === "waitlist") return <WaitlistLanding source="home" />;
  const catalogue = await giftCatalogue();
  return <GiftHome {...catalogue} live={readiness().live} />;
}
