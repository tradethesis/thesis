"use client";

import { Buffer } from "buffer";
import dynamic from "next/dynamic";

import { WalletProvider } from "@/components/buy/useWallet";

// @solana/web3.js v1 reaches for the Node Buffer global at import time and Next does not
// polyfill it. This module is evaluated by the root layout before any wallet code runs;
// the dynamic import of web3.js in lib/wallet/transaction.ts keeps that ordering true even
// in a production build, where a static import could otherwise be hoisted above this.
if (typeof globalThis.Buffer === "undefined") {
  (globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

/**
 * Sign-in without a browser extension, loaded off the critical path.
 *
 * Privy is about 400 kB. Imported statically it lands in the entry graph of every route,
 * which took the feed's first-load JS from 130 kB to 532 kB — a four-fold cost on the page
 * every visitor lands on, to support an action most of them will not take on that visit.
 *
 * `ssr: false` puts it in its own chunk fetched after hydration. The feed paints on its own
 * budget; the provider arrives a moment later and the sign-in buttons work from then on.
 * It has no UI of its own until something asks it for a modal, so there is nothing to see
 * arriving and no layout to shift.
 */
const PrivyAuth = dynamic(() => import("./PrivyAuth").then((m) => m.PrivyAuth), { ssr: false });

/**
 * Nothing about the server changes. The challenge is still ours, the signature is still
 * verified as ed25519 against the claimed address, and the session cookie is still what
 * authorises a write. Privy supplies a signer; it does not supply an identity we trust.
 *
 * With no app id configured the provider never mounts at all — Phantom keeps working and
 * the email path simply does not appear. A provider that threw on a missing key at import
 * time would take the whole site down with it.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* One session for the page. Every surface that gates on a wallet reads the same copy, so
          signing in through one updates all of them and signing out clears all of them. It wraps
          children and Privy alike; it holds no Privy import of its own, reading the signer
          through the bridge's external store instead. */}
      <WalletProvider>{children}</WalletProvider>
      {/* A sibling, never an ancestor. `ssr: false` on anything wrapping children turns off
          server rendering for the whole site, which is exactly what happened: every page
          started arriving as an empty shell. Nothing below here uses Privy's hooks, so it
          has nothing to wrap. */}
      {PRIVY_APP_ID ? <PrivyAuth appId={PRIVY_APP_ID} /> : null}
    </>
  );
}
