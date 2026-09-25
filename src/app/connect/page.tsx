import type { Metadata } from "next";
import { Suspense } from "react";

import { WalletEntry } from "@/components/entry/WalletEntry";
import { WaitlistLanding } from "@/components/join/WaitlistLanding";
import { siteMode } from "@/lib/site-mode";

import "../landing.css";
import "../entry.css";
import "../join/join.css";

export const metadata: Metadata = {
  title: "Thesis — connect",
  description: "Connect a Solana wallet to open the terminal.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The wallet gate.
 *
 * This screen used to be `/`. It moved here on 22 September 2026 when the matching homepage took
 * the root, and the move is the whole reason the new page cannot create a connection loop: `/` is
 * public and never redirects, and everything that needs a wallet sends the visitor *here* with
 * `?next=`, which this screen hands back on success.
 *
 * Waitlist mode is unchanged and still wins, because that gate is operational and has nothing to
 * do with this redesign.
 */
export default function Connect() {
  if (siteMode() === "waitlist") return <WaitlistLanding source="home" />;

  return (
    <Suspense fallback={null}>
      <WalletEntry />
    </Suspense>
  );
}
