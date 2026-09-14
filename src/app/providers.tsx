"use client";

import { Buffer } from "buffer";

// @solana/web3.js v1 reaches for the Node Buffer global at import time and Next does not
// polyfill it. This module is evaluated by the root layout before any wallet code runs;
// the dynamic import of web3.js in lib/wallet/transaction.ts keeps that ordering true even
// in a production build, where a static import could otherwise be hoisted above this.
if (typeof globalThis.Buffer === "undefined") {
  (globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
