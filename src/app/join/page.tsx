import type { Metadata } from "next";
import "../landing.css";
import "./join.css";
import { WaitlistLanding } from "@/components/join/WaitlistLanding";

export const metadata: Metadata = {
  title: "Join the waitlist — Thesis",
  description: "Buying opens to more wallets soon. Leave an email and we will tell you when it does.",
};

export default function JoinPage() {
  return <WaitlistLanding source="join" />;
}
