"use client";

import { Mail, Wallet } from "lucide-react";
import { useEffect, useRef } from "react";

import { usePrivySigner } from "@/lib/wallet/privy-signer";

import type { WalletState } from "./useWallet";

/**
 * The two ways in, wherever signing in is offered.
 *
 * One component because the choice has to be the same everywhere. Two buttons that mean
 * different things on the feed and in the buy flow is how somebody ends up with a basket
 * in one address and a session on another.
 *
 * Email leads when there is no extension, which is almost everybody. Phantom leads when it
 * is installed, because a person who installed it expects it to be used and an embedded
 * wallet would put their tokens in a second address they did not ask for.
 *
 * Both paths end in the same place: a signature over the server's challenge. Being logged
 * into an email account proves nothing here and grants nothing.
 */
export function SignIn({ wallet, variant = "block" }: { wallet: WalletState; variant?: "block" | "inline" }) {
  const busy = wallet.connecting || wallet.signingIn;
  const label = wallet.connecting ? "Connecting…" : wallet.signingIn ? "Waiting for your signature…" : null;
  const emailFirst = wallet.hasEmailSignIn && !wallet.hasPhantom;

  const email = wallet.hasEmailSignIn ? (
    <button
      key="email"
      type="button"
      className={emailFirst ? "ln-btn ln-btn--ink" : "ln-btn ln-btn--secondary"}
      onClick={wallet.connectWithEmail}
      disabled={busy}
    >
      <Mail size={15} aria-hidden="true" />
      {emailFirst && label ? label : "Continue with email"}
    </button>
  ) : null;

  const phantom = (
    <button
      key="phantom"
      type="button"
      className={emailFirst ? "ln-btn ln-btn--secondary" : "ln-btn ln-btn--ink"}
      onClick={wallet.connect}
      disabled={busy}
    >
      <Wallet size={15} aria-hidden="true" />
      {!emailFirst && label ? label : wallet.hasPhantom ? "Connect wallet" : "Use a wallet extension"}
    </button>
  );

  return (
    <div className={`signin signin--${variant}`}>
      {emailFirst ? [email, phantom] : [phantom, email]}

      {/* Said once, here, rather than in three places that would drift apart. */}
      {wallet.hasEmailSignIn && (
        <p className="signin-note">
          Email gives you a Solana wallet you own and can export. Nothing is bought until you approve it.
        </p>
      )}
      {wallet.error && (
        <p className="signin-error" role="alert">
          {wallet.error}
        </p>
      )}
    </div>
  );
}

/**
 * Signing in to open a gift. One way only: the X account the gift was sent to.
 *
 * A gift sits in the wallet made for that X account. Email or an extension would sign in as
 * somebody else — a second account with an empty wallet, which the server would then refuse to buy
 * for. So when there is no X session yet, this sends the recipient back to their invitation, where
 * the X sign-in lives, instead of offering a door that leads to the wrong wallet.
 */
export function GiftSignIn({ wallet, token }: { wallet: WalletState; token: string }) {
  const signer = usePrivySigner();
  const busy = wallet.connecting || wallet.signingIn;
  // Already signed in with the gift's X account (they just did, on the invitation): continue for
  // them once, rather than asking them to press "Continue" for something they already chose.
  const tried = useRef(false);
  useEffect(() => {
    if (tried.current || !signer?.authenticated || !signer.twitterHandle || wallet.wallet || busy || wallet.error) return;
    tried.current = true;
    void wallet.connectWithEmail();
  }, [signer?.authenticated, signer?.twitterHandle, wallet.wallet, busy, wallet.error, wallet]);
  const label = wallet.connecting ? "Connecting…" : wallet.signingIn ? "Waiting for your signature…" : null;

  if (!signer) {
    return (
      <div className="signin signin--block">
        <button type="button" className="ln-btn ln-btn--ink" disabled>
          Loading sign-in…
        </button>
      </div>
    );
  }
  if (!signer.authenticated || !signer.twitterHandle) {
    return (
      <div className="signin signin--block">
        <a className="ln-btn ln-btn--ink" href={`/gift/${encodeURIComponent(token)}`}>
          Sign in with X on your invitation
        </a>
        <p className="signin-note">Your gift is in the wallet made for your X account. Sign in there, then come back to open it.</p>
      </div>
    );
  }
  return (
    <div className="signin signin--block">
      <button type="button" className="ln-btn ln-btn--ink" onClick={wallet.connectWithEmail} disabled={busy}>
        {label ?? `Continue as @${signer.twitterHandle}`}
      </button>
      <p className="signin-note">This signs a message with the wallet your gift was sent to. Nothing is bought until you approve it.</p>
      {wallet.error && (
        <p className="signin-error" role="alert">
          {wallet.error}
        </p>
      )}
    </div>
  );
}
