"use client";

import { useSyncExternalStore } from "react";

/**
 * The one thing the app needs from Privy: something that can sign.
 *
 * Privy's hooks throw when no provider is mounted, and the provider is loaded lazily so it
 * is genuinely absent for the first moments of every visit — and absent forever when no
 * app id is configured. Calling those hooks from useWallet would therefore crash the feed
 * on first paint, which is a strange way to fix a problem about people not being able to
 * sign in.
 *
 * So a bridge inside the provider publishes a signer here, and everything outside reads
 * this. The rest of the app never imports Privy, never depends on its hook API, and works
 * unchanged when it is not there.
 */

export type PrivySigner = {
  authenticated: boolean;
  /** Null until an embedded wallet exists on the account. */
  address: string | null;
  login: () => Promise<void>;
  /** UI identity only. Never authorizes a gift claim. */
  twitterHandle?: string | null;
  /** Resolves with what happened, so a closed modal reads as cancelled rather than failed. */
  loginWithX?: () => Promise<"ok" | "cancelled" | "failed">;
  /**
   * A signed token the server verifies to learn who this is. The only thing a gift claim accepts;
   * the handle above is display, this is proof. Null when signed out or when identity tokens are
   * not enabled for the Privy app.
   */
  getIdentityToken?: () => Promise<string | null>;
  /**
   * Sign-in methods other than X on this account. The wallet belongs to the Privy user, not to the
   * X account, so a second method is what keeps it reachable if the X account is ever lost.
   */
  recoveryMethods?: ("email" | "passkey" | "google")[];
  linkEmail?: () => void;
  linkPasskey?: () => void;
  /** Opens Privy's own export modal on a separate domain. The app never sees the key. */
  exportWallet?: () => Promise<void>;
  logout: () => Promise<void>;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  /**
   * Sign (not send) a serialized transaction with the embedded wallet. The purchase path sends it
   * itself, exactly as it does with Phantom's signature, so both wallets share one execution path.
   */
  signTransaction?: (transaction: Uint8Array) => Promise<Uint8Array>;
};

let current: PrivySigner | null = null;
const listeners = new Set<() => void>();

export function setPrivySigner(next: PrivySigner | null): void {
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Null on the server and until the provider has loaded, which callers must handle. */
export function usePrivySigner(): PrivySigner | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
