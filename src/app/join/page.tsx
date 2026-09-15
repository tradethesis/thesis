import type { Metadata } from "next";
import "../landing.css";
import "./join.css";
import { WaitlistLanding } from "@/components/join/WaitlistLanding";

export const metadata: Metadata = {
  title: "Join the waitlist",
  description: "Buying opens to more wallets soon. Leave an email and we will tell you when it does.",
  // Both "/" and "/join" render the same component while the site is gated. Pointing
  // this one at "/" would be lying about which URL a visitor is on; pointing it at
  // itself lets the two coexist without either being treated as a duplicate.
  alternates: { canonical: "/join" },
};

export default function JoinPage() {
  return <WaitlistLanding source="join" />;
}
